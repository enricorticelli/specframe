// A tiny line-based prompt kit. Zero dependencies, no raw mode, no cursor
// control: every prompt is a printed block plus one line of input. That keeps it
// usable over ssh and in dumb terminals, and — more importantly — keeps the
// decision logic in pure parse functions that tests can drive without a TTY.
//
// The shortcut vocabulary is the same at every prompt, because the wizard is
// long enough that having to remember two sets would be worse than having none:
//
//   <empty>  take the default (skip a question, enter a group)
//   1 2 3    choose by number ("1,3" or "1 3" where several are allowed)
//   s        skip
//   a        skip everything remaining
//   d        accept the recommended option for everything remaining
//   b        go back one question
//   ?        show the long explanation
//   q        quit without writing

import { createInterface } from 'node:readline/promises';
import process from 'node:process';

export const CONTROL = {
  SKIP: 'skip',
  SKIP_ALL: 'skip-all',
  DEFAULTS: 'defaults',
  BACK: 'back',
  HELP: 'help',
  QUIT: 'quit',
  SELECT: 'select',
  ENTER: 'enter',
  INVALID: 'invalid',
};

const CONTROL_WORDS = new Map([
  ['s', CONTROL.SKIP],
  ['skip', CONTROL.SKIP],
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

// Free-text answer with a default, used for the project name.
export function parseTextInput(raw, fallback) {
  const input = (raw ?? '').trim();
  return input === '' ? fallback : input;
}

// --- formatting ------------------------------------------------------------

// Numbered option list. The recommendation is marked rather than pre-selected:
// pressing enter skips, so a default is never applied by accident.
export function formatOptions(options) {
  const width = String(options.length).length;
  return options
    .map((option, i) => {
      const n = String(i + 1).padStart(width, ' ');
      const star = option.recommended ? '  ★ recommended' : '';
      const hint = option.hint ? `\n     ${option.hint}` : '';
      return `  ${n}) ${option.label}${star}${hint}`;
    })
    .join('\n');
}

export function formatGroupHeader({ index, total, group, questionCount }) {
  const noun = questionCount === 1 ? 'question' : 'questions';
  return [
    '',
    `── ${index}/${total} · ${group.title} · ${questionCount} ${noun} ${'─'.repeat(Math.max(0, 44 - group.title.length))}`,
    `   ${group.blurb}`,
    '',
    '   [enter] answer them   [s] skip this section',
    '   [d] recommend everything remaining   [a] skip everything remaining',
    '   [?] list the questions   [q] quit',
  ].join('\n');
}

export function formatQuestion({ number, total, decision }) {
  return [
    '',
    `${number}/${total}  ${decision.question}`,
    `        ADR-${decision.adr} · ${decision.help}`,
    '',
    formatOptions(decision.options),
    '',
  ].join('\n');
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
