import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveDecisions } from './decisions/resolve.js';
import { getDecision } from './decisions/catalog.js';
import {
  renderAdr,
  renderAdrIndex,
  renderDismissedDecisions,
  renderGlossaryGroup,
  renderGlossaryIndex,
  renderGuideline,
  renderGuidelinesIndex,
  renderLocalAdrIndex,
  renderLocalDocIndex,
  LOCAL_DOC_SECTIONS,
  renderOpenDecisions,
  renderRule,
  renderRulesIndex,
  renderRunbook,
  renderRunbookIndex,
  renderTakenDecisions,
} from './decisions/render.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const templateDir = path.join(__dirname, 'templates');

// Date stamped into generated ADRs. It is stored in the manifest at init and
// reused by every later `update`, so re-running the CLI never rewrites a date
// and never produces a spurious content-hash change.
const FALLBACK_DATE = '2026-01-01';

// Substituted into every agent body that shells out to the CLI (specframe-decide,
// specframe-record, bootstrapper — see their .body.md.tpl files). specframe's own
// pitch is "zero install"; a repo scaffolded with a bare `npx specframe` has no
// `specframe` on PATH, and an agent that gets "command not found" and has no
// other instruction tends to invent an ADR by hand instead — the exact failure
// this whole tool exists to prevent. One shared note, substituted everywhere,
// so the fallback only needs writing once.
const CLI_FALLBACK_NOTE =
  'Run these as `specframe <args>`. If the shell reports the command is not found,\n' +
  'this repository was set up with `npx specframe` and never installed it — use\n' +
  '`npx --yes specframe <args>` instead, same behaviour, no install required. Never\n' +
  'substitute writing the file yourself for a command that fails to run.';

// Substituted into every surface that can create an ADR — the root context files,
// the specframe-record skill, the always-on rules file. The threshold itself is
// not new: it has always been in docs/adr/README.md. But an agent reads whichever
// file its harness loads, and none of those restated it, so every entry point was
// looser than the doc it pointed at — "draft an ADR" with no threshold at all.
// The result is an ADR for a variable name. Defined once here so no surface can
// be the loose one, and so the null outcome is stated where the destinations are.
const ADR_GATE_NOTE =
  'Before recording an ADR, answer all three. An ADR is warranted only if every\n' +
  'answer is yes:\n' +
  '\n' +
  '1. Were there **two or more credible options** — ones a competent team would\n' +
  '   argue about, not one real option and some bad ones?\n' +
  '2. Would **reversing it later be expensive** — does it shape code that does not\n' +
  '   exist yet, or does unwinding it reach past the module it lives in?\n' +
  '3. Would someone reading this code in six months **ask "why is it like this?"**\n' +
  '   and not find the answer in the code?\n' +
  '\n' +
  'If any answer is no, do not record an ADR. Say which question failed, then route\n' +
  'it: a default with room for judgement is a guideline, a constraint with no\n' +
  'acceptable exception is a rule, a procedure is a runbook, a term belongs in the\n' +
  'glossary — and a reversible implementation detail is none of them, so **writing\n' +
  'nothing is the correct outcome.** One destination is not a file at all: if the\n' +
  'trade-off is the **user\'s to make** — product, budget, risk appetite — no\n' +
  'document is the answer. Ask them, and write nothing until they answer. Do not\n' +
  'record an ADR to park the question. Naming, file layout, which helper to call, a\n' +
  'library used in one place and swappable in an afternoon: that is code, not a\n' +
  'decision. An ADR for one of those costs more than it records — it dilutes the\n' +
  'log until an ADR stops meaning anything.';

// The only root file specframe still writes. Agent context is not scaffolded as
// a file any more — no AGENTS.md, no CLAUDE.md, no per-tool pointer: `docs/` is
// the source of truth and the commands and skills under AGENT_TEMPLATES are how
// an agent reaches it. A pointer file is a copy that goes stale; a command reads
// the log at the moment it runs.
export const TEMPLATE_TARGETS = [
  { template: 'pr-template.md.tpl', target: '.github/pull_request_template.md' },
];

