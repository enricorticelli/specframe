import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

async function writeAgentSet({ targetDir, targets, vars }) {
  for (const target of targets) {
    const adapter = AGENT_ADAPTERS[target];
    if (!adapter) continue;

    for (const entry of AGENT_TEMPLATES.agents) {
      const bodyPath = path.join(templateDir, 'agents-src', 'agents', `${entry.name}.body.md.tpl`);
      const body = renderTemplate(await readFile(bodyPath, 'utf8'), vars);
      const content = adapter.renderAgent({ name: entry.name, description: entry.description, body });
      const targetPath = path.join(targetDir, adapter.agentPath(entry.name));
      await writeIfMissing(targetPath, content, targetDir);
    }

    for (const entry of AGENT_TEMPLATES.commands) {
      const bodyPath = path.join(templateDir, 'agents-src', 'commands', `${entry.name}.body.md.tpl`);
      const body = renderTemplate(await readFile(bodyPath, 'utf8'), vars);
      const content = adapter.renderCommand({ name: entry.name, description: entry.description, body });
      const targetPath = path.join(targetDir, adapter.commandPath(entry.name));
      await writeIfMissing(targetPath, content, targetDir);
    }

    if (adapter.skillPath) {
      for (const entry of AGENT_TEMPLATES.skills) {
        const bodyPath = path.join(templateDir, 'agents-src', 'skills', `${entry.name}.body.md.tpl`);
        const body = renderTemplate(await readFile(bodyPath, 'utf8'), vars);
        const content = adapter.renderSkill({ name: entry.name, description: entry.description, body });
        const targetPath = path.join(targetDir, adapter.skillPath(entry.name));
        await writeIfMissing(targetPath, content, targetDir);
      }
    }
  }
}

export async function writeTemplateSet({
  targetDir,
  projectName,
  packageManager,
  contentProfile = 'empty',
  agentTargets = [],
}) {
  const vars = { projectName, packageManager };

  for (const item of TEMPLATE_TARGETS) {
    const templatePath = path.join(templateDir, item.template);
    const targetPath = path.join(targetDir, item.target);

    const templateText = await readFile(templatePath, 'utf8');
    const rendered = renderTemplate(templateText, vars);

    await writeIfMissing(targetPath, rendered, targetDir);
  }

  for (const item of CONTENT_TARGETS) {
    const templatePath = await resolveContentTemplatePath(item.template, contentProfile);
    const targetPath = path.join(targetDir, item.target);

    const templateText = await readFile(templatePath, 'utf8');
    const rendered = renderTemplate(templateText, vars);

    await writeIfMissing(targetPath, rendered, targetDir);
  }

  if (agentTargets.length > 0) {
    await writeAgentSet({ targetDir, targets: agentTargets, vars });
  }
}
