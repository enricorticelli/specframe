import { BLUEPRINTS } from './decisions/blueprints.js';
import { PRESET_IDS, PRESETS } from './decisions/presets.js';
import { wrapText } from './style.js';

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
    all: false,
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
    if (arg === '--all') { flags.all = true; continue; }

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
    // <slug>`'s slug, and a fourth `doc new <section> <slug>`'s. Kept as
    // first-one-wins per slot, so a stray extra argument cannot quietly
    // redirect the command.
    if (flags.target === undefined) { flags.target = arg; continue; }
    if (flags.target2 === undefined) { flags.target2 = arg; continue; }
    if (flags.target3 === undefined) flags.target3 = arg;
  }

  return { command, flags, commandSeen };
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

export const HELP = `specframe — decision-driven scaffolding for AI-ready repositories.

Usage:
  specframe [options]             Bare, on a terminal: opens a menu of what
                                  applies here — onboarding if this repo isn't
                                  scaffolded yet, otherwise decide/review/
                                  update/etc. Off a terminal, or with -y: acts
                                  the same as \`init\`.
  specframe init [options]        Scaffold context files at the repo root,
                                  skipping the menu.
  specframe decide [options]     Record decisions still open in this repo.
  specframe review [options]     Show the decisions recorded here, as a table.
  specframe explain <id>         Show one decision's brief: question, context,
                                  every option with its tradeoff.
  specframe adr new <slug>       Record an ADR for a decision outside the
                                  catalog — a project-specific choice.
  specframe adr rm <number>      Withdraw one of those: an ADR that should not
                                  have been written. Removes the file and its
                                  index row; the number is never reissued.
  specframe doc new <section> <slug>
                                 The same for the other four sections: a rule,
                                  guideline, runbook or glossary group this
                                  repository needs that the catalog never asked
                                  about. Writes the file from that section's
                                  template and adds its index row.
  specframe revise [id]          Change a decision already recorded.
  specframe dismiss <id>         Declare a decision can never apply here — every
                                  frontend decision in a backend-only service,
                                  say. Leaves the open backlog with no ADR.
  specframe restore <id>         Undo a dismissal; the decision reopens.
  specframe agents [add|remove|set <ids>]
                                 Change which AI assistants (Claude, Codex, …)
                                  get native files in a repo already
                                  scaffolded — including the first one, if none
                                  were picked at init, and none at all. With no
                                  argument, lists what is configured.
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
      --agents LIST   claude,copilot,codex | none
      --detected      These decisions are already implemented in this codebase.
                      Their ADRs say so, and ask for the evidence in the code
                      instead of presenting the choice as new. Use this when
                      documenting an existing repository — /specframe-bootstrap
                      does it for you.
  -f, --force         If specframe is already installed here, re-run onboarding
                      from scratch instead of pointing at update/decide. Also
                      answers yes to overwriting root files that already exist
                      from outside specframe, unattended.

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

Adr options ('adr new <slug> --title "..."', 'adr rm <number>'):
      --title      Required for \`adr new\`. The ADR's title.
  -n, --dry-run    Show what would be written or removed, without doing it.
      --json       Print { number, slug, title, relpath } instead of a message.
                   The number comes from a band (9000+) the catalog never
                   allocates, so it can never collide with a future decision.
                   \`adr rm\` takes a number from that band only: a catalog ADR
                   is a reserved decision, so use \`dismiss\` or \`revise\` instead.

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

Agents subcommands (each takes '<id>[,<id>...]', or no argument on a terminal
to pick from a list):
  agents                     What is configured here, and what can be added.
  agents add codex,copilot   Write those harnesses' native files.
  agents remove codex        Drop a harness's files. --all drops every one.
  agents set claude,codex    Make it exactly this list — adds and removes as
                             needed. 'set none' leaves the repo with none.

Agents options:
      --agents LIST  Same list, as a flag: \`agents add --agents codex,copilot\`.
      --all          On remove: every harness configured here.
  -n, --dry-run      Show what would happen, without touching anything.
  -f, --force        On add: rewrite one of this harness's files if you edited
                     it. On remove: delete one you edited (kept by default).
      --purge        On remove: also delete a file the manifest records as
                     yours. Only repositories scaffolded before specframe
                     stopped writing per-tool context files have one.
      --json         Print { added | removed, agentTargets, files } instead of
                     messages.
Nothing outside the harness's own files — no doc, no ADR — is ever touched, so
a repository with no harness at all is a supported position: docs/ is the log,
and it reads the same to a human. Adding leaves
harnesses already configured alone (\`specframe update\` refreshes their files);
removing deletes only what specframe wrote and you never edited.

Update options:
  -f, --force      Overwrite managed files even if you edited them.
  -n, --dry-run    Show what would change without writing anything.

Uninstall options:
      --purge      Remove every user-owned starter (docs/**, the PR template,
                   …) too, with
                   no prompt. Without it, on a terminal, you are asked which
                   of those (if any) to remove along with the managed files.
  -n, --dry-run    Show what would be removed.

Common options:
  -h, --help       Show this help.
      --no-color   Plain output. NO_COLOR=1 and a non-TTY do the same;
                   SPECFRAME_ASCII=1 also drops the box drawing.

Presets — how demanding the defaults are:
${PRESET_IDS.map((id) => `  ${id.padEnd(9)} ${PRESETS[id].description}`).join('\n')}

Blueprints — the shape of the system:
${BLUEPRINTS.map(describeBlueprint).join('\n')}

On update, files you own (docs, ADRs, …) are never overwritten.
A managed file you edited by hand is kept; the new version lands beside it as
<file>.specframe-new for you to merge. The one part of a document specframe
keeps writing is the generated section of an index (the \`## Index\` table, and
the two decision lists in DECISIONS.md): those are refreshed in place, so the
prose you add around them survives every decide, revise and update.`;

