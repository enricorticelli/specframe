import process from 'node:process';
import { GROUPS, decisionsForGroup, getDecision, isRelevant } from '../decisions/catalog.js';
import { readManifest } from '../manifest.js';
import { theme } from '../style.js';
import { decideTemplateSet, normalizeConfig, today } from '../writer.js';
import { resolveTargetDir } from './context.js';

function dismissWarning(id, entry) {
  return (
    theme.warn(`\n${id} is already recorded, in docs/adr/${entry.adr}-${entry.slug}.md.`) +
    theme.muted('\nChange it with `specframe revise` instead — dismiss only applies to an open decision.')
  );
}

/**
 * Declare that a decision can never apply to this repository — every frontend
 * decision in a backend-only service, say.
 *
 * Deliberately narrow: only a decision still *open* may be dismissed (an
 * already-decided one is changed with `specframe revise` instead, which keeps
 * the accepted ADR the single source of truth for what was chosen), and a
 * gated-off decision is refused with the same wording `revise` already uses
 * for the same situation. No ADR is written — see docs/DECISIONS.md's own
 * explanation of why — so this reuses `decideTemplateSet` exactly as it is:
 * new documents created, nothing existing touched, and the regenerable
 * indexes (chiefly docs/DECISIONS.md) refreshed.
 */
export async function runDismiss(cwd, version, flags) {
  const targetDir = await resolveTargetDir(cwd);
  const manifest = await readManifest(targetDir);
  if (!manifest?.config) {
    throw new Error(
      `No ${'.specframe/manifest.json'} in ${targetDir}.\n` +
        'Run `specframe init` first — `dismiss` extends an existing scaffold.',
    );
  }

  const stored = normalizeConfig(manifest.config);

  let ids;
  if (flags.group) {
    if (!GROUPS.some((g) => g.id === flags.group)) {
      throw new Error(`Unknown group: ${flags.group}\nGroups: ${GROUPS.map((g) => g.id).join(', ')}`);
    }
    ids = decisionsForGroup(flags.group)
      .filter((d) => isRelevant(d, stored.decisions))
      .filter((d) => stored.decisions[d.id] === undefined && stored.dismissed[d.id] === undefined)
      .map((d) => d.id);
    if (ids.length === 0) {
      console.log(`Nothing to dismiss in "${flags.group}" — every decision there is already recorded or dismissed.`);
      return;
    }
    // The high-blast-radius form — several decisions dismissed at once with
    // one shared reason — needs the same explicit confirmation off a terminal
    // that `init --yes`/`decide --yes` already require for an unreviewed,
    // catalog-wide action.
    if (!process.stdin.isTTY && !flags.yes) {
      throw new Error(
        `--group would dismiss ${ids.length} decisions at once: ${ids.join(', ')}.\n` +
          'Pass --yes to confirm off a terminal.',
      );
    }
  } else {
    ids = (flags.target ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (ids.length === 0) {
      throw new Error(
        'Usage: specframe dismiss <id>[,<id>...] [--reason "..."]\n\n' +
          'Or:    specframe dismiss --group <name> [--reason "..."]',
      );
    }
  }

  // Validated before anything is written, so a typo partway through a
  // multi-id list cannot half-apply.
  for (const id of ids) {
    const decision = getDecision(id);
    if (!decision) {
      throw new Error(
        `Unknown decision: ${id}\nRun \`specframe review\` to see the decisions this repository records.`,
      );
    }
    if (stored.decisions[id] !== undefined) throw new Error(dismissWarning(id, decision));
    if (!isRelevant(decision, stored.decisions)) {
      throw new Error(
        `${id} does not apply to this configuration — an earlier answer already retires it.\n` +
          'Revise that answer first if you want to record something about it.',
      );
    }
  }

  const date = today();
  const reason = flags.reason?.trim() || null;
  const dismissed = { ...stored.dismissed };
  for (const id of ids) dismissed[id] = { date, reason };

  // Never flips `mode` — dismissing is not the same act as recording a
  // decision, and a blank-mode repo dismissing its way through the frontend
  // group should not suddenly gain the guided-mode worked examples it never
  // asked for.
  const config = { ...stored, dismissed };

  if (flags.json) {
    const actions = await decideTemplateSet({ targetDir, ...config, version, dryRun: flags.dryRun, quiet: true });
    console.log(
      JSON.stringify(
        {
          dryRun: flags.dryRun,
          dismissed: ids,
          reason,
          files: actions.filter((a) => a.action !== 'up-to-date').map((a) => ({ relpath: a.relpath, action: a.action })),
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log('');
  await decideTemplateSet({ targetDir, ...config, version, dryRun: flags.dryRun });
  console.log(
    flags.dryRun
      ? '\nDry run complete. Nothing was written.'
      : `\n${theme.good(`Dismissed ${ids.length} decision${ids.length === 1 ? '' : 's'}.`)} ` +
          theme.muted('No ADR was written — see docs/DECISIONS.md. `specframe restore <id>` reopens it.'),
  );
}

/**
 * Undo a dismissal: the decision returns to the open backlog, exactly as if
 * it had never been dismissed. Reuses `decideTemplateSet` the same way
 * `runDismiss` does — restoring writes nothing new, it only refreshes the
 * regenerable indexes so the decision moves back to `## Open decisions`.
 */
export async function runRestore(cwd, version, flags) {
  const targetDir = await resolveTargetDir(cwd);
  const manifest = await readManifest(targetDir);
  if (!manifest?.config) {
    throw new Error(
      `No ${'.specframe/manifest.json'} in ${targetDir}.\n` +
        'Run `specframe init` first — `restore` reopens a decision it dismissed.',
    );
  }

  const stored = normalizeConfig(manifest.config);
  const ids = (flags.target ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (ids.length === 0) {
    throw new Error('Usage: specframe restore <id>[,<id>...]');
  }

  const notDismissed = ids.filter((id) => stored.dismissed[id] === undefined);
  if (notDismissed.length > 0) {
    throw new Error(
      `Not dismissed, so nothing to restore: ${notDismissed.join(', ')}\n` +
        'Run `specframe review` to see the decisions this repository records.',
    );
  }

  const dismissed = { ...stored.dismissed };
  for (const id of ids) delete dismissed[id];
  const config = { ...stored, dismissed };

  if (flags.json) {
    const actions = await decideTemplateSet({ targetDir, ...config, version, dryRun: flags.dryRun, quiet: true });
    console.log(
      JSON.stringify(
        {
          dryRun: flags.dryRun,
          restored: ids,
          files: actions.filter((a) => a.action !== 'up-to-date').map((a) => ({ relpath: a.relpath, action: a.action })),
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log('');
  await decideTemplateSet({ targetDir, ...config, version, dryRun: flags.dryRun });
  console.log(
    flags.dryRun
      ? '\nDry run complete. Nothing was written.'
      : `\n${theme.good(`Restored ${ids.length} decision${ids.length === 1 ? '' : 's'}.`)} ` +
          theme.muted('Back in the open backlog — see docs/DECISIONS.md, or `specframe decide` to record it.'),
  );
}
