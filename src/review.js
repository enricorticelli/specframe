// The review view: what did I actually choose?
//
// A guided run asks dozens of questions, and the answer to "what did I just
// configure" cannot be "scroll up". So the answers are projected into a numbered
// table — one row per decision that applies, grouped by section, open ones
// included — and the row number is the handle you use to change one answer
// without walking the wizard again.
//
// Relevance comes from resolveDecisions rather than being recomputed here: the
// table then shows exactly the decisions that will produce documents, and a
// decision retired by an earlier answer never appears as a row you could edit.
// Pure functions only — prompts.js does the asking, this decides what to show.

import { DECISIONS, GROUPS, getOption, recommendedValue } from './decisions/catalog.js';
import { resolveDecisions } from './decisions/resolve.js';
import { renderTable } from './table.js';
import { plainTheme, terminalWidth } from './style.js';

/**
 * Project answers into the review model.
 *
 * @param {object} answers  { [decisionId]: optionValue }
 * @returns {{
 *   groups: object[], rows: object[], decided: number, open: number,
 *   total: number, notApplicable: object[], resolved: object,
 * }}
 * Row numbering is global and follows catalog order, so the number beside a
 * decision is stable for as long as the answers are — which is what makes
 * "type 12 to change it" safe to offer.
 */
export function buildReview(answers = {}) {
  const resolved = resolveDecisions({ mode: 'guided', answers });

  const decidedById = new Map(resolved.decided.map((entry) => [entry.decision.id, entry]));
  const openIds = new Set(resolved.open.map((entry) => entry.decision.id));

  let index = 0;
  const groups = GROUPS.map((group) => {
    const rows = DECISIONS.filter(
      (decision) => decision.group === group.id && (decidedById.has(decision.id) || openIds.has(decision.id)),
    ).map((decision) => {
      const hit = decidedById.get(decision.id);
      index += 1;
      return {
        index,
        group,
        decision,
        option: hit?.option ?? null,
        status: hit ? 'decided' : 'open',
        recommended: hit ? hit.option.value === recommendedValue(decision) : false,
      };
    });

    return {
      group,
      rows,
      decided: rows.filter((row) => row.status === 'decided').length,
      open: rows.filter((row) => row.status === 'open').length,
    };
  }).filter((entry) => entry.rows.length > 0);

  const rows = groups.flatMap((entry) => entry.rows);

  return {
    groups,
    rows,
    total: rows.length,
    decided: rows.filter((row) => row.status === 'decided').length,
    open: rows.filter((row) => row.status === 'open').length,
    notApplicable: resolved.notApplicable,
    resolved,
  };
}

export function findReviewRow(review, index) {
  return review.rows.find((row) => row.index === index) ?? null;
}

export function openDecisionIds(review) {
  return review.rows.filter((row) => row.status === 'open').map((row) => row.decision.id);
}

// A decision's short name for the table. `title` is the catalog's own label;
// falling back to the question keeps the table honest if one is ever missing.
function decisionLabel(decision) {
  return decision.title ?? decision.question;
}

/**
 * The section digest: eight-ish rows that say where the gaps are.
 *
 * This is what the confirmation screen shows, because after forty questions the
 * first thing you need is not every answer but "which section did I leave half
 * done".
 */
export function formatSectionDigest(review, { theme = plainTheme, width = terminalWidth() } = {}) {
  const columns = [
    { label: 'Section', min: 12 },
    { label: 'Answered', align: 'right', min: 8, fixed: true },
    { label: 'Open', align: 'right', min: 4, fixed: true },
    { label: 'Progress', min: 12, fixed: true },
  ];

  const rows = review.groups.map((entry) => ({
    cells: [
      entry.group.title,
      theme.bold(`${entry.decided}/${entry.rows.length}`),
      entry.open > 0 ? theme.warn(String(entry.open)) : theme.muted('0'),
      theme.bar(entry.decided, entry.rows.length),
    ],
  }));

  rows.push({ rule: true });
  rows.push({
    cells: [
      theme.bold('Total'),
      theme.bold(`${review.decided}/${review.total}`),
      review.open > 0 ? theme.warn(String(review.open)) : theme.muted('0'),
      theme.bar(review.decided, review.total),
    ],
  });

  return renderTable({ columns, rows, width, theme });
}

/**
 * The full decision table: every row you could change, numbered.
 *
 * @param {object}   review
 * @param {object}   options
 * @param {Set}      options.editable  decision ids this run may still change.
 *                                     Rows outside it are marked, because a
 *                                     recorded decision is superseded by editing
 *                                     its ADR, not by re-answering it here.
 * @param {boolean}  options.openOnly  show only the decisions still open.
 */
