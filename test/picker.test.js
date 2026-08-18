import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createScriptedKeyReader, keyboardAvailable, normalizeKey } from '../src/keys.js';
import { acceptedIndex, applyKey, formatPickerFrame, runPicker, windowRange } from '../src/picker.js';
import { plainTheme, stripAnsi, visibleWidth } from '../src/style.js';
import { CONTROL } from '../src/tui.js';

const OPTIONS = [
  { value: 'monolith', label: 'Monolith', hint: 'One deployable.' },
  { value: 'modular', label: 'Modular monolith', recommended: true, hint: 'One deployable, enforced seams.' },
  { value: 'services', label: 'Service-based' },
  { value: 'micro', label: 'Microservices' },
];

const state = (over = {}) => ({
  options: OPTIONS,
  active: 1,
  selected: new Set(),
  multi: false,
  initial: 1,
  ...over,
});

const press = (name, current) => applyKey({ ...normalizeKey(null, { name }), char: name.length === 1 ? name : '' }, current);

// Collects what the picker writes, so a test can assert on the block it drew
// without a terminal being involved anywhere.
function capture() {
  const chunks = [];
  return { write: (text) => chunks.push(text), text: () => chunks.join('') };
}

const drive = (keys, options = {}) =>
  runPicker({
    options: OPTIONS,
    reader: createScriptedKeyReader(keys),
    write: capture().write,
    theme: plainTheme,
    width: 80,
    rows: 24,
    ...options,
  });

// --- where the cursor starts ------------------------------------------------

test('the cursor starts on the answer already given', () => {
  assert.equal(acceptedIndex(OPTIONS, { current: 'services' }), 2);
});

test('with no answer yet, the cursor starts on the recommendation', () => {
  assert.equal(acceptedIndex(OPTIONS), 1);
});

test('with nothing to accept, the cursor starts nowhere rather than on option one', () => {
  // Parking on the first option would promise that enter takes it, and enter
  // here leaves the decision open.
  assert.equal(acceptedIndex([{ value: 'a', label: 'One' }, { value: 'b', label: 'Two' }]), -1);
});

// --- what enter means -------------------------------------------------------

test('enter on an untouched cursor accepts, exactly as an empty line does', async () => {
  const result = await drive(['return']);
  assert.deepEqual(result, { kind: CONTROL.ACCEPT });
});

test('enter after moving takes the highlighted option', async () => {
  const result = await drive(['down', 'down', 'return']);
  assert.deepEqual(result, { kind: CONTROL.SELECT, values: [4] });
});

test('moving away and back again is still an accept, not a re-selection', async () => {
  // The distinction matters downstream: an accepted answer is echoed as having
  // taken the recommendation, and navigating past it does not change that.
  const result = await drive(['down', 'up', 'return']);
  assert.deepEqual(result, { kind: CONTROL.ACCEPT });
});

test('the cursor wraps at both ends', () => {
  assert.equal(press('up', state({ active: 0 })).state.active, OPTIONS.length - 1);
  assert.equal(press('down', state({ active: OPTIONS.length - 1 })).state.active, 0);
});

test('home and end reach the ends of a long list', () => {
  assert.equal(press('home', state()).state.active, 0);
  assert.equal(press('end', state()).state.active, OPTIONS.length - 1);
});

// --- keys that keep their typed meaning -------------------------------------

test('a digit still names an option, and single-select resolves on it', async () => {
  const result = await drive(['3']);
  assert.deepEqual(result, { kind: CONTROL.SELECT, values: [3] });
});

test('a digit past the end of the list is ignored, not clamped', async () => {
  const result = await drive(['9', 'return']);
  assert.deepEqual(result, { kind: CONTROL.ACCEPT });
});

test('the control letters resolve on one key, with no enter', async () => {
  for (const [key, kind] of [
    ['s', CONTROL.SKIP],
    ['a', CONTROL.SKIP_ALL],
    ['d', CONTROL.DEFAULTS],
    ['b', CONTROL.BACK],
    ['q', CONTROL.QUIT],
    ['?', CONTROL.HELP],
  ]) {
    assert.deepEqual(await drive([key]), { kind }, `key ${key}`);
  }
});

// --- multi-select -----------------------------------------------------------

test('space marks and unmarks, and enter takes what is marked', async () => {
  const result = await drive(['space', 'down', 'space', 'return'], { multi: true });
  assert.deepEqual(result, { kind: CONTROL.SELECT, values: [2, 3] });
});

test('unmarking everything falls back to accept, so enter still means none', async () => {
  const result = await drive(['down', 'space', 'space', 'return'], { multi: true });
  assert.deepEqual(result, { kind: CONTROL.ACCEPT });
});

