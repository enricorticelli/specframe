import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildReview,
  diffAnswers,
  findReviewRow,
  formatChangeTable,
  formatReviewTable,
  formatSectionDigest,
  openDecisionIds,
} from '../src/review.js';
import { resolvePreset } from '../src/decisions/presets.js';
import { plainTheme, stripAnsi, visibleWidth } from '../src/style.js';

const balanced = resolvePreset('balanced').answers;

test('every decision that applies is a row, answered or not', () => {
  const review = buildReview({});
  assert.ok(review.total > 20, 'the whole catalog applies when nothing is answered');
  assert.equal(review.decided, 0);
  assert.equal(review.open, review.total);
  assert.equal(review.rows.length, review.total);
});

test('row numbers are consecutive and follow catalog order', () => {
  const review = buildReview(balanced);
  assert.deepEqual(
    review.rows.map((row) => row.index),
    review.rows.map((_, i) => i + 1),
  );
  const groupOrder = review.groups.map((entry) => entry.group.id);
  assert.deepEqual(groupOrder, [...new Set(groupOrder)], 'each section appears once');
});

test('a decision retired by an earlier answer is not a row at all', () => {
  // A modular monolith has no inter-component transport to choose.
  const distributed = buildReview({ 'architecture-style': 'microservices' });
  const single = buildReview({ 'architecture-style': 'modular-monolith' });

  assert.ok(distributed.rows.some((row) => row.decision.id === 'inter-component-comm'));
  assert.ok(
    !single.rows.some((row) => row.decision.id === 'inter-component-comm'),
    'gated off, so it can never be shown as editable',
  );
  assert.ok(single.total < distributed.total);
});

test('an answer that matches the recommendation is marked as such', () => {
  const review = buildReview(balanced);
  const decided = review.rows.filter((row) => row.status === 'decided');
  assert.ok(decided.length > 0);
  assert.ok(decided.some((row) => row.recommended), 'the balanced preset follows some recommendations');
});

test('section counts add up to the totals', () => {
  const review = buildReview(balanced);
  const decided = review.groups.reduce((sum, entry) => sum + entry.decided, 0);
  const open = review.groups.reduce((sum, entry) => sum + entry.open, 0);
  assert.equal(decided, review.decided);
  assert.equal(open, review.open);
  assert.equal(decided + open, review.total);
});

test('a row can be found by its number, and only by a number that exists', () => {
  const review = buildReview(balanced);
  assert.equal(findReviewRow(review, 1).index, 1);
  assert.equal(findReviewRow(review, review.total).index, review.total);
  assert.equal(findReviewRow(review, review.total + 1), null);
  assert.equal(findReviewRow(review, 0), null);
});

test('the open ids are exactly the undecided rows', () => {
  const review = buildReview(balanced);
  assert.deepEqual(
    openDecisionIds(review),
    review.rows.filter((row) => row.status === 'open').map((row) => row.decision.id),
  );
});

// --- rendering --------------------------------------------------------------

test('the table lists sections, choices and the ADR each one produces', () => {
  const rendered = stripAnsi(formatReviewTable(buildReview(balanced), { theme: plainTheme, width: 100 }));
  assert.match(rendered, /Architecture/);
  assert.match(rendered, /Architecture style/);
  assert.match(rendered, /0100/, 'the ADR number');
  assert.match(rendered, /\* = the recommended option/);
});

test('an open decision says so instead of showing a blank cell', () => {
  const rendered = stripAnsi(formatReviewTable(buildReview({}), { theme: plainTheme, width: 100 }));
  assert.match(rendered, /not decided/);
  assert.match(rendered, /docs\/DECISIONS\.md/, 'and where it will be listed');
});

test('the open-only filter hides everything already decided', () => {
  const review = buildReview(balanced);
  const rendered = stripAnsi(
    formatReviewTable(review, { theme: plainTheme, width: 100, openOnly: true }),
  );
  assert.ok(!/Modular monolith/.test(rendered), 'decided rows are gone');
  const decided = review.rows.find((row) => row.status === 'decided');
  assert.ok(!rendered.includes(decided.option.label));
});