// Static scaffolding shared by both modes. A `section` marks a README whose
// `{{index}}` placeholder is filled from the resolved decision set — empty in
// blank mode, a table of generated documents in guided mode. `blankOnly` files
// are worked examples: they teach the expected level of detail, and would be
// noise next to real generated content.
//
// `regenerable` files are refreshed as the decision set grows, and `generated`
// names the headings of the part specframe renders in each: everything else in
// them is prose the user is invited to rewrite, and a refresh has to be able to
// land without touching it.
// Two generated sections in every section index now: the catalog's documents,
// and the ones `specframe doc new` recorded here. `## Added here` is new to
// repositories scaffolded before that command existed — mergeGeneratedSections
// inserts it after `## Index`, which is why the order below is document order.
const INDEX_SECTION = ['## Index', '## Added here'];
// `## When to write one` is the canonical long form of the ADR gate, and it is
// listed here because it has to reach repos scaffolded before the gate was
// tightened. It needs no anchor — every adr/README.md ever written already has it — but the
// order here must stay document order, ahead of the two indexes.
const ADR_README_SECTIONS = ['## When to write one', '## Index', '## Decisions outside the catalog'];
// The third heading is new as of the `dismissed` state and absent from every
// docs/DECISIONS.md written before it — mergeGeneratedSections (update.js)
// inserts it after `## Open decisions` on refresh rather than treating that as
// a restructure, so it reaches existing repos instead of only new ones.
const BACKLOG_SECTIONS = ['## Decisions taken', '## Open decisions', '## Decisions that do not apply'];

const CONTENT_TARGETS = [
  { template: 'docs-readme.md.tpl', target: 'docs/README.md' },
  { template: 'decisions.md.tpl', target: 'docs/DECISIONS.md', regenerable: true, generated: BACKLOG_SECTIONS },
  { template: 'interop.md.tpl', target: 'docs/INTEROP.md' },

  { template: 'adr-readme.md.tpl', target: 'docs/adr/README.md', section: 'adr', regenerable: true, generated: ADR_README_SECTIONS },
  { template: 'adr-0000-template.md.tpl', target: 'docs/adr/0000-template.md' },
  { template: 'adr-0001-decision-policy.md.tpl', target: 'docs/adr/0001-repository-decision-policy.md' },

  { template: 'rules-readme.md.tpl', target: 'docs/rules/README.md', section: 'rules', regenerable: true, generated: INDEX_SECTION },
  { template: 'rules-0000-template.md.tpl', target: 'docs/rules/0000-template.md' },
  { template: 'rules-0001-example.md.tpl', target: 'docs/rules/0001-example.md', blankOnly: true },

  { template: 'guidelines-readme.md.tpl', target: 'docs/guidelines/README.md', section: 'guidelines', regenerable: true, generated: INDEX_SECTION },
  { template: 'guidelines-0000-template.md.tpl', target: 'docs/guidelines/0000-template.md' },
  { template: 'guidelines-0001-example.md.tpl', target: 'docs/guidelines/0001-example.md', blankOnly: true },

  { template: 'runbook-readme.md.tpl', target: 'docs/runbook/README.md', section: 'runbooks', regenerable: true, generated: INDEX_SECTION },
  { template: 'runbook-0000-template.md.tpl', target: 'docs/runbook/0000-template.md' },
  { template: 'runbook-0001-example.md.tpl', target: 'docs/runbook/0001-example.md', blankOnly: true },

  { template: 'glossary-readme.md.tpl', target: 'docs/glossary/README.md', section: 'glossary', regenerable: true, generated: INDEX_SECTION },
  { template: 'glossary-0000-template.md.tpl', target: 'docs/glossary/0000-template.md' },
  { template: 'glossary-0001-example.md.tpl', target: 'docs/glossary/0001-example.md', blankOnly: true },
];

// The section key CONTENT_TARGETS uses, mapped to the `doc new` section name.
// They differ in exactly one place — the runbook directory is singular and its
// index renderer is plural — and one map is cheaper than renaming either.
const LOCAL_DOC_FOR_SECTION = {
  rules: 'rule',
  guidelines: 'guideline',
  runbooks: 'runbook',
  glossary: 'glossary',
};

