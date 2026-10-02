import process from 'node:process';
import { readManifest } from '../manifest.js';
import { AGENT_TARGET_LIST, agentTargetLabel, askAgentTargets, splitAgentTargets } from '../prompts.js';
import { theme } from '../style.js';
import { addAgentTargets, normalizeConfig, removeAgentTargets } from '../writer.js';
import { resolveTargetDir } from './context.js';

// Add native support for an agent harness to a repository that is already
// scaffolded. Onboarding asks which assistants to generate files for exactly
// once, and the answer ages badly: a team that picked Claude in March and adds
// Codex in June had no way to get its files short of `init --force` (which
// re-runs the whole wizard) or `uninstall`. This is that way — it only ever
// adds, so it is equally the command for a repo where nothing was picked.
export async function runAgents(cwd, version, flags) {
  const targetDir = await resolveTargetDir(cwd);
  const manifest = await readManifest(targetDir);
  if (!manifest?.config) {
    throw new Error(
      `No ${'.specframe/manifest.json'} in ${targetDir}.\n` +
        'Run `specframe init` first — `agents` extends an existing scaffold.',
    );
  }

  const stored = normalizeConfig(manifest.config);
  const configured = stored.agentTargets;
  const available = AGENT_TARGET_LIST.map((t) => t.value).filter((value) => !configured.includes(value));
  const context = { targetDir, version, flags, stored, configured, available };

  // `agents` and `agents list` report. `add`, `remove` (`rm`) and `set` write;
  // a bare `agents <ids>` is shorthand for `add`, which is what a first-time
  // reach for this command almost always means.
  const SUBCOMMANDS = new Set(['add', 'remove', 'rm', 'set', 'list']);
  const named = SUBCOMMANDS.has(flags.target) ? flags.target : null;
  const sub = named ?? (flags.target === undefined ? 'list' : 'add');
  const rawList = flags.agents ?? (named ? flags.target2 : flags.target);

  if (sub === 'list') return reportAgentTargets({ configured, available });
  if (sub === 'add') return runAgentsAdd(context, rawList);
  if (sub === 'set') return runAgentsSet(context, rawList);
  return runAgentsRemove(context, rawList);
}

// The id list a subcommand was given, validated. `null` means "nothing was
// named" — the caller decides whether to open a picker or explain itself.
function parseAgentList(rawList) {
  if (!rawList) return null;
  const { valid, unknown } = splitAgentTargets(rawList);
  if (unknown.length > 0) {
    throw new Error(
      `Unknown agent target(s): ${unknown.join(', ')}\n` +
        `Expected any of: ${AGENT_TARGET_LIST.map((t) => t.value).join(', ')}.`,
    );
  }
  return valid;
}

async function runAgentsAdd({ targetDir, version, flags, stored, configured, available }, rawList) {
  // Validated before the state checks below, so a typo is reported as a typo
  // rather than as whatever this repository happens not to need.
  let requested = parseAgentList(rawList);

  if (available.length === 0) {
    console.log('Every agent harness specframe knows about is already configured here. Nothing to add.');
    return;
  }

  if (requested === null) {
    if (flags.yes || !process.stdin.isTTY) {
      throw new Error(
        'Which agent harness? Name one or more, e.g. `specframe agents add codex,copilot`.\n' +
          `Still available here: ${available.join(', ')}.`,
      );
    }
    requested = await askAgentTargets({ available });
    if (requested === null || requested.length === 0) {
      console.log(theme.muted('\nNothing selected. Nothing was written.'));
      return;
    }
  }

  const alreadyThere = requested.filter((value) => configured.includes(value));
  if (alreadyThere.length > 0) {
    console.warn(
      theme.muted(`\nAlready configured here, left as they are: ${alreadyThere.join(', ')}.`),
    );
    console.warn(theme.muted('Run `specframe update` to refresh their files.\n'));
  }
  const added = requested.filter((value) => !configured.includes(value));
  if (added.length === 0) {
    console.log('Nothing to add.');
    return;
  }

  const agentTargets = [...configured, ...added];
  // Silent under --json: stdout belongs to the document a caller is parsing.
  if (!flags.json) {
    console.log(
      `\nAdding ${added.map((value) => theme.bold(agentTargetLabel(value))).join(', ')} ` +
        theme.muted(
          `to ${configured.length > 0 ? `the ${configured.length} already configured here` : 'this repository'}.`,
        ) +
        '\n',
    );
  }

  const actions = await addAgentTargets({
    targetDir,
    ...stored,
    agentTargets,
    previousTargets: configured,
    version,
    force: flags.force,
    dryRun: flags.dryRun,
    quiet: flags.json,
  });

  if (flags.json) {
    console.log(
      JSON.stringify(
        { dryRun: flags.dryRun, added, agentTargets, files: fileReport(actions) },
        null,
        2,
      ),
    );
    return;
  }

  if (flags.dryRun) {
    console.log('\nDry run complete. Nothing was written.');
    return;
  }
  console.log(
    `\n${theme.good('Done.')} ${added.join(', ')} ${added.length === 1 ? 'now reads' : 'now read'} ` +
      'the same context as the rest of this repository.',
  );
}

