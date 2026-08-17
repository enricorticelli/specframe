import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  colorSupported,
  createStyle,
  pad,
  plainTheme,
  stripAnsi,
  terminalWidth,
  truncate,
  unicodeSupported,
  visibleWidth,
  wrapText,
} from '../src/style.js';

const colored = createStyle({ color: true, unicode: true });

// --- capability detection ---------------------------------------------------

test('colour follows NO_COLOR, FORCE_COLOR, TERM and the TTY, in that order', () => {
  const tty = { isTTY: true };
  const pipe = { isTTY: false };

  assert.equal(colorSupported({ env: {}, stream: tty }), true, 'a terminal gets colour');
  assert.equal(colorSupported({ env: {}, stream: pipe }), false, 'a pipe does not');
  assert.equal(colorSupported({ env: { NO_COLOR: '1' }, stream: tty }), false);
  assert.equal(colorSupported({ env: { NO_COLOR: '' }, stream: tty }), true, 'empty means unset');
  assert.equal(colorSupported({ env: { FORCE_COLOR: '1' }, stream: pipe }), true);
  assert.equal(colorSupported({ env: { FORCE_COLOR: '0' }, stream: tty }), false);
  assert.equal(
    colorSupported({ env: { NO_COLOR: '1', FORCE_COLOR: '1' }, stream: tty }),
    false,
    'NO_COLOR wins',
  );
  assert.equal(colorSupported({ env: { TERM: 'dumb' }, stream: tty }), false);
});

test('box drawing is dropped on a dumb terminal or on request', () => {
  assert.equal(unicodeSupported({ env: {} }), true);
  assert.equal(unicodeSupported({ env: { TERM: 'dumb' } }), false);
  assert.equal(unicodeSupported({ env: { SPECFRAME_ASCII: '1' } }), false);
});

test('the terminal width is clamped to a readable range', () => {
  assert.equal(terminalWidth({ stream: { columns: 200 } }), 110);
  assert.equal(terminalWidth({ stream: { columns: 20 } }), 60);
  assert.equal(terminalWidth({ stream: {} }), 80, 'no columns reported');
});

// --- with colour off, nothing changes ---------------------------------------

test('a plain theme is the identity, so every screen reads the same', () => {
  assert.equal(plainTheme.brand('specframe'), 'specframe');
  assert.equal(plainTheme.good('ok'), 'ok');
  assert.equal(plainTheme.glyph.star, '*', 'and falls back to ASCII');
});

test('styled and plain text occupy the same number of columns', () => {
  const styled = colored.brand('specframe');
  assert.notEqual(styled, 'specframe', 'it really is styled');
  assert.equal(stripAnsi(styled), 'specframe');
  assert.equal(visibleWidth(styled), visibleWidth('specframe'));
});

test('a nested style does not cancel the one around it', () => {
  // Closing codes are specific (22/39), not a blanket reset, so the outer style
  // survives an inner fragment.
  assert.ok(!colored.muted(colored.good('x')).includes('[0m'));
});

// --- measuring and fitting --------------------------------------------------

test('padding aligns by visible width, ignoring escape sequences', () => {
  assert.equal(visibleWidth(pad(colored.good('ok'), 6)), 6);
  assert.equal(pad('ok', 6), 'ok    ');
  assert.equal(pad('ok', 6, 'right'), '    ok');
  assert.equal(pad('too long', 3), 'too long', 'padding never truncates');
});

test('truncation keeps the styling and closes it', () => {
  assert.equal(truncate('hello world', 8), 'hello w…');
  assert.equal(truncate('short', 8), 'short', 'untouched when it fits');
  assert.equal(visibleWidth(truncate(colored.good('hello world'), 8)), 8);
  assert.match(truncate(colored.good('hello world'), 8), /\[0m$/, 'styling is closed');
});

test('wrapping keeps words whole and indents every line', () => {
  const lines = wrapText('one two three four five six seven', 20, '  ');
  assert.ok(lines.length > 1);
  assert.ok(lines.every((line) => visibleWidth(line) <= 20));
  assert.ok(lines.every((line) => line.startsWith('  ')));
  assert.equal(lines.join(' ').trim().replace(/\s+/g, ' '), 'one two three four five six seven');
});

test('a paragraph break survives wrapping', () => {
  assert.deepEqual(wrapText('a\n\nb', 20), ['a', '', 'b']);
});

// --- the bar ----------------------------------------------------------------

test('the progress bar is proportional, and empty for an empty section', () => {
  const half = stripAnsi(plainTheme.bar(5, 10, 10));
  assert.equal(half, '#####.....');
  assert.equal(stripAnsi(plainTheme.bar(10, 10, 4)), '####');
  assert.equal(plainTheme.bar(0, 0), '', 'nothing to show');
});
