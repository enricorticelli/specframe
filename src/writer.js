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
];

const AGENT_ADAPTERS = {
  claude: {
    agentPath: (name) => `.claude/agents/${name}.md`,
    commandPath: (name) => `.claude/commands/${name}.md`,
    skillPath: (name) => `.claude/skills/${name}/SKILL.md`,
    agentFrontmatter: (name, desc) => `---\nname: ${name}\ndescription: ${desc}\n---\n\n`,
    commandFrontmatter: (desc) => `---\ndescription: ${desc}\n---\n\n`,
    skillFrontmatter: (name, desc) => `---\nname: ${name}\ndescription: ${desc}\n---\n\n`,
  },
  copilot: {
    agentPath: (name) => `.github/chatmodes/${name}.chatmode.md`,
    commandPath: (name) => `.github/prompts/${name}.prompt.md`,
    skillPath: null,
    agentFrontmatter: (_name, desc) => `---\ndescription: ${desc}\n---\n\n`,
    commandFrontmatter: (desc) => `---\nmode: agent\ndescription: ${desc}\n---\n\n`,
  },
  codex: {
    agentPath: (name) => `.codex/agents/${name}.md`,
    commandPath: (name) => `.codex/prompts/${name}.md`,
    skillPath: null,
    agentFrontmatter: (name, desc) => `---\nname: ${name}\ndescription: ${desc}\n---\n\n`,
    commandFrontmatter: (desc) => `# ${desc}\n\n`,
  },
};

const AGENT_TEMPLATES = {
  agents: [
    { name: 'explorer', description: 'Explore the codebase to answer questions. Read-only.' },
    { name: 'planner', description: 'Produce implementation plans. Reads ADRs/rules/guidelines first.' },
    { name: 'reviewer', description: 'Review diffs against ADRs/rules/guidelines.' },
  ],
  commands: [
    { name: 'specify', description: 'Draft a spec from a request.' },
    { name: 'plan', description: 'Produce an implementation plan from a spec.' },
    { name: 'review', description: 'Review current changes against ADRs/rules/guidelines.' },
  ],
  skills: [
    { name: 'example', description: 'Starter skill template.' },
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
      const body = await readFile(bodyPath, 'utf8');
      const rendered = renderTemplate(body, vars);
      const content = adapter.agentFrontmatter(entry.name, entry.description) + rendered;
      const targetPath = path.join(targetDir, adapter.agentPath(entry.name));
      await writeIfMissing(targetPath, content, targetDir);
    }

    for (const entry of AGENT_TEMPLATES.commands) {
      const bodyPath = path.join(templateDir, 'agents-src', 'commands', `${entry.name}.body.md.tpl`);
      const body = await readFile(bodyPath, 'utf8');
      const rendered = renderTemplate(body, vars);
      const content = adapter.commandFrontmatter(entry.description) + rendered;
      const targetPath = path.join(targetDir, adapter.commandPath(entry.name));
      await writeIfMissing(targetPath, content, targetDir);
    }

    if (adapter.skillPath) {
      for (const entry of AGENT_TEMPLATES.skills) {
        const bodyPath = path.join(templateDir, 'agents-src', 'skills', `${entry.name}.body.md.tpl`);
        const body = await readFile(bodyPath, 'utf8');
        const rendered = renderTemplate(body, vars);
        const content = adapter.skillFrontmatter(entry.name, entry.description) + rendered;
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
