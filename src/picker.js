// The arrow-key option list.
//
// This is a second way to answer the same prompts, not a second prompt system.
// It resolves to exactly the shapes `parseQuestionInput` returns, so everything
// downstream — the answers map, the echo lines, the review table — cannot tell
// which one produced an answer. That is the whole design constraint: two input
// surfaces, one meaning, and the line-based one stays the baseline for ssh,
// dumb terminals, pipes and tests.
//
// Two decisions carry most of the behaviour:
//
// `enter` still means accept, not "take the highlighted row". The cursor starts
// *on* the accepted option — the answer already given, or the recommendation —
// so the usual reading of enter and this CLI's older one agree while the cursor
// has not been moved. Move it and enter takes what you moved to, and the hint
// line says so as it changes. When there is nothing to accept, the cursor starts
// nowhere rather than parking on option one and implying a default that pressing
// enter would not actually take.
//
// The hint belongs to the cursor, not to the list. Printing every option's hint
// makes a five-option decision a screenful and buries the labels; printing the
// active one under the list keeps the geometry fixed, which is also what makes
// the redraw arithmetic honest.
//
// Redraw is in place and additive: the block is erased on resolve and the
// caller's echo line takes its place, so a forty-question run leaves a readable
// transcript of questions and answers instead of forty option lists.

import process from 'node:process';

import { terminalWidth, theme as defaultTheme, truncate, visibleWidth, wrapText } from './style.js';
import { CONTROL } from './tui.js';

const CURSOR_UP = (n) => (n > 0 ? `\u001b[${n}A` : '');
const CLEAR_DOWN = '\u001b[0J';

// Single keys, no enter. Same vocabulary as the typed prompts — the point of the
// picker is that it costs one keystroke instead of two, not that it invents a
// second set of shortcuts to remember.
const CONTROL_KEYS = new Map([
  ['s', CONTROL.SKIP],
  ['a', CONTROL.SKIP_ALL],
  ['d', CONTROL.DEFAULTS],
  ['b', CONTROL.BACK],
  ['x', CONTROL.DISMISS],
  ['?', CONTROL.HELP],
  ['h', CONTROL.HELP],
  ['q', CONTROL.QUIT],
]);

// Where the cursor starts: the answer already on record, else the recommended
// option, else nowhere. Exported because askChoice needs the same answer to
// decide what its `enter` hint should say.
export function acceptedIndex(options, { current = undefined } = {}) {
  if (current !== undefined) {
    const i = options.findIndex((option) => option.value === current);
    if (i >= 0) return i;
  }
  const recommended = options.findIndex((option) => option.recommended);
  return recommended >= 0 ? recommended : -1;
}

/**
 * Which slice of a long list to show, and what to say about the rest.
 *
 * Only bites on a short terminal — nothing in the catalog has more than seven
 * options — but a wizard that silently hid options it could not fit would be
 * worse than one that scrolls, so the elision is always counted out loud.
 */
export function windowRange(count, active, capacity) {
  if (capacity >= count || capacity <= 0) return { start: 0, end: count };
  const half = Math.floor(capacity / 2);
  const start = Math.max(0, Math.min(count - capacity, Math.max(0, active) - half));
  return { start, end: start + capacity };
}

// One row per option: pointer, number, label, and the markers that say which one
// is recommended and which one is already the answer.
function optionRow(option, index, { active, selected, multi, theme, current, numberWidth }) {
  const isActive = index === active;
  const isCurrent = current !== undefined && option.value === current;

  const pointer = isActive ? theme.accent(theme.glyph.prompt) : ' ';
  const box = multi
    ? `${selected.has(index) ? theme.good(theme.glyph.check) : theme.muted(theme.glyph.bullet)} `
    : '';
  const number = theme.muted(`${String(index + 1).padStart(numberWidth, ' ')})`);

  let label = option.label;
  if (isActive) label = theme.bold(theme.accent(label));
  else if (option.recommended) label = theme.good(label);

  const marks = [
    option.recommended ? theme.good(`${theme.glyph.star} recommended`) : '',
    isCurrent ? theme.accent('current') : '',
  ].filter(Boolean);

  return `  ${pointer} ${number} ${box}${label}${marks.length ? `  ${marks.join('  ')}` : ''}`;
}

/**
 * Build the frame as an array of lines.
 *
 * Pure, and the reason the picker is testable: a test asserts on these lines
 * without a terminal anywhere in sight. Every line is truncated to `width`, so
 * `lines.length` is the true height of the block — if a line soft-wrapped, the
 * cursor-up count on the next redraw would be short and the picker would eat
 * whatever was printed above it.
 */
export function formatPickerFrame({
  options,
  active = -1,
  selected = new Set(),
  multi = false,
  current = undefined,
  keys = [],
  theme = defaultTheme,
  width = terminalWidth(),
  maxRows = 24,
}) {
  const numberWidth = String(options.length).length;
  const keyLines = keys.length > 0 ? formatPickerKeys(keys, { theme, width }) : [];

  const activeOption = active >= 0 ? options[active] : null;
  const hintLines =
    activeOption?.hint
      ? ['', ...wrapText(activeOption.hint, width, ' '.repeat(numberWidth + 6)).map((line) => theme.muted(line))]
      : [];

  // Shed the optional blocks before shedding options: the hint is a nicety, the
  // keys are recoverable with `?`, but an option you cannot see is an answer you
  // cannot give.
  const fixed = () => keyLines.length + (keyLines.length > 0 ? 1 : 0);
  let body = [...hintLines];
  if (options.length + body.length + fixed() > maxRows) body = [];

  const capacity = maxRows - body.length - fixed();
  const { start, end } = windowRange(options.length, active, capacity);

  const rows = options
    .slice(start, end)
    .map((option, i) =>
      optionRow(option, start + i, { active, selected, multi, theme, current, numberWidth }),
    );

  if (start > 0) rows[0] = `  ${theme.muted(`${theme.glyph.arrow} ${start} more above`)}`;
  if (end < options.length) {
    rows[rows.length - 1] = `  ${theme.muted(`${theme.glyph.arrow} ${options.length - end} more below`)}`;
  }

  return [...rows, ...body, ...(keyLines.length > 0 ? ['', ...keyLines] : [])].map((line) =>
    truncate(line, width),
  );
}