const SECTION_INDEX_RENDERERS = {
  adr: renderAdrIndex,
  rules: renderRulesIndex,
  guidelines: renderGuidelinesIndex,
  runbooks: renderRunbookIndex,
  glossary: renderGlossaryIndex,
};

// Escape a value for a TOML double-quoted basic string.
function tomlBasicString(value) {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

// Each adapter renders a full artifact file from { name, description, body }.
// Paths and formats follow each tool's current (2026) official conventions:
// - Claude:  .claude/agents/*.md, .claude/commands/*.md, .claude/skills/*/SKILL.md
// - Copilot: .github/agents/*.agent.md (custom agents), .github/prompts/*.prompt.md
// - Codex:   .codex/agents/*.toml (developer_instructions), .agents/skills/*/SKILL.md
const AGENT_ADAPTERS = {
  claude: {
    agentPath: (name) => `.claude/agents/${name}.md`,
    commandPath: (name) => `.claude/commands/${name}.md`,
    skillPath: (name) => `.claude/skills/${name}/SKILL.md`,
    renderAgent: ({ name, description, body, model }) =>
      `---\nname: ${name}\ndescription: ${description}\n${model ? `model: ${model}\n` : ''}---\n\n${body}`,
    renderCommand: ({ description, body }) =>
      `---\ndescription: ${description}\n---\n\n${body}`,
    renderSkill: ({ name, description, body }) =>
      `---\nname: ${name}\ndescription: ${description}\n---\n\n${body}`,
  },
  copilot: {
    agentPath: (name) => `.github/agents/${name}.agent.md`,
    // Copilot has no skills; a prompt is the closest thing it has, and the
    // same path as its commands on purpose. A workflow shipped as both — and
    // every skill-only workflow, which would otherwise not reach Copilot at
    // all — lands there once, the skill winning the collision, exactly as on
    // Codex. See buildAgentEntries.
    commandPath: (name) => `.github/prompts/${name}.prompt.md`,
    skillPath: (name) => `.github/prompts/${name}.prompt.md`,
    renderAgent: ({ description, body }) =>
      `---\ndescription: ${description}\n---\n\n${body}`,
    renderCommand: ({ description, body }) =>
      `---\nagent: agent\ndescription: ${description}\n---\n\n${body}`,
    renderSkill: ({ description, body }) =>
      `---\nagent: agent\ndescription: ${description}\n---\n\n${body}`,
  },
  codex: {
    // Codex subagents are TOML; the instruction body lives in developer_instructions.
    agentPath: (name) => `.codex/agents/${name}.toml`,
    // Codex has no project-level prompts; the repo-shareable equivalent is a skill.
    commandPath: (name) => `.agents/skills/${name}/SKILL.md`,
    skillPath: (name) => `.agents/skills/${name}/SKILL.md`,
    renderAgent: ({ name, description, body }) =>
      `name = "${tomlBasicString(name)}"\n` +
      `description = "${tomlBasicString(description)}"\n` +
      `developer_instructions = '''\n${body.trimEnd()}\n'''\n`,
    renderCommand: ({ name, description, body }) =>
      `---\nname: ${name}\ndescription: ${description}\n---\n\n${body}`,
    renderSkill: ({ name, description, body }) =>
      `---\nname: ${name}\ndescription: ${description}\n---\n\n${body}`,
  },
};

// specframe ships no per-feature planning asset (spec/plan, an "explorer" or
// "planner" subagent): every harness already has those, and duplicating them
// is what made specframe read as a competitor to Spec Kit/BMAD/OpenSpec instead
// of their complement. What is here is decision-shaped only. See docs/INTEROP.md.
//
// `body` names the file in `agents-src/bodies/` to render (defaults to `name`);
// it exists so two entries that share a name across kinds — `specframe-decide`
// is both a command and a skill, on purpose, since it is one workflow — or two
// entries that reuse one name for a different scope, can point at distinct or
// identical body files without a naming collision on disk.
// One command and one skill per section, rather than one that asks which
// section you meant. The section is the decision that is hardest to get right
// and easiest to state up front, so the command name states it: reaching for
// `/specframe-add-rule` is already the claim that this is a rule. They share
// one body (`specframe-add`), differing only through `vars`.
const ADD_SECTIONS = [
  {
    section: 'rule',
    label: 'rule',
    article: 'a',
    prefix: 'R-NNNN',
    dir: 'docs/rules',
    belongs: 'A constraint with no acceptable exception, and something that checks it. If a reviewer could reasonably wave a violation through, it is a guideline, not a rule.',
    fill: '`Enforcement` names what checks it — a CI job, a linter, a permission, code review. If the honest answer is "nothing", set `Status: advisory` rather than claiming enforcement that does not exist.',
  },
  {
    section: 'guideline',
    label: 'guideline',
    article: 'a',
    prefix: 'GL-NNNN',
    dir: 'docs/guidelines',
    belongs: 'The way this repository builds something by default, which a good reason can override. If no reason could ever justify departing from it, it is a rule, not a guideline.',
    fill: '`Rationale` says why this default and not the obvious alternative — a guideline nobody can argue with was never a choice. Give a `Prefer` and an `Avoid` example when the difference is easier shown than stated.',
  },
  {
    section: 'runbook',
    label: 'runbook',
    article: 'a',
    prefix: 'RB-NNNN',
    dir: 'docs/runbook',
    belongs: 'What to do when something breaks or has to be operated: the symptom, the steps, how you know it worked. If nothing has gone wrong, it is a guideline, not a runbook.',
    fill: 'The steps are commands as they would actually be run here, not a description of them. `Verification` is the check that it worked, and `Rollback` is what to do when a step makes it worse — neither is optional, and "not applicable" is an answer only if it is true.',
  },
  {
    section: 'glossary',
    label: 'glossary group',
    article: 'a',
    prefix: 'GLO-NNNN',
    dir: 'docs/glossary',
    belongs: 'A domain area, and the words that mean something specific inside it. A term that belongs to an area already recorded is added to that file — only a new area needs a new one.',
    fill: 'Each term gets one or two sentences saying what it means *here*, not in general, and naming what it is not when a neighbouring term is easy to confuse it with.',
  },
];

const addEntries = (describe) =>
  ADD_SECTIONS.map(({ section, label, article, prefix, dir, belongs, fill }) => ({
    name: `specframe-add-${section}`,
    description: describe({ section, label, dir }),
    body: 'specframe-add',
    vars: {
      // The other three, so a body never offers the command it already is.
      addOthers: ADD_SECTIONS.filter((other) => other.section !== section)
        .map((other) => `\`/specframe-add-${other.section}\``)
        .join(', '),
      addSection: section,
      addLabel: label,
      addArticle: article,
      addPrefix: prefix,
      addDir: dir,
      addBelongs: belongs,
      addFill: fill,
    },
  }));

const AGENT_TEMPLATES = {
  agents: [
    { name: 'bootstrapper', description: 'Populate ADR/rules/guidelines/runbook/glossary docs by analyzing an existing codebase.' },
    // model is only rendered by the claude adapter today (see AGENT_ADAPTERS.claude.renderAgent);
    // copilot/codex ignore the extra field safely since their renderAgent doesn't destructure it.
    { name: 'doc-writer', description: 'Render a decided doc entry (ADR, rule, guideline, runbook, or glossary term) into its template file. Mechanical only — does not decide content.', model: 'haiku' },
    { name: 'conformance', description: 'Review diffs against the ADRs, rules and guidelines recorded in this repository.' },
  ],
  commands: [
    { name: 'specframe-decide', description: 'Register an architectural decision — from the catalog or project-specific — with an agent in the loop.', body: 'specframe-decide' },
    { name: 'specframe-conform', description: 'Review current changes against ADRs/rules/guidelines.', body: 'specframe-conform-command' },
    { name: 'specframe-bootstrap', description: 'Populate ADR/rules/guidelines/runbook/glossary from an existing codebase.' },
    { name: 'specframe-audit', description: 'Audit every document under docs/ against the gate its own section publishes, and report what does not belong.' },
    { name: 'specframe-do', description: 'Carry out an implementation task under the enforced rules and recorded ADRs, stopping if it depends on a decision still open.', body: 'specframe-do' },
    ...addEntries(({ label, dir }) => `Add a ${label} to ${dir}/ — the file, its number and its index row in one step.`),
  ],
  skills: [
    { name: 'specframe-decide', description: 'Auto-trigger when an architectural decision needs to be made, or a spec/plan from another tool implies one not yet recorded.', body: 'specframe-decide' },
    { name: 'specframe-record', description: 'Auto-trigger when a decision outside the catalog needs an ADR — a project-specific choice the guided pass never asked about.' },
    { name: 'specframe-conform', description: 'Auto-trigger on diff/PR review: verify compliance with enforced rules.', body: 'specframe-conform-check' },
    { name: 'specframe-doc-sync', description: 'Auto-trigger when a new convention, term, or procedure emerges without a matching doc.' },
    { name: 'specframe-audit', description: 'Auto-trigger when asked whether the docs are compliant: judge every existing document against its section gate. Reviews the standing log, not a diff.' },
    // Explicit-invocation only, unlike its four siblings: the description carries
    // no auto-trigger clause on purpose. Asking for it is the opt-in.
    { name: 'specframe-do', description: 'Invoked explicitly to carry out an implementation task under the enforced rules and recorded ADRs, stopping if it depends on a decision still open.', body: 'specframe-do' },
    ...addEntries(
      ({ label, dir }) =>
        `Invoked explicitly to add a ${label}: checks ${dir}/ for one that already says it, allocates the file through the CLI, and fills it in.`,
    ),
  ],
};

// Substitute {{key}} for every key in `vars`. Placeholders with no matching key
// are left in place: a generated document can legitimately contain one that a
// later pass fills.
function renderTemplate(templateText, vars) {
  let out = templateText;
  for (const [key, value] of Object.entries(vars)) {
    if (value === undefined || value === null) continue;
    out = out.replaceAll(`{{${key}}}`, String(value));
  }
  return out;
}

// Every body lives flat in agents-src/bodies/, named by `entry.body` when the
// entry declares one, or by `entry.name` otherwise — see the comment on
// AGENT_TEMPLATES for why a name can need a body file of its own.
// `entry.vars` lets several entries share one body that differs only in the
// parts that are genuinely per-entry — the four `specframe-add-*` commands are
// one skeleton and one section name. Entry vars win over the global ones, and
// any placeholder neither supplies survives rendering, which plan.test.js
// treats as a failure.
async function readBody(entry, vars) {
  const bodyPath = path.join(templateDir, 'agents-src', 'bodies', `${entry.body ?? entry.name}.body.md.tpl`);
  return renderTemplate(await readFile(bodyPath, 'utf8'), { ...vars, ...entry.vars });
}

async function buildAgentEntries({ targets, vars }) {
  const entries = [];

  for (const target of targets) {
    const adapter = AGENT_ADAPTERS[target];
    if (!adapter) continue;

    for (const entry of AGENT_TEMPLATES.agents) {
      const body = await readBody(entry, vars);
      const content = adapter.renderAgent({ name: entry.name, description: entry.description, body, model: entry.model });
      entries.push({ relpath: adapter.agentPath(entry.name), content, managed: true });
    }

    // A workflow shipped as both a command and a skill (specframe-decide,
    // specframe-conform) is two files on Claude and one on Codex, whose
    // commandPath *is* its skillPath — neither Codex nor Copilot has a second
    // slot to put it in. Two
    // plan entries for one path is not a harmless duplicate: each `update`
    // would find the other's content on disk, call it untouched-since-write,
    // and overwrite it, so the file flip-flops on every run. The skill wins,
    // being the auto-triggered form and what such a path has always ended up
    // holding.
    const skillRelpaths = adapter.skillPath
      ? new Set(AGENT_TEMPLATES.skills.map((entry) => adapter.skillPath(entry.name)))
      : new Set();

    // What the dropped command entry would have rendered, per colliding path.
    // Carried on the surviving entry as an `alternate`: a repo scaffolded before
    // this collision was fixed has that rendering on disk under the other one's
    // hash, which reads as "the user edited it" and yields the same conflict on
    // every update, forever. Recognising specframe's own earlier output lets one
    // update settle it. Never persisted — see manifestFromActions.
    const alternates = new Map();

    for (const entry of AGENT_TEMPLATES.commands) {
      const relpath = adapter.commandPath(entry.name);
      const body = await readBody(entry, vars);
      const content = adapter.renderCommand({ name: entry.name, description: entry.description, body });
      if (skillRelpaths.has(relpath)) {
        alternates.set(relpath, content);
        continue;
      }
      entries.push({ relpath, content, managed: true });
    }

    if (adapter.skillPath) {
      for (const entry of AGENT_TEMPLATES.skills) {
        const relpath = adapter.skillPath(entry.name);
        const body = await readBody(entry, vars);
        const content = adapter.renderSkill({ name: entry.name, description: entry.description, body });
        const alternate = alternates.get(relpath);
        entries.push({
          relpath,
          content,
          managed: true,
          ...(alternate !== undefined ? { alternates: [alternate] } : {}),
        });
      }
    }
  }

  return entries;
}

// Documents produced by the decisions taken. All user-owned: they are this
// repository's decision log from the moment they are written, so `update` never
// touches them.
//
// render.js fills only the placeholders a catalog option supplied; the global
// ones ({{projectName}}, {{packageManager}}) are substituted here, so generated
// documents and static templates go through the same final pass.
// The documents a decision produces. Marked `derived` — a non-persisted marker,
// like `regenerable` — because `specframe revise` needs to be able to refresh
// exactly this set when an answer changes, and nothing else.
function buildDecisionEntries(resolved, { vars }) {
  const entries = [];
  const add = (relpath, content) =>
    entries.push({ relpath, content: renderTemplate(content, vars), managed: false, derived: true });

  for (const adr of resolved.adrs) add(adr.relpath, renderAdr(adr, { date: vars.initDate, resolved }));
  for (const item of resolved.rules) add(item.relpath, renderRule(item));
  for (const item of resolved.guidelines) add(item.relpath, renderGuideline(item));
  for (const item of resolved.runbooks) add(item.relpath, renderRunbook(item));
  for (const group of resolved.glossaryGroups) add(group.relpath, renderGlossaryGroup(group));

  return entries;
}

// Every section key present, each holding an array — so nothing downstream has
// to guard for a manifest written before `doc new` existed.
function normalizeLocalDocs(localDocs = {}) {
  const out = {};
  for (const section of Object.keys(LOCAL_DOC_SECTIONS)) {
    out[section] = Array.isArray(localDocs?.[section]) ? localDocs[section] : [];
  }
  return out;
}

// Normalise a config that may come from a v1 manifest (contentProfile, no mode).
export function normalizeConfig(config = {}) {
  const mode = config.mode === 'guided' ? 'guided' : 'blank';
  const decisions = mode === 'guided' ? (config.decisions ?? {}) : {};

  // Provenance is only meaningful for a decision that was recorded, and is
  // pruned to those so a stale entry cannot change how anything renders.
  const provenance = {};
  for (const [id, source] of Object.entries(config.provenance ?? {})) {
    if (decisions[id] !== undefined && source === 'detected') provenance[id] = source;
  }

  // Revision history, same treatment: kept only for decisions still recorded,
  // and only for entries that carry both a date and a value. A malformed entry
  // would otherwise render as an ADR history line saying nothing.
  const revisions = {};
  for (const [id, entries] of Object.entries(config.revisions ?? {})) {
    if (decisions[id] === undefined || !Array.isArray(entries)) continue;
    const clean = entries
      .filter((entry) => entry && typeof entry.date === 'string' && typeof entry.value === 'string')
      .map((entry) => ({ date: entry.date, value: entry.value }));
    if (clean.length > 0) revisions[id] = clean;
  }

  // Dismissals, inverse-pruned from provenance's rule: kept only for a decision
  // NOT recorded (a dismissal is dead the moment its decision is answered — see
  // resolve.js, decided wins there too), and only for a known catalog id — the
  // predicate being inverted means an unknown id would otherwise never prune
  // itself out the way an unknown id in `provenance` does. Blank mode needs no
  // special case: `decisions` is already forced to `{}` above, so every
  // dismissal passes the "not recorded" test and survives, which is the point
  // — a legacy repo scaffolded blank is the primary use case for this.
  const dismissed = {};
  for (const [id, entry] of Object.entries(config.dismissed ?? {})) {
    if (decisions[id] !== undefined) continue;
    if (!getDecision(id)) continue;
    if (!entry || typeof entry !== 'object') continue;
    dismissed[id] = {
      date: typeof entry.date === 'string' ? entry.date : (config.initDate ?? FALLBACK_DATE),
      reason: typeof entry.reason === 'string' && entry.reason.trim() !== '' ? entry.reason.trim() : null,
    };
  }

  return {
    configVersion: 2,
    projectName: config.projectName,
    packageManager: config.packageManager === 'pnpm' ? 'pnpm' : 'npm',
    mode,
    decisions,
    provenance,
    revisions,
    dismissed,
    agentTargets: config.agentTargets ?? [],
    initDate: config.initDate ?? FALLBACK_DATE,
    // ADRs recorded outside the catalog via `specframe adr new` — see
    // recordLocalAdr below. { number, slug, title, date }, oldest first.
    localAdrs: Array.isArray(config.localAdrs) ? config.localAdrs : [],
    // The same, per section, for `specframe doc new` — rules, guidelines,
    // runbooks and glossary groups this repository needed and the catalog never
    // asked about. Absent from a manifest written before the command existed,
    // hence the per-section default rather than a bare `?? {}`.
    localDocs: normalizeLocalDocs(config.localDocs),
  };
}

/**
 * Render the full set of files this specframe version produces for the given
 * choices. Returns { relpath, content, managed } with forward-slash relpaths
 * (the manifest key form), plus a non-persisted `regenerable` marker on the
 * index files `specframe decide` refreshes. Shared by init, update and decide.
 */
export async function buildTemplatePlan(rawConfig = {}) {
  const config = normalizeConfig(rawConfig);
  const {
    projectName,
    packageManager,
    mode,
    decisions,
    provenance,
    revisions,
    dismissed,
    agentTargets,
    initDate,
    localAdrs,
    localDocs,
  } = config;

  const resolved = resolveDecisions({ mode, answers: decisions, provenance, revisions, dismissed });

  const vars = {
    projectName,
    packageManager,
    initDate,
    takenDecisions: renderTakenDecisions(resolved),
    openDecisions: renderOpenDecisions(resolved),
    dismissedDecisions: renderDismissedDecisions(resolved),
    cliFallback: CLI_FALLBACK_NOTE,
    adrGate: ADR_GATE_NOTE,
  };

  const plan = [];

  for (const item of TEMPLATE_TARGETS) {
    const templateText = await readFile(path.join(templateDir, item.template), 'utf8');
    plan.push({
      relpath: item.target,
      content: renderTemplate(templateText, vars),
      managed: false,
      ...(item.generated ? { sections: item.generated } : {}),
    });
  }

  for (const item of CONTENT_TARGETS) {
    if (item.blankOnly && mode !== 'blank') continue;
    const templateText = await readFile(path.join(templateDir, 'content', item.template), 'utf8');
    const fileVars = item.section
      ? {
          ...vars,
          index: SECTION_INDEX_RENDERERS[item.section](resolved),
          // Every index carries a second generated section, listing what was
          // recorded here rather than pulled from the catalog. The adr README's
          // has its own placeholder and its own command (`adr new`).
          ...(item.section === 'adr'
            ? { localAdrIndex: renderLocalAdrIndex(localAdrs) }
            : { localIndex: renderLocalDocIndex(localDocs[LOCAL_DOC_FOR_SECTION[item.section]], LOCAL_DOC_FOR_SECTION[item.section]) }),
        }
      : vars;
    plan.push({
      relpath: item.target,
      content: renderTemplate(templateText, fileVars),
      managed: false,
      ...(item.regenerable ? { regenerable: true } : {}),
      ...(item.generated ? { sections: item.generated } : {}),
    });
  }

  plan.push(...buildDecisionEntries(resolved, { vars }));

  if (agentTargets.length > 0) {
    plan.push(...(await buildAgentEntries({ targets: agentTargets, vars })));
  }

  return plan;
}

