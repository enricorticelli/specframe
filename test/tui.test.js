import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CONTROL,
  formatOptions,
  formatQuestion,
  parseConfirmInput,
  parseGroupInput,
  parseQuestionInput,
  parseReviewInput,
  parseTextInput,
} from '../src/tui.js';
import { plainTheme, stripAnsi } from '../src/style.js';

const q = (raw, opts = { optionCount: 4 }) => parseQuestionInput(raw, opts);

// --- question prompts -------------------------------------------------------

test('empty input skips, so enter never applies a default by accident', () => {
  assert.equal(q('').kind, CONTROL.SKIP);
  assert.equal(q('   ').kind, CONTROL.SKIP);
  assert.equal(q(undefined).kind, CONTROL.SKIP);
});

test('a number selects that option', () => {
  assert.deepEqual(q('3'), { kind: CONTROL.SELECT, values: [3] });
  assert.deepEqual(q(' 1 '), { kind: CONTROL.SELECT, values: [1] });
});

test('out-of-range and non-numeric input is rejected rather than guessed', () => {
  assert.equal(q('0').kind, CONTROL.INVALID);
  assert.equal(q('5').kind, CONTROL.INVALID);
  assert.equal(q('1x').kind, CONTROL.INVALID);
  assert.equal(q('-1').kind, CONTROL.INVALID);
});

test('several numbers are only accepted where several answers are allowed', () => {
  assert.equal(q('1,3').kind, CONTROL.INVALID, 'single-answer question');
  assert.deepEqual(q('1,3', { optionCount: 6, multi: true }), {
    kind: CONTROL.SELECT,
    values: [1, 3],
  });
  assert.deepEqual(q('2 4', { optionCount: 6, multi: true }).values, [2, 4]);
  assert.deepEqual(q('2,2', { optionCount: 6, multi: true }).values, [2], 'deduplicated');
});

test('control words work in short and long form, case-insensitively', () => {
  for (const [input, kind] of [
    ['s', CONTROL.SKIP],
    ['skip', CONTROL.SKIP],
    ['S', CONTROL.SKIP],
    ['x', CONTROL.CLEAR],
    ['reopen', CONTROL.CLEAR],
    ['a', CONTROL.SKIP_ALL],
    ['all', CONTROL.SKIP_ALL],
    ['d', CONTROL.DEFAULTS],
    ['defaults', CONTROL.DEFAULTS],
    ['b', CONTROL.BACK],
    ['?', CONTROL.HELP],
    ['help', CONTROL.HELP],
    ['q', CONTROL.QUIT],
    ['quit', CONTROL.QUIT],
  ]) {
    assert.equal(q(input).kind, kind, `"${input}"`);
  }
});

// --- group gates ------------------------------------------------------------

test('empty input enters a group; s skips the whole group in one key', () => {
  assert.equal(parseGroupInput('').kind, CONTROL.ENTER);
  assert.equal(parseGroupInput('s').kind, CONTROL.SKIP);
  assert.equal(parseGroupInput('a').kind, CONTROL.SKIP_ALL);
  assert.equal(parseGroupInput('d').kind, CONTROL.DEFAULTS);
  assert.equal(parseGroupInput('q').kind, CONTROL.QUIT);
});

test('back is meaningless at a group gate and says so', () => {
  const result = parseGroupInput('b');
  assert.equal(result.kind, CONTROL.INVALID);
  assert.match(result.reason, /nothing to go back to/);
});

test('a number at a group gate is not a silent no-op', () => {
  assert.equal(parseGroupInput('2').kind, CONTROL.INVALID);
});

test('reopening is a per-decision action, so a gate rejects it', () => {
  const result = parseGroupInput('x');
  assert.equal(result.kind, CONTROL.INVALID);
  assert.match(result.reason, /one decision/);
});

// --- the review table -------------------------------------------------------

test('a row number at the review table addresses that decision', () => {
  assert.deepEqual(parseReviewInput('12', { total: 40 }), { kind: 'jump', index: 12 });
  assert.deepEqual(parseReviewInput(' 1 ', { total: 40 }), { kind: 'jump', index: 1 });
});

test('a row number outside the table is refused with its range', () => {
  const result = parseReviewInput('41', { total: 40 });
  assert.equal(result.kind, CONTROL.INVALID);
  assert.match(result.reason, /no row 41 \(1-40\)/);
  assert.equal(parseReviewInput('0', { total: 40 }).kind, CONTROL.INVALID);
});

test('the review table has one key per way out', () => {
  assert.equal(parseReviewInput('', { total: 40 }).kind, 'back');
  assert.equal(parseReviewInput('b', { total: 40 }).kind, 'back');
  assert.equal(parseReviewInput('o', { total: 40 }).kind, 'open');
  assert.equal(parseReviewInput('w', { total: 40 }).kind, 'walk');
  assert.equal(parseReviewInput('f', { total: 40 }).kind, 'filter');
  assert.equal(parseReviewInput('?', { total: 40 }).kind, CONTROL.HELP);
  assert.equal(parseReviewInput('q', { total: 40 }).kind, CONTROL.QUIT);
  assert.equal(parseReviewInput('nope', { total: 40 }).kind, CONTROL.INVALID);
});

// --- confirmation and free text --------------------------------------------

test('confirmation defaults to writing', () => {
  assert.equal(parseConfirmInput('').kind, 'write');
  assert.equal(parseConfirmInput('y').kind, 'write');
  assert.equal(parseConfirmInput('r').kind, 'review');
  assert.equal(parseConfirmInput('q').kind, CONTROL.QUIT);
  assert.equal(parseConfirmInput('n').kind, CONTROL.QUIT);
  assert.equal(parseConfirmInput('maybe').kind, CONTROL.INVALID);
});

test('free text falls back to the default', () => {
  assert.equal(parseTextInput('', 'acme'), 'acme');
  assert.equal(parseTextInput('  ', 'acme'), 'acme');
  assert.equal(parseTextInput(' my-repo ', 'acme'), 'my-repo');
});

// --- formatting -------------------------------------------------------------

test('the recommendation is marked, not pre-selected', () => {
  const rendered = formatOptions([
    { label: 'One', hint: 'first' },
    { label: 'Two', recommended: true },
  ]);
  assert.match(rendered, /1\) One/);
  assert.match(rendered, /first/);
  assert.match(rendered, /2\) Two {2}★ recommended/);
});

test('the answer already on record is marked as current', () => {
  const rendered = formatOptions(
    [
      { value: 'a', label: 'One' },
      { value: 'b', label: 'Two' },
    ],
    { theme: plainTheme, width: 80, current: 'b' },
  );
  assert.doesNotMatch(rendered.split('\n')[0], /current/);
  assert.match(rendered.split('\n')[1], /Two {2}current/);
});

test('a question shows its counter, its ADR and its options', () => {
  const decision = {
    adr: '0100',
    question: 'Which architecture style do you adopt?',
    help: 'Decides how many things you deploy.',
    options: [{ value: 'monolith', label: 'Monolith' }],
  };
  const rendered = stripAnsi(
    formatQuestion({ number: 3, total: 40, decision, theme: plainTheme, width: 80 }),
  );
  assert.match(rendered, /3\/40/);
  assert.match(rendered, /ADR-0100/);
  assert.match(rendered, /Which architecture style/);
  assert.match(rendered, /1\) Monolith/);
});
