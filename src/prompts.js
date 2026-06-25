import { createInterface } from 'node:readline/promises';
import process from 'node:process';

// Triad agents get full subagents/commands/skills; rules agents get a single
// native rules file that points back at AGENTS.md + docs/.
const VALID_AGENT_TARGETS = new Set([
  'claude',
  'copilot',
  'codex',
  'gemini',
  'continue',
  'amazonq',
]);

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

export function parseAgentTargets(value) {
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
    console.log('Tailors files for the AI agents you use. AGENTS.md (always generated) already');
    console.log('covers most tools; these add each tool\'s native files on top.');
    console.log('Full subagents + slash commands + skills:');
    console.log('  - claude  → .claude/agents, .claude/commands, .claude/skills');
    console.log('  - copilot → .github/agents, .github/prompts');
    console.log('  - codex   → .codex/agents (TOML), .agents/skills');
    console.log('Native rules file (for tools that do not read AGENTS.md on their own):');
    console.log('  - gemini   → GEMINI.md');
    console.log('  - continue → .continue/rules/specframe.md');
    console.log('  - amazonq  → .amazonq/rules/specframe.md');
    console.log('Comma-separate multiple targets. Use "none" to skip.');
    const agentTargetsInput = await rl.question(
      '> Agent assistants [claude,copilot,codex,gemini,continue,amazonq|none] (default: none): ',
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
