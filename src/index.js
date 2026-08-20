import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  applyRecommendedDefaults,
  collectAnswerSources,
  parseSetFlag,
  validateAnswers,
} from './answers.js';
import { BLUEPRINTS, BLUEPRINT_IDS } from './decisions/blueprints.js';
import { GROUPS, decisionsForGroup, getDecision, isRelevant } from './decisions/catalog.js';
import { explainDecision } from './decisions/explain.js';
import { PRESET_IDS, PRESETS } from './decisions/presets.js';
import { resolveDecisions, summarize } from './decisions/resolve.js';
import { readManifest } from './manifest.js';
import { askQuestions, askRevision, parseAgentTargets, renderReview } from './prompts.js';
import { findRepoRoot, isGitRepoRoot } from './repo.js';
import { buildReview, diffAnswers, reviewToJSON } from './review.js';
import { configureTheme, terminalWidth, theme, wrapText } from './style.js';
import { createReadlineIo } from './tui.js';
import {
  decideTemplateSet,
  findExistingRootFiles,
  normalizeConfig,
  planRevisionEffects,
  recordLocalAdr,
  reviseTemplateSet,
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
const VALUE_FLAGS = new Set([
  '--preset',
  '--blueprint',
  '--answers',
  '--set',
  '--mode',
  '--name',
  '--pm',
  '--agents',
  '--title',
  '--reason',
  '--group',
]);

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
    json: false,
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
    if (arg === '--json') { flags.json = true; continue; }

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
      continue;
    }

    // A second bare argument is the command's subject — `revise <decision-id>`,
    // `explain <decision-id>`, or `adr <subcommand>`. A third is `adr new
    // <slug>`'s slug. Kept as first-one-wins per slot, so a stray extra
    // argument cannot quietly redirect the command.
    if (flags.target === undefined) { flags.target = arg; continue; }
    if (flags.target2 === undefined) flags.target2 = arg;
  }

  return { command, flags };
}

// The blueprint list in --help. Wrapped at a fixed width rather than the
// terminal's, so `specframe --help | less` looks the same everywhere the rest
// of this hand-wrapped text does.
const HELP_WIDTH = 78;
const HELP_INDENT = ' '.repeat(21);

function describeBlueprint(blueprint) {
  const [first, ...rest] = wrapText(blueprint.hint, HELP_WIDTH, HELP_INDENT);
  return [`  ${blueprint.id.padEnd(19)}${first.trimStart()}`, ...rest].join('\n');
}

