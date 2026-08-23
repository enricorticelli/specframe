import process from 'node:process';

import { applyRecommendedDefaults } from './answers.js';
import { BLUEPRINTS, blueprintCoverage, blueprintHeadline } from './decisions/blueprints.js';
import { GROUPS, decisionsForGroup, isRelevant, recommendedValue } from './decisions/catalog.js';
import { resolveDecisions, summarize } from './decisions/resolve.js';
import {
  buildReview,
  diffAnswers,
  findReviewRow,
  formatArtifactSummary,
  formatChangeTable,
  formatReviewTable,
  formatSectionDigest,
  openDecisionIds,
} from './review.js';
import { runPicker } from './picker.js';
import { terminalWidth, theme, truncate, wrapText } from './style.js';
import {
  CONTROL,
  createReadlineIo,
  formatBanner,
  formatChoiceEcho,
  formatError,
  formatGroupHeader,
  formatKeys,
  formatOptions,
  formatQuestionHead,
  formatSkipEcho,
  parseConfirmInput,
  parseGroupInput,
  parseQuestionInput,
  parseReviewInput,
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

// Exposed so `specframe agents` can list the harnesses, and name each one the
// same way the wizard does, without a second copy of the table.
export const AGENT_TARGET_LIST = AGENT_TARGETS;

export function agentTargetLabel(value) {
  return AGENT_TARGETS.find((t) => t.value === value)?.label ?? value;
}

const PACKAGE_MANAGERS = [
  { value: 'npm', label: 'npm', recommended: true },
  { value: 'pnpm', label: 'pnpm' },
];

const MODES = [
  {
    value: 'guided',
    label: 'Guided — answer decisions now',
    recommended: true,
    hint: 'Every decision you take becomes an ADR plus the rules and guidelines it implies. Enter takes the recommended option; one key leaves a question, or a whole section, open.',
  },
  {
    value: 'blueprint',
    label: 'Blueprint — start from a known architecture',
    hint: 'Pick an archetype and the questions arrive already answered the way that architecture answers them. Then walk the same guided pass, changing what does not fit.',
  },
  {
    value: 'blank',
    label: 'Blank — templates only',
    hint: 'No decisions taken. Every template, its filling instructions, and the full decision backlog in docs/DECISIONS.md.',
  },
];

// Blueprints as prompt options. The list is the catalog's, in its own order —
// simplest shape first — so the screen reads as a ladder from one deployable to
// many rather than as a menu of equals.
const BLUEPRINT_OPTIONS = BLUEPRINTS.map((blueprint) => ({
  value: blueprint.id,
  label: blueprint.label,
  hint: blueprint.hint,
}));

const PROMPT = () => `${theme.accent(theme.glyph.prompt)} `;

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

// Like parseAgentTargets, but reports what it could not use instead of
// dropping it. `init --agents` can afford to ignore a typo — it is one flag
// among many and the wizard's list is right there — but `agents add codexx` has
// nothing else to do, and silently succeeding at nothing is the worst outcome.
export function splitAgentTargets(value) {
  const tokens = (value || '')
    .split(',')
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);
  const valid = [];
  const unknown = [];
  for (const token of tokens) {
    if (token === 'none') continue;
    if (VALID_AGENT_TARGETS.has(token)) {
      if (!valid.includes(token)) valid.push(token);
    } else if (!unknown.includes(token)) {
      unknown.push(token);
    }
  }
  return { valid, unknown };
}

function sectionTitle(text, { width = terminalWidth() } = {}) {
  return `\n${theme.rule(width, text)}`;
}

// The one prompt shape in the wizard: some prose, a numbered list, a choice.
//
// It has two input surfaces. On a real terminal the option list is an arrow-key
// picker; everywhere else it is printed and the answer is typed. Both resolve to
// the same outcomes, so every caller below — and everything downstream of them —
// is written once and does not ask which one ran.
//
// `keys` is passed as pairs rather than as rendered text because the two
// surfaces label the same keys differently: `enter` changes meaning once the
// picker's cursor moves, and there is no point telling someone to type `1,2`
// when they can hit space. `pickerKeys` overrides the list where that gap is
// wider than the enter hint alone.
async function askChoice(io, {
  preamble,
  options,
  multi = false,
  help,
  current = undefined,
  keys = [],
  pickerKeys = null,
  keyLayout = {},
  promptLabel,
}) {
  for (;;) {
    io.log(preamble);

    const result = usePicker(io)
      ? await askByKey(io, { options, multi, current, keys: pickerKeys ?? keys })
      : await askByLine(io, { options, multi, current, keys, keyLayout, promptLabel });

    if (result.kind === CONTROL.HELP) {
      const width = terminalWidth();
      io.log('');
      io.log(
        help
          ? wrapText(help, width, '  ')
              .map((line) => theme.muted(line))
              .join('\n')
          : theme.muted('  No further explanation available.'),
      );
      io.log('');
      continue;
    }
    if (result.kind === CONTROL.INVALID) {
      io.log(formatError(`${result.reason}. Type a number, or press enter for the default.`, { theme }));
      continue;
    }
    return result;
  }
}

