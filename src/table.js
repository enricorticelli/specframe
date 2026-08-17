// A minimal table renderer, dependency-free.
//
// It exists because a review of forty decisions is a table whether we draw one
// or not: without aligned columns the eye has to re-find the answer on every
// line. Three properties are worth the code:
//
//   It fits. Columns shrink to the terminal width, widest-flexible-first, and
//   cells are truncated rather than wrapped — a review table that soft-wraps
//   stops being scannable, which was the whole point.
//
//   It survives no-colour and no-unicode. Borders fall back to ASCII, and every
//   width is measured with visibleWidth, so styling never shifts a column.
//
//   It groups. A `section` row spans the full width, so "Architecture 4/6" can
//   sit inside the table instead of forcing one table per group.
//
// Cells may carry styling; column widths are computed from visible width, so
// styled and plain output align identically. Nothing here uses an
// ambiguous-width glyph (★, ✓): those render two columns wide in some
// terminals, which would tear the grid apart.

import { pad, truncate, visibleWidth, plainTheme } from './style.js';

const BORDERS = {
  unicode: {
    topLeft: '┌', topRight: '┐', bottomLeft: '└', bottomRight: '┘',
    horizontal: '─', vertical: '│',
    leftTee: '├', rightTee: '┤', topTee: '┬', bottomTee: '┴', cross: '┼',
  },
  ascii: {
    topLeft: '+', topRight: '+', bottomLeft: '+', bottomRight: '+',
    horizontal: '-', vertical: '|',
    leftTee: '+', rightTee: '+', topTee: '+', bottomTee: '+', cross: '+',
  },
};

// Per column: 1 separator + 2 padding spaces, plus the closing border.
const FRAME_PER_COLUMN = 3;
const FRAME_CLOSING = 1;

function naturalWidths(columns, rows) {
  return columns.map((column, index) => {
    let width = visibleWidth(column.label ?? '');
    for (const row of rows) {
      if (!Array.isArray(row?.cells)) continue;
      width = Math.max(width, visibleWidth(row.cells[index] ?? ''));
    }
    const min = column.min ?? 3;
    const max = column.max ?? Infinity;
    return Math.max(min, Math.min(max, width));
  });
}

// Shrink the widest shrinkable column one step at a time. Taking a column at a
// time rather than scaling everything proportionally keeps the narrow columns
// (`#`, `ADR`) intact and spends the whole loss on prose, which is where an
// ellipsis costs the reader least.
function fitWidths(columns, widths, available) {
  const result = [...widths];
  const mins = columns.map((column) => column.min ?? 3);
  const fixed = columns.map((column) => column.fixed === true);

  const total = () => result.reduce((sum, width) => sum + width, 0);

  while (total() > available) {
    let target = -1;
    for (let i = 0; i < result.length; i += 1) {
      if (fixed[i] || result[i] <= mins[i]) continue;
      if (target === -1 || result[i] > result[target]) target = i;
    }
    if (target === -1) break; // nothing left to give: the table overflows
    result[target] -= 1;
  }

  return result;
}

/**
 * Render a table.
 *
 * @param {object}   spec
 * @param {object[]} spec.columns  { label, align?: 'left'|'right', min?, max?, fixed? }
 * @param {object[]} spec.rows     { cells: string[] } | { section, note? } | { rule: true }
 * @param {number}   spec.width    total width to fit into.
 * @param {object}   spec.theme    style theme; decides colour and border charset.
 * @param {boolean}  spec.header   draw the header row (default true).
 * @returns {string} the table, newline-joined, with no trailing newline.
 */
export function renderTable({ columns, rows = [], width = 80, theme = plainTheme, header = true } = {}) {
  if (!columns?.length) return '';

  const border = theme.unicode ? BORDERS.unicode : BORDERS.ascii;
  const frame = columns.length * FRAME_PER_COLUMN + FRAME_CLOSING;
  const widths = fitWidths(columns, naturalWidths(columns, rows), Math.max(columns.length * 3, width - frame));

  // Width between the two outer verticals, minus the one space of padding on
  // each side — what a section row has to fill.
  const spanWidth = widths.reduce((sum, w) => sum + w, 0) + 3 * (columns.length - 1);

  const v = theme.muted(border.vertical);
  const h = border.horizontal;

  const line = (left, mid, right) =>
    theme.muted(left + widths.map((w) => h.repeat(w + 2)).join(mid) + right);

  const spanLine = (left, right) => theme.muted(left + h.repeat(spanWidth + 2) + right);

  const dataRow = (cells) =>
    v +
    widths
      .map((w, i) => {
        const cell = truncate(cells[i] ?? '', w, theme.glyph.ellipsis);
        return ` ${pad(cell, w, columns[i].align ?? 'left')} `;
      })
      .join(v) +
    v;

  const spanRow = (left, right) => {
    const gap = Math.max(1, spanWidth - visibleWidth(left) - visibleWidth(right));
    const content = truncate(left + ' '.repeat(gap) + right, spanWidth, theme.glyph.ellipsis);
    return `${v} ${pad(content, spanWidth)} ${v}`;
  };

  const out = [line(border.topLeft, border.topTee, border.topRight)];

  if (header) {
    out.push(dataRow(columns.map((column) => theme.bold(column.label ?? ''))));
    out.push(line(border.leftTee, border.cross, border.rightTee));
  }

  let previous = null;
  for (const row of rows) {
    if (row?.section !== undefined) {
      // No rule above the first section: the header rule already closed.
      if (previous !== null) out.push(spanLine(border.leftTee, border.rightTee));
      out.push(spanRow(theme.brand(row.section), row.note ? theme.muted(row.note) : ''));
      out.push(spanLine(border.leftTee, border.rightTee));
    } else if (row?.rule) {
      out.push(line(border.leftTee, border.cross, border.rightTee));
    } else {
      out.push(dataRow(row.cells ?? []));
    }
    previous = row;
  }

  out.push(line(border.bottomLeft, border.bottomTee, border.bottomRight));
  return out.join('\n');
}
