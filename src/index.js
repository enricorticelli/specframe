import process from 'node:process';

import { askQuestions } from './prompts.js';
import { writeTemplateSet } from './writer.js';

export async function run() {
  const targetDir = process.cwd();
  const { projectName, packageManager, includeCI } = await askQuestions();

  await writeTemplateSet({
    targetDir,
    projectName,
    packageManager,
    includeCI,
  });

  console.log(`Done. Context files are ready in: ${targetDir}`);
}