// SPECFRAME_NO_KEYS and every non-terminal case are already folded into
// io.keyboard; this is only the seam that lets a caller hold a picker-less io.
function usePicker(io) {
  return Boolean(io.keyboard && io.openKeys);
}

async function askByLine(io, { options, multi, current, keys, keyLayout, promptLabel }) {
  const width = terminalWidth();
  io.log(formatOptions(options, { theme, width, current }));
  if (keys.length > 0) {
    io.log('');
    io.log(formatKeys(keys, { theme, width, ...keyLayout }));
  }
  io.log('');
  const raw = await io.question(promptLabel ?? PROMPT());
  return parseQuestionInput(raw, { optionCount: options.length, multi });
}

async function askByKey(io, { options, multi, current, keys }) {
  // The picker draws its own block and must never let a line soft-wrap, or the
  // cursor arithmetic on the next frame walks up through the question above it.
  // terminalWidth() has a floor of 60 for the tables' sake; here the terminal's
  // real width wins.
  const width = Math.min(terminalWidth(), Math.max(20, io.columns() - 1));
  const reader = io.openKeys();
  try {
    return await runPicker({
      options,
      multi,
      current,
      keys,
      enterHintMoved: multi ? 'take what is marked' : 'take the highlighted option',
      reader,
      write: io.write,
      theme,
      width,
      rows: io.rows(),
    });
  } finally {
    reader.close();
  }
}

// The arrows, named for whichever glyphs this terminal admits to having.
const MOVE_KEY = () => (theme.unicode ? '\u2191\u2193' : 'up/down');

async function askProjectBasics(io, seed) {
  const width = terminalWidth();
  const defaultName = seed.projectName || getCurrentRepoName();

  io.log(sectionTitle('Project', { width }));
  io.log(theme.muted('  Used inside the generated documents as this repository\'s identifier.'));
  io.log('');
  const projectName = parseTextInput(
    await io.question(`${theme.accent(theme.glyph.prompt)} Project name ${theme.muted(`[enter = ${defaultName}]`)} `),
    defaultName,
  );

  const pmChoice = await askChoice(io, {
    preamble: [
      sectionTitle('Package manager', { width }),
      theme.muted('  Referenced in generated guidelines and sample commands.'),
      '',
    ].join('\n'),
    options: PACKAGE_MANAGERS,
    keys: [['enter', 'npm'], ['?', 'why this matters']],
    pickerKeys: [[MOVE_KEY(), 'move'], ['enter', 'npm'], ['?', 'why this matters']],
    help: 'Only affects the commands quoted in generated documents.',
  });
  const packageManager =
    pmChoice.kind === CONTROL.SELECT ? PACKAGE_MANAGERS[pmChoice.values[0] - 1].value : 'npm';

  const agentChoice = await askChoice(io, {
    preamble: [
      sectionTitle('Agent assistants', { width }),
      ...wrapText(
        `AGENTS.md is always generated and covers most tools. These add each tool's native files on top. Pick any number.`,
        width,
        '  ',
      ).map((line) => theme.muted(line)),
      '',
    ].join('\n'),
    options: AGENT_TARGETS,
    multi: true,
    keys: [['1,2', 'pick several'], ['enter', 'none'], ['?', 'what each one gets']],
    pickerKeys: [
      [MOVE_KEY(), 'move'],
      ['space', 'mark'],
      ['enter', 'none'],
      ['?', 'what each one gets'],
    ],
    help: 'Claude, Copilot and Codex receive subagents, slash commands and skills.\nGemini, Continue and Amazon Q receive a single rules file pointing back at AGENTS.md.',
  });
  const agentTargets =
    agentChoice.kind === CONTROL.SELECT
      ? agentChoice.values.map((n) => AGENT_TARGETS[n - 1].value)
      : [];

  return { projectName, packageManager, agentTargets };
}

/**
 * The one-choice menu `specframe` shows when the repository it is run in is
 * already scaffolded. Built by the caller from what this repo actually has, so
 * the list never offers revising decisions in a repo with none.
 *
 * @param {{value: string, label: string, hint?: string}[]} options
 * @param {string[]} preamble  lines shown above the list, already sentence-shaped.
 * @returns {string|null} the chosen value, or null when the user quit.
 */
