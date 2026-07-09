import { access, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { manifestFromPlan, readManifest, sha256, writeManifest, MANIFEST_RELPATH } from './manifest.js';
import { planUpdateActions, planUninstallActions } from './update.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const templateDir = path.join(__dirname, 'templates');

const TEMPLATE_TARGETS = [
  { template: 'AGENTS.md.tpl', target: 'AGENTS.md' },
  { template: 'CLAUDE.md.tpl', target: 'CLAUDE.md' },
  { template: 'adr-readme.md.tpl', target: 'docs/adr/README.md' },
  { template: 'adr-0000-template.md.tpl', target: 'docs/adr/0000-template.md' },
  {
    template: 'copilot-instructions.md.tpl',
    target: '.github/copilot-instructions.md',
  },
  { template: 'pr-template.md.tpl', target: '.github/pull_request_template.md' },
];

const CONTENT_TARGETS = [
  { template: 'guidelines-readme.md.tpl', target: 'docs/guidelines/README.md' },
  { template: 'guidelines-0000-template.md.tpl', target: 'docs/guidelines/0000-template.md' },
  { template: 'rules-readme.md.tpl', target: 'docs/rules/README.md' },
  { template: 'rules-0000-template.md.tpl', target: 'docs/rules/0000-template.md' },
  { template: 'runbook-readme.md.tpl', target: 'docs/runbook/README.md' },
  { template: 'runbook-0000-template.md.tpl', target: 'docs/runbook/0000-template.md' },
  { template: 'glossary-readme.md.tpl', target: 'docs/glossary/README.md' },
  { template: 'glossary-0000-template.md.tpl', target: 'docs/glossary/0000-template.md' },
];

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
    renderAgent: ({ name, description, body }) =>
      `---\nname: ${name}\ndescription: ${description}\n---\n\n${body}`,
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

function renderTemplate(templateText, vars) {
  return templateText
    .replaceAll('{{projectName}}', vars.projectName)
    .replaceAll('{{packageManager}}', vars.packageManager);
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
    return;
  }

  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, content, 'utf8');
  console.log(`[write] ${path.relative(targetDir, targetPath)}`);
}

async function resolveContentTemplatePath(templateFile, contentProfile) {
  if (contentProfile && contentProfile !== 'empty') {
    const profilePath = path.join(templateDir, 'content', contentProfile, templateFile);
    if (await exists(profilePath)) {
      return profilePath;
    }
  }
  return path.join(templateDir, 'content', 'empty', templateFile);
}

async function buildAgentEntries({ targets, vars }) {
  const entries = [];

  for (const target of targets) {
    const adapter = AGENT_ADAPTERS[target];
    if (!adapter) continue;

    for (const entry of AGENT_TEMPLATES.agents) {
      const bodyPath = path.join(templateDir, 'agents-src', 'agents', `${entry.name}.body.md.tpl`);
      const body = renderTemplate(await readFile(bodyPath, 'utf8'), vars);
      const content = adapter.renderAgent({ name: entry.name, description: entry.description, body });
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

// Render the full set of files this specframe version produces for the given
// choices. Returns { relpath, content, managed } with forward-slash relpaths
// (the manifest key form). Shared by `init` and `update`.
export async function buildTemplatePlan({
  projectName,
  packageManager,
  contentProfile = 'empty',
  agentTargets = [],
}) {
  const vars = { projectName, packageManager };
  const plan = [];

  for (const item of TEMPLATE_TARGETS) {
    const templateText = await readFile(path.join(templateDir, item.template), 'utf8');
    plan.push({ relpath: item.target, content: renderTemplate(templateText, vars), managed: false });
  }

  for (const item of CONTENT_TARGETS) {
    const templatePath = await resolveContentTemplatePath(item.template, contentProfile);
    const templateText = await readFile(templatePath, 'utf8');
    plan.push({ relpath: item.target, content: renderTemplate(templateText, vars), managed: false });
  }

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

export async function writeTemplateSet({
  targetDir,
  projectName,
  packageManager,
  contentProfile = 'empty',
  agentTargets = [],
  version,
}) {
  const config = { projectName, packageManager, contentProfile, agentTargets };
  const plan = await buildTemplatePlan(config);

  for (const entry of plan) {
    await writeIfMissing(toAbsPath(targetDir, entry.relpath), entry.content, targetDir);
  }

  await writeManifest(targetDir, manifestFromPlan(plan, { version, config }));
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
export async function updateTemplateSet({
  targetDir,
  projectName,
  packageManager,
  contentProfile = 'empty',
  agentTargets = [],
  version,
  force = false,
  dryRun = false,
}) {
  const config = { projectName, packageManager, contentProfile, agentTargets };
  const plan = await buildTemplatePlan(config);
  const manifest = await readManifest(targetDir);
  const diskHashes = await hashDiskFiles(targetDir, plan);

  const actions = planUpdateActions({ plan, manifest, diskHashes, force });

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

  if (!dryRun) {
    await writeManifest(targetDir, manifestFromPlan(plan, { version, config }));
  }

  return actions;
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
