// A tiny line-based prompt kit. Zero dependencies, no raw mode, no cursor
// control: every prompt is a printed block plus one line of input. That keeps it
// usable over ssh and in dumb terminals, and — more importantly — keeps the
// decision logic in pure parse functions that tests can drive without a TTY.
//
// The shortcut vocabulary is the same at every prompt, because the wizard is
// long enough that having to remember two sets would be worse than having none:
//
//   <empty>  no change (skip an unanswered question, keep an answered one,
//            enter a group)
//   1 2 3    choose by number ("1,3" or "1 3" where several are allowed)
//   s        skip
//   x        reopen a decision already answered
//   a        skip everything remaining
//   d        accept the recommended option for everything remaining
//   b        go back one question
//   ?        show the long explanation
//   q        quit without writing
//
// Formatting lives here too, and it is styled through the shared theme rather
// than with hard-coded escapes. Colour carries no information — with it off the
// blocks read identically — but it carries the *hierarchy*: in a run this long,
// the question, its explanation, the options and the answer just given have to
// be distinguishable without being read.

import { createInterface } from 'node:readline/promises';
import process from 'node:process';

import { terminalWidth, theme as defaultTheme, visibleWidth, wrapText } from './style.js';

export const CONTROL = {
  SKIP: 'skip',
  SKIP_ALL: 'skip-all',
  DEFAULTS: 'defaults',
  BACK: 'back',
  CLEAR: 'clear',
  HELP: 'help',
  QUIT: 'quit',
  SELECT: 'select',
  ENTER: 'enter',
  INVALID: 'invalid',
};

const CONTROL_WORDS = new Map([
  ['s', CONTROL.SKIP],
  ['skip', CONTROL.SKIP],
  ['x', CONTROL.CLEAR],
  ['clear', CONTROL.CLEAR],
  ['reopen', CONTROL.CLEAR],
  ['a', CONTROL.SKIP_ALL],
  ['all', CONTROL.SKIP_ALL],
  ['d', CONTROL.DEFAULTS],
  ['default', CONTROL.DEFAULTS],
  ['defaults', CONTROL.DEFAULTS],
  ['b', CONTROL.BACK],
  ['back', CONTROL.BACK],
  ['?', CONTROL.HELP],
  ['h', CONTROL.HELP],
  ['help', CONTROL.HELP],
  ['q', CONTROL.QUIT],
  ['quit', CONTROL.QUIT],
]);

// Parse one line typed at a question prompt.
//
// Returns { kind } for a control word, or { kind: 'select', values: number[] }
// with 1-based indices already validated against optionCount. `multi: false`
// rejects more than one index rather than silently taking the first.
export function parseQuestionInput(raw, { optionCount, multi = false } = {}) {
  const input = (raw ?? '').trim();
  if (input === '') return { kind: CONTROL.SKIP };

  const word = CONTROL_WORDS.get(input.toLowerCase());
  if (word) return { kind: word };

  const tokens = input.split(/[\s,]+/).filter(Boolean);
  const indices = [];
  for (const token of tokens) {
    if (!/^\d+$/.test(token)) return { kind: CONTROL.INVALID, reason: `not a number: ${token}` };
    const n = Number(token);
    if (n < 1 || n > optionCount) {
      return { kind: CONTROL.INVALID, reason: `out of range: ${n}` };
    }
    if (!indices.includes(n)) indices.push(n);
  }

  if (indices.length === 0) return { kind: CONTROL.INVALID, reason: 'no selection' };
  if (!multi && indices.length > 1) {
    return { kind: CONTROL.INVALID, reason: 'pick exactly one' };
  }

  return { kind: CONTROL.SELECT, values: indices };
}

// Parse one line typed at a group gate. Empty enters the group; the control
// words keep their meaning, so `a` here skips the whole remaining catalog.
export function parseGroupInput(raw) {
  const input = (raw ?? '').trim();
  if (input === '') return { kind: CONTROL.ENTER };

  const word = CONTROL_WORDS.get(input.toLowerCase());
  if (word === CONTROL.BACK) return { kind: CONTROL.INVALID, reason: 'nothing to go back to' };
  if (word === CONTROL.CLEAR) {
    return { kind: CONTROL.INVALID, reason: 'reopening applies to one decision, not a section' };
  }
  if (word) return { kind: word };

  return { kind: CONTROL.INVALID, reason: `unrecognised: ${input}` };
}