export async function askMenu({ title, preamble = [], options, io = createReadlineIo() }) {
  const width = terminalWidth();
  try {
    const choice = await askChoice(io, {
      preamble: [
        sectionTitle(title, { width }),
        ...preamble.flatMap((line) => wrapText(line, width, '  ')).map((line) => theme.muted(line)),
        '',
      ].join('\n'),
      options,
      // Enter means different things on the two surfaces and is labelled as
      // each: it runs the highlighted row in the picker, and there is no
      // highlighted row when the list is typed at.
      keys: [['1', 'pick one'], ['q', 'quit'], ['?', 'what each one does']],
      pickerKeys: [[MOVE_KEY(), 'move'], ['enter', 'run it'], ['q', 'quit'], ['?', 'what each one does']],
      help: options.map((option) => `${option.label}\n  ${option.hint ?? ''}`.trimEnd()).join('\n\n'),
    });
    return choice.kind === CONTROL.SELECT ? options[choice.values[0] - 1].value : null;
  } finally {
    io.close();
  }
}

/**
 * Pick harnesses to add to a repository that already has some — the interactive
 * half of `specframe agents add`. Same picker as onboarding's, restricted to
 * what is not configured here yet, and its own io because it is the whole
 * session rather than one screen inside the wizard.
 *
 * @param {string[]} available  target values still addable, in catalog order.
 * @returns {string[]|null} the chosen values, or null when the user quit.
 */
export async function askAgentTargets({ available, io = createReadlineIo() }) {
  const options = AGENT_TARGETS.filter((target) => available.includes(target.value));
  const width = terminalWidth();
  try {
    const choice = await askChoice(io, {
      preamble: [
        sectionTitle('Agent assistants to add', { width }),
        ...wrapText(
          'Each one adds that tool\'s native files, pointing at the AGENTS.md and docs/ already in this repository. Pick any number.',
          width,
          '  ',
        ).map((line) => theme.muted(line)),
        '',
      ].join('\n'),
      options,
      multi: true,
      keys: [['1,2', 'pick several'], ['enter', 'cancel'], ['?', 'what each one gets']],
      pickerKeys: [
        [MOVE_KEY(), 'move'],
        ['space', 'mark'],
        ['enter', 'cancel'],
        ['?', 'what each one gets'],
      ],
      help: 'Claude, Copilot and Codex receive subagents, slash commands and skills.\nGemini, Continue and Amazon Q receive a single rules file pointing back at AGENTS.md.',
    });
    return choice.kind === CONTROL.SELECT ? choice.values.map((n) => options[n - 1].value) : null;
  } finally {
    io.close();
  }
}

async function askMode(io) {
  const width = terminalWidth();
  const choice = await askChoice(io, {
    preamble: [sectionTitle('Onboarding mode', { width }), ''].join('\n'),
    options: MODES,
    keys: [['enter', 'guided'], ['?', 'the difference in full']],
    pickerKeys: [[MOVE_KEY(), 'move'], ['enter', 'guided'], ['?', 'the difference in full']],
    help: MODES.map((m) => `${m.label}\n  ${m.hint}`).join('\n\n'),
  });
  return choice.kind === CONTROL.SELECT ? MODES[choice.values[0] - 1].value : 'guided';
}

/**
 * Pick an architecture blueprint.
 *
 * The screen between "no decisions" and "forty questions from scratch": you
 * choose the shape you already have in mind, and the wizard starts from what
 * that shape implies instead of from a blank map.
 *
 * `enter` goes back to the mode question rather than taking a default. There is
 * no recommended architecture — the whole point of the catalog is that the
 * right one depends on the system — so offering one here by way of a default
 * would contradict every question that follows.
 *
 * @returns {{kind: 'select', blueprint: object} | {kind: 'back'} | {kind: 'quit'}}
 */
async function askBlueprint(io) {
  const width = terminalWidth();
  const choice = await askChoice(io, {
    preamble: [
      sectionTitle('Blueprint', { width }),
      ...wrapText(
        `Each one answers the architecture, design and data decisions the way that architecture answers them, plus what its shape forces on you. Nothing is written: every answer comes back as a question with your blueprint's answer already selected.`,
        width,
        '  ',
      ).map((line) => theme.muted(line)),
      '',
    ].join('\n'),
    options: BLUEPRINT_OPTIONS,
    // No blueprint is recommended, so the picker's cursor starts on none of them
    // and `enter` keeps meaning what it says here: go back, do not pick.
    keys: [
      [`1-${BLUEPRINT_OPTIONS.length}`, 'choose'],
      ['enter', 'back'],
      ['?', 'what each one commits you to'],
    ],
    pickerKeys: [
      [MOVE_KEY(), 'move'],
      ['enter', 'back'],
      ['?', 'what each one commits you to'],
    ],
    help: BLUEPRINTS.map((b) => `${b.label}\n  ${b.description}`).join('\n\n'),
  });

  if (choice.kind === CONTROL.QUIT) return { kind: CONTROL.QUIT };
  if (choice.kind !== CONTROL.SELECT) return { kind: 'back' };
  return { kind: CONTROL.SELECT, blueprint: BLUEPRINTS[choice.values[0] - 1] };
}

