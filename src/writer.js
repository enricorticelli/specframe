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

const POLICY_WORKFLOW_CONTENT = `name: policy-check

on:
  pull_request:
  push:
    branches: [main]

jobs:
  policy-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Check ADR folder exists
        run: test -f docs/adr/README.md
`;

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

export async function writeTemplateSet({
  targetDir,
  projectName,
  packageManager,
  includeCI,
}) {
  for (const item of TEMPLATE_TARGETS) {
    const templatePath = path.join(templateDir, item.template);
    const targetPath = path.join(targetDir, item.target);

    const templateText = await readFile(templatePath, 'utf8');
    const rendered = renderTemplate(templateText, { projectName, packageManager });

    await writeIfMissing(targetPath, rendered, targetDir);
  }

  if (includeCI) {
    const workflowPath = path.join(
      targetDir,
      '.github/workflows/policy-check.yml',
    );
    await writeIfMissing(workflowPath, POLICY_WORKFLOW_CONTENT, targetDir);
  }
}