const HELP = `specframe — decision-driven scaffolding for AI-ready repositories.

Usage:
  specframe [init] [options]     Scaffold context files at the repo root.
  specframe decide [options]     Record decisions still open in this repo.
  specframe review [options]     Show the decisions recorded here, as a table.
  specframe explain <id>         Show one decision's brief: question, context,
                                  every option with its tradeoff.
  specframe adr new <slug>       Record an ADR for a decision outside the
                                  catalog — a project-specific choice.
  specframe revise [id]          Change a decision already recorded.
  specframe dismiss <id>         Declare a decision can never apply here — every
                                  frontend decision in a backend-only service,
                                  say. Leaves the open backlog with no ADR.
  specframe restore <id>         Undo a dismissal; the decision reopens.
  specframe update [options]     Refresh specframe-managed artifacts.
  specframe uninstall [options]  Remove everything specframe created.

Everything is written to the root of the repository (the nearest ancestor with
a .git directory), even when the CLI is run from a subdirectory.

Init has three ways in:
  blank      Every template plus its filling instructions, and the full decision
             backlog in docs/DECISIONS.md. No decisions taken.
  blueprint  Pick a known architecture and walk the guided pass with its
             decisions already answered — a starting position to argue with.
  guided     Answer decisions from the catalog. Each one becomes an ADR plus the
             rules, guidelines, runbooks and glossary terms it implies. Enter
             takes the recommended option; s leaves a question, or a whole
             section, open. Nothing is written before you see the review table.

Init options:
      --preset <id>   ${PRESET_IDS.join(' | ')}
                      Seeds the wizard; with --yes it runs unattended.
      --blueprint <id>
                      An architecture archetype, listed at the bottom. Seeds
                      the wizard with the way that architecture answers the
                      catalog. Combines with --preset: the posture applies
                      everywhere, the blueprint wins on the decisions that
                      are the shape.
      --set k=v,...   Answer decisions directly, e.g.
                      --set architecture-style=microservices,tdd=strict
                      Repeatable. Overrides --preset and --answers.
      --answers FILE  JSON of { "decision-id": "option-value" }, or a saved
                      .specframe/manifest.json to replay another repo's setup.
      --mode MODE     blank | guided | blueprint. Skips the mode question;
                      blueprint goes straight to the archetype list.
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
  -f, --force         If specframe is already installed here, re-run onboarding
                      from scratch instead of pointing at update/decide. Also
                      answers yes to overwriting AGENTS.md/CLAUDE.md/etc. that
                      already exist from outside specframe, unattended.

Decide options:
  -n, --dry-run    Show what would be written.
      --set / --answers / --preset / --blueprint / --yes / --detected
                   as for init. A blueprint only answers what is still open.

Review options:
      --open       Only the decisions still open.
      --json       Machine-readable: counts plus one object per decision
                   (status — decided, open or dismissed — value, ADR path,
                   and the dismissal reason where there is one). What
                   \`specframe-decide\` reads.

Explain options:
      --json       Machine-readable: question, context, and every option with
                   its statement, consequences, tradeoff and what it emits.
                   Works before init too — there is just no repo context yet.

Adr options ('adr new <slug> --title "..."'):
      --title      Required. The ADR's title.
  -n, --dry-run    Show what would be written, without writing it.
      --json       Print { number, slug, title, relpath } instead of a message.
                   The number comes from a band (9000+) the catalog never
                   allocates, so it can never collide with a future decision.

Revise options:
      --set k=v,...  Revise without prompting, e.g.
                     --set architecture-style=microservices
  -n, --dry-run      Show what would change without writing anything.
  -f, --force        Rewrite a revised document even if you edited it.

The ADR keeps its number and gains a History section naming what the decision
used to be. Documents the new answer no longer implies are reported, never
deleted. A document you edited by hand is kept, with the new version beside it
as <file>.specframe-new; an index is refreshed in place instead, section by
section.

Dismiss options ('dismiss <id>[,<id>...]' or 'dismiss --group <name>'):
      --reason "..."  Why this repository will never take it. Optional — an
                      omitted reason renders as "not applicable to this
                      repository" — but a stated one is worth more in six
                      months, when nobody can tell a judgement from tidying.
      --group <name>  Dismiss every open, relevant decision in one section at
                      once, with the same reason — nine frontend decisions in
                      one call for a backend-only service. Off a terminal,
                      needs --yes.
  -n, --dry-run       Show what would be written, without writing it.
      --json          Print { dismissed, reason, files } instead of a message.
Only applies to a decision still open — an already-decided one is changed with
\`revise\` instead. No ADR is written; the record lives in docs/DECISIONS.md and
the manifest only. \`specframe restore <id>\` undoes it.

Restore options ('restore <id>[,<id>...]'):
  -n, --dry-run       Show what would be written, without writing it.
      --json          Print { restored, files } instead of a message.

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

Presets — how demanding the defaults are:
${PRESET_IDS.map((id) => `  ${id.padEnd(9)} ${PRESETS[id].description}`).join('\n')}

Blueprints — the shape of the system:
${BLUEPRINTS.map(describeBlueprint).join('\n')}

On update, files you own (docs, ADRs, CLAUDE.md, …) are never overwritten.
A managed file you edited by hand is kept; the new version lands beside it as
<file>.specframe-new for you to merge. The one part of a document specframe
keeps writing is the generated section of an index (the \`## Index\` table, and
the two decision lists in DECISIONS.md): those are refreshed in place, so the
prose you add around them survives every decide, revise and update.`;

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

// The wizard's `x` key records only a reason (see applyDecisionResult in
// prompts.js) — dating it happens once, here, when the run's config is
// finalized, exactly like every ADR this same run produces shares one
// `initDate` rather than a per-keystroke timestamp. `?? date` makes this safe
// to call on a dismissal that already carries one (from a previous run).
function stampDismissed(dismissed, date) {
  return Object.fromEntries(
    Object.entries(dismissed).map(([id, entry]) => [id, { date: entry.date ?? date, reason: entry.reason ?? null }]),
  );
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
  console.log(theme.muted('\nRun `specframe init --force` to re-run onboarding from scratch anyway.'));
}

// AGENTS.md/CLAUDE.md/etc. that already exist here, from outside specframe —
// most often a legacy project with its own AI-agent context files. `init` never
// overwrites a file it did not create, so left unquestioned these are silently
// skipped and specframe's pointers (docs/, ADRs, rules) end up unreachable from
// whichever file an agent actually reads. Ask once, before the wizard runs,
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

