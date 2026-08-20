// A tiny line-based prompt kit. Zero dependencies: every prompt is a printed
// block plus one line of input. That keeps it usable over ssh and in dumb
// terminals, and — more importantly — keeps the decision logic in pure parse
// functions that tests can drive without a TTY.
//
// It is the baseline, not the fallback. picker.js adds an arrow-key surface on
// top for real terminals, but it resolves to the shapes the parse functions
// below return, so this file stays the definition of what an answer *is* and the
// picker stays a way of giving one.
//
// The shortcut vocabulary is the same at every prompt, because the wizard is
// long enough that having to remember two sets would be worse than having none:
//
//   <empty>  accept: take the recommended option, or keep the answer already
//            given; at a section header, answer its questions
//   1 2 3    choose by number ("1,3" or "1 3" where several are allowed)
//   s        leave it open — the one way to *not* record an answer
//   a        leave everything remaining open
//   d        accept the recommended option for everything remaining
//   b        go back one question
//   ?        show the long explanation
//   q        quit without writing
//
// Enter takes the recommendation rather than skipping. It is the convention
// every other prompt in the world follows, and a wizard that quietly means the
// opposite reads as broken: the first person through it pressed enter forty
// times and reached the summary with nothing recorded. Not recording an answer
// is the deliberate act now, and it has its own key. What keeps that safe is
// that every accepted answer is echoed with the ADR it produces, and the review
// table marks which ones merely took the recommendation.
//
// Formatting lives here too, and it is styled through the shared theme rather
// than with hard-coded escapes. Colour carries no information — with it off the
// blocks read identically — but it carries the *hierarchy*: in a run this long,
// the question, its explanation, the options and the answer just given have to
// be distinguishable without being read.

import { createInterface } from 'node:readline/promises';
import process from 'node:process';

import { createKeyReader, keyboardAvailable } from './keys.js';
import { terminalWidth, theme as defaultTheme, truncate, visibleWidth, wrapText } from './style.js';

export const CONTROL = {
  ACCEPT: 'accept',
  SKIP: 'skip',
  SKIP_ALL: 'skip-all',
  DEFAULTS: 'defaults',
  BACK: 'back',
  HELP: 'help',
  QUIT: 'quit',
  SELECT: 'select',
  ENTER: 'enter',
  INVALID: 'invalid',
  // Declares a decision (or, at a section gate, everything left in the
  // section) can never apply to this repository — distinct from `SKIP`,
  // which merely leaves a question open for later. See applyDecisionResult
  // in prompts.js: unlike every other control word this one is not always
  // available — only where the caller is actually tracking dismissals.
  DISMISS: 'dismiss',
};

const CONTROL_WORDS = new Map([
  ['s', CONTROL.SKIP],
  ['skip', CONTROL.SKIP],
  ['open', CONTROL.SKIP],
  ['a', CONTROL.SKIP_ALL],
  ['all', CONTROL.SKIP_ALL],
  ['d', CONTROL.DEFAULTS],
  ['default', CONTROL.DEFAULTS],
  ['defaults', CONTROL.DEFAULTS],
  ['b', CONTROL.BACK],
  ['back', CONTROL.BACK],
  ['x', CONTROL.DISMISS],
  ['dismiss', CONTROL.DISMISS],
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
//
// Empty is ACCEPT, not SKIP: what "accept" resolves to is the caller's business
// (the recommendation, the answer already given, or a fixed default), because
// only the caller knows what it is offering.
export function parseQuestionInput(raw, { optionCount, multi = false } = {}) {
  const input = (raw ?? '').trim();
  if (input === '') return { kind: CONTROL.ACCEPT };

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
//
// They pack themselves into as many lines as the terminal needs. Hard-coding the
// line breaks meant either hints too terse to be read or a row that wrapped
// mid-key on a narrow window — and these hints are the one place where being
// read matters most: they are what tells you enter is about to answer.
export function formatKeys(
  pairs,
  { theme = defaultTheme, indent = '  ', gap = 3, width = terminalWidth() } = {},
) {
  const items = pairs
    .filter(Boolean)
    .map(([key, meaning]) => `${theme.key(`[${key}]`)} ${theme.muted(meaning)}`);

  const lines = [];
  let line = '';
  for (const item of items) {
    if (line === '') {
      line = item;
    } else if (visibleWidth(indent) + visibleWidth(line) + gap + visibleWidth(item) <= width) {
      line += ' '.repeat(gap) + item;
    } else {
      lines.push(indent + line);
      line = item;
    }
  }
  if (line !== '') lines.push(indent + line);

  return lines.join('\n');
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
        ['s', 'leave the section open'],
        ['x', 'the section does not apply here'],
        ['?', 'list them'],
        ['d', 'take every recommendation from here'],
        ['a', 'leave everything remaining open'],
        ['q', 'quit'],
      ],
      { theme, indent: '   ', width },
    ),
  ].join('\n');
}