// What picking a blueprint bought you, said out loud before the first question:
// the shape in the catalog's own words, and how much of the catalog it leaves.
function logBlueprintEcho(io, blueprint, { width = terminalWidth() } = {}) {
  const { answered, relevant } = blueprintCoverage(blueprint);
  io.log('');
  io.log(`  ${theme.good(theme.glyph.check)} ${theme.bold(blueprint.label)}`);
  io.log(
    wrapText(blueprintHeadline(blueprint), width, '    ')
      .map((line) => theme.muted(line))
      .join('\n'),
  );
  io.log(
    wrapText(
      `${answered} of the ${relevant} decisions that still apply come pre-answered. Every one is asked again with that answer selected — enter keeps it, a number changes it.`,
      width,
      '    ',
    )
      .map((line) => theme.muted(line))
      .join('\n'),
  );
}

// What `enter` resolves to for one decision: the answer already given if there
// is one, otherwise the recommendation. Returned as an option so the prompt can
// name it — an unnamed default is how the wizard lost its first user.
function acceptedOption(decision, answers) {
  const current = answers[decision.id];
  const value = current !== undefined ? current : recommendedValue(decision);
  return decision.options.find((option) => option.value === value) ?? null;
}

// Ask one decision and report what the answer means for the answers map, without
// touching it. Shared by the wizard and by the review table's "change row 12",
// so a decision is presented identically wherever you reach it from.
async function askDecision(io, { decision, number, total, answers, lead = null }) {
  const width = terminalWidth();
  const current = answers[decision.id];
  const accepted = acceptedOption(decision, answers);

  // Enter names the option it will take, and says whether that is keeping your
  // answer or taking the recommendation.
  let enterHint = 'leave it open';
  if (accepted) {
    const label = truncate(accepted.label, 34, theme.glyph.ellipsis);
    enterHint = current !== undefined ? `keep ${label}` : `${label} ${theme.glyph.star}`;
  }

  const tail = [
    ['s', 'leave it open'],
    ['x', 'never applies here'],
    ['?', 'why this matters'],
    ['b', 'back'],
    ['d', 'take every recommendation from here'],
    ['a', 'leave the rest open'],
    ['q', 'quit'],
  ];

  const preamble = [
    lead ? `\n${theme.muted(lead)}` : null,
    formatQuestionHead({ number, total, decision, theme, width }),
    '',
  ]
    .filter((part) => part !== null)
    .join('\n');

  return askChoice(io, {
    preamble,
    options: decision.options,
    current,
    keys: [[`1-${decision.options.length}`, 'choose'], ['enter', enterHint], ...tail],
    // The number keys still work in the picker, but they stop being the headline:
    // what you reach for is the arrows, and the digits are the shortcut for
    // someone who already knows the list.
    pickerKeys: [[MOVE_KEY(), 'move'], ['enter', enterHint], ...tail],
    keyLayout: { indent: '  ', gap: 2 },
    help: [
      decision.help,
      '',
      decision.context,
      '',
      ...decision.options.map((o) => `${o.label}: ${o.statement}`),
    ].join('\n'),
  });
}

/**
 * Fold a prompt result into the answers map and say out loud what happened.
 *
 * Handles the outcomes that are about *this* decision — a pick, `enter`, `s`,
 * `x` — and reports back when the result is flow control (back, quit, the
 * bulk keys) for the caller to deal with. Shared so that `enter` cannot come to
 * mean one thing in the wizard and another in the review table.
 *
 * `dismissed` is the sibling of `answers` for the one decision `x` records —
 * mutated in place the same way, and `null` wherever a caller has nothing to
 * put a dismissal in (`specframe revise`'s table): the key still works there,
 * it just says so instead of silently discarding the reason.
 *
 * Async only for the one branch that needs it — capturing the reason for a
 * dismissal is another `io.question`, safe to open here because by the time a
 * result reaches this function the picker's key reader is already closed (see
 * runPicker's `finally`) and `createReadlineIo` builds and tears down a
 * readline per question, so the two can never fight over stdin.
 *
 * @returns {boolean} true when the result was an answer and has been applied.
 */
