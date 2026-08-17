import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { applyRecommendedDefaults, collectAnswerSources, validateAnswers } from './answers.js';
import { isRelevant } from './decisions/catalog.js';
import { PRESET_IDS, PRESETS } from './decisions/presets.js';
import { resolveDecisions, summarize } from './decisions/resolve.js';
import { readManifest } from './manifest.js';
import { askQuestions, parseAgentTargets, renderReview } from './prompts.js';
import { findRepoRoot, isGitRepoRoot } from './repo.js';
import { configureTheme, terminalWidth, theme } from './style.js';
import {
  decideTemplateSet,
  normalizeConfig,
  today,
  uninstallTemplateSet,
  updateTemplateSet,
  writeTemplateSet,
} from './writer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function getVersion() {
  const pkg = JSON.parse(await readFile(path.join(__dirname, '..', 'package.json'), 'utf8'));
  return pkg.version;
}

// Flags that take a value, in either `--flag value` or `--flag=value` form.
const VALUE_FLAGS = new Set(['--preset', '--answers', '--set', '--mode', '--name', '--pm', '--agents']);

export function parseArgs(argv) {
  const flags = {
    force: false,
    dryRun: false,
    purge: false,
    help: false,
    yes: false,
    detected: false,
    noColor: false,
    open: false,
  };
  let command = 'init';
  let commandSeen = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--force' || arg === '-f') { flags.force = true; continue; }
    if (arg === '--dry-run' || arg === '-n') { flags.dryRun = true; continue; }
    if (arg === '--purge') { flags.purge = true; continue; }
    if (arg === '--help' || arg === '-h') { flags.help = true; continue; }
    if (arg === '--yes' || arg === '-y') { flags.yes = true; continue; }
    if (arg === '--detected') { flags.detected = true; continue; }
    if (arg === '--no-color' || arg === '--no-colour') { flags.noColor = true; continue; }
    if (arg === '--open') { flags.open = true; continue; }

    const eq = arg.indexOf('=');
    const name = eq > 0 ? arg.slice(0, eq) : arg;

    if (VALUE_FLAGS.has(name)) {
      const value = eq > 0 ? arg.slice(eq + 1) : argv[++i];
      if (value === undefined) throw new Error(`${name} requires a value.`);
      const key = name.slice(2);
      // --set is repeatable and accumulates, so a preset can be adjusted with
      // several separate flags.
      flags[key] = key === 'set' && flags.set ? `${flags.set},${value}` : value;
      continue;
    }

    if (arg.startsWith('-')) throw new Error(`Unknown option: ${arg}\n\n${HELP}`);

    if (!commandSeen) {
      command = arg;
      commandSeen = true;
    }
  }

  return { command, flags };
}

const HELP = `specframe — decision-driven scaffolding for AI-ready repositories.

Usage:
  specframe [init] [options]     Scaffold context files at the repo root.
  specframe decide [options]     Record decisions still open in this repo.
  specframe review [options]     Show the decisions recorded here, as a table.
  specframe update [options]     Refresh specframe-managed artifacts.
  specframe uninstall [options]  Remove everything specframe created.

Everything is written to the root of the repository (the nearest ancestor with
a .git directory), even when the CLI is run from a subdirectory.

Init has two modes:
  blank    Every template plus its filling instructions, and the full decision
           backlog in docs/DECISIONS.md. No decisions taken.
  guided   Answer decisions from the catalog. Each one becomes an ADR plus the
           rules, guidelines, runbooks and glossary terms it implies. Skipping
           is one key per question, or per section.

Init options:
      --preset <id>   ${PRESET_IDS.join(' | ')}
                      Seeds the wizard; with --yes it runs unattended.
      --set k=v,...   Answer decisions directly, e.g.
                      --set architecture-style=microservices,tdd=strict
                      Repeatable. Overrides --preset and --answers.
      --answers FILE  JSON of { "decision-id": "option-value" }, or a saved
                      .specframe/manifest.json to replay another repo's setup.
      --mode MODE     blank | guided. Skips the mode question.
  -y, --yes           No prompts. Unanswered decisions in guided mode take
                      their recommended option.
      --name NAME     Project name (default: directory name).
      --pm NAME       npm | pnpm (default: npm).
      --agents LIST   claude,copilot,codex,gemini,continue,amazonq | none
      --detected      These decisions are already implemented in this codebase.
                      Their ADRs say so, and ask for the evidence in the code
                      instead of presenting the choice as new. Use this when
                      documenting an existing repository — /specframe-bootstrap
                      does it for you.

Decide options:
  -n, --dry-run    Show what would be written.
      --set / --answers / --preset / --yes / --detected  as for init.

Review options:
      --open       Only the decisions still open.

Update options:
  -f, --force      Overwrite managed files even if you edited them.
  -n, --dry-run    Show what would change without writing anything.

Uninstall options:
      --purge      Also remove user-owned starters (CLAUDE.md, docs/**, …).
  -n, --dry-run    Show what would be removed.

Common options:
  -h, --help       Show this help.
      --no-color   Plain output. NO_COLOR=1 and a non-TTY do the same;
                   SPECFRAME_ASCII=1 also drops the box drawing.

Presets:
${PRESET_IDS.map((id) => `  ${id.padEnd(9)} ${PRESETS[id].description}`).join('\n')}

On update, files you own (docs, ADRs, CLAUDE.md, …) are never overwritten.
A managed file you edited by hand is kept; the new version lands beside it as
<file>.specframe-new for you to merge.`;