// Parse the final confirmation. Empty means "write it".
export function parseConfirmInput(raw) {
  const input = (raw ?? '').trim().toLowerCase();
  if (input === '') return { kind: 'write' };
  if (input === 'w' || input === 'write' || input === 'y' || input === 'yes') return { kind: 'write' };
  if (input === 'r' || input === 'review') return { kind: 'review' };
  if (input === 'q' || input === 'quit' || input === 'n' || input === 'no') return { kind: CONTROL.QUIT };
  return { kind: CONTROL.INVALID, reason: `unrecognised: ${input}` };
}

// Parse one line typed at the review table.
//
// A row number is the whole point: after forty questions the way to fix answer
// twelve is to type 12, not to walk the wizard again. `w` keeps the old
// behaviour available for when you do want another full pass.
export function parseReviewInput(raw, { total = 0 } = {}) {
  const input = (raw ?? '').trim().toLowerCase();
  if (input === '') return { kind: 'back' };

  if (/^\d+$/.test(input)) {
    const index = Number(input);
    if (index < 1 || index > total) {
      return { kind: CONTROL.INVALID, reason: `no row ${index} (1-${total})` };
    }
    return { kind: 'jump', index };
  }

  if (input === 'o' || input === 'open') return { kind: 'open' };
  if (input === 'w' || input === 'walk') return { kind: 'walk' };
  if (input === 'f' || input === 'filter') return { kind: 'filter' };
  if (input === '?' || input === 'h' || input === 'help') return { kind: CONTROL.HELP };
  if (input === 'q' || input === 'quit') return { kind: CONTROL.QUIT };
  if (input === 'b' || input === 'back') return { kind: 'back' };

  return { kind: CONTROL.INVALID, reason: `unrecognised: ${input}` };
}

// Free-text answer with a default, used for the project name.
export function parseTextInput(raw, fallback) {
  const input = (raw ?? '').trim();
  return input === '' ? fallback : input;
}

// --- formatting ------------------------------------------------------------

// Shortcut hints. The key is coloured and the meaning is not, so a row of them
// scans as a keyboard, and with colour off it still reads as prose.
export function formatKeys(pairs, { theme = defaultTheme, indent = '  ', gap = 3 } = {}) {
  return (
    indent +
    pairs
      .filter(Boolean)
      .map(([key, meaning]) => `${theme.key(`[${key}]`)} ${theme.muted(meaning)}`)
      .join(' '.repeat(gap))
  );
}

// Numbered option list. The recommendation is marked rather than pre-selected:
// pressing enter skips, so a default is never applied by accident. `current`
// marks the answer already on record, which is what makes a second pass over an
// answered question readable instead of a guessing game.
export function formatOptions(
  options,
  { theme = defaultTheme, width = terminalWidth(), current = undefined } = {},
) {
  const numberWidth = String(options.length).length;
  const indent = ' '.repeat(numberWidth + 5);

  return options
    .map((option, i) => {
      const n = String(i + 1).padStart(numberWidth, ' ');
      const isCurrent = current !== undefined && option.value === current;
      const star = option.recommended ? `  ${theme.good(`${theme.glyph.star} recommended`)}` : '';
      const chosen = isCurrent ? `  ${theme.accent('current')}` : '';
      const label = option.recommended ? theme.good(option.label) : theme.bold(option.label);
      const head = `  ${theme.accent(`${n})`)} ${label}${star}${chosen}`;
      if (!option.hint) return head;
      return [head, ...wrapText(option.hint, width, indent).map((line) => theme.muted(line))].join('\n');
    })
    .join('\n');
}

/**
 * Section gate.
 *
 * Shows where you are in the catalog, how much of this section is already
 * answered, and what a single key does — the three things that stop a
 * forty-question run from feeling open-ended.
 */
