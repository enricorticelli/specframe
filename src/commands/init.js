import process from 'node:process';
import { applyRecommendedDefaults, collectAnswerSources, validateAnswers } from '../answers.js';
import { BLUEPRINT_IDS } from '../decisions/blueprints.js';
import { resolveDecisions } from '../decisions/resolve.js';
import { readManifest } from '../manifest.js';
import { askQuestions, parseAgentTargets } from '../prompts.js';
import { theme } from '../style.js';
import { createReadlineIo } from '../tui.js';
import { findExistingRootFiles, normalizeConfig, today, writeTemplateSet } from '../writer.js';
import { reportInvalidAnswers, stampDismissed, logPlanSummary, resolveTargetDir } from './context.js';
import { runNotInstalledMenu, runInstalledMenu } from './interactive-menu.js';

function currentDirName(cwd) {
  const parts = cwd.split(/[\\/]+/).filter(Boolean);
  return parts[parts.length - 1] || 'current-repo';
}

// `init` on a repo specframe already scaffolded used to re-run the whole wizard
// from scratch and then quietly skip every file that already existed — correct
// per file, but the run as a whole looked like onboarding into an empty repo
// when it was really redundant with `update`/`decide`. Caught here, before any
// question is asked, so a re-run points at the command that actually applies.
function reportAlreadyInstalled(manifest) {
  const stored = normalizeConfig(manifest.config);
  console.log(
    `${theme.warn('specframe is already installed here')} ` +
      theme.muted(`(v${manifest.version ?? 'unknown'}, mode ${stored.mode}).`),
  );
  console.log(theme.muted('  `specframe update`  refreshes generated files for this version.'));
  console.log(theme.muted('  `specframe decide`  records decisions still open.'));
  console.log(theme.muted('  `specframe review`  shows what is recorded here.'));
  console.log(theme.muted('  `specframe agents`  adds another AI assistant.'));
  console.log(theme.muted('\nRun `specframe init --force` to re-run onboarding from scratch anyway.'));
}

// Root files that already exist here, from outside specframe. `init` never
// overwrites a file it did not create, so left unquestioned these are silently
// skipped and whatever specframe would have put there never lands. Ask once,
// before the wizard runs,
// rather than let that go by as a quiet `[skip]` line mid-run.
async function confirmLegacyOverwrite({ targetDir, flags, unattended }) {
  const found = await findExistingRootFiles(targetDir);
  if (found.length === 0) return new Set();

  const list = found.join(', ');
  const plural = found.length === 1 ? 'it' : 'them';

  if (unattended) {
    if (flags.force) {
      console.log(theme.warn(`\n--force: overwriting existing ${list}.`));
      return new Set(found);
    }
    console.warn(theme.warn(`\nFound existing ${list} — kept as-is (specframe never overwrites a file it did not create).`));
    console.warn(theme.muted(`Pass --force to overwrite ${plural} with specframe's templates instead.\n`));
    return new Set();
  }

  console.log(`\n${theme.warn('Found file(s) specframe would normally create:')} ${theme.bold(list)}`);
  console.log(
    theme.muted(
      '  Kept as-is by default. Overwriting replaces the content with specframe\'s\n' +
        '  template — anything already written there is lost.',
    ),
  );
  const io = createReadlineIo();
  const raw = await io.question(`${theme.accent(theme.glyph.prompt)} Overwrite ${plural}? [y/N] `);
  io.close();
  return ['y', 'yes'].includes(raw.trim().toLowerCase()) ? new Set(found) : new Set();
}

