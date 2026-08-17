import process from 'node:process';

import { applyRecommendedDefaults } from './answers.js';
import { GROUPS, decisionsForGroup, isRelevant } from './decisions/catalog.js';
import { resolveDecisions, summarize } from './decisions/resolve.js';
import {
  CONTROL,
  createReadlineIo,
  formatGroupHeader,
  formatOptions,
  formatQuestion,
  parseConfirmInput,
  parseGroupInput,
  parseQuestionInput,
  parseTextInput,
} from './tui.js';

// Triad agents get full subagents/commands/skills; rules agents get a single
// native rules file that points back at AGENTS.md + docs/.
const AGENT_TARGETS = [
  { value: 'claude', label: 'Claude', hint: '.claude/agents, .claude/commands, .claude/skills' },
  { value: 'copilot', label: 'GitHub Copilot', hint: '.github/agents, .github/prompts' },
  { value: 'codex', label: 'Codex', hint: '.codex/agents (TOML), .agents/skills' },
  { value: 'gemini', label: 'Gemini', hint: 'GEMINI.md pointer' },
  { value: 'continue', label: 'Continue', hint: '.continue/rules/specframe.md' },
  { value: 'amazonq', label: 'Amazon Q', hint: '.amazonq/rules/specframe.md' },
];

const VALID_AGENT_TARGETS = new Set(AGENT_TARGETS.map((t) => t.value));

const PACKAGE_MANAGERS = [
  { value: 'npm', label: 'npm', recommended: true },
  { value: 'pnpm', label: 'pnpm' },
];

const MODES = [
  {
    value: 'guided',
    label: 'Guided — answer decisions now',
    recommended: true,
    hint: 'Every decision you take becomes an ADR plus the rules and guidelines it implies. Skip any question, or a whole section, with one key.',
  },
  {
    value: 'blank',
    label: 'Blank — templates only',
    hint: 'No decisions taken. Every template, its filling instructions, and the full decision backlog in docs/DECISIONS.md.',
  },
];

function getCurrentRepoName() {
  const parts = process.cwd().split(/[\\/]+/).filter(Boolean);
  return parts[parts.length - 1] || 'current-repo';
}

// Kept exported and permissive: it also parses the value stored in an existing
// manifest, which may predate a target being renamed or removed.
export function parseAgentTargets(value) {
  const normalized = (value || '').trim().toLowerCase();
  if (!normalized || normalized === 'none') return [];
  return normalized
    .split(',')
    .map((token) => token.trim())
    .filter((token) => VALID_AGENT_TARGETS.has(token));
}

// One numbered-choice prompt. Handles re-prompting on invalid input and on `?`
// so callers only ever see a resolved outcome.
async function askChoice(io, { header, options, multi = false, help, promptLabel }) {
  for (;;) {
    io.log(header);
    const raw = await io.question(promptLabel);
    const result = parseQuestionInput(raw, { optionCount: options.length, multi });

    if (result.kind === CONTROL.HELP) {
      io.log(help ? `\n${help}\n` : '\nNo further explanation available.\n');
      continue;
    }
    if (result.kind === CONTROL.INVALID) {
      io.log(`\n  ${result.reason}. Type a number, or press enter to skip.\n`);
      continue;
    }
    return result;
  }
}

async function askProjectBasics(io, seed) {
  const defaultName = seed.projectName || getCurrentRepoName();

  io.log('\n# Project name');
  io.log('Used inside the generated documents as this repository\'s identifier.');
  const projectName = parseTextInput(
    await io.question(`> Project name (default: ${defaultName}): `),
    defaultName,
  );

  const pmChoice = await askChoice(io, {
    header: [
      '',
      '# Package manager',
      'Referenced in generated guidelines and sample commands.',
      '',
      formatOptions(PACKAGE_MANAGERS),
      '',
    ].join('\n'),
    options: PACKAGE_MANAGERS,
    help: 'Only affects the commands quoted in generated documents.',
    promptLabel: '> Package manager [enter = npm]: ',
  });
  const packageManager =
    pmChoice.kind === CONTROL.SELECT ? PACKAGE_MANAGERS[pmChoice.values[0] - 1].value : 'npm';

  const agentChoice = await askChoice(io, {
    header: [
      '',
      '# Agent assistants',
      'AGENTS.md is always generated and covers most tools. These add each tool\'s',
      'native files on top. Pick any number, comma-separated.',
      '',
      formatOptions(AGENT_TARGETS),
      '',
    ].join('\n'),
    options: AGENT_TARGETS,
    multi: true,
    help: 'Claude, Copilot and Codex receive subagents, slash commands and skills.\nGemini, Continue and Amazon Q receive a single rules file pointing back at AGENTS.md.',
    promptLabel: '> Agents, e.g. "1,2" [enter = none]: ',
  });
  const agentTargets =
    agentChoice.kind === CONTROL.SELECT
      ? agentChoice.values.map((n) => AGENT_TARGETS[n - 1].value)
      : [];

  return { projectName, packageManager, agentTargets };
}

