import process from 'node:process';
import { applyRecommendedDefaults, collectAnswerSources, validateAnswers } from '../answers.js';
import { resolveDecisions } from '../decisions/resolve.js';
import { readManifest } from '../manifest.js';
import { askQuestions } from '../prompts.js';
import { theme } from '../style.js';
import { decideTemplateSet, normalizeConfig, today } from '../writer.js';
import { reportInvalidAnswers, stampDismissed, logPlanSummary, resolveTargetDir } from './context.js';

// Record decisions in a repository that has already been scaffolded. Reuses the
// stored config, asks only about decisions still open, and never overwrites an
// existing document.
export async function runDecide(cwd, version, flags) {
  const targetDir = await resolveTargetDir(cwd);
  const manifest = await readManifest(targetDir);
  if (!manifest?.config) {
    throw new Error(
      `No ${'.specframe/manifest.json'} in ${targetDir}.\n` +
        'Run `specframe init` first — `decide` extends an existing scaffold.',
    );
  }

  const stored = normalizeConfig(manifest.config);
  const resolvedBefore = resolveDecisions({ mode: 'guided', answers: stored.decisions, dismissed: stored.dismissed });
  const openIds = resolvedBefore.open.map((o) => o.decision.id);

  if (openIds.length === 0) {
    console.log('Every decision in the catalog is already recorded. Nothing to do.');
    return;
  }

  const sources = await collectAnswerSources({
    preset: flags.preset,
    blueprint: flags.blueprint,
    answersFile: flags.answers,
    set: flags.set,
  });
  const { valid, invalid } = validateAnswers(sources.answers);
  reportInvalidAnswers(invalid);

  // A non-interactive source may only answer decisions that are still open;
  // silently rewriting a recorded decision would contradict its ADR, and one
  // that was dismissed needs `specframe restore` first, not a quiet answer.
  const alreadyDecided = Object.keys(valid).filter((id) => stored.decisions[id] !== undefined);
  if (alreadyDecided.length > 0) {
    console.warn(
      `\nIgnoring decisions already recorded: ${alreadyDecided.join(', ')}\n` +
        'Supersede them by editing their ADR instead.\n',
    );
  }
  for (const id of Object.keys(valid)) {
    const dismissal = stored.dismissed[id];
    if (!dismissal) continue;
    console.warn(
      theme.warn(`\nIgnoring ${id}: dismissed on ${dismissal.date}${dismissal.reason ? ` — ${dismissal.reason}` : ''}.`),
    );
    console.warn(theme.muted(`Run \`specframe restore ${id}\` first if that is no longer true.\n`));
  }
  const fresh = Object.fromEntries(Object.entries(valid).filter(([id]) => openIds.includes(id)));

  let decisions;
  let dismissed = stored.dismissed;
  const unattended = flags.yes || !process.stdin.isTTY;
  if (unattended) {
    decisions = flags.yes
      ? applyRecommendedDefaults({ ...stored.decisions, ...fresh }, { only: openIds, dismissed: stored.dismissed })
      : { ...stored.decisions, ...fresh };
    if (Object.keys(fresh).length === 0 && !flags.yes) {
      throw new Error(
        'Not running on a terminal, and no answers were supplied.\n' +
          'Pass --set/--answers/--preset/--blueprint, or --yes to accept the recommended options.',
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
    dismissed = stampDismissed(answered.dismissed ?? {}, today());
  }

  const newlyDecided = Object.keys(decisions).filter((id) => stored.decisions[id] === undefined);
  // Dismissing something is also recording something, even when no option was
  // chosen — a wizard session that only pressed `x` a few times must not be
  // discarded as if nothing happened.
  const newlyDismissed = Object.keys(dismissed).filter((id) => stored.dismissed[id] === undefined);
  if (newlyDecided.length === 0 && newlyDismissed.length === 0) {
    console.log(theme.muted('\nNo new decisions were recorded. Nothing was written.'));
    return;
  }

  // --detected applies to what this run records: the ADRs say they document an
  // existing implementation rather than a fresh choice, and ask for the evidence.
  const provenance = { ...stored.provenance };
  if (flags.detected) {
    for (const id of newlyDecided) provenance[id] = 'detected';
  }

  const config = { ...stored, mode: 'guided', decisions, dismissed, provenance };

  // `--dry-run --json` is the preview `specframe-decide` shows before writing
  // anything: the plan as data, not console lines meant for a terminal.
  if (flags.json) {
    const actions = await decideTemplateSet({
      targetDir,
      ...config,
      version,
      dryRun: flags.dryRun,
      quiet: true,
    });
    console.log(
      JSON.stringify(
        {
          dryRun: flags.dryRun,
          recorded: newlyDecided,
          dismissed: newlyDismissed,
          files: actions
            .filter((a) => a.action !== 'up-to-date')
            .map((a) => ({ relpath: a.relpath, action: a.action })),
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log('');
  await decideTemplateSet({ targetDir, ...config, version, dryRun: flags.dryRun });
  logPlanSummary(resolveDecisions({ mode: 'guided', answers: decisions, dismissed }));
  const parts = [];
  if (newlyDecided.length > 0) parts.push(`Recorded ${newlyDecided.length} decision${newlyDecided.length === 1 ? '' : 's'}`);
  if (newlyDismissed.length > 0) parts.push(`dismissed ${newlyDismissed.length}`);
  console.log(flags.dryRun ? '\nDry run complete. Nothing was written.' : `\n${parts.join(', ')}.`);
}
