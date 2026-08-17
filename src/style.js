// Terminal styling, dependency-free.
//
// Colour is a hint here, never information: every screen has to read the same
// with colour off (NO_COLOR, a pipe, TERM=dumb, CI logs), because a wizard that
// only makes sense in a 24-bit terminal is a wizard you cannot run over ssh.
// What colour buys is *hierarchy* — in a forty-question run the eye needs to
// know, without reading, which line is the question, which is the help text and
// which is the answer it just gave.
//
// The palette is deliberately small. Seven semantic tokens, not a colour per
// concept: `brand` for structure, `heading` for the thing being asked, `muted`
// for everything explanatory, `accent` for what you type, `key` for shortcuts,
// and good/warn/bad for outcomes. Anything beyond that turns a long wizard into
// a slideshow.
//
// Closing codes are specific (22 for bold/dim, 39 for foreground) rather than a
// blanket reset, so a styled fragment inside another one does not blow away the
// outer style. Even so, call sites concatenate separately styled fragments
// instead of nesting — it is the only way to keep this predictable without
// writing a real renderer.

import process from 'node:process';

// SGR sequences only. Enough for everything below, and it keeps stripAnsi and
// visibleWidth honest: there is no cursor movement to account for.
const ANSI = /\u001b\[[0-9;]*m/g;

// One code point, or one whole escape sequence, per match.
const TOKENS = /\u001b\[[0-9;]*m|./gsu;

export function stripAnsi(value) {
  return String(value).replace(ANSI, '');
}

// Width as the terminal will lay it out, ignoring escape sequences. Code points,
// not UTF-16 units, so a non-BMP character counts once. Ambiguous-width glyphs
// are counted as one — which is why nothing in a *table* uses them.
export function visibleWidth(value) {
  return [...stripAnsi(value)].length;
}

// Truncate to a visible width, preserving escape sequences (they cost no
// columns) and closing the styling if any was opened.
export function truncate(value, max, ellipsis = '…') {
  const text = String(value);
  if (visibleWidth(text) <= max) return text;
  if (max <= 0) return '';

  const budget = max - visibleWidth(ellipsis);
  let out = '';
  let width = 0;
  let styled = false;

  for (const [token] of text.matchAll(TOKENS)) {
    if (token.startsWith('\u001b')) {
      out += token;
      styled = true;
      continue;
    }
    if (width >= budget) break;
    out += token;
    width += 1;
  }

  return `${out}${ellipsis}${styled ? '\u001b[0m' : ''}`;
}

export function pad(value, width, align = 'left') {
  const gap = Math.max(0, width - visibleWidth(value));
  if (gap === 0) return String(value);
  const filler = ' '.repeat(gap);
  return align === 'right' ? filler + value : String(value) + filler;
}

// Greedy word wrap that keeps existing line breaks and never splits a word it
// could keep whole. Used for blurbs, hints and `?` help, so a long explanation
// stops depending on the reader's window being wide.
export function wrapText(value, width, indent = '') {
  const limit = Math.max(20, width - indent.length);
  const lines = [];

  for (const paragraph of String(value).split('\n')) {
    if (paragraph.trim() === '') {
      lines.push('');
      continue;
    }
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      if (line === '') {
        line = word;
      } else if (visibleWidth(line) + 1 + visibleWidth(word) <= limit) {
        line += ` ${word}`;
      } else {
        lines.push(line);
        line = word;
      }
    }
    if (line !== '') lines.push(line);
  }

  return lines.map((line) => (line === '' ? '' : indent + line));
}

/**
 * Whether to emit colour at all.
 *
 * NO_COLOR (any non-empty value) wins, then FORCE_COLOR, then a dumb terminal,
 * then whether anyone is actually looking at a TTY. That order is the informal
 * cross-tool convention, and honouring it is what makes `specframe init | tee`
 * produce a clean log.
 */
export function colorSupported({ env = process.env, stream = process.stdout } = {}) {
  if (env.NO_COLOR !== undefined && env.NO_COLOR !== '') return false;
  if (env.FORCE_COLOR !== undefined && env.FORCE_COLOR !== '') {
    return env.FORCE_COLOR !== '0' && env.FORCE_COLOR !== 'false';
  }
  if (env.TERM === 'dumb') return false;
  return Boolean(stream.isTTY);
}

// Box-drawing and the few glyphs used outside tables. A dumb terminal, or an
// explicit opt-out, falls back to ASCII rather than to mojibake.
export function unicodeSupported({ env = process.env } = {}) {
  if (env.SPECFRAME_ASCII !== undefined && env.SPECFRAME_ASCII !== '') return false;
  if (env.TERM === 'dumb') return false;
  return true;
}

// Usable width for framed output. Clamped: below 60 the tables stop being
// readable whatever we do, above 110 long lines get hard to track back.
export function terminalWidth({ stream = process.stdout, min = 60, max = 110 } = {}) {
  const columns = Number(stream?.columns) || 80;
  return Math.max(min, Math.min(max, columns));
}

function sgr(open, close) {
  return (value) => `\u001b[${open}m${value}\u001b[${close}m`;
}

const identity = (value) => String(value);

export function createStyle({ color = true, unicode = true } = {}) {
  const on = (open, close) => (color ? sgr(open, close) : identity);

  const style = {
    color,
    unicode,

    bold: on('1', '22'),
    dim: on('2', '22'),
    underline: on('4', '24'),
    inverse: on('7', '27'),

    brand: on('1;36', '22;39'), // structure: banners, section titles
    heading: on('1', '22'), // the question itself
    muted: on('2', '22'), // help, hints, borders, anything explanatory
    accent: on('36', '39'), // things you type: option numbers, row numbers
    key: on('33', '39'), // keyboard shortcuts
    good: on('32', '39'), // taken, written, recommended
    warn: on('33', '39'), // open, kept, skipped
    bad: on('31', '39'), // errors, removals
    tag: on('35', '39'), // ADR ids

    glyph: {
      check: unicode ? '✓' : '+',
      star: unicode ? '★' : '*',
      bullet: unicode ? '·' : '-',
      arrow: unicode ? '→' : '->',
      prompt: unicode ? '❯' : '>',
      lock: unicode ? '·' : '-',
      rule: unicode ? '─' : '-',
      barFull: unicode ? '█' : '#',
      barEmpty: unicode ? '░' : '.',
      ellipsis: unicode ? '…' : '...',
    },
  };

  // A progress bar reads at a glance, which is the point: the group headers use
  // it so "how much of this is left" never has to be counted.
  style.bar = (done, total, width = 12) => {
    if (total <= 0) return '';
    const filled = Math.max(0, Math.min(width, Math.round((done / total) * width)));
    return (
      style.good(style.glyph.barFull.repeat(filled)) +
      style.muted(style.glyph.barEmpty.repeat(width - filled))
    );
  };

  // Horizontal rule, optionally with a label sitting on it.
  style.rule = (width, label = '') => {
    const line = style.glyph.rule;
    if (label === '') return style.muted(line.repeat(Math.max(0, width)));
    const lead = line.repeat(2);
    const tail = line.repeat(Math.max(0, width - visibleWidth(label) - 4));
    return `${style.muted(lead)} ${style.brand(label)} ${style.muted(tail)}`;
  };

  return style;
}

// The process-wide theme. Mutated in place by setColor/setUnicode so every
// module can hold a plain reference to it, and the CLI can still turn colour off
// after `--no-color` has been parsed.
export const theme = createStyle({ color: colorSupported(), unicode: unicodeSupported() });

export function configureTheme({ color = theme.color, unicode = theme.unicode } = {}) {
  Object.assign(theme, createStyle({ color, unicode }));
  return theme;
}

// A never-styled theme, for tests and for anything writing to a file.
export const plainTheme = createStyle({ color: false, unicode: false });