async function applyDecisionResult(io, { decision, result, answers, dismissed = null }) {
  if (result.kind === CONTROL.SELECT) {
    const option = decision.options[result.values[0] - 1];
    answers[decision.id] = option.value;
    if (dismissed) delete dismissed[decision.id];
    io.log(formatChoiceEcho(decision, option, { theme }));
    return true;
  }

  if (result.kind === CONTROL.ACCEPT) {
    const current = answers[decision.id];
    const option = acceptedOption(decision, answers);
    if (!option) {
      // No recommendation to fall back on: enter cannot invent an answer, so the
      // decision stays open and says so rather than looking like it was taken.
      io.log(formatSkipEcho('no recommended option — left open', { theme }));
      return true;
    }
    answers[decision.id] = option.value;
    if (dismissed) delete dismissed[decision.id];
    io.log(
      formatChoiceEcho(decision, option, {
        theme,
        note: current !== undefined ? 'kept' : 'recommended',
      }),
    );
    return true;
  }

  if (result.kind === CONTROL.SKIP) {
    delete answers[decision.id];
    io.log(formatSkipEcho('left open — it will be listed in docs/DECISIONS.md', { theme }));
    return true;
  }

  if (result.kind === CONTROL.DISMISS) {
    if (!dismissed) {
      io.log(formatSkipEcho('not available here — dismiss during setup, or run `specframe dismiss`', { theme }));
      return true;
    }
    if (answers[decision.id] !== undefined) {
      io.log(formatSkipEcho('already recorded — supersede it with `specframe revise` instead', { theme }));
      return true;
    }
    const raw = await io.question('  Why not? [enter = not applicable here] ');
    const reason = raw.trim() || null;
    dismissed[decision.id] = { reason };
    io.log(
      formatSkipEcho(
        reason ? `does not apply — ${reason}` : 'does not apply here',
        { theme },
      ),
    );
    return true;
  }

  return false;
}

// The decision wizard. Returns { answers, dismissed }, or null when the user
// quits. `only` restricts it to a subset of decision ids — that is how
// `specframe decide` reopens just the outstanding ones. `dismissed` follows
// the same copy-in/return-out shape as `answers`; pass null where there is
// nowhere for a dismissal to go (see applyDecisionResult) — `specframe
// revise`'s walk, currently — and `x` says so instead of silently discarding it.
async function askDecisions(io, { seed = {}, only = null, dismissed: dismissedSeed = null } = {}) {
  const answers = { ...seed };
  const dismissed = dismissedSeed ? { ...dismissedSeed } : null;
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
          answered: relevant().filter((d) => answers[d.id] !== undefined).length,
          theme,
        }),
      );
      const gate = parseGroupInput(await io.question(PROMPT()));

      if (gate.kind === CONTROL.HELP) {
        io.log('');
        for (const decision of relevant()) {
          const current = answers[decision.id];
          const option = current ? decision.options.find((o) => o.value === current) : null;
          const state = option ? theme.good(option.label) : theme.warn('not decided');
          io.log(`   ${theme.muted(theme.glyph.bullet)} ${decision.question}  ${state}`);
        }
      } else if (gate.kind === CONTROL.INVALID) {
        io.log(formatError(`${gate.reason}.`, { theme }));
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
      } else if (gate.kind === CONTROL.DISMISS) {
        if (!dismissed) {
          io.log(formatSkipEcho('not available here — dismiss during setup, or run `specframe dismiss`', { theme }));
        } else {
          const raw = await io.question('  Why does none of this apply? [enter = not applicable here] ');
          const reason = raw.trim() || null;
          for (const decision of relevant()) dismissed[decision.id] = { reason };
          asked += relevant().length;
          io.log(formatSkipEcho(`the whole section does not apply here${reason ? ` — ${reason}` : ''}`, { theme }));
          gateAction = 'skip-group';
        }
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
      const result = await askDecision(io, {
        decision,
        number: asked,
        total: relevantTotal(),
        answers,
      });

      if (result.kind === CONTROL.QUIT) return null;
      if (await applyDecisionResult(io, { decision, result, answers, dismissed })) continue;
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

  return { answers, dismissed };
}

/**
 * The review table.
 *
 * The point of this screen is that a row number is an address: after thirty
 * questions you fix answer twelve by typing 12, and you come straight back here.
 * `w` still walks every section, because sometimes you do want another pass.
 *
 * @returns {{ action: 'back'|'walk', decisions: object, dismissed: object|null }}
 *   or null when quitting.
 */