// The question without its options: counter, question, and the help line that
// carries the ADR number.
//
// Split out because the option block has two renderers now — this static one and
// the arrow-key picker — and only the options differ between them. The head is
// printed once either way, which is also what keeps the picker's redraw cheap:
// it repaints the options and never the question.
export function formatQuestionHead({
  number,
  total,
  decision,
  theme = defaultTheme,
  width = terminalWidth(),
}) {
  const counter = `${theme.accent(String(number))}${theme.muted(`/${total}`)}`;
  const tag = `${theme.tag(`ADR-${decision.adr}`)} ${theme.muted(theme.glyph.bullet)}`;

  // The ADR number sits on the first line of the help text, so the "why this
  // matters" line and the document it will produce read as one thing. The tag
  // occupies columns the help text cannot have, so it is wrapped against a
  // hanging indent that lines the continuation up under the first word — wrap it
  // against the full width and the first line runs off the terminal.
  const hang = 6 + visibleWidth(`ADR-${decision.adr} ${theme.glyph.bullet} `);
  const help = wrapText(decision.help, width, ' '.repeat(hang));

  return [
    '',
    `${counter}  ${theme.heading(decision.question)}`,
    ...help.map((line, i) =>
      i === 0 ? `      ${tag} ${theme.muted(line.trim())}` : theme.muted(line),
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
  return [
    formatQuestionHead({ number, total, decision, theme, width }),
    '',
    formatOptions(decision.options, { theme, width, current }),
    '',
  ].join('\n');
}

// The line printed after an answer is taken. Cheap, and it turns the transcript
// above the cursor into a readable log of the run instead of a wall of prompts.
// `note` is what makes `enter` honest: an answer that came from the
// recommendation says so on the line that records it.
export function formatChoiceEcho(
  decision,
  option,
  { theme = defaultTheme, note = null, width = terminalWidth() } = {},
) {
  const bullet = theme.muted(theme.glyph.bullet);
  const tail = `${bullet} ${theme.muted(`ADR-${decision.adr}`)}${note ? ` ${bullet} ${theme.muted(note)}` : ''}`;
  // The ADR number is the part worth keeping on a narrow terminal: it is how you
  // find the document this line just promised.
  const room = width - visibleWidth(tail) - 6;
  const label = truncate(option.label, Math.max(12, room), theme.glyph.ellipsis);
  return `  ${theme.good(theme.glyph.check)} ${theme.good(label)} ${tail}`;
}

export function formatSkipEcho(text, { theme = defaultTheme } = {}) {
  return `  ${theme.muted(theme.glyph.bullet)} ${theme.muted(text)}`;
}

export function formatBanner({ version, theme = defaultTheme, width = terminalWidth() } = {}) {
  const title = theme.brand('specframe') + (version ? ` ${theme.muted(`v${version}`)}` : '');
  const tagline = 'decision-driven scaffolding for this repository';
  const oneLine = `${title}  ${theme.muted(theme.glyph.bullet)} ${theme.muted(tagline)}`;

  return [
    '',
    visibleWidth(oneLine) <= width ? oneLine : `${title}\n${theme.muted(tagline)}`,
    theme.rule(width),
  ].join('\n');
}

export function formatError(message, { theme = defaultTheme } = {}) {
  return `\n  ${theme.bad(message)}\n`;
}

// --- io --------------------------------------------------------------------

// The wizard talks to this shape only, so tests can drive it with a scripted
// list of answers instead of a terminal.
//
// The readline interface is built per question and closed straight after, rather
// than held open for the run. That is deliberate: readline and the picker both
// want stdin's keypress events and raw mode, and two owners produce the classic
// double-echo — every arrow key printed as `^[[A` into a line buffer nobody
// reads. One owner at a time, handed over at each prompt, and neither has to
// know the other exists.
export function createReadlineIo({
  input = process.stdin,
  output = process.stdout,
  env = process.env,
} = {}) {
  return {
    question: async (prompt) => {
      const rl = createInterface({ input, output });
      try {
        return await rl.question(prompt);
      } finally {
        rl.close();
      }
    },
    log: (message = '') => output.write(`${message}\n`),
    close: () => {},
    interactive: Boolean(input.isTTY),

    // Whether prompts may use the arrow-key picker, and how to open the keyboard
    // when they do. False everywhere it cannot work, which is where the typed
    // prompts take over unchanged.
    keyboard: keyboardAvailable({ input, output, env }),
    openKeys: () => createKeyReader({ input, output }),
    write: (text) => output.write(text),
    columns: () => output.columns || 80,
    rows: () => output.rows || 24,
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
    // No keyboard: a scripted run answers in lines, which is what keeps the
    // typed path the one every test exercises.
    keyboard: false,
    output: written,
    remaining: () => queue.length,
  };
}