export async function runInit(cwd, version, flags, { explicit = true } = {}) {
  const targetDir = await resolveTargetDir(cwd);

  const existingManifest = await readManifest(targetDir);
  if (existingManifest?.config && !flags.force) {
    // Off a terminal (CI, a pipe, an agent) there is nobody to pick from a
    // menu: keep naming the commands that apply, which is scriptable.
    if (flags.yes || !process.stdin.isTTY) {
      reportAlreadyInstalled(existingManifest);
      return;
    }
    await runInstalledMenu(cwd, version, flags, existingManifest);
    return;
  }

  // `specframe` typed bare — no explicit `init` — used to drop straight into
  // the onboarding wizard, so picking an agent target mid-wizard read as the
  // whole job when it was really one question of many; anybody who stopped
  // before the final review wrote nothing. `specframe init` still goes
  // straight in: typing the word is the commitment this menu exists to ask
  // for. Guarded on there truly being no manifest (rather than just skipping
  // the branch above) so `--force` on an already-installed repo never reports
  // itself as uninstalled.
  if (!explicit && !existingManifest?.config && !flags.yes && process.stdin.isTTY) {
    const proceed = await runNotInstalledMenu(version);
    if (!proceed) return;
  }

  const sources = await collectAnswerSources({
    preset: flags.preset,
    blueprint: flags.blueprint,
    answersFile: flags.answers,
    set: flags.set,
  });
  const { valid, invalid } = validateAnswers(sources.answers);
  reportInvalidAnswers(invalid);

  const mode = flags.mode ?? sources.mode;
  if (mode && mode !== 'blank' && mode !== 'guided' && mode !== 'blueprint') {
    throw new Error(`Unknown --mode: ${mode}. Expected blank, guided or blueprint.`);
  }
  if (mode === 'blank' && Object.keys(valid).length > 0) {
    console.warn(
      '\n--mode blank takes no decisions, so the answers supplied are ignored.\n' +
        'Drop --mode to record them, or run `specframe decide` afterwards.\n',
    );
  }

  const unattended = flags.yes || !process.stdin.isTTY;
  if (
    unattended &&
    !flags.yes &&
    !flags.preset &&
    !flags.blueprint &&
    !flags.set &&
    !flags.answers &&
    !flags.mode
  ) {
    throw new Error(
      'Not running on a terminal, and no answers were supplied.\n' +
        'Pass --mode blank for the template set, or --preset/--blueprint/--set/--yes to configure it.',
    );
  }

  const overwrite = await confirmLegacyOverwrite({ targetDir, flags, unattended });

  let config;
  if (unattended) {
    // `blueprint` is a screen, not a configuration: off a terminal there is
    // nobody to pick one, so say which flag carries the same intent.
    if (mode === 'blueprint') {
      throw new Error(
        'Not running on a terminal, so there is no blueprint to pick.\n' +
          `Pass --blueprint <id> instead: ${BLUEPRINT_IDS.join(', ')}.`,
      );
    }
    const resolvedMode = mode ?? 'blank';
    config = {
      projectName: flags.name ?? currentDirName(targetDir),
      packageManager: flags.pm === 'pnpm' ? 'pnpm' : 'npm',
      agentTargets: parseAgentTargets(flags.agents),
      mode: resolvedMode,
      decisions:
        resolvedMode === 'guided' && flags.yes ? applyRecommendedDefaults(valid) : valid,
    };
    console.log(
      `Running unattended: mode ${resolvedMode}` +
        (flags.preset ? `, preset ${flags.preset}` : '') +
        (flags.blueprint ? `, blueprint ${flags.blueprint}` : '') +
        '.',
    );
  } else {
    const answers = await askQuestions({
      seed: {
        projectName: flags.name,
        packageManager: flags.pm,
        agentTargets: parseAgentTargets(flags.agents),
        decisions: valid,
      },
      mode,
      version,
    });
    if (answers === null) {
      console.log(theme.muted('\nCancelled. Nothing was written.'));
      return;
    }
    config = answers;
  }

  const provenance = flags.detected
    ? Object.fromEntries(Object.keys(config.decisions ?? {}).map((id) => [id, 'detected']))
    : {};
  const initDate = today();
  const dismissed = stampDismissed(config.dismissed ?? {}, initDate);
  const full = { ...config, provenance, dismissed, initDate };
  logPlanSummary(resolveDecisions({ mode: full.mode, answers: full.decisions, dismissed: full.dismissed }));
  console.log('');

  await writeTemplateSet({ targetDir, ...full, version, overwrite });
  console.log(`\n${theme.good('Done.')} Context files are ready in: ${theme.bold(targetDir)}`);
  console.log(theme.muted(`Run \`specframe review\` to see the decisions recorded here as a table.`));
  if (full.mode === 'blank') {
    console.log(theme.muted('Open docs/README.md to see how the sections fit together,'));
    console.log(theme.muted('and docs/DECISIONS.md for the decisions still to make.'));
    console.log(theme.muted('Run `specframe decide` when you want to record some of them.'));
  }
}