async function reviewScreen(io, { decisions, editable = null, dismissed: dismissedSeed = null }) {
  let answers = { ...decisions };
  let dismissed = dismissedSeed ? { ...dismissedSeed } : null;
  let openOnly = false;

  for (;;) {
    const width = terminalWidth();
    const review = buildReview(answers, { dismissed: dismissed ?? {} });

    io.log(sectionTitle('Answers', { width }));
    io.log('');
    io.log(formatReviewTable(review, { theme, width, editable, openOnly }));
    io.log('');
    io.log(
      `  ${theme.bold(String(review.decided))} ${theme.muted('decided')}   ` +
        `${review.open > 0 ? theme.warn(String(review.open)) : theme.bold('0')} ${theme.muted('open')}   ` +
        `${theme.muted(theme.glyph.arrow)} ${formatArtifactSummary(review, { theme })}`,
    );
    io.log('');
    io.log(
      formatKeys(
        [
          [`1-${review.total}`, 'change that one'],
          review.open > 0 ? ['o', `answer the ${review.open} still open`] : null,
          ['f', openOnly ? 'show all' : 'show only open'],
          ['w', 'walk every section again'],
          ['enter', 'back'],
          ['q', 'quit'],
        ],
        { theme, width },
      ),
    );

    const input = parseReviewInput(await io.question(PROMPT()), { total: review.total });

    if (input.kind === CONTROL.QUIT) return null;
    if (input.kind === 'back') return { action: 'back', decisions: answers, dismissed };
    if (input.kind === 'walk') return { action: 'walk', decisions: answers, dismissed };

    if (input.kind === CONTROL.INVALID) {
      io.log(formatError(`${input.reason}.`, { theme }));
      continue;
    }

    if (input.kind === CONTROL.HELP) {
      io.log('');
      io.log(
        wrapText(
          'Every decision that applies to this configuration is listed, open ones included. ' +
            'Type a row number to change that single answer; the questions a new answer makes ' +
            'relevant are added to the table, and the ones it retires disappear.',
          width,
          '  ',
        )
          .map((line) => theme.muted(line))
          .join('\n'),
      );
      continue;
    }

    if (input.kind === 'filter') {
      openOnly = !openOnly;
      continue;
    }

    if (input.kind === 'open') {
      const ids = openDecisionIds(review).filter((id) => !editable || editable.has(id));
      if (ids.length === 0) {
        io.log(formatError('Nothing left open that this run may answer.', { theme }));
        continue;
      }
      const answered = await askDecisions(io, { seed: answers, only: ids, dismissed });
      if (answered === null) return null;
      answers = answered.answers;
      dismissed = answered.dismissed;
      continue;
    }

    if (input.kind === 'jump') {
      const row = findReviewRow(review, input.index);
      if (editable && !editable.has(row.decision.id)) {
        io.log(
          formatError(
            row.status === 'dismissed'
              ? `${row.decision.title} was dismissed as not applicable. Run \`specframe restore ${row.decision.id}\` first if that is no longer true.`
              : `${row.decision.title} is already recorded. Supersede it by editing docs/adr/${row.decision.adr}-${row.decision.slug}.md.`,
            { theme },
          ),
        );
        continue;
      }

      const result = await askDecision(io, {
        decision: row.decision,
        number: row.index,
        total: review.total,
        answers,
        lead: `Changing row ${row.index} ${theme.glyph.bullet} ${row.group?.title ?? ''}`.trim(),
      });

      if (result.kind === CONTROL.QUIT) return null;
      if (await applyDecisionResult(io, { decision: row.decision, result, answers, dismissed })) {
        // handled: the answer is recorded and echoed
      } else if (result.kind === CONTROL.DEFAULTS) {
        // "The rest", from a review, means every decision still open — but never
        // one this run is not allowed to answer.
        answers = applyRecommendedDefaults(answers, editable ? { only: [...editable] } : {});
        io.log(formatSkipEcho('every open decision took its recommended option', { theme }));
      } else if (result.kind === CONTROL.SKIP_ALL || result.kind === CONTROL.BACK) {
        io.log(formatSkipEcho('unchanged', { theme }));
      } else {
        io.log(formatSkipEcho('unchanged', { theme }));
      }

      // A new answer can open questions the old one had retired, or retire ones
      // it had opened. Say so rather than letting the table silently grow.
      const after = buildReview(answers, { dismissed: dismissed ?? {} });
      const delta = after.total - review.total;
      if (delta > 0) {
        io.log(formatSkipEcho(`${delta} more question(s) now apply`, { theme }));
      } else if (delta < 0) {
        io.log(formatSkipEcho(`${-delta} question(s) no longer apply`, { theme }));
      }
    }
  }
}

// What the answers will produce, wrapped rather than overflowing: on a narrow
// terminal this list is long enough to run off the edge.
function formatArtifactLine(s, { width = terminalWidth() } = {}) {
  const text =
    `${s.adrs} ADRs, ${s.rules} rules, ${s.guidelines} guidelines, ` +
    `${s.runbooks} runbooks, ${s.glossaryTerms} glossary terms`;
  const lines = wrapText(text, width - 4, '    ');
  return [`  ${theme.muted(theme.glyph.arrow)} ${lines[0].trim()}`, ...lines.slice(1)].join('\n');
}

