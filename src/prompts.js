import { createInterface } from 'node:readline/promises';
import process from 'node:process';

const VALID_AGENT_TARGETS = new Set(['claude', 'copilot', 'codex']);

function getCurrentRepoName() {
  const parts = process.cwd().split(/[\\/]+/).filter(Boolean);
  return parts[parts.length - 1] || 'current-repo';
}

function parsePackageManager(value) {
  const normalized = (value || '').trim().toLowerCase();
  return normalized === 'pnpm' ? 'pnpm' : 'npm';
}

function parseContentProfile(value) {
  const normalized = (value || '').trim().toLowerCase();
  return normalized === 'universal' ? 'universal' : 'empty';
}

function parseAgentTargets(value) {
  const normalized = (value || '').trim().toLowerCase();
  if (!normalized || normalized === 'none') return [];
  return normalized
    .split(',')
    .map((token) => token.trim())
    .filter((token) => VALID_AGENT_TARGETS.has(token));
}

export async function askQuestions() {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const defaultProjectName = getCurrentRepoName();

  try {
    console.log('\nspecframe init — bootstrap context files for this repository.\n');

    console.log('# Project name');
    console.log('Shown inside generated docs (glossary, rules, guidelines) as the project identifier.');
    const projectNameInput = await rl.question(
      `> Project name (default: ${defaultProjectName}): `,
    );

    console.log('\n# Package manager');
    console.log('Referenced in generated guidelines and sample commands. Pick the one you actually use.');
    const packageManagerInput = await rl.question(
      '> Package manager [npm|pnpm] (default: npm): ',
    );

    console.log('\n# Content profile');
    console.log('Controls the starting content of docs/rules/ and docs/guidelines/:');
    console.log('  - empty     → skeleton only (README index + 0000-template). You fill it in.');
    console.log('  - universal → pre-populated with an opinionated baseline (Clean Code, SOLID,');
    console.log('                testing, security, logging, git/PR conventions). You can edit or remove.');
    const contentProfileInput = await rl.question(
      '> Content profile [empty|universal] (default: empty): ',
    );

    console.log('\n# Agent assistants');
    console.log('Scaffolds subagents, slash commands and a starter skill for the selected tools:');
    console.log('  - claude  → .claude/agents, .claude/commands, .claude/skills');
    console.log('  - copilot → .github/chatmodes, .github/prompts');
    console.log('  - codex   → .codex/agents, .codex/prompts');
    console.log('Comma-separate multiple targets. Use "none" to skip.');
    const agentTargetsInput = await rl.question(
      '> Agent assistants [claude,copilot,codex|none] (default: none): ',
    );

    return {
      projectName: (projectNameInput || '').trim() || defaultProjectName,
      packageManager: parsePackageManager(packageManagerInput),
      contentProfile: parseContentProfile(contentProfileInput),
      agentTargets: parseAgentTargets(agentTargetsInput),
    };
  } finally {
    rl.close();
  }
}