function reportInvalidAnswers(invalid) {
  if (invalid.length === 0) return;
  console.warn(theme.warn('\nIgnoring answers that do not match the decision catalog:'));
  for (const { id, value, reason } of invalid) {
    console.warn(`  ${theme.bold(`${id}=${value}`)} ${theme.muted(`— ${reason}`)}`);
  }
  console.warn('');
}

function currentDirName(cwd) {
  const parts = cwd.split(/[\\/]+/).filter(Boolean);
  return parts[parts.length - 1] || 'current-repo';
}

function logPlanSummary(resolved) {
  const s = summarize(resolved);
  console.log(
    `\n${theme.bold(String(s.decided))} ${theme.muted('decisions recorded')} ${theme.muted(theme.glyph.bullet)} ` +
      `${s.open > 0 ? theme.warn(String(s.open)) : theme.bold('0')} ${theme.muted('open')} ` +
      `${theme.muted(theme.glyph.bullet)} ` +
      theme.muted(
        `${s.adrs} ADRs, ${s.rules} rules, ${s.guidelines} guidelines, ` +
          `${s.runbooks} runbooks, ${s.glossaryTerms} glossary terms`,
      ),
  );
}

async function runInit(cwd, version, flags) {
  const targetDir = await resolveTargetDir(cwd);

  const sources = await collectAnswerSources({
    preset: flags.preset,
    answersFile: flags.answers,
    set: flags.set,
  });
  const { valid, invalid } = validateAnswers(sources.answers);
  reportInvalidAnswers(invalid);

  const mode = flags.mode ?? sources.mode;
  if (mode && mode !== 'blank' && mode !== 'guided') {
    throw new Error(`Unknown --mode: ${mode}. Expected blank or guided.`);
  }
  if (mode === 'blank' && Object.keys(valid).length > 0) {
    console.warn(
      '\n--mode blank takes no decisions, so the answers supplied are ignored.\n' +
        'Drop --mode to record them, or run `specframe decide` afterwards.\n',
    );
  }

  const unattended = flags.yes || !process.stdin.isTTY;
  if (unattended && !flags.yes && !flags.preset && !flags.set && !flags.answers && !flags.mode) {
    throw new Error(
      'Not running on a terminal, and no answers were supplied.\n' +
        'Pass --mode blank for the template set, or --preset/--set/--yes to configure it.',
    );
  }

  let config;
  if (unattended) {
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
  const full = { ...config, provenance, initDate: today() };
  logPlanSummary(resolveDecisions({ mode: full.mode, answers: full.decisions }));
  console.log('');

  await writeTemplateSet({ targetDir, ...full, version });
  console.log(`\n${theme.good('Done.')} Context files are ready in: ${theme.bold(targetDir)}`);
  console.log(theme.muted(`Run \`specframe review\` to see the decisions recorded here as a table.`));
  if (full.mode === 'blank') {
    console.log(theme.muted('Open docs/README.md to see how the sections fit together,'));
    console.log(theme.muted('and docs/DECISIONS.md for the decisions still to make.'));
    console.log(theme.muted('Run `specframe decide` when you want to record some of them.'));
  }
}

// Record decisions in a repository that has already been scaffolded. Reuses the
// stored config, asks only about decisions still open, and never overwrites an
// existing document.
async function runDecide(cwd, version, flags) {
  const targetDir = await resolveTargetDir(cwd);
  const manifest = await readManifest(targetDir);
  if (!manifest?.config) {
    throw new Error(
      `No ${'.specframe/manifest.json'} in ${targetDir}.\n` +
        'Run `specframe init` first — `decide` extends an existing scaffold.',
    );
  }

  const stored = normalizeConfig(manifest.config);
  const resolvedBefore = resolveDecisions({ mode: 'guided', answers: stored.decisions });
  const openIds = resolvedBefore.open.map((o) => o.decision.id);

  if (openIds.length === 0) {
    console.log('Every decision in the catalog is already recorded. Nothing to do.');
    return;
  }

  const sources = await collectAnswerSources({
    preset: flags.preset,
    answersFile: flags.answers,
    set: flags.set,
  });
  const { valid, invalid } = validateAnswers(sources.answers);
  reportInvalidAnswers(invalid);

  // A non-interactive source may only answer decisions that are still open;
  // silently rewriting a recorded decision would contradict its ADR.
  const alreadyDecided = Object.keys(valid).filter((id) => !openIds.includes(id));
  if (alreadyDecided.length > 0) {
    console.warn(
      `\nIgnoring decisions already recorded: ${alreadyDecided.join(', ')}\n` +
        'Supersede them by editing their ADR instead.\n',
    );
  }
  const fresh = Object.fromEntries(Object.entries(valid).filter(([id]) => openIds.includes(id)));

  let decisions;
  const unattended = flags.yes || !process.stdin.isTTY;
  if (unattended) {
    decisions = flags.yes
      ? applyRecommendedDefaults({ ...stored.decisions, ...fresh }, { only: openIds })
      : { ...stored.decisions, ...fresh };
    if (Object.keys(fresh).length === 0 && !flags.yes) {
      throw new Error(
        'Not running on a terminal, and no answers were supplied.\n' +
          'Pass --set/--answers/--preset, or --yes to accept the recommended options.',
      );
    }
  } else {
    console.log(
      `\n${theme.warn(String(openIds.length))} ${theme.muted('decisions are still open in this repository.')}`,
    );
    const answered = await askQuestions({
      seed: { ...stored, decisions: { ...stored.decisions, ...fresh } },
      mode: 'guided',
      only: openIds,
      basics: false,
      version,
    });
    if (answered === null) {
      console.log(theme.muted('\nCancelled. Nothing was written.'));
      return;
    }
    decisions = answered.decisions;
  }

  const newlyDecided = Object.keys(decisions).filter((id) => stored.decisions[id] === undefined);
  if (newlyDecided.length === 0) {
    console.log(theme.muted('\nNo new decisions were recorded. Nothing was written.'));
    return;
  }

  // --detected applies to what this run records: the ADRs say they document an
  // existing implementation rather than a fresh choice, and ask for the evidence.
  const provenance = { ...stored.provenance };
  if (flags.detected) {
    for (const id of newlyDecided) provenance[id] = 'detected';
  }

  const config = { ...stored, mode: 'guided', decisions, provenance };
  console.log('');
  await decideTemplateSet({ targetDir, ...config, version, dryRun: flags.dryRun });
  logPlanSummary(resolveDecisions({ mode: 'guided', answers: decisions }));
  console.log(
    flags.dryRun ? '\nDry run complete. Nothing was written.' : `\nRecorded ${newlyDecided.length} decisions.`,
  );
}

// Read back what this repository has decided, as the same table the wizard
// shows. It answers the question a scaffolded repo raises months later — "what
// did we actually agree, and what is still open" — without opening 30 ADRs.
async function runReview(cwd, flags) {
  const targetDir = await resolveTargetDir(cwd);
  const manifest = await readManifest(targetDir);
  if (!manifest?.config) {
    throw new Error(
      `No ${'.specframe/manifest.json'} in ${targetDir}.\n` +
        'Run `specframe init` first — `review` reads the decisions it recorded.',
    );
  }

  const stored = normalizeConfig(manifest.config);
  const width = terminalWidth();

  console.log('');
  console.log(theme.rule(width, stored.projectName ?? 'specframe'));
  console.log(
    theme.muted(
      `  mode ${stored.mode ?? 'unknown'} ${theme.glyph.bullet} scaffolded with specframe ` +
        `${manifest.version ?? 'unknown'} ${theme.glyph.bullet} ${stored.initDate ?? 'unknown date'}`,
    ),
  );
  console.log('');
  console.log(renderReview(stored.decisions ?? {}, { width, openOnly: flags.open }));
  console.log('');

  const open = summarize(resolveDecisions({ mode: 'guided', answers: stored.decisions ?? {} })).open;
  console.log(
    theme.muted(
      open > 0
        ? '  `specframe decide` records the open ones.'
        : '  Every decision in this catalog is recorded. Supersede one by editing its ADR.',
    ),
  );
}

async function runUpdate(cwd, version, flags) {
  const targetDir = await resolveTargetDir(cwd);
  const manifest = await readManifest(targetDir);

  let config;
  if (manifest?.config) {
    config = normalizeConfig(manifest.config);
    console.log(
      `Updating to specframe ${version} (was ${manifest.version ?? 'unknown'}), ` +
        `using choices saved in ${'.specframe/manifest.json'}.\n`,
    );
    if (manifest.config.contentProfile !== undefined && manifest.config.mode === undefined) {
      console.warn(
        'This repository was scaffolded before the two onboarding modes existed.\n' +
          `The old "${manifest.config.contentProfile}" content profile no longer exists; your\n` +
          'documents under docs/ are yours and are left untouched. Run `specframe decide`\n' +
          'to record decisions as ADRs going forward.\n',
      );
    }
  } else {
    console.log(
      'No .specframe/manifest.json found — this repo was scaffolded before update\n' +
        'tracking existed. Re-confirm your choices; edited files will be preserved\n' +
        'conservatively (a .specframe-new is written instead of overwriting).\n',
    );
    const answers = await askQuestions({});
    if (answers === null) {
      console.log('\nCancelled. Nothing was written.');
      return;
    }
    config = { ...answers, initDate: today() };
  }

  await updateTemplateSet({
    targetDir,
    ...config,
    version,
    force: flags.force,
    dryRun: flags.dryRun,
  });

  // A newer catalog can introduce decisions this repo has never seen. They are
  // not re-prompted: they surface in docs/DECISIONS.md, and `specframe decide`
  // is how you answer them.
  if (config.mode === 'guided') {
    const resolved = resolveDecisions({ mode: 'guided', answers: config.decisions });
    const newOpen = resolved.open.filter((o) => isRelevant(o.decision, config.decisions));
    if (newOpen.length > 0) {
      console.log(
        `\n${newOpen.length} decisions in this version's catalog are unanswered here.\n` +
          'They are listed in docs/DECISIONS.md — run `specframe decide` to record them.',
      );
    }
  }

  console.log(flags.dryRun ? '\nDry run complete. Nothing was written.' : '\nUpdate complete.');
}

async function runUninstall(cwd, flags) {
  const targetDir = await resolveTargetDir(cwd);
  await uninstallTemplateSet({ targetDir, purge: flags.purge, dryRun: flags.dryRun });
}

// Always operate on the repository root, never on an arbitrary subdirectory.
// `init`/`decide`/`update`/`uninstall` resolve to the nearest ancestor
// containing a `.git` (the actual repo root) or an existing
// `.specframe/manifest.json` (a repo specframe already scaffolded). If neither
// is found we fall back to cwd and warn when it isn't itself a git repo root,
// so `init` still works in a brand-new folder that hasn't been `git init`-ed yet.
async function resolveTargetDir(cwd) {
  const root = await findRepoRoot(cwd);
  if (root) {
    if (root !== path.resolve(cwd)) {
      console.log(`Operating on repository root: ${root}`);
    }
    return root;
  }

  if (!(await isGitRepoRoot(cwd))) {
    console.warn(
      `Warning: no .git found at or above ${cwd}.\n` +
        `Scaffolding in ${cwd} anyway — run \`git init\` first for a real repository.`,
    );
  }
  return cwd;
}

export async function run(argv = process.argv.slice(2)) {
  const { command, flags } = parseArgs(argv);
  const cwd = process.cwd();
  const version = await getVersion();

  // `--no-color` has to be honoured before anything is printed, and it only
  // turns colour off: a flag cannot force it on where the terminal says no.
  if (flags.noColor) configureTheme({ color: false });

  if (flags.help || command === 'help') {
    console.log(HELP);
    return;
  }

  if (command === 'decide') {
    await runDecide(cwd, version, flags);
    return;
  }

  if (command === 'review') {
    await runReview(cwd, flags);
    return;
  }

  if (command === 'update') {
    await runUpdate(cwd, version, flags);
    return;
  }

  if (command === 'uninstall') {
    await runUninstall(cwd, flags);
    return;
  }

  if (command === 'init') {
    await runInit(cwd, version, flags);
    return;
  }

  throw new Error(`Unknown command: ${command}\n\n${HELP}`);
}
