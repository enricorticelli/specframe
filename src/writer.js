import { access, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { manifestFromActions, readManifest, writeManifest, MANIFEST_RELPATH } from './manifest.js';
import { planAgentRemoval, planUpdateActions, planUninstallActions } from './update.js';
import { resolveDecisions } from './decisions/resolve.js';
import { LOCAL_ADR_MIN, LOCAL_ADR_STEP, getDecision } from './decisions/catalog.js';
import { pad, theme } from './style.js';
import {
  renderAdr,
  renderAdrIndex,
  renderDismissedDecisions,
  renderGlossaryGroup,
  renderGlossaryIndex,
  renderGuideline,
  renderGuidelinesIndex,
  renderLocalAdr,
  renderLocalAdrIndex,
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
  'nothing is the correct outcome.** Naming, file layout, which helper to call, a\n' +
  'library used in one place and swappable in an afternoon: that is code, not a\n' +
  'decision. An ADR for one of those costs more than it records — it dilutes the\n' +
  'log until an ADR stops meaning anything.';

export function today() {
  return new Date().toISOString().slice(0, 10);
}

// Every file the CLI touches is reported on one line, and a run writes dozens of
// them. Colouring the verb and aligning the paths is what turns that wall into
// something you can skim for the two lines that are not `[write]`.
const ACTION_TONE = {
  write: 'good',
  update: 'good',
  refresh: 'good',
  ok: 'muted',
  skip: 'muted',
  keep: 'warn',
  orphan: 'warn',
  conflict: 'bad',
  remove: 'bad',
};

function actionTag(label, { dryRun = false } = {}) {
  const tone = theme[ACTION_TONE[label] ?? 'muted'];
  const prefix = dryRun ? theme.muted('[dry-run] ') : '';
  // 11, not 10: `[conflict]` is itself ten columns wide, and padding to its own
  // length leaves the path with no space in front of it.
  return prefix + pad(tone(`[${label}]`), 11);
}

// AGENTS.md is the one root file that carries a generated section. The ADR gate
// has to reach repositories scaffolded before it existed, and AGENTS.md is
// user-owned: without this, `update` reports `[keep] your file` and the file
// every agent reads first keeps the version of the instruction that had no
// threshold at all. `## When something new emerges` is listed with it because
// mergeGeneratedSections needs an anchor that already exists on disk to insert
// a brand-new heading after — see its doc comment in update.js. That makes the
// routing list specframe's to rewrite, which is the point: it is the list that
// was wrong. Not `regenerable` — the gate is static, so `update` is the only
// thing that needs to carry it, not every `decide` and `revise`.
const AGENTS_SECTIONS = ['## When something new emerges', '## The ADR gate'];

const TEMPLATE_TARGETS = [
  { template: 'AGENTS.md.tpl', target: 'AGENTS.md', generated: AGENTS_SECTIONS },
  { template: 'CLAUDE.md.tpl', target: 'CLAUDE.md' },
  {
    template: 'copilot-instructions.md.tpl',
    target: '.github/copilot-instructions.md',
  },
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
const INDEX_SECTION = ['## Index'];
// `## When to write one` is the canonical long form of the ADR gate, and it is
// listed here for the same reason AGENTS.md carries one: it has to reach repos
// scaffolded before the gate was tightened. Unlike AGENTS.md's new heading it
// needs no anchor — every adr/README.md ever written already has it — but the
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
    commandPath: (name) => `.github/prompts/${name}.prompt.md`,
    skillPath: null,
    renderAgent: ({ description, body }) =>
      `---\ndescription: ${description}\n---\n\n${body}`,
    renderCommand: ({ description, body }) =>
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

// Rules adapters cover agents that read a single native rules/instructions file
// rather than the subagent/command/skill triad. Each renders one thin pointer
// back to AGENTS.md + docs/ from a shared body.
// - managed:false → the tool's primary context file the user is expected to own
//   and extend (like CLAUDE.md). Never overwritten on update.
// - managed:true  → a specframe-namespaced rule inside the tool's rules dir,
//   refreshed on update (with the usual .specframe-new safety net).
const RULES_ADAPTERS = {
  gemini: {
    path: 'GEMINI.md',
    managed: false,
    render: ({ body }) => body,
  },
  continue: {
    path: '.continue/rules/specframe.md',
    managed: true,
    render: ({ body }) =>
      '---\n' +
      'name: specframe context\n' +
      'description: Canonical AI-agent context for this repository.\n' +
      'alwaysApply: true\n' +
      `---\n\n${body}`,
  },
  amazonq: {
    path: '.amazonq/rules/specframe.md',
    managed: true,
    render: ({ body }) => body,
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
  ],
  skills: [
    { name: 'specframe-decide', description: 'Auto-trigger when an architectural decision needs to be made, or a spec/plan from another tool implies one not yet recorded.', body: 'specframe-decide' },
    { name: 'specframe-record', description: 'Auto-trigger when a decision outside the catalog needs an ADR — a project-specific choice the guided pass never asked about.' },
    { name: 'specframe-conform', description: 'Auto-trigger on diff/PR review: verify compliance with enforced rules.', body: 'specframe-conform-check' },
    { name: 'specframe-doc-sync', description: 'Auto-trigger when a new convention, term, or procedure emerges without a matching doc.' },
    { name: 'specframe-audit', description: 'Auto-trigger when asked whether the docs are compliant: judge every existing document against its section gate. Reviews the standing log, not a diff.' },
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

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function writeIfMissing(targetPath, content, targetDir, { overwrite = false } = {}) {
  const alreadyThere = await exists(targetPath);
  if (alreadyThere && !overwrite) {
    console.log(`${actionTag('skip')}${theme.muted(path.relative(targetDir, targetPath))}`);
    return { written: false, existed: true };
  }

  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, content, 'utf8');
  console.log(`${actionTag(alreadyThere ? 'update' : 'write')}${path.relative(targetDir, targetPath)}`);
  return { written: true, existed: alreadyThere };
}

// Root-level files init would create — AGENTS.md, CLAUDE.md, the two .github
// templates — that are already on disk in a repo specframe has never scaffolded.
// Most often a legacy project with its own AI-agent context file: `init` never
// overwrites a file it did not create, so left unquestioned these would just be
// skipped, leaving specframe's pointers unreachable from whichever file an agent
// actually reads. Checked up front so the CLI can ask instead of skipping quietly.
export async function findExistingRootFiles(targetDir) {
  const found = [];
  for (const { target } of TEMPLATE_TARGETS) {
    if (await exists(toAbsPath(targetDir, target))) found.push(target);
  }
  return found;
}

// Every body lives flat in agents-src/bodies/, named by `entry.body` when the
// entry declares one, or by `entry.name` otherwise — see the comment on
// AGENT_TEMPLATES for why a name can need a body file of its own.
async function readBody(entry, vars) {
  const bodyPath = path.join(templateDir, 'agents-src', 'bodies', `${entry.body ?? entry.name}.body.md.tpl`);
  return renderTemplate(await readFile(bodyPath, 'utf8'), vars);
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
    // commandPath *is* its skillPath — Codex has no project-level prompts. Two
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

async function buildRulesEntries({ targets, vars }) {
  const entries = [];
  let body;

  for (const target of targets) {
    const adapter = RULES_ADAPTERS[target];
    if (!adapter) continue;

    if (body === undefined) {
      const bodyPath = path.join(templateDir, 'rules-src', 'specframe-rules.body.md.tpl');
      body = renderTemplate(await readFile(bodyPath, 'utf8'), vars);
    }

    entries.push({
      relpath: adapter.path,
      content: adapter.render({ body }),
      managed: adapter.managed,
    });
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
          // Only the adr README carries a second generated section — every
          // other section index has nothing outside the catalog to list.
          ...(item.section === 'adr' ? { localAdrIndex: renderLocalAdrIndex(localAdrs) } : {}),
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
    plan.push(...(await buildRulesEntries({ targets: agentTargets, vars })));
  }

  return plan;
}

// Absolute path for a forward-slash manifest-key relpath on the host OS.
function toAbsPath(targetDir, relpath) {
  return path.join(targetDir, ...relpath.split('/'));
}

export async function writeTemplateSet(rawConfig) {
  const { targetDir, version, overwrite = new Set() } = rawConfig;
  const config = normalizeConfig(rawConfig);
  const plan = await buildTemplatePlan(config);
  const previous = await readManifest(targetDir);

  // A file already on disk is left alone unless its relpath is in `overwrite`
  // (the CLI asked, up front, whether to replace a pre-existing AGENTS.md/
  // CLAUDE.md/etc.). Left alone, it is reported as `skip-user`: the manifest
  // must not claim specframe wrote whatever is in it.
  const actions = [];
  for (const entry of plan) {
    const { written, existed } = await writeIfMissing(toAbsPath(targetDir, entry.relpath), entry.content, targetDir, {
      overwrite: overwrite.has(entry.relpath),
    });
    actions.push({
      relpath: entry.relpath,
      managed: entry.managed,
      action: written ? (existed ? 'overwrite' : 'create') : 'skip-user',
      ...(written ? { content: entry.content } : {}),
    });
  }

  await writeManifest(targetDir, manifestFromActions({ plan, actions, previous, version, config }));
  return plan;
}

// Read whatever each planned file currently holds on disk; a missing file is
// simply absent from the returned map. Contents rather than hashes, because
// refreshing a generated section in place needs the surrounding text.
//
// Also reads every file the *previous* manifest tracked but this plan no
// longer produces: an orphan. Without this, planUpdateActions would never see
// disk state for one and could not tell "never touched, safe to remove" from
// "the user edited this" — it would have to guess, which is exactly the
// silent-discard risk orphan-remove exists to avoid. `manifest` is optional so
// a caller reading disk for an unrelated reason (recordLocalAdr's single-file
// refresh) can skip the extra reads.
async function readDiskFiles(targetDir, plan, manifest) {
  const relpaths = new Set(plan.map((entry) => entry.relpath));
  for (const relpath of Object.keys(manifest?.files ?? {})) relpaths.add(relpath);

  const diskContents = {};
  for (const relpath of relpaths) {
    try {
      diskContents[relpath] = await readFile(toAbsPath(targetDir, relpath), 'utf8');
    } catch {
      // not on disk — leave it out so it is treated as "create" (planned) or
      // as already gone (orphaned).
    }
  }
  return diskContents;
}

// Reconcile an already-scaffolded repo with this version of specframe. Managed
// artifacts are refreshed when untouched; user-edited managed files get a
// `.specframe-new` sibling; user-owned files are never written. Returns the
// list of actions taken so the CLI can report them.
export async function updateTemplateSet(rawConfig) {
  const { targetDir, version, force = false, dryRun = false } = rawConfig;
  const config = normalizeConfig(rawConfig);
  const plan = await buildTemplatePlan(config);
  const manifest = await readManifest(targetDir);
  const diskContents = await readDiskFiles(targetDir, plan, manifest);

  const actions = planUpdateActions({ plan, manifest, diskContents, force });

  await applyActions({ targetDir, actions, dryRun });

  if (!dryRun) {
    await writeManifest(
      targetDir,
      manifestFromActions({ plan, actions, previous: manifest, version, config }),
    );
  }

  return actions;
}

/**
 * What changing a set of answers does to the document set.
 *
 * Computed by resolving both the old and the new answers, which is the only
 * honest way to answer "what is now stale": a rule is not orphaned because the
 * decision that emitted it changed, but because *no* decision emits it any more.
 * Nothing is deleted — these documents are the user's, and a rule they extended
 * by hand is worth more than the tidiness of removing it.
 *
 * @returns {{ orphaned: object[], added: object[] }} both in document order.
 */
export function planRevisionEffects({ before, after }) {
  const KINDS = ['rules', 'guidelines', 'runbooks'];

  const index = (resolved) => {
    const map = new Map();
    for (const kind of KINDS) {
      for (const item of resolved[kind]) {
        map.set(item.relpath, { kind, number: item.number, title: item.entry.title, relpath: item.relpath });
      }
    }
    return map;
  };

  const oldDocs = index(before);
  const newDocs = index(after);

  return {
    orphaned: [...oldDocs.values()].filter((doc) => !newDocs.has(doc.relpath)),
    added: [...newDocs.values()].filter((doc) => !oldDocs.has(doc.relpath)),
  };
}

/**
 * Revise decisions already recorded in a repository.
 *
 * The one operation that rewrites a document specframe wrote and the user owns,
 * so it is deliberately narrow: only the documents a decision produces are in
 * scope (`derived`), plus the indexes that describe the set. Each is treated as
 * managed *for this operation only* — refreshed when untouched since specframe
 * wrote it, and landing as `.specframe-new` beside a version you edited by hand
 * (an index instead has only its generated sections replaced, in place).
 * That is what makes a revision safe to run on a decision log someone has been
 * writing in for a year.
 */
export async function reviseTemplateSet(rawConfig) {
  const { targetDir, version, force = false, dryRun = false } = rawConfig;
  const config = normalizeConfig(rawConfig);
  const plan = await buildTemplatePlan(config);
  const manifest = await readManifest(targetDir);
  const diskContents = await readDiskFiles(targetDir, plan, manifest);

  const actions = planUpdateActions({
    plan: plan.map((entry) =>
      entry.regenerable || entry.derived ? { ...entry, managed: true } : entry,
    ),
    manifest,
    diskContents,
    force,
  });

  await applyActions({ targetDir, actions, dryRun });

  if (!dryRun) {
    await writeManifest(
      targetDir,
      manifestFromActions({ plan, actions, previous: manifest, version, config }),
    );
  }

  return actions;
}

/**
 * Record decisions in an already-scaffolded repository.
 *
 * New documents are created and nothing existing is overwritten — the decision
 * log is the user's. The indexes and DECISIONS.md are the exception: they exist
 * to describe the set, so leaving them stale would be worse than refreshing
 * them. Untouched since specframe wrote them, they are rewritten wholesale like
 * a managed file; edited by hand, only their generated sections are replaced, so
 * the prose someone added around an index survives every later `decide`.
 */
export async function decideTemplateSet(rawConfig) {
  const { targetDir, version, force = false, dryRun = false, quiet = false } = rawConfig;
  const config = normalizeConfig(rawConfig);
  const plan = await buildTemplatePlan(config);
  const manifest = await readManifest(targetDir);
  const diskContents = await readDiskFiles(targetDir, plan, manifest);

  // Treat the indexes as managed for this operation only; their recorded
  // ownership in the manifest stays user-owned. Every other planned file keeps
  // user ownership, so applyActions creates what is missing and leaves the rest.
  const actions = planUpdateActions({
    plan: plan.map((entry) => (entry.regenerable ? { ...entry, managed: true } : entry)),
    manifest,
    diskContents,
    force,
  });

  // `quiet` is for a caller that wants the actions as data (`specframe decide
  // --json`) rather than the per-file console lines meant for a terminal.
  await applyActions({ targetDir, actions, dryRun, quiet });

  if (!dryRun) {
    await writeManifest(
      targetDir,
      manifestFromActions({ plan, actions, previous: manifest, version, config }),
    );
  }

  return actions;
}

// --- decisions outside the catalog -----------------------------------------
//
// A project-specific ADR — "which payment provider" — has no catalog entry and
// therefore no reserved number. It gets one from a band the catalog promises
// never to use (LOCAL_ADR_MIN, see catalog.js).
//
// Disk is the primary source: those files are user-owned from the moment they
// are written, so disk cannot drift from what `adr new` actually allocated. It
// is no longer the *only* source, though — `adr rm` can take a file away, and a
// number that has been used must never be handed out again (docs/README.md:
// "Numbers are permanent. They appear in links, in commit messages, and in
// agent output."). Removed entries stay in the manifest as tombstones for
// exactly this, so the high-water mark is the max across both.
async function nextLocalAdrNumber(targetDir, config) {
  let entries = [];
  try {
    entries = await readdir(path.join(targetDir, 'docs', 'adr'));
  } catch {
    entries = [];
  }

  const onDisk = entries
    .map((name) => name.match(/^(\d{4,})-/))
    .filter(Boolean)
    .map((m) => Number(m[1]));

  const known = (config?.localAdrs ?? []).map((a) => Number(a.number));

  const used = [...onDisk, ...known].filter((n) => Number.isFinite(n) && n >= LOCAL_ADR_MIN);

  return String(used.length === 0 ? LOCAL_ADR_MIN : Math.max(...used) + LOCAL_ADR_STEP);
}

/**
 * Record an ADR for a decision the catalog does not ask about — the CLI half
 * of the `specframe-record` skill (`specframe adr new`). Allocates the next
 * free number in the local band, writes the file with empty sections for the
 * caller to fill, and refreshes docs/adr/README.md's "Decisions outside the
 * catalog" section through the same generated-section merge every other index
 * on this repository uses.
 */
export async function recordLocalAdr({ targetDir, version, slug, title, date, dryRun = false, quiet = false }) {
  const manifest = await readManifest(targetDir);
  if (!manifest?.config) {
    throw new Error(
      `No ${MANIFEST_RELPATH} in ${targetDir}.\n` +
        'Run `specframe init` first — `adr new` extends an existing scaffold.',
    );
  }

  const config = normalizeConfig(manifest.config);
  const number = await nextLocalAdrNumber(targetDir, config);
  const relpath = `docs/adr/${number}-${slug}.md`;
  const absPath = toAbsPath(targetDir, relpath);

  // nextLocalAdrNumber always returns one past every number already on disk,
  // so this only ever fires on a genuine race — two `adr new` calls reading
  // the same directory before either has written its file. Cheap to check,
  // and the alternative is silently clobbering whichever call loses the race.
  if (await exists(absPath)) {
    throw new Error(`${relpath} already exists.`);
  }

  const localAdrs = [...config.localAdrs, { number, slug, title, date }];
  const nextConfig = { ...config, localAdrs };

  if (!dryRun) {
    await mkdir(path.dirname(absPath), { recursive: true });
    await writeFile(absPath, renderLocalAdr({ number, title, date }), 'utf8');
  }

  // Refresh docs/adr/README.md the same way `decide` refreshes any index: the
  // generated sections in place, everything the user wrote around them kept.
  const plan = await buildTemplatePlan(nextConfig);
  const readmeEntry = plan.find((entry) => entry.relpath === 'docs/adr/README.md');
  const diskContents = await readDiskFiles(targetDir, [readmeEntry]);
  const readmeActions = planUpdateActions({
    plan: [{ ...readmeEntry, managed: true }],
    manifest,
    diskContents,
    force: false,
  });

  await applyActions({ targetDir, actions: readmeActions, dryRun, quiet });

  if (!dryRun) {
    const readmeManifest = manifestFromActions({
      plan: [{ ...readmeEntry, managed: true }],
      actions: readmeActions,
      previous: manifest,
      version,
      config: nextConfig,
    });
    await writeManifest(targetDir, {
      ...manifest,
      config: { ...manifest.config, localAdrs },
      files: { ...manifest.files, ...readmeManifest.files },
    });
  }

  return { number, slug, title, relpath, dryRun };
}

/**
 * Withdraw an ADR recorded outside the catalog (`specframe adr rm`). The
 * counterpart to recordLocalAdr, and the primitive the audit skill needs: an
 * ADR that should never have been written can be taken out in one step instead
 * of leaving a dangling index row and a stale manifest behind.
 *
 * Only the local band. A catalog ADR is a reserved decision with canonical
 * wording, and "this repository should not have recorded it" is `dismiss`,
 * while "we decided differently" is `revise` — neither is a deletion.
 *
 * The manifest entry is kept as a tombstone rather than dropped: the number it
 * holds must never be allocated again.
 */
export async function removeLocalAdr({ targetDir, version, number, date, dryRun = false, quiet = false }) {
  const manifest = await readManifest(targetDir);
  if (!manifest?.config) {
    throw new Error(
      `No ${MANIFEST_RELPATH} in ${targetDir}.\n` +
        'Run `specframe init` first — `adr rm` withdraws an ADR from an existing scaffold.',
    );
  }

  if (!/^\d{4,}$/.test(String(number)) || Number(number) < LOCAL_ADR_MIN) {
    throw new Error(
      `ADR-${number} is not a decision \`adr rm\` can withdraw.\n\n` +
        `Only ADRs numbered ${LOCAL_ADR_MIN} and up — the ones \`specframe adr new\` allocates.\n` +
        'A catalog ADR is a reserved decision: use `specframe dismiss <id>` if it can never\n' +
        'apply here, or `specframe revise <id>` if the choice itself changed.',
    );
  }

  const config = normalizeConfig(manifest.config);
  const entry = config.localAdrs.find((a) => a.number === String(number) && a.removed === undefined);
  if (!entry) {
    const tombstoned = config.localAdrs.some((a) => a.number === String(number));
    throw new Error(
      tombstoned
        ? `ADR-${number} was already withdrawn.`
        : `No ADR-${number} recorded in ${MANIFEST_RELPATH}.\n\n` +
          'Run `specframe review --json` to see what is recorded. An ADR file written by\n' +
          'hand was never allocated by specframe and is not tracked here: remove it, and\n' +
          "its row in docs/adr/README.md's index, yourself.",
    );
  }

  const relpath = `docs/adr/${entry.number}-${entry.slug}.md`;
  const absPath = toAbsPath(targetDir, relpath);

  const localAdrs = config.localAdrs.map((a) =>
    a === entry ? { ...a, removed: date ?? today() } : a,
  );
  const nextConfig = { ...config, localAdrs };

  if (!dryRun) {
    await rm(absPath, { force: true });
    await pruneEmptyDirs(path.dirname(absPath), targetDir);
  }
  if (!quiet) reportAction({ relpath, managed: false, action: 'remove' }, dryRun);

  // Same refresh path as recordLocalAdr: the generated sections of the index in
  // place, the user's prose around them untouched.
  const plan = await buildTemplatePlan(nextConfig);
  const readmeEntry = plan.find((e) => e.relpath === 'docs/adr/README.md');
  const diskContents = await readDiskFiles(targetDir, [readmeEntry]);
  const readmeActions = planUpdateActions({
    plan: [{ ...readmeEntry, managed: true }],
    manifest,
    diskContents,
    force: false,
  });

  await applyActions({ targetDir, actions: readmeActions, dryRun, quiet });

  if (!dryRun) {
    const readmeManifest = manifestFromActions({
      plan: [{ ...readmeEntry, managed: true }],
      actions: readmeActions,
      previous: manifest,
      version,
      config: nextConfig,
    });
    const files = { ...manifest.files, ...readmeManifest.files };
    delete files[relpath];
    await writeManifest(targetDir, {
      ...manifest,
      config: { ...manifest.config, localAdrs },
      files,
    });
  }

  return { number: entry.number, slug: entry.slug, title: entry.title, relpath, dryRun };
}

async function applyActions({ targetDir, actions, dryRun, quiet = false }) {
  for (const action of actions) {
    const rel = action.relpath;
    if (!dryRun) {
      if (action.action === 'create' || action.action === 'overwrite' || action.action === 'merge') {
        const absPath = toAbsPath(targetDir, rel);
        await mkdir(path.dirname(absPath), { recursive: true });
        await writeFile(absPath, action.content, 'utf8');
      } else if (action.action === 'conflict') {
        await writeFile(`${toAbsPath(targetDir, rel)}.specframe-new`, action.content, 'utf8');
      } else if (action.action === 'orphan-remove') {
        const absPath = toAbsPath(targetDir, rel);
        await rm(absPath, { force: true });
        await pruneEmptyDirs(path.dirname(absPath), targetDir);
      }
    }
    if (!quiet) reportAction(action, dryRun);
  }
}

const ACTION_LABEL = {
  create: 'write',
  overwrite: 'update',
  merge: 'refresh',
  'up-to-date': 'ok',
  conflict: 'conflict',
  'skip-user': 'keep',
  orphan: 'orphan',
  'orphan-remove': 'remove',
};

function reportAction(action, dryRun) {
  if (action.action === 'up-to-date') return; // nothing changed; stay quiet
  const label = ACTION_LABEL[action.action] ?? action.action;
  let suffix = '';
  if (action.action === 'merge') suffix = ' (generated sections only — your text kept)';
  if (action.action === 'conflict') suffix = ` ${theme.glyph.arrow} wrote ${action.relpath}.specframe-new (yours kept)`;
  if (action.action === 'skip-user') suffix = ' (your file, untouched)';
  if (action.action === 'orphan') suffix = ' (no longer generated — edited by hand, so kept; remove it yourself if unused)';
  if (action.action === 'orphan-remove') {
    suffix = action.forced
      ? ' (no longer generated — removed as asked)'
      : ' (no longer generated — never edited, so removed)';
  }
  console.log(`${actionTag(label, { dryRun })}${action.relpath}${theme.muted(suffix)}`);
}

// Remove specframe-managed artifacts from a repository, leaving it as if
// specframe had never run. By default only specframe-owned (managed) files are
// deleted; user-owned starters (CLAUDE.md, docs/**, …) are reported as kept so
// the user can review them — pass `purge: true` to remove those too. The
// manifest itself is always removed at the end. Empty directories left behind
// are pruned up to (but not including) targetDir. Returns the list of actions.
export async function uninstallTemplateSet({ targetDir, purge = false, dryRun = false }) {
  const manifest = await readManifest(targetDir);
  if (!manifest) {
    throw new Error(
      `No ${MANIFEST_RELPATH} found in ${targetDir}.\n` +
        'Nothing to uninstall — run `specframe init` first.',
    );
  }

  const actions = planUninstallActions({ manifest, purge });

  for (const action of actions) {
    if (action.action === 'remove') {
      const absPath = toAbsPath(targetDir, action.relpath);
      if (!dryRun) {
        await rm(absPath, { force: true });
        await pruneEmptyDirs(path.dirname(absPath), targetDir);
      }
      console.log(`${actionTag('remove', { dryRun })}${action.relpath}`);
    } else {
      console.log(
        `${actionTag('keep', { dryRun })}${action.relpath}` +
          theme.muted(' (user-owned — use --purge to remove)'),
      );
    }
  }

  if (!dryRun) {
    const manifestPath = path.join(targetDir, MANIFEST_RELPATH);
    await rm(manifestPath, { force: true });
    await pruneEmptyDirs(path.dirname(manifestPath), targetDir);
    console.log(`${actionTag('remove')}${MANIFEST_RELPATH}`);
  } else {
    console.log(`${actionTag('remove', { dryRun: true })}${MANIFEST_RELPATH}`);
  }

  console.log(dryRun ? '\nDry run complete. Nothing was removed.' : '\nUninstall complete.');
  return actions;
}

// Walk up from `startDir` removing empty directories, stopping at (and never
// removing) `rootDir`. Used to clean up scaffolding dirs like `.claude/agents/`
// once the last file inside them is gone.
async function pruneEmptyDirs(startDir, rootDir) {
  const root = path.resolve(rootDir);
  let dir = path.resolve(startDir);
  while (dir !== root && dir.startsWith(root + path.sep)) {
    let entries;
    try {
      entries = await readdir(dir);
    } catch {
      break; // gone already
    }
    if (entries.length > 0) break; // not empty — leave it
    await rm(dir, { recursive: true, force: true });
    dir = path.dirname(dir);
  }
}

// --- agent harnesses added after onboarding ---------------------------------

/**
 * Add native support for one or more agent harnesses to a repository that is
 * already scaffolded — the CLI half of `specframe agents add`.
 *
 * Deliberately narrower than `update`: the only files in scope are the ones the
 * newly added targets contribute (`.claude/**`, `GEMINI.md`, …), computed as the
 * difference between the plan for the merged target list and the plan for the
 * one already recorded. Everything else — docs, ADRs, AGENTS.md — is left
 * exactly as it stands, so adding a second harness can never rewrite prose
 * written for the first.
 *
 * Only the fresh files' disk state is read, so the untouched remainder of the
 * manifest cannot look like an orphan (see readDiskFiles / planUpdateActions).
 *
 * @param {string[]} previousTargets  the targets already recorded in the manifest.
 */
export async function addAgentTargets(rawConfig) {
  const { targetDir, version, previousTargets = [], dryRun = false, force = false, quiet = false } = rawConfig;
  const config = normalizeConfig(rawConfig);
  const manifest = await readManifest(targetDir);

  const plan = await buildTemplatePlan(config);
  const already = new Set(
    (await buildTemplatePlan({ ...config, agentTargets: previousTargets })).map((entry) => entry.relpath),
  );
  const fresh = plan.filter((entry) => !already.has(entry.relpath));

  const diskContents = await readDiskFiles(targetDir, fresh);
  const actions = planUpdateActions({ plan: fresh, manifest, diskContents, force });

  await applyActions({ targetDir, actions, dryRun, quiet });

  if (!dryRun) {
    const rendered = manifestFromActions({ plan: fresh, actions, previous: manifest, version, config });
    // Merged into the manifest rather than replacing it: this run planned a
    // handful of files, and manifestFromActions only knows about those. The
    // recorded `version` stays as it was — `update` is what moves a repository
    // to a new specframe version, and claiming it here would make it a no-op.
    await writeManifest(targetDir, {
      ...manifest,
      version: manifest?.version ?? version,
      config: { ...(manifest?.config ?? {}), agentTargets: config.agentTargets },
      files: { ...(manifest?.files ?? {}), ...rendered.files },
    });
  }

  return actions;
}

/**
 * Drop native support for one or more agent harnesses from a repository — the
 * CLI half of `specframe agents remove`.
 *
 * The mirror of addAgentTargets, and narrow in the same way: the files in scope
 * are exactly the ones the dropped targets contributed, computed as the
 * difference between the plan before and the plan after. AGENTS.md and docs/
 * are untouched, so the repository keeps its whole decision log — it just stops
 * shipping that tool's native files. Removing the last one is a supported
 * position: AGENTS.md alone covers most tools.
 *
 * @param {string[]} previousTargets  the targets recorded in the manifest.
 * @param {boolean} purge  also remove the harness's user-owned file (GEMINI.md).
 * @param {boolean} force  also remove a managed file that was edited by hand.
 */
export async function removeAgentTargets(rawConfig) {
  const {
    targetDir,
    previousTargets = [],
    dryRun = false,
    purge = false,
    force = false,
    quiet = false,
  } = rawConfig;
  const config = normalizeConfig(rawConfig);
  const manifest = await readManifest(targetDir);

  const keptRelpaths = new Set((await buildTemplatePlan(config)).map((entry) => entry.relpath));
  const before = await buildTemplatePlan({ ...config, agentTargets: previousTargets });
  // A path the remaining targets still produce is not this harness's to remove
  // — nothing shares one today, but the set difference is what makes that a
  // property of the code rather than of the adapter table.
  const gone = before.filter((entry) => !keptRelpaths.has(entry.relpath));

  const diskContents = await readDiskFiles(targetDir, gone);
  const actions = planAgentRemoval({
    relpaths: gone.map((entry) => entry.relpath),
    manifest,
    diskContents,
    purge,
    force,
  });

  await applyActions({ targetDir, actions, dryRun, quiet });

  // A `<file>.specframe-new` beside a file that just went is specframe's own
  // output for a document that no longer exists — nothing left to merge it
  // into, so it goes too rather than sitting there as litter.
  if (!dryRun) {
    for (const action of actions) {
      if (action.action !== 'orphan-remove') continue;
      const pending = `${toAbsPath(targetDir, action.relpath)}.specframe-new`;
      if (!(await exists(pending))) continue;
      await rm(pending, { force: true });
      await pruneEmptyDirs(path.dirname(pending), targetDir);
    }
  }

  if (!dryRun) {
    const files = { ...(manifest?.files ?? {}) };
    // A file that is really gone leaves the manifest with it. One kept — edited
    // by hand, or user-owned — stays tracked, so `uninstall` still knows about
    // it and `update` can go on reporting it as an orphan.
    for (const action of actions) {
      if (action.action === 'orphan-remove') delete files[action.relpath];
    }
    // A path that was never on disk is absent from `actions` entirely; it has
    // no business staying in the manifest either.
    const acted = new Set(actions.map((action) => action.relpath));
    for (const entry of gone) {
      if (!acted.has(entry.relpath)) delete files[entry.relpath];
    }

    await writeManifest(targetDir, {
      ...manifest,
      config: { ...(manifest?.config ?? {}), agentTargets: config.agentTargets },
      files,
    });
  }

  return actions;
}