async function askMode(io) {
  const choice = await askChoice(io, {
    header: [
      '',
      '# Onboarding mode',
      '',
      formatOptions(MODES),
      '',
    ].join('\n'),
    options: MODES,
    help: MODES.map((m) => `${m.label}\n  ${m.hint}`).join('\n\n'),
    promptLabel: '> Mode [enter = guided]: ',
  });
  return choice.kind === CONTROL.SELECT ? MODES[choice.values[0] - 1].value : 'guided';
}

// The decision wizard. Returns the answers map, or null when the user quits.
// `only` restricts it to a subset of decision ids — that is how `specframe
// decide` reopens just the outstanding ones.
async function askDecisions(io, { seed = {}, only = null } = {}) {
  const answers = { ...seed };
  let skipRest = false;

  const inScope = (decision) => (only ? only.includes(decision.id) : true);
  const groups = GROUPS.map((group) => ({
    group,
    decisions: decisionsForGroup(group.id).filter(inScope),
  })).filter((g) => g.decisions.length > 0);

  // How many questions remain askable, given the answers so far. Recomputed per
  // question rather than fixed up front: choosing a modular monolith retires the
  // questions about distribution, and a progress counter out of a total that
  // includes them would contradict the summary at the end.
  const relevantTotal = () =>
    groups.flatMap((g) => g.decisions).filter((d) => isRelevant(d, answers)).length;

  let asked = 0;

  for (const [groupIndex, { group, decisions }] of groups.entries()) {
    if (skipRest) break;

    // Questions whose gate a previous answer has closed are not asked at all.
    const relevant = () => decisions.filter((d) => isRelevant(d, answers));
    if (relevant().length === 0) continue;

    // 'enter' | 'skip-group' | 'stop'
    let gateAction = null;
    while (gateAction === null) {
      io.log(
        formatGroupHeader({
          index: groupIndex + 1,
          total: groups.length,
          group,
          questionCount: relevant().length,
        }),
      );
      const gate = parseGroupInput(await io.question('> '));

      if (gate.kind === CONTROL.HELP) {
        io.log('');
        for (const decision of relevant()) io.log(`   · ${decision.question}  (${decision.help})`);
      } else if (gate.kind === CONTROL.INVALID) {
        io.log(`\n  ${gate.reason}.\n`);
      } else if (gate.kind === CONTROL.QUIT) {
        return null;
      } else if (gate.kind === CONTROL.SKIP) {
        asked += relevant().length;
        gateAction = 'skip-group';
      } else if (gate.kind === CONTROL.SKIP_ALL) {
        skipRest = true;
        gateAction = 'stop';
      } else if (gate.kind === CONTROL.DEFAULTS) {
        // `d` means "recommended for everything still ahead", at any prompt.
        const remaining = groups
          .slice(groupIndex)
          .flatMap((g) => g.decisions)
          .filter((d) => isRelevant(d, answers))
          .map((d) => d.id);
        Object.assign(answers, applyRecommendedDefaults(answers, { only: remaining }));
        skipRest = true;
        gateAction = 'stop';
      } else {
        gateAction = 'enter';
      }
    }

    if (gateAction !== 'enter') continue;

    // Re-read relevance on every step: answering one question can retire a
    // later one in the same group.
    for (let i = 0; i < decisions.length; i += 1) {
      const decision = decisions[i];
      if (!isRelevant(decision, answers)) continue;

      asked += 1;
      const result = await askChoice(io, {
        header: formatQuestion({ number: asked, total: relevantTotal(), decision }),
        options: decision.options,
        help: [
          decision.help,
          '',
          decision.context,
          '',
          ...decision.options.map((o) => `${o.label}: ${o.statement}`),
        ].join('\n'),
        promptLabel: '> [enter = skip · s skip · b back · d recommend rest · a skip all · q quit] ',
      });

      if (result.kind === CONTROL.QUIT) return null;
      if (result.kind === CONTROL.SELECT) {
        answers[decision.id] = decision.options[result.values[0] - 1].value;
        continue;
      }
      if (result.kind === CONTROL.SKIP) {
        delete answers[decision.id];
        continue;
      }
      if (result.kind === CONTROL.BACK) {
        asked -= 1; // undo this question's own increment
        let j = i - 1;
        while (j >= 0 && !isRelevant(decisions[j], answers)) j -= 1;
        if (j >= 0) {
          asked -= 1; // and the increment of the question we are re-asking
          i = j - 1;
        } else {
          i -= 1; // first question of the group: re-ask this one
        }
        continue;
      }
      if (result.kind === CONTROL.SKIP_ALL) {
        skipRest = true;
        break;
      }
      if (result.kind === CONTROL.DEFAULTS) {
        const remaining = [
          ...decisions.slice(i),
          ...groups.slice(groupIndex + 1).flatMap((g) => g.decisions),
        ]
          .filter((d) => isRelevant(d, answers))
          .map((d) => d.id);
        Object.assign(answers, applyRecommendedDefaults(answers, { only: remaining }));
        skipRest = true;
        break;
      }
    }
  }

  return answers;
}