// Drop a harness. Nothing about the decision log changes — this is the tool's
// own files and nothing else — so removing the last one is a position, not a
// half-uninstall: docs/ is the log and stands on its own.
async function runAgentsRemove({ targetDir, version, flags, stored, configured }, rawList) {
  let requested = flags.all ? [...configured] : parseAgentList(rawList);

  if (configured.length === 0) {
    console.log('No agent harness is configured here. Nothing to remove.');
    return;
  }

  if (requested === null) {
    if (flags.yes || !process.stdin.isTTY) {
      throw new Error(
        'Which agent harness? Name one or more, e.g. `specframe agents remove codex`.\n' +
          `Pass --all to remove every one. Configured here: ${configured.join(', ')}.`,
      );
    }
    requested = await askAgentTargets({ available: configured, verb: 'remove' });
    if (requested === null || requested.length === 0) {
      console.log(theme.muted('\nNothing selected. Nothing was removed.'));
      return;
    }
  }

  const notHere = requested.filter((value) => !configured.includes(value));
  if (notHere.length > 0) {
    console.warn(theme.muted(`\nNot configured here, nothing to remove: ${notHere.join(', ')}.`));
  }
  const removed = requested.filter((value) => configured.includes(value));
  if (removed.length === 0) {
    console.log('Nothing to remove.');
    return;
  }

  const agentTargets = configured.filter((value) => !removed.includes(value));
  if (!flags.json) {
    console.log(
      `\nRemoving ${removed.map((value) => theme.bold(agentTargetLabel(value))).join(', ')}` +
        theme.muted(
          agentTargets.length > 0
            ? `, keeping ${agentTargets.join(', ')}.`
            : ' — this repository will have no harness-specific files left.',
        ) +
        '\n',
    );
  }

  const actions = await removeAgentTargets({
    targetDir,
    ...stored,
    agentTargets,
    previousTargets: configured,
    version,
    purge: flags.purge,
    force: flags.force,
    dryRun: flags.dryRun,
    quiet: flags.json,
  });

  if (flags.json) {
    console.log(
      JSON.stringify(
        { dryRun: flags.dryRun, removed, agentTargets, files: fileReport(actions) },
        null,
        2,
      ),
    );
    return;
  }

  const kept = actions.filter((action) => action.action !== 'orphan-remove');
  if (kept.length > 0) {
    console.log(
      theme.muted(
        `\n${kept.length} file(s) were kept: a managed one you had edited, or one that is yours to own.` +
          '\nRemove them yourself, or re-run with --force (edited) / --purge (yours).',
      ),
    );
  }

  if (flags.dryRun) {
    console.log('\nDry run complete. Nothing was removed.');
    return;
  }
  console.log(
    `\n${theme.good('Done.')} ` +
      (agentTargets.length > 0
        ? `${agentTargets.join(', ')} ${agentTargets.length === 1 ? 'still reads' : 'still read'} this repository's context.`
        : 'No harness-specific files here now; docs/ is untouched and still the log.'),
  );
}

// The declarative form: name the harnesses this repository should have, and
// whatever that implies happens. `set none` leaves it with none. It exists
// because the two-step ("stop shipping codex, start shipping copilot") is the
// shape of the actual intent, and doing it as add-then-remove by hand means a
// window where the repo has both, or neither.
async function runAgentsSet(context, rawList) {
  const { configured, flags } = context;
  const requested = parseAgentList(rawList);
  if (requested === null) {
    throw new Error(
      'Which agent harnesses should this repository have?\n' +
        'Name them all — `specframe agents set claude,codex` — or `set none` for none.\n' +
        `Configured here: ${configured.length > 0 ? configured.join(', ') : 'none'}.`,
    );
  }

  const toRemove = configured.filter((value) => !requested.includes(value));
  const toAdd = requested.filter((value) => !configured.includes(value));
  if (toRemove.length === 0 && toAdd.length === 0) {
    console.log(
      `Already exactly ${configured.length > 0 ? configured.join(', ') : 'none'}. Nothing to do.`,
    );
    return;
  }

  // Removal first, so the intermediate state is the smaller one: an interrupted
  // `set` leaves a repo shipping less than asked for rather than files for a
  // harness that was meant to go.
  if (toRemove.length > 0) {
    await runAgentsRemove(context, toRemove.join(','));
  }
  if (toAdd.length > 0) {
    const configuredNow = configured.filter((value) => !toRemove.includes(value));
    await runAgentsAdd(
      {
        ...context,
        stored: { ...context.stored, agentTargets: configuredNow },
        configured: configuredNow,
        available: AGENT_TARGET_LIST.map((t) => t.value).filter((value) => !configuredNow.includes(value)),
      },
      toAdd.join(','),
    );
  }
}

const fileReport = (actions) => actions.map((a) => ({ relpath: a.relpath, action: a.action }));

function reportAgentTargets({ configured, available }) {
  const label = (value) => {
    const entry = AGENT_TARGET_LIST.find((t) => t.value === value);
    return `  ${theme.bold(value.padEnd(10))}${theme.muted(entry ? entry.hint : '')}`;
  };

  if (configured.length === 0) {
    console.log(theme.warn('No agent harness is configured in this repository.'));
    console.log(theme.muted('Each one adds that tool\'s subagents, commands and skills, wired to docs/.'));
  } else {
    console.log(theme.bold('Configured here:'));
    for (const value of configured) console.log(label(value));
  }

  if (available.length === 0) {
    console.log(theme.muted('\nEvery harness specframe knows about is configured here.'));
    console.log(theme.muted(`Run \`specframe agents remove ${configured[0]}\` to drop one.`));
    return;
  }

  console.log(`\n${theme.bold('Available to add:')}`);
  for (const value of available) console.log(label(value));
  console.log(
    theme.muted(
      `\nRun \`specframe agents add ${available[0]}\` (or with no argument, to pick from a list)` +
        `${configured.length > 0 ? `, \`specframe agents remove ${configured[0]}\`` : ''}, ` +
        'or `specframe agents set <ids>` to name the exact set.',
    ),
  );
}