function logSummary(io, decisions, { width = terminalWidth(), dismissed = {} } = {}) {
  const review = buildReview(decisions, { dismissed });
  const s = summarize(review.resolved);

  io.log(sectionTitle('Summary', { width }));
  io.log('');
  io.log(formatSectionDigest(review, { theme, width }));
  io.log('');
  io.log(
    `  ${theme.bold(String(s.decided))} ${theme.muted('decisions taken')} ${theme.muted(theme.glyph.bullet)} ` +
      `${s.open > 0 ? theme.warn(String(s.open)) : theme.bold('0')} ${theme.muted('left open')}`,
  );
  io.log(formatArtifactLine(s, { width }));
  if (s.open > 0) {
    io.log(`  ${theme.muted('Open decisions are listed in docs/DECISIONS.md.')}`);
  }
  io.log('');
  return review;
}

// Blank mode writes no decisions, so its summary is a sentence, not a table.
function logBlankSummary(io, { width = terminalWidth() } = {}) {
  const resolved = resolveDecisions({ mode: 'blank', answers: {} });
  const s = summarize(resolved);
  io.log(sectionTitle('Summary', { width }));
  io.log('');
  io.log(
    `  ${theme.bold('0')} ${theme.muted('decisions taken')} ${theme.muted(theme.glyph.bullet)} ` +
      `${theme.warn(String(s.open))} ${theme.muted('left open')}`,
  );
  io.log(formatArtifactLine(s, { width }));
  io.log(`  ${theme.muted('Every decision is listed in docs/DECISIONS.md.')}`);
  io.log('');
}

/**
 * Run the full onboarding.
 *
 * @param {object}   options
 * @param {object}   options.io            prompt transport; defaults to readline over stdio.
 * @param {object}   options.seed          pre-filled answers (from --preset / --set / a manifest),
 *                                         plus any dismissals already recorded (`seed.dismissed`).
 * @param {string}   options.mode          when set, the mode question is not asked.
 * @param {string[]} options.only          restrict the wizard to these decision ids.
 * @param {boolean}  options.close         close the io when finished (default true).
 * @param {string}   options.version       shown in the banner.
 * @returns config (including `dismissed`), or null when the user quits.
 */
export async function askQuestions({
  io = createReadlineIo(),
  seed = {},
  mode: fixedMode,
  only = null,
  close = true,
  basics = true,
  version,
} = {}) {
  try {
    const width = terminalWidth();
    io.log(formatBanner({ version, theme, width }));

    const projectSeed = { projectName: seed.projectName };
    const project = basics
      ? await askProjectBasics(io, projectSeed)
      : {
          projectName: seed.projectName,
          packageManager: seed.packageManager,
          agentTargets: seed.agentTargets ?? [],
        };

    // The blueprint screen sits inside the mode question rather than after it:
    // picking one resolves to guided, and `enter` there comes back here, so a
    // wrong turn costs a keystroke instead of a run.
    let mode = fixedMode ?? (await askMode(io));
    let seeded = seed.decisions ?? {};
    let dismissed = seed.dismissed ?? {};

    while (mode === 'blueprint') {
      const picked = await askBlueprint(io);
      if (picked.kind === CONTROL.QUIT) return null;
      if (picked.kind !== CONTROL.SELECT) {
        mode = await askMode(io);
        continue;
      }
      // An answer given on the command line is about one decision and was typed
      // on purpose, so it survives the blueprint that arrived after it — the
      // same precedence `--set` has over `--preset`.
      seeded = { ...picked.blueprint.answers, ...seeded };
      logBlueprintEcho(io, picked.blueprint, { width });
      mode = 'guided';
    }

    if (mode === 'blank') {
      logBlankSummary(io, { width });
      return { ...project, mode: 'blank', decisions: {}, dismissed };
    }

    // Only what this run may change: with `only` set (that is, `specframe
    // decide`) the already-recorded decisions are shown for context but are not
    // editable, because an ADR is superseded, not rewritten.
    const editable = only ? new Set(only) : null;

    let decisions = seeded;
    for (;;) {
      const answered = await askDecisions(io, { seed: decisions, only, dismissed });
      if (answered === null) return null;
      decisions = answered.answers;
      dismissed = answered.dismissed;

      // Confirm/review loop: the review screen returns here rather than
      // restarting the wizard, unless it is explicitly asked to walk again.
      let walkAgain = false;
      while (!walkAgain) {
        const review = logSummary(io, decisions, { width, dismissed });
        io.log(
          formatKeys(
            [
              ['enter', 'write it'],
              ['r', `review the ${review.total} decisions`],
              ['q', 'quit'],
            ],
            { theme },
          ),
        );

        const confirm = parseConfirmInput(await io.question(PROMPT()));

        if (confirm.kind === 'write') return { ...project, mode: 'guided', decisions, dismissed };
        if (confirm.kind === CONTROL.QUIT) return null;
        if (confirm.kind === CONTROL.INVALID) {
          io.log(formatError(`${confirm.reason}.`, { theme }));
          continue;
        }

        const reviewed = await reviewScreen(io, { decisions, editable, dismissed });
        if (reviewed === null) return null;
        decisions = reviewed.decisions;
        dismissed = reviewed.dismissed;
        walkAgain = reviewed.action === 'walk';
      }
    }
  } finally {
    if (close) io.close();
  }
}

