import { createInterface } from 'node:readline/promises';
import process from 'node:process';

function getCurrentRepoName() {
  const parts = process.cwd().split(/[\\/]+/).filter(Boolean);
  return parts[parts.length - 1] || 'current-repo';
}

function parsePackageManager(value) {
  const normalized = (value || '').trim().toLowerCase();
  return normalized === 'pnpm' ? 'pnpm' : 'npm';
}

function parseIncludeCI(value) {
  const normalized = (value || '').trim().toLowerCase();
  return normalized !== 'n' && normalized !== 'no';
}

export async function askQuestions() {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const defaultProjectName = getCurrentRepoName();

  try {
    const projectNameInput = await rl.question(
      `Project name (default: ${defaultProjectName}): `,
    );
    const packageManagerInput = await rl.question(
      'Package manager [npm|pnpm] (default: npm): ',
    );
    const includeCIInput = await rl.question(
      'Include GitHub policy workflow? [Y/n]: ',
    );

    return {
      projectName: (projectNameInput || '').trim() || defaultProjectName,
      packageManager: parsePackageManager(packageManagerInput),
      includeCI: parseIncludeCI(includeCIInput),
    };
  } finally {
    rl.close();
  }
}