export function formatReviewTable(
  review,
  { theme = plainTheme, width = terminalWidth(), editable = null, openOnly = false } = {},
) {
  // Choice is capped so one long option label cannot reflow the whole table
  // between two redraws of the same screen — a layout that moves under you is
  // worse than a truncated label. `Rec` is its own column rather than a suffix
  // on the label for the same reason a star is never used inside the grid: a
  // marker that a truncation can eat is a marker you cannot trust, and "did I
  // just take every recommendation" is the first thing a review has to answer.
  const columns = [
    { label: '#', align: 'right', min: 2, max: 4, fixed: true },
    { label: 'Decision', min: 16, max: 40 },
    { label: 'Choice', min: 14, max: 30 },
    { label: 'Rec', min: 3, fixed: true },
    { label: 'ADR', min: 8, fixed: true },
  ];

  const rows = [];
  let shown = 0;
  let lockedShown = false;
  let recShown = false;
  let openShown = false;

  for (const entry of review.groups) {
    const visible = openOnly ? entry.rows.filter((row) => row.status === 'open') : entry.rows;
    if (visible.length === 0) continue;

    rows.push({
      section: entry.group.title,
      note: `${entry.decided} of ${entry.rows.length} answered`,
    });

    for (const row of visible) {
      shown += 1;
      if (row.recommended) recShown = true;
      if (row.status === 'open') openShown = true;
      const locked = editable && !editable.has(row.decision.id);
      if (locked) lockedShown = true;
      const number = locked ? theme.muted(String(row.index)) : theme.accent(String(row.index));

      // ASCII '*' rather than a star glyph: this cell lives in a grid, and the
      // star is ambiguous-width in some terminals.
      rows.push({
        cells: [
          number,
          decisionLabel(row.decision),
          row.status === 'open' ? theme.warn('not decided') : theme.bold(row.option.label),
          row.recommended ? theme.muted('*') : '',
          row.status === 'open' ? theme.muted('—') : theme.tag(row.decision.adr),
        ],
      });
    }
  }

  if (shown === 0) {
    return theme.muted(openOnly ? '  Nothing left open.' : '  No decisions apply yet.');
  }

  // Only explain what is actually on screen: a legend for rows the filter hid is
  // noise in a table this long.
  const legend = [
    recShown ? `  ${theme.muted('Rec *')} ${theme.muted('= the recommended option')}` : '',
    openShown
      ? `  ${theme.warn('not decided')} ${theme.muted('= stays open, listed in docs/DECISIONS.md')}`
      : '',
    lockedShown
      ? `  ${theme.muted('a dimmed number is already recorded — supersede it by editing its ADR')}`
      : '',
  ].filter(Boolean);

  return [renderTable({ columns, rows, width, theme }), '', ...legend].join('\n');
}

/**
 * What a revision actually changes, decision by decision.
 *
 * @param {object} before  answers as recorded
 * @param {object} after   answers as they would be written
 * @returns {object[]} { decision, kind, fromValue, toValue, from, to } — kind is
 *                     'changed', 'recorded' (was open) or 'reopened' (was
 *                     recorded). The raw values are kept alongside the resolved
 *                     options because the history written into an ADR stores the
 *                     value, while the table shows the label.
 */
export function diffAnswers(before = {}, after = {}) {
  const changes = [];

  for (const decision of DECISIONS) {
    const fromValue = before[decision.id];
    const toValue = after[decision.id];
    if (fromValue === toValue) continue;

    const kind =
      fromValue === undefined ? 'recorded' : toValue === undefined ? 'reopened' : 'changed';
    changes.push({
      decision,
      kind,
      fromValue: fromValue ?? null,
      toValue: toValue ?? null,
      from: fromValue ? (getOption(decision, fromValue) ?? { label: fromValue }) : null,
      to: toValue ? (getOption(decision, toValue) ?? { label: toValue }) : null,
    });
  }

  return changes;
}

// The confirmation for a revision: three columns, because "what am I about to
// change" is a before/after question and a single list of new values cannot
// answer it.
export function formatChangeTable(changes, { theme = plainTheme, width = terminalWidth() } = {}) {
  if (changes.length === 0) return theme.muted('  Nothing changed.');

  const columns = [
    { label: 'Decision', min: 16, max: 34 },
    { label: 'From', min: 12, max: 26 },
    { label: 'To', min: 12, max: 26 },
    { label: 'ADR', min: 8, fixed: true },
  ];

  const rows = changes.map(({ decision, from, to }) => ({
    cells: [
      decisionLabel(decision),
      from ? theme.muted(from.label) : theme.muted('not decided'),
      to ? theme.bold(to.label) : theme.warn('not decided'),
      theme.tag(decision.adr),
    ],
  }));

  return renderTable({ columns, rows, width, theme });
}

// The artifacts a set of answers produces. Shown next to the digest so "23
// decisions" is expressed in the files it actually creates.
export function formatArtifactSummary(review, { theme = plainTheme } = {}) {
  const { resolved } = review;
  const glossaryTerms = resolved.glossaryGroups.reduce((sum, group) => sum + group.terms.length, 0);

  const parts = [
    [resolved.adrs.length, 'ADRs'],
    [resolved.rules.length, 'rules'],
    [resolved.guidelines.length, 'guidelines'],
    [resolved.runbooks.length, 'runbooks'],
    [glossaryTerms, 'glossary terms'],
  ].map(([count, label]) => `${theme.bold(String(count))} ${theme.muted(label)}`);

  return parts.join(theme.muted(', '));
}