/**
 * Revise decisions already recorded — `specframe revise`.
 *
 * The review table *is* the screen here, rather than a checkpoint at the end of
 * a wizard: you arrive knowing which answer you want to change, so the first
 * thing shown is the numbered list of what this repo decided. Every row is
 * editable, including the ones already carrying an ADR — that is the whole point
 * of the command — and the confirmation is a before/after table, because writing
 * over a decision log deserves a louder confirmation than taking a fresh one.
 *
 * @param {object}   options
 * @param {object}   options.decisions  answers as currently recorded.
 * @param {string}   options.target     decision id to open straight away.
 * @returns the revised answers, or null when the user quits.
 */
export async function askRevision({
  io = createReadlineIo(),
  decisions = {},
  target = null,
  version,
  close = true,
} = {}) {
  const recorded = { ...decisions };
  let answers = { ...decisions };

  try {
    const width = terminalWidth();
    io.log(formatBanner({ version, theme, width }));

    // `specframe revise architecture-style` goes straight to the question.
    if (target) {
      const review = buildReview(answers);
      const row = review.rows.find((entry) => entry.decision.id === target);
      if (!row) {
        io.log(
          formatError(
            `${target} does not apply to this configuration, so there is nothing to revise.`,
            { theme },
          ),
        );
        return null;
      }
      const result = await askDecision(io, {
        decision: row.decision,
        number: row.index,
        total: review.total,
        answers,
        lead: `Revising ${row.decision.id} ${theme.glyph.bullet} ${row.group.title}`,
      });
      if (result.kind === CONTROL.QUIT) return null;
      // No `dismissed` map is threaded through a revision — dismiss only
      // applies to an open decision, and everything reachable from `revise`
      // is, by definition, already recorded. `x` here says so and changes
      // nothing (see applyDecisionResult), same as everywhere else below.
      await applyDecisionResult(io, { decision: row.decision, result, answers });
    }

    for (;;) {
      const reviewed = await reviewScreen(io, { decisions: answers, editable: null });
      if (reviewed === null) return null;
      answers = reviewed.decisions;

      if (reviewed.action === 'walk') {
        const walked = await askDecisions(io, { seed: answers });
        if (walked === null) return null;
        answers = walked.answers;
        continue;
      }

      const changes = diffAnswers(recorded, answers);
      io.log(sectionTitle('Revision', { width }));
      io.log('');
      io.log(formatChangeTable(changes, { theme, width }));
      io.log('');

      if (changes.length === 0) {
        io.log(
          formatKeys([['r', 'back to the table'], ['q', 'quit']], { theme, width }),
        );
      } else {
        io.log(
          `  ${theme.muted('Each revised ADR keeps its number and records the old choice under')} ` +
            `${theme.muted('History.')}`,
        );
        io.log('');
        io.log(
          formatKeys(
            [
              ['enter', `write ${changes.length} revision${changes.length === 1 ? '' : 's'}`],
              ['r', 'back to the table'],
              ['q', 'quit, changing nothing'],
            ],
            { theme, width },
          ),
        );
      }

      const confirm = parseConfirmInput(await io.question(PROMPT()));
      if (confirm.kind === CONTROL.QUIT) return null;
      if (confirm.kind === 'review') continue;
      if (confirm.kind === CONTROL.INVALID) {
        io.log(formatError(`${confirm.reason}.`, { theme }));
        continue;
      }
      // Enter on a run that changed nothing would write a manifest for no
      // reason; the caller treats an empty diff as "nothing to do" anyway.
      return answers;
    }
  } finally {
    if (close) io.close();
  }
}

/**
 * The read-only review used by `specframe review`: the same table, without any
 * prompting, so a recorded configuration can be read back in one command.
 */
export function renderReview(decisions, { width = terminalWidth(), openOnly = false, dismissed = {} } = {}) {
  const review = buildReview(decisions, { dismissed });
  const s = summarize(review.resolved);

  return [
    formatSectionDigest(review, { theme, width }),
    '',
    formatReviewTable(review, { theme, width, openOnly }),
    '',
    `  ${theme.bold(String(s.decided))} ${theme.muted('decisions taken')} ${theme.muted(theme.glyph.bullet)} ` +
      `${s.open > 0 ? theme.warn(String(s.open)) : theme.bold('0')} ${theme.muted('left open')}`,
    formatArtifactLine(s, { width }),
  ].join('\n');
}
