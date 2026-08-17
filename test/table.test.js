import { test } from 'node:test';
import assert from 'node:assert/strict';

import { renderTable } from '../src/table.js';
import { createStyle, plainTheme, stripAnsi, visibleWidth } from '../src/style.js';

const columns = [
  { label: '#', align: 'right', min: 2, max: 4, fixed: true },
  { label: 'Decision', min: 8 },
  { label: 'Choice', min: 6 },
];

const rows = [
  { section: 'Architecture', note: '1 of 2 answered' },
  { cells: ['1', 'Architecture style', 'Modular monolith'] },
  { cells: ['2', 'Inter-component comm', 'not decided'] },
];

const lines = (table) => table.split('\n');

test('every line of a table is exactly the same width', () => {
  for (const width of [50, 64, 80, 110]) {
    const rendered = lines(renderTable({ columns, rows, width, theme: plainTheme }));
    const widths = new Set(rendered.map(visibleWidth));
    assert.equal(widths.size, 1, `ragged at width ${width}: ${[...widths].join(', ')}`);
    assert.ok([...widths][0] <= width, `overflowed ${width}`);
  }
});

test('styling never shifts a column', () => {
  const theme = createStyle({ color: true, unicode: true });
  const styled = renderTable({
    columns,
    rows: [{ cells: [theme.accent('1'), theme.bold('Architecture style'), theme.good('Modular monolith')] }],
    width: 60,
    theme,
  });
  const plain = renderTable({
    columns,
    rows: [{ cells: ['1', 'Architecture style', 'Modular monolith'] }],
    width: 60,
    theme: createStyle({ color: false, unicode: true }),
  });
  assert.deepEqual(
    lines(styled).map(visibleWidth),
    lines(plain).map(visibleWidth),
  );
});

test('the widest flexible column gives up the space, not the narrow ones', () => {
  const narrow = stripAnsi(renderTable({ columns, rows, width: 46, theme: plainTheme }));
  assert.match(narrow, /\|\s+1\s+\|/, 'the # column kept its width');
  assert.match(narrow, /\.\.\./, 'prose was truncated instead');
});

test('a fixed column is never shrunk', () => {
  const table = renderTable({
    columns: [
      { label: 'ADR', min: 8, fixed: true },
      { label: 'Decision', min: 6 },
    ],
    rows: [{ cells: ['ADR-0100', 'Architecture style and friends'] }],
    width: 30,
    theme: plainTheme,
  });
  assert.match(stripAnsi(table), /ADR-0100/, 'shown in full');
});

test('a section row spans the table and carries its note', () => {
  const rendered = stripAnsi(renderTable({ columns, rows, width: 70, theme: plainTheme }));
  assert.match(rendered, /Architecture\s+1 of 2 answered/);
});

test('borders fall back to ASCII without unicode', () => {
  const ascii = renderTable({ columns, rows, width: 70, theme: plainTheme });
  assert.ok(!/[┌┐└┘─│├┤┬┴┼]/.test(ascii), 'no box drawing');
  const unicode = renderTable({ columns, rows, width: 70, theme: createStyle({ color: false, unicode: true }) });
  assert.match(unicode, /┌/);
});

test('an empty column set renders nothing rather than a broken frame', () => {
  assert.equal(renderTable({ columns: [], rows, width: 70, theme: plainTheme }), '');
});

test('a table with no rows is still a valid frame', () => {
  const rendered = lines(renderTable({ columns, rows: [], width: 40, theme: plainTheme }));
  assert.equal(rendered.length, 4, 'top, header, rule, bottom');
  assert.equal(new Set(rendered.map(visibleWidth)).size, 1);
});