test('a digit toggles instead of resolving when several answers are allowed', () => {
  const step = applyKey({ name: '1', char: '1' }, state({ multi: true }));
  assert.equal(step.result, undefined);
  assert.deepEqual([...step.state.selected], [0]);
});

test('space does nothing where only one answer is allowed', () => {
  assert.deepEqual(press('space', state()).state.selected, new Set());
});

// --- the drawn block --------------------------------------------------------

test('the block marks the cursor, the recommendation and the current answer', () => {
  const frame = formatPickerFrame({
    options: OPTIONS,
    active: 2,
    current: 'monolith',
    theme: plainTheme,
    width: 80,
  }).map(stripAnsi);

  assert.match(frame[0], /1\) Monolith {2}current/);
  assert.match(frame[1], /2\) Modular monolith {2}\* recommended/);
  assert.match(frame[2], /^ {2}> 3\) Service-based/);
  // The pointer column is held open on every row, so the labels stay in line.
  assert.match(frame[0], /^ {4}1\) Monolith/);
});

test('only the option under the cursor explains itself', () => {
  const frame = formatPickerFrame({ options: OPTIONS, active: 0, theme: plainTheme, width: 80 }).map(
    stripAnsi,
  );
  const text = frame.join('\n');
  assert.match(text, /One deployable\./);
  assert.doesNotMatch(text, /enforced seams/);
});

test('no drawn line can wrap, because the redraw counts lines to walk back up', () => {
  const wide = [{ value: 'a', label: 'x'.repeat(200), hint: 'y '.repeat(200), recommended: true }];
  const frame = formatPickerFrame({
    options: wide,
    active: 0,
    theme: plainTheme,
    width: 40,
    keys: [['enter', 'z'.repeat(120)]],
  });
  for (const line of frame) assert.ok(visibleWidth(line) <= 40, line);
});

test('a block too tall for the window sheds its hint before it hides an option', () => {
  const frame = formatPickerFrame({
    options: OPTIONS,
    active: 0,
    theme: plainTheme,
    width: 80,
    maxRows: 4,
  }).map(stripAnsi);
  assert.equal(frame.length, 4);
  assert.doesNotMatch(frame.join('\n'), /One deployable/);
  assert.match(frame.join('\n'), /Microservices/);
});

test('options that will not fit are elided out loud, never silently', () => {
  const frame = formatPickerFrame({
    options: OPTIONS,
    active: 3,
    theme: plainTheme,
    width: 80,
    maxRows: 3,
  }).map(stripAnsi);
  assert.equal(frame.length, 3);
  assert.match(frame[0], /1 more above/);
});

test('the window follows the cursor', () => {
  assert.deepEqual(windowRange(10, 0, 4), { start: 0, end: 4 });
  assert.deepEqual(windowRange(10, 9, 4), { start: 6, end: 10 });
  assert.deepEqual(windowRange(4, 2, 10), { start: 0, end: 4 });
});

test('the enter hint changes the moment the cursor makes it mean something else', async () => {
  const out = capture();
  await runPicker({
    options: OPTIONS,
    reader: createScriptedKeyReader(['down', 'return']),
    write: out.write,
    theme: plainTheme,
    width: 80,
    keys: [['enter', 'keep Modular monolith']],
    enterHintMoved: 'take the highlighted option',
  });
  const drawn = stripAnsi(out.text());
  assert.match(drawn, /keep Modular monolith/);
  assert.match(drawn, /take the highlighted option/);
});

test('the block is erased on the way out, leaving the caller the last word', async () => {
  const out = capture();
  await runPicker({
    options: OPTIONS,
    reader: createScriptedKeyReader(['return']),
    write: out.write,
    theme: plainTheme,
    width: 80,
  });
  assert.ok(out.text().endsWith('[0J'));
});

// --- capability detection ---------------------------------------------------

test('the arrow-key path is refused wherever it cannot work', () => {
  const tty = { isTTY: true, setRawMode() {} };
  assert.equal(keyboardAvailable({ input: tty, output: tty, env: {} }), true);
  assert.equal(keyboardAvailable({ input: { isTTY: false }, output: tty, env: {} }), false);
  assert.equal(keyboardAvailable({ input: tty, output: { isTTY: false }, env: {} }), false);
  assert.equal(keyboardAvailable({ input: tty, output: tty, env: { TERM: 'dumb' } }), false);
  assert.equal(keyboardAvailable({ input: tty, output: tty, env: { SPECFRAME_NO_KEYS: '1' } }), false);
});

test('a keypress is flattened to one shape, including the keys readline leaves unnamed', () => {
  assert.equal(normalizeKey('?', {}).name, '?');
  assert.equal(normalizeKey('[A', { name: 'up' }).name, 'up');
  assert.equal(normalizeKey('c', { ctrl: true, name: 'c' }).char, '');
});