// Same shape as tui's formatKeys, but returning lines rather than a string —
// the frame has to be able to count them.
function formatPickerKeys(pairs, { theme, width, indent = '  ', gap = 3 }) {
  const items = pairs
    .filter(Boolean)
    .map(([key, meaning]) => `${theme.key(`[${key}]`)} ${theme.muted(meaning)}`);

  const lines = [];
  let line = '';
  for (const item of items) {
    if (line === '') line = item;
    else if (visibleWidth(indent) + visibleWidth(line) + gap + visibleWidth(item) <= width) {
      line += ' '.repeat(gap) + item;
    } else {
      lines.push(indent + line);
      line = item;
    }
  }
  if (line !== '') lines.push(indent + line);
  return lines;
}

/**
 * Fold one keypress into the picker's state.
 *
 * Pure, and separate from the loop for the same reason the parse functions in
 * tui.js are separate from the prompts: the rules about what enter means are
 * the part worth testing, and they should not need a terminal to exercise.
 *
 * Returns `{ state }` to keep going or `{ result }` to resolve.
 */
export function applyKey(key, state) {
  const { options, active, selected, multi, initial } = state;
  const last = options.length - 1;
  const move = (next) => ({ state: { ...state, active: next } });

  switch (key.name) {
    case 'up':
    case 'k':
      return move(active <= 0 ? last : active - 1);
    case 'down':
    case 'j':
      return move(active >= last ? 0 : active + 1);
    case 'home':
      return move(0);
    case 'end':
      return move(last);
    case 'return':
    case 'enter': {
      if (multi) {
        return selected.size > 0
          ? { result: { kind: CONTROL.SELECT, values: [...selected].sort((a, b) => a - b).map((i) => i + 1) } }
          : { result: { kind: CONTROL.ACCEPT } };
      }
      // Untouched cursor means the caller's `enter` promise — accept — is still
      // the one on screen. Moved cursor means take what it is on.
      if (active < 0 || active === initial) return { result: { kind: CONTROL.ACCEPT } };
      return { result: { kind: CONTROL.SELECT, values: [active + 1] } };
    }
    case 'space': {
      if (!multi || active < 0) return { state };
      const next = new Set(selected);
      if (next.has(active)) next.delete(active);
      else next.add(active);
      return { state: { ...state, selected: next } };
    }
    default:
      break;
  }

  // A digit is the same shortcut it was at the typed prompt: it names an option
  // outright. Single-select takes it and resolves — waiting for enter after an
  // unambiguous choice is the sort of ceremony this is meant to remove.
  if (/^[1-9]$/.test(key.char) && Number(key.char) <= options.length) {
    const index = Number(key.char) - 1;
    if (!multi) return { result: { kind: CONTROL.SELECT, values: [index + 1] } };
    const next = new Set(selected);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    return { state: { ...state, active: index, selected: next } };
  }

  const control = CONTROL_KEYS.get(key.char.toLowerCase());
  if (control) return { result: { kind: control } };

  return { state };
}

/**
 * Run the picker until it resolves.
 *
 * `reader` is the only way in and `write` the only way out, both injected, so
 * the whole loop runs under test against a scripted key list and a string
 * buffer. `enterHintMoved` is what the enter key's hint becomes once the cursor
 * has left the accepted option — the hint has to change, because the meaning did.
 */
export async function runPicker({
  options,
  multi = false,
  current = undefined,
  keys = [],
  enterHintMoved = 'take the highlighted option',
  reader,
  write = (text) => process.stdout.write(text),
  theme = defaultTheme,
  width = terminalWidth(),
  rows = process.stdout.rows || 24,
}) {
  const initial = acceptedIndex(options, { current });
  let state = { options, active: initial, selected: new Set(), multi, initial };
  let height = 0;

  // Two lines held back: one for the cursor's own row, one so a frame drawn at
  // the very bottom of the window cannot scroll itself out of reach.
  const maxRows = Math.max(options.length, rows - 2);

  const draw = () => {
    const moved = state.active !== initial && state.active >= 0;
    const frame = formatPickerFrame({
      ...state,
      current,
      width,
      theme,
      maxRows,
      keys: keys.map(([key, meaning]) =>
        key === 'enter' && (moved || (multi && state.selected.size > 0))
          ? [key, enterHintMoved]
          : [key, meaning],
      ),
    });
    write(`${CURSOR_UP(height)}${height > 0 ? CLEAR_DOWN : ''}${frame.join('\n')}\n`);
    height = frame.length;
  };

  for (;;) {
    draw();
    const key = await reader.read();
    const step = applyKey(key, state);
    if (step.result) {
      // Erase the block: the caller prints the echo line, and question-plus-answer
      // is a better transcript than question-plus-options-plus-answer.
      write(`${CURSOR_UP(height)}${CLEAR_DOWN}`);
      return step.result;
    }
    state = step.state;
  }
}