export function formatGroupHeader({
  index,
  total,
  group,
  questionCount,
  answered = 0,
  theme = defaultTheme,
  width = terminalWidth(),
}) {
  // questionCount is every question in this section that still applies, answered
  // or not — which is exactly what `enter` will walk through.
  const noun = questionCount === 1 ? 'question' : 'questions';
  const progress = `${theme.bar(answered, questionCount, 10)} ${theme.muted(`${answered}/${questionCount}`)}`;
  const label = `${theme.muted(`Section ${index}/${total}`)}  ${theme.brand(group.title.toUpperCase())}`;
  // 5 = the two leading rule characters and the three single spaces around them.
  const fill = Math.max(1, width - visibleWidth(label) - visibleWidth(progress) - 5);

  return [
    '',
    `${theme.muted(theme.glyph.rule.repeat(2))} ${label} ${theme.muted(theme.glyph.rule.repeat(fill))} ${progress}`,
    ...wrapText(group.blurb, width, '   ').map((line) => theme.muted(line)),
    '',
    formatKeys(
      [
        [
          'enter',
          answered > 0
            ? `walk its ${questionCount} ${noun} (${answered} answered)`
            : `answer the ${questionCount} ${noun}`,
        ],
        ['s', 'skip section'],
        ['?', 'list them'],
      ],
      { theme, indent: '   ' },
    ),
    formatKeys(
      [
        ['d', 'recommend everything remaining'],
        ['a', 'skip everything remaining'],
        ['q', 'quit'],
      ],
      { theme, indent: '   ' },
    ),
  ].join('\n');
}

export function formatQuestion({
  number,
  total,
  decision,
  current = undefined,
  theme = defaultTheme,
  width = terminalWidth(),
}) {
  const counter = `${theme.accent(String(number))}${theme.muted(`/${total}`)}`;
  const tag = `${theme.tag(`ADR-${decision.adr}`)} ${theme.muted(theme.glyph.bullet)}`;

  return [
    '',
    `${counter}  ${theme.heading(decision.question)}`,
    // The ADR number sits on the first line of the help text, so the "why this
    // matters" line and the document it will produce read as one thing.
    ...wrapText(decision.help, width, '      ').map((line, i) =>
      i === 0 ? `      ${tag} ${theme.muted(line.trim())}` : theme.muted(line),
    ),
    '',
    formatOptions(decision.options, { theme, width, current }),
    '',
  ].join('\n');
}

// The line printed after an answer is taken. Cheap, and it turns the transcript
// above the cursor into a readable log of the run instead of a wall of prompts.
export function formatChoiceEcho(decision, option, { theme = defaultTheme } = {}) {
  return `  ${theme.good(theme.glyph.check)} ${theme.good(option.label)} ${theme.muted(theme.glyph.bullet)} ${theme.muted(`ADR-${decision.adr}`)}`;
}

export function formatSkipEcho(text, { theme = defaultTheme } = {}) {
  return `  ${theme.muted(theme.glyph.bullet)} ${theme.muted(text)}`;
}

export function formatBanner({ version, theme = defaultTheme, width = terminalWidth() } = {}) {
  const title = theme.brand('specframe');
  const tail = version ? ` ${theme.muted(`v${version}`)}` : '';
  return [
    '',
    `${title}${tail}  ${theme.muted(theme.glyph.bullet)} ${theme.muted('decision-driven scaffolding for this repository')}`,
    theme.rule(width),
  ].join('\n');
}

export function formatError(message, { theme = defaultTheme } = {}) {
  return `\n  ${theme.bad(message)}\n`;
}

// --- io --------------------------------------------------------------------

// The wizard talks to this shape only, so tests can drive it with a scripted
// list of answers instead of a terminal.
export function createReadlineIo({ input = process.stdin, output = process.stdout } = {}) {
  const rl = createInterface({ input, output });
  return {
    question: (prompt) => rl.question(prompt),
    log: (message = '') => output.write(`${message}\n`),
    close: () => rl.close(),
    interactive: Boolean(input.isTTY),
  };
}

// Scripted io for tests and for non-interactive runs: every prompt consumes the
// next queued line, and an exhausted queue answers empty (i.e. take the default)
// instead of hanging.
export function createScriptedIo(lines = []) {
  const queue = [...lines];
  const written = [];
  return {
    question: async (prompt) => {
      written.push(prompt);
      return queue.length > 0 ? queue.shift() : '';
    },
    log: (message = '') => written.push(message),
    close: () => {},
    interactive: false,
    output: written,
    remaining: () => queue.length,
  };
}