function logSummary(io, resolved) {
  const s = summarize(resolved);
  io.log('');
  io.log(`── Summary ${'─'.repeat(48)}`);
  io.log(`   ${s.decided} decisions taken · ${s.open} left open`);
  io.log(
    `   → ${s.adrs} ADRs, ${s.rules} rules, ${s.guidelines} guidelines, ` +
      `${s.runbooks} runbooks, ${s.glossaryTerms} glossary terms`,
  );
  if (s.open > 0) io.log(`   Open decisions are listed in docs/DECISIONS.md.`);
  io.log('');
}

/**
 * Run the full onboarding.
 *
 * @param {object}   options
 * @param {object}   options.io            prompt transport; defaults to readline over stdio.
 * @param {object}   options.seed          pre-filled answers (from --preset / --set / a manifest).
 * @param {string}   options.mode          when set, the mode question is not asked.
 * @param {string[]} options.only          restrict the wizard to these decision ids.
 * @param {boolean}  options.close         close the io when finished (default true).
 * @returns config, or null when the user quits.
 */
export async function askQuestions({
  io = createReadlineIo(),
  seed = {},
  mode: fixedMode,
  only = null,
  close = true,
  basics = true,
} = {}) {
  try {
    io.log('\nspecframe — decision-driven scaffolding for this repository.\n');

    const projectSeed = { projectName: seed.projectName };
    const project = basics
      ? await askProjectBasics(io, projectSeed)
      : {
          projectName: seed.projectName,
          packageManager: seed.packageManager,
          agentTargets: seed.agentTargets ?? [],
        };

    const mode = fixedMode ?? (await askMode(io));

    if (mode === 'blank') {
      const resolved = resolveDecisions({ mode: 'blank', answers: {} });
      logSummary(io, resolved);
      return { ...project, mode: 'blank', decisions: {} };
    }

    let decisions = seed.decisions ?? {};
    for (;;) {
      const answered = await askDecisions(io, { seed: decisions, only });
      if (answered === null) return null;
      decisions = answered;

      const resolved = resolveDecisions({ mode: 'guided', answers: decisions });
      logSummary(io, resolved);

      const confirm = parseConfirmInput(
        await io.question('> [enter] write   [r] review answers   [q] quit: '),
      );
      if (confirm.kind === 'write') return { ...project, mode: 'guided', decisions };
      if (confirm.kind === CONTROL.QUIT) return null;
      if (confirm.kind === CONTROL.INVALID) io.log(`\n  ${confirm.reason}.\n`);
      // 'review' falls through and runs the decision loop again, seeded with
      // the answers already given.
    }
  } finally {
    if (close) io.close();
  }
}