test('a decision outside this run is marked as already recorded', () => {
  const review = buildReview(balanced);
  const editable = new Set([review.rows.find((row) => row.status === 'open')?.decision.id]);
  const rendered = stripAnsi(formatReviewTable(review, { theme: plainTheme, width: 100, editable }));
  assert.match(rendered, /already recorded/);
});

test('the table fits the width it is given', () => {
  for (const width of [60, 80, 100]) {
    const rendered = formatReviewTable(buildReview(balanced), { theme: plainTheme, width });
    for (const line of rendered.split('\n')) {
      assert.ok(visibleWidth(line) <= width, `line over ${width}: ${line}`);
    }
  }
});

test('the digest has one row per section plus a total', () => {
  const review = buildReview(balanced);
  const rendered = stripAnsi(formatSectionDigest(review, { theme: plainTheme, width: 80 }));
  for (const entry of review.groups) assert.ok(rendered.includes(entry.group.title));
  assert.match(rendered, /Total/);
  assert.match(rendered, new RegExp(`${review.decided}/${review.total}`));
});

// --- the revision diff ------------------------------------------------------

test('a diff names what changed, in which direction', () => {
  const changes = diffAnswers(
    { 'architecture-style': 'modular-monolith', tdd: 'strict' },
    { 'architecture-style': 'microservices', tdd: 'strict' },
  );

  assert.equal(changes.length, 1, 'an unchanged answer is not a change');
  const [change] = changes;
  assert.equal(change.decision.id, 'architecture-style');
  assert.equal(change.kind, 'changed');
  assert.equal(change.fromValue, 'modular-monolith');
  assert.equal(change.toValue, 'microservices');
  assert.equal(change.from.label, 'Modular monolith');
  assert.equal(change.to.label, 'Microservices');
});

test('recording and reopening are distinguished from changing', () => {
  assert.equal(diffAnswers({}, { tdd: 'strict' })[0].kind, 'recorded');
  assert.equal(diffAnswers({ tdd: 'strict' }, {})[0].kind, 'reopened');
  assert.deepEqual(diffAnswers({ tdd: 'strict' }, { tdd: 'strict' }), []);
});

test('the diff follows catalog order, not the order answers were changed', () => {
  const changes = diffAnswers({}, { tdd: 'strict', 'architecture-style': 'monolith' });
  assert.deepEqual(
    changes.map((change) => change.decision.id),
    ['architecture-style', 'tdd'],
  );
});

test('the change table shows before and after, and the ADR that carries it', () => {
  const changes = diffAnswers(
    { 'architecture-style': 'modular-monolith' },
    { 'architecture-style': 'microservices' },
  );
  const rendered = stripAnsi(formatChangeTable(changes, { theme: plainTheme, width: 90 }));

  assert.match(rendered, /Architecture style/);
  assert.match(rendered, /Modular monolith/);
  assert.match(rendered, /Microservices/);
  assert.match(rendered, /0100/);
});

test('a change table with nothing in it says so instead of drawing a frame', () => {
  assert.match(stripAnsi(formatChangeTable([], { theme: plainTheme })), /Nothing changed/);
});

test('a review of nothing renders a sentence, not an empty frame', () => {
  const review = buildReview(balanced);
  const all = new Set(review.rows.map((row) => row.decision.id));
  const complete = buildReview(
    Object.fromEntries(
      review.rows.map((row) => [row.decision.id, row.option?.value ?? row.decision.options[0].value]),
    ),
  );
  assert.ok(all.size > 0);
  assert.equal(complete.open, 0);
  const rendered = stripAnsi(formatReviewTable(complete, { theme: plainTheme, width: 80, openOnly: true }));
  assert.match(rendered, /Nothing left open/);
});
