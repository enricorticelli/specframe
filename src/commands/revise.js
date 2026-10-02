import process from 'node:process';
import { parseSetFlag, validateAnswers } from '../answers.js';
import { getDecision } from '../decisions/catalog.js';
import { resolveDecisions } from '../decisions/resolve.js';
import { readManifest } from '../manifest.js';
import { askRevision } from '../prompts.js';
import { diffAnswers } from '../review.js';
import { theme } from '../style.js';
import { normalizeConfig, planRevisionEffects, reviseTemplateSet, today } from '../writer.js';
import { reportInvalidAnswers, logPlanSummary, resolveTargetDir } from './context.js';

/**
 * Change a decision this repository has already recorded.
 *
 * The ADR keeps its number — it is *the* record for this decision, and the
 * catalog's numbering promise says 0100 is architecture-style forever — and gains
 * a History section naming what it used to be. Documents the new answer no longer
 * implies are reported, never deleted: they are the user's, and a rule someone
 * extended by hand outnumbers the tidiness of removing it.
 */
export async function runRevise(cwd, version, flags) {
  const targetDir = await resolveTargetDir(cwd);
  const manifest = await readManifest(targetDir);
  if (!manifest?.config) {
    throw new Error(
      `No ${'.specframe/manifest.json'} in ${targetDir}.\n` +
        'Run `specframe init` first — `revise` changes decisions it recorded.',
    );
  }

  const stored = normalizeConfig(manifest.config);
  if (Object.keys(stored.decisions).length === 0) {
    throw new Error(
      'No decisions are recorded in this repository yet.\n' +
        'Run `specframe decide` to record some — `revise` changes existing ones.',
    );
  }

  const target = flags.target ?? null;
  if (target && !getDecision(target)) {
    throw new Error(
      `Unknown decision: ${target}\n` +
        'Run `specframe review` to see the decisions this repository records.',
    );
  }

  // Non-interactive revision, for scripts and for the agents: `--set` names the
  // new values directly.
  let decisions;
  if (flags.set) {
    const { valid, invalid } = validateAnswers(parseSetFlag(flags.set));
    reportInvalidAnswers(invalid);
    // A dismissed decision is not "recorded" in the ordinary sense, but --set
    // silently answering it would bypass `specframe restore` just the same —
    // the whole point of a dismissal is that nothing decides it quietly.
    for (const id of Object.keys(valid)) {
      const dismissal = stored.dismissed[id];
      if (!dismissal) continue;
      console.warn(
        theme.warn(`\nIgnoring ${id}: dismissed on ${dismissal.date}${dismissal.reason ? ` — ${dismissal.reason}` : ''}.`),
      );
      console.warn(theme.muted(`Run \`specframe restore ${id}\` first if that is no longer true.\n`));
      delete valid[id];
    }
    if (Object.keys(valid).length === 0) {
      throw new Error('--set named no decision this catalog knows. Nothing to revise.');
    }
    decisions = { ...stored.decisions, ...valid };
  } else if (!process.stdin.isTTY) {
    throw new Error(
      'Not running on a terminal, so there is nothing to revise interactively.\n' +
        'Pass --set decision-id=option-value.',
    );
  } else {
    const answered = await askRevision({
      decisions: stored.decisions,
      target,
      version,
    });
    if (answered === null) {
      console.log(theme.muted('\nCancelled. Nothing was written.'));
      return;
    }
    decisions = answered;
  }

  // `--set` can name a decision this configuration has gated off — contract
  // testing in a monolith, say. Recording it would put a value in the manifest
  // that no ADR renders and no document reflects, so it is dropped out loud
  // rather than kept as a fact nothing on disk agrees with.
  const notApplicable = new Set(
    resolveDecisions({ mode: 'guided', answers: decisions }).notApplicable.map(
      (entry) => entry.decision.id,
    ),
  );
  if (notApplicable.size > 0) {
    const dropped = [...notApplicable].filter((id) => decisions[id] !== stored.decisions[id]);
    if (dropped.length > 0) {
      console.warn(
        theme.warn(`\nIgnoring decisions that do not apply to this configuration: ${dropped.join(', ')}`),
      );
      console.warn(theme.muted('An earlier answer retires them — revise that one first.\n'));
    }
    decisions = Object.fromEntries(
      Object.entries(decisions).filter(([id]) => !notApplicable.has(id) || stored.decisions[id] !== undefined),
    );
  }

  const changes = diffAnswers(stored.decisions, decisions);
  if (changes.length === 0) {
    console.log(theme.muted('\nNo decision changed. Nothing was written.'));
    return;
  }

  // History gets the value being replaced, dated today. A decision recorded for
  // the first time has no history to write; one that was reopened keeps the
  // history it had, so re-answering it later still shows the whole chain.
  const revisions = { ...stored.revisions };
  for (const change of changes) {
    if (change.kind !== 'changed') continue;
    const previous = revisions[change.decision.id] ?? [];
    revisions[change.decision.id] = [...previous, { date: today(), value: change.fromValue }];
  }

  const config = { ...stored, mode: 'guided', decisions, revisions };
  const before = resolveDecisions({
    mode: 'guided',
    answers: stored.decisions,
    provenance: stored.provenance,
    dismissed: stored.dismissed,
  });
  const after = resolveDecisions({
    mode: 'guided',
    answers: decisions,
    provenance: stored.provenance,
    dismissed: stored.dismissed,
  });
  const effects = planRevisionEffects({ before, after });

  console.log('');
  await reviseTemplateSet({ targetDir, ...config, version, dryRun: flags.dryRun });

  const plural = (n, one, many) => (n === 1 ? one : many);

  if (effects.added.length > 0) {
    console.log(
      `\n${theme.good(String(effects.added.length))} ` +
        theme.muted(
          `${plural(effects.added.length, 'document is', 'documents are')} new for these answers.`,
        ),
    );
  }
  if (effects.orphaned.length > 0) {
    console.log(
      `\n${theme.warn(String(effects.orphaned.length))} ` +
        theme.muted(
          `${plural(effects.orphaned.length, 'document is', 'documents are')} no longer implied by any decision.`,
        ),
    );
    console.log(
      theme.muted('Left in place — these files are yours; remove them if nothing depends on them:'),
    );
    for (const doc of effects.orphaned) {
      console.log(`  ${theme.warn(theme.glyph.bullet)} ${doc.relpath} ${theme.muted(`— ${doc.title}`)}`);
    }
  }

  // A revision can make questions relevant that the old answer had retired —
  // choosing microservices opens every question about distribution. Saying so is
  // the difference between an incomplete decision log and one nobody knows is
  // incomplete.
  const opened = after.open.length - before.open.length;
  if (opened > 0) {
    console.log(
      `\n${theme.warn(String(opened))} ` +
        theme.muted(
          `${plural(opened, 'decision is', 'decisions are')} now relevant that the old answer had ` +
            'retired. Run `specframe decide` to record them.',
        ),
    );
  }

  logPlanSummary(after);
  console.log(
    flags.dryRun
      ? theme.muted('\nDry run complete. Nothing was written.')
      : `\n${theme.good(`Revised ${changes.length} decision${changes.length === 1 ? '' : 's'}.`)} ` +
          theme.muted('Each ADR records what it used to be, under History.'),
  );
}
