import { access, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { manifestFromPlan, readManifest, sha256, writeManifest, MANIFEST_RELPATH } from './manifest.js';
import { planUpdateActions, planUninstallActions } from './update.js';
import { resolveDecisions } from './decisions/resolve.js';
import {
  renderAdr,
  renderAdrIndex,
  renderGlossaryGroup,
  renderGlossaryIndex,
  renderGuideline,
  renderGuidelinesIndex,
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

export function today() {
  return new Date().toISOString().slice(0, 10);
}

const TEMPLATE_TARGETS = [
  { template: 'AGENTS.md.tpl', target: 'AGENTS.md' },
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
const CONTENT_TARGETS = [
  { template: 'docs-readme.md.tpl', target: 'docs/README.md' },
  { template: 'decisions.md.tpl', target: 'docs/DECISIONS.md', regenerable: true },

  { template: 'adr-readme.md.tpl', target: 'docs/adr/README.md', section: 'adr', regenerable: true },
  { template: 'adr-0000-template.md.tpl', target: 'docs/adr/0000-template.md' },
  { template: 'adr-0001-decision-policy.md.tpl', target: 'docs/adr/0001-repository-decision-policy.md' },

  { template: 'rules-readme.md.tpl', target: 'docs/rules/README.md', section: 'rules', regenerable: true },
  { template: 'rules-0000-template.md.tpl', target: 'docs/rules/0000-template.md' },
  { template: 'rules-0001-example.md.tpl', target: 'docs/rules/0001-example.md', blankOnly: true },

  { template: 'guidelines-readme.md.tpl', target: 'docs/guidelines/README.md', section: 'guidelines', regenerable: true },
  { template: 'guidelines-0000-template.md.tpl', target: 'docs/guidelines/0000-template.md' },
  { template: 'guidelines-0001-example.md.tpl', target: 'docs/guidelines/0001-example.md', blankOnly: true },

  { template: 'runbook-readme.md.tpl', target: 'docs/runbook/README.md', section: 'runbooks', regenerable: true },
  { template: 'runbook-0000-template.md.tpl', target: 'docs/runbook/0000-template.md' },
  { template: 'runbook-0001-example.md.tpl', target: 'docs/runbook/0001-example.md', blankOnly: true },

  { template: 'glossary-readme.md.tpl', target: 'docs/glossary/README.md', section: 'glossary', regenerable: true },
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

const AGENT_TEMPLATES = {
  agents: [
    { name: 'explorer', description: 'Explore the codebase to answer questions. Read-only.' },
    { name: 'planner', description: 'Produce implementation plans. Reads ADRs/rules/guidelines first.' },
    { name: 'reviewer', description: 'Review diffs against ADRs/rules/guidelines.' },
    { name: 'bootstrapper', description: 'Populate ADR/rules/guidelines/runbook/glossary docs by analyzing an existing codebase.' },
    // model is only rendered by the claude adapter today (see AGENT_ADAPTERS.claude.renderAgent);
    // copilot/codex ignore the extra field safely since their renderAgent doesn't destructure it.
    { name: 'doc-writer', description: 'Render a decided doc entry (ADR, rule, guideline, runbook, or glossary term) into its template file. Mechanical only — does not decide content.', model: 'haiku' },
  ],
  commands: [
    { name: 'specframe-specify', description: 'Draft a spec from a request.' },
    { name: 'specframe-plan', description: 'Produce an implementation plan from a spec.' },
    { name: 'specframe-review', description: 'Review current changes against ADRs/rules/guidelines.' },
    { name: 'specframe-bootstrap', description: 'Populate ADR/rules/guidelines/runbook/glossary from an existing codebase.' },
  ],
  skills: [
    { name: 'specframe-adr-draft', description: 'Auto-trigger when an architectural decision is being made: draft a new ADR.' },
    { name: 'specframe-rule-check', description: 'Auto-trigger on diff/PR review: verify compliance with enforced rules.' },
    { name: 'specframe-doc-sync', description: 'Auto-trigger when a new convention, term, or procedure emerges without a matching doc.' },
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

async function writeIfMissing(targetPath, content, targetDir) {
  if (await exists(targetPath)) {
    console.log(`[skip] ${path.relative(targetDir, targetPath)}`);
    return false;
  }

  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, content, 'utf8');
  console.log(`[write] ${path.relative(targetDir, targetPath)}`);
  return true;
}

async function buildAgentEntries({ targets, vars }) {
  const entries = [];

  for (const target of targets) {
    const adapter = AGENT_ADAPTERS[target];
    if (!adapter) continue;

    for (const entry of AGENT_TEMPLATES.agents) {
      const bodyPath = path.join(templateDir, 'agents-src', 'agents', `${entry.name}.body.md.tpl`);
      const body = renderTemplate(await readFile(bodyPath, 'utf8'), vars);
      const content = adapter.renderAgent({ name: entry.name, description: entry.description, body, model: entry.model });
      entries.push({ relpath: adapter.agentPath(entry.name), content, managed: true });
    }

    for (const entry of AGENT_TEMPLATES.commands) {
      const bodyPath = path.join(templateDir, 'agents-src', 'commands', `${entry.name}.body.md.tpl`);
      const body = renderTemplate(await readFile(bodyPath, 'utf8'), vars);
      const content = adapter.renderCommand({ name: entry.name, description: entry.description, body });
      entries.push({ relpath: adapter.commandPath(entry.name), content, managed: true });
    }

    if (adapter.skillPath) {
      for (const entry of AGENT_TEMPLATES.skills) {
        const bodyPath = path.join(templateDir, 'agents-src', 'skills', `${entry.name}.body.md.tpl`);
        const body = renderTemplate(await readFile(bodyPath, 'utf8'), vars);
        const content = adapter.renderSkill({ name: entry.name, description: entry.description, body });
        entries.push({ relpath: adapter.skillPath(entry.name), content, managed: true });
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
function buildDecisionEntries(resolved, { vars }) {
  const entries = [];
  const add = (relpath, content) =>
    entries.push({ relpath, content: renderTemplate(content, vars), managed: false });

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

  return {
    configVersion: 2,
    projectName: config.projectName,
    packageManager: config.packageManager === 'pnpm' ? 'pnpm' : 'npm',
    mode,
    decisions,
    provenance,
    agentTargets: config.agentTargets ?? [],
    initDate: config.initDate ?? FALLBACK_DATE,
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
  const { projectName, packageManager, mode, decisions, provenance, agentTargets, initDate } = config;

  const resolved = resolveDecisions({ mode, answers: decisions, provenance });

  const vars = {
    projectName,
    packageManager,
    initDate,
    takenDecisions: renderTakenDecisions(resolved),
    openDecisions: renderOpenDecisions(resolved),
  };

  const plan = [];

  for (const item of TEMPLATE_TARGETS) {
    const templateText = await readFile(path.join(templateDir, item.template), 'utf8');
    plan.push({ relpath: item.target, content: renderTemplate(templateText, vars), managed: false });
  }

  for (const item of CONTENT_TARGETS) {
    if (item.blankOnly && mode !== 'blank') continue;
    const templateText = await readFile(path.join(templateDir, 'content', item.template), 'utf8');
    const fileVars = item.section
      ? { ...vars, index: SECTION_INDEX_RENDERERS[item.section](resolved) }
      : vars;
    plan.push({
      relpath: item.target,
      content: renderTemplate(templateText, fileVars),
      managed: false,
      ...(item.regenerable ? { regenerable: true } : {}),
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
  const { targetDir, version } = rawConfig;
  const config = normalizeConfig(rawConfig);
  const plan = await buildTemplatePlan(config);

  for (const entry of plan) {
    await writeIfMissing(toAbsPath(targetDir, entry.relpath), entry.content, targetDir);
  }

  await writeManifest(targetDir, manifestFromPlan(plan, { version, config }));
  return plan;
}

// Hash whatever each planned file currently holds on disk; a missing file is
// simply absent from the returned map.
async function hashDiskFiles(targetDir, plan) {
  const diskHashes = {};
  for (const { relpath } of plan) {
    try {
      diskHashes[relpath] = sha256(await readFile(toAbsPath(targetDir, relpath), 'utf8'));
    } catch {
      // not on disk — leave it out so it is treated as "create".
    }
  }
  return diskHashes;
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
  const diskHashes = await hashDiskFiles(targetDir, plan);

  const actions = planUpdateActions({ plan, manifest, diskHashes, force });

  await applyActions({ targetDir, actions, dryRun });

  if (!dryRun) {
    await writeManifest(targetDir, manifestFromPlan(plan, { version, config }));
  }

  return actions;
}

/**
 * Record decisions in an already-scaffolded repository.
 *
 * New documents are created and nothing existing is overwritten — the decision
 * log is the user's. The indexes and DECISIONS.md are the exception: they exist
 * to describe the set, so leaving them stale would be worse than refreshing
 * them. They are refreshed only when untouched since specframe wrote them,
 * exactly like a managed file, and land as `.specframe-new` otherwise.
 */
export async function decideTemplateSet(rawConfig) {
  const { targetDir, version, force = false, dryRun = false } = rawConfig;
  const config = normalizeConfig(rawConfig);
  const plan = await buildTemplatePlan(config);
  const manifest = await readManifest(targetDir);
  const diskHashes = await hashDiskFiles(targetDir, plan);

  // Treat the indexes as managed for this operation only; their recorded
  // ownership in the manifest stays user-owned. Every other planned file keeps
  // user ownership, so applyActions creates what is missing and leaves the rest.
  const actions = planUpdateActions({
    plan: plan.map((entry) => (entry.regenerable ? { ...entry, managed: true } : entry)),
    manifest,
    diskHashes,
    force,
  });

  await applyActions({ targetDir, actions, dryRun });

  if (!dryRun) {
    await writeManifest(targetDir, manifestFromPlan(plan, { version, config }));
  }

  return actions;
}

async function applyActions({ targetDir, actions, dryRun }) {
  for (const action of actions) {
    const rel = action.relpath;
    if (!dryRun) {
      if (action.action === 'create' || action.action === 'overwrite') {
        const absPath = toAbsPath(targetDir, rel);
        await mkdir(path.dirname(absPath), { recursive: true });
        await writeFile(absPath, action.content, 'utf8');
      } else if (action.action === 'conflict') {
        await writeFile(`${toAbsPath(targetDir, rel)}.specframe-new`, action.content, 'utf8');
      }
    }
    reportAction(action, dryRun);
  }
}

const ACTION_LABEL = {
  create: 'write',
  overwrite: 'update',
  'up-to-date': 'ok',
  conflict: 'conflict',
  'skip-user': 'keep',
  orphan: 'orphan',
};

function reportAction(action, dryRun) {
  if (action.action === 'up-to-date') return; // nothing changed; stay quiet
  const prefix = dryRun ? '[dry-run] ' : '';
  const label = ACTION_LABEL[action.action] ?? action.action;
  let suffix = '';
  if (action.action === 'conflict') suffix = ` → wrote ${action.relpath}.specframe-new (yours kept)`;
  if (action.action === 'skip-user') suffix = ' (your file, untouched)';
  if (action.action === 'orphan') suffix = ' (no longer generated — remove if unused)';
  console.log(`${prefix}[${label}] ${action.relpath}${suffix}`);
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
      console.log(`${dryRun ? '[dry-run] ' : ''}[remove] ${action.relpath}`);
    } else {
      console.log(`${dryRun ? '[dry-run] ' : ''}[keep] ${action.relpath} (user-owned — use --purge to remove)`);
    }
  }

  if (!dryRun) {
    const manifestPath = path.join(targetDir, MANIFEST_RELPATH);
    await rm(manifestPath, { force: true });
    await pruneEmptyDirs(path.dirname(manifestPath), targetDir);
    console.log(`[remove] ${MANIFEST_RELPATH}`);
  } else {
    console.log(`[dry-run] [remove] ${MANIFEST_RELPATH}`);
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