async function runInit(cwd, version, flags) {
  const targetDir = await resolveTargetDir(cwd);

  const existingManifest = await readManifest(targetDir);
  if (existingManifest?.config && !flags.force) {
    reportAlreadyInstalled(existingManifest);
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

  if (flags.json) {
    const review = buildReview(stored.decisions ?? {}, { dismissed: stored.dismissed ?? {} });
    console.log(JSON.stringify({ version: manifest.version ?? null, ...reviewToJSON(review) }, null, 2));
    return;
  }

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
  console.log(renderReview(stored.decisions ?? {}, { width, openOnly: flags.open, dismissed: stored.dismissed ?? {} }));
  console.log('');

  const s = summarize(
    resolveDecisions({ mode: 'guided', answers: stored.decisions ?? {}, dismissed: stored.dismissed ?? {} }),
  );
  console.log(
    theme.muted(
      s.open > 0
        ? '  `specframe decide` records the open ones.'
        : s.dismissed > 0
          ? '  Every applicable decision is recorded; the rest were dismissed as not applicable.'
          : '  Every decision in this catalog is recorded. Supersede one by editing its ADR.',
    ),
  );
}

// The decision brief — the `?` the interactive wizard shows for one question,
// available without a terminal. Works even without a manifest (a fresh
// directory, before `init`): there is simply no repository context to fold in,
// so the decision shows as open and always relevant. This is what
// `specframe-decide` reads before proposing anything, and what a human can run
// on its own to see the alternatives a given decision weighs.
async function runExplain(cwd, flags) {
  const targetDir = await resolveTargetDir(cwd);
  const id = flags.target;
  if (!id) {
    throw new Error('Usage: specframe explain <decision-id> [--json]\n\nRun `specframe review` to see decision ids.');
  }

  const manifest = await readManifest(targetDir);
  const stored = manifest?.config ? normalizeConfig(manifest.config) : null;
  const explanation = explainDecision(id, {
    answers: stored?.decisions ?? {},
    provenance: stored?.provenance ?? {},
  });
  if (!explanation) {
    throw new Error(
      `Unknown decision: ${id}\nRun \`specframe review\` to see the decisions this repository records.`,
    );
  }

  if (flags.json) {
    console.log(JSON.stringify(explanation, null, 2));
    return;
  }

  console.log(formatExplanation(explanation));
}

function formatExplanation(exp) {
  const lines = [];
  lines.push(`${theme.bold(exp.title)} ${theme.muted(`(ADR-${exp.adr})`)}`, '');
  lines.push(exp.question, '');
  lines.push(theme.muted(exp.help), '');
  lines.push(exp.context, '');

  if (exp.status === 'decided') {
    lines.push(
      `${theme.good('Current:')} ${exp.current}` +
        (exp.provenance === 'detected' ? theme.muted(' (detected, not chosen)') : ''),
    );
  } else {
    lines.push(theme.warn('Not yet decided.'));
  }
  if (!exp.relevant) lines.push(theme.muted('Not currently relevant to this configuration.'));
  lines.push('');

  for (const option of exp.options) {
    const marker = option.recommended ? theme.good(' ★ recommended') : '';
    lines.push(`${theme.bold(option.label)}${marker}` + (option.hint ? theme.muted(`  — ${option.hint}`) : ''));
    lines.push(`  ${option.statement}`);
    for (const consequence of option.consequences) lines.push(`  - ${consequence}`);
    lines.push(theme.muted(`  Tradeoff: ${option.tradeoff}`));
    lines.push('');
  }

  return lines.join('\n').trimEnd();
}

// Record an ADR for a decision the catalog does not ask about — the CLI half
// of the `specframe-record` skill. See writer.js's recordLocalAdr: the number
// comes from the local band the catalog promises never to use, derived from
// disk so it can never collide with what a future catalog adds.
async function runAdrNew(cwd, version, flags) {
  if (flags.target !== 'new') {
    throw new Error(
      `Unknown \`adr\` subcommand: ${flags.target ?? '(none)'}\n\n` +
        'Usage: specframe adr new <slug> --title "..."',
    );
  }
  const slug = flags.target2;
  if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
    throw new Error('Usage: specframe adr new <slug> --title "..."\n\n<slug> must be lowercase, digits and hyphens.');
  }
  if (!flags.title) {
    throw new Error('Usage: specframe adr new <slug> --title "..."\n\n--title is required.');
  }

  const targetDir = await resolveTargetDir(cwd);
  const result = await recordLocalAdr({
    targetDir,
    version,
    slug,
    title: flags.title,
    date: today(),
    dryRun: flags.dryRun,
    quiet: flags.json,
  });

  if (flags.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`${theme.good('[write]')} ${result.relpath}`);
  console.log(theme.muted(`ADR-${result.number}: ${result.title}`));
  console.log(
    theme.muted(
      flags.dryRun
        ? '\nDry run complete. Nothing was written.'
        : '\nFill in Context, Decision, Consequences and Alternatives, then set its Status.',
    ),
  );
}

/**
 * Change a decision this repository has already recorded.
 *
 * The ADR keeps its number — it is *the* record for this decision, and the
 * catalog's numbering promise says 0100 is architecture-style forever — and gains
 * a History section naming what it used to be. Documents the new answer no longer
 * implies are reported, never deleted: they are the user's, and a rule someone
 * extended by hand outnumbers the tidiness of removing it.
 */
async function runRevise(cwd, version, flags) {
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
async function runDismiss(cwd, version, flags) {
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
async function runRestore(cwd, version, flags) {
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
    const initDate = today();
    config = { ...answers, dismissed: stampDismissed(answers.dismissed ?? {}, initDate), initDate };
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
    const resolved = resolveDecisions({ mode: 'guided', answers: config.decisions, dismissed: config.dismissed });
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
      // Informational, not the command's output — stderr, so `--json` callers
      // piping stdout into a parser never see it mixed in.
      console.error(`Operating on repository root: ${root}`);
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

  if (command === 'explain') {
    await runExplain(cwd, flags);
    return;
  }

  if (command === 'adr') {
    await runAdrNew(cwd, version, flags);
    return;
  }

  if (command === 'revise') {
    await runRevise(cwd, version, flags);
    return;
  }

  if (command === 'dismiss') {
    await runDismiss(cwd, version, flags);
    return;
  }

  if (command === 'restore') {
    await runRestore(cwd, version, flags);
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
