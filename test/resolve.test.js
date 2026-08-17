import { test } from 'node:test';
import assert from 'node:assert/strict';

import { DECISIONS } from '../src/decisions/catalog.js';
import { groupOpenDecisions, resolveDecisions, summarize } from '../src/decisions/resolve.js';

const guided = (answers) => resolveDecisions({ mode: 'guided', answers });
const pathsOf = (list) => list.map((i) => i.relpath);

test('blank mode ignores answers entirely and opens the whole catalog', () => {
  const resolved = resolveDecisions({ mode: 'blank', answers: { tdd: 'strict' } });
  assert.deepEqual(resolved.decided, []);
  assert.deepEqual(resolved.adrs, []);
  assert.equal(resolved.open.length, DECISIONS.length);
});

test('answers partition into decided and open', () => {
  const resolved = guided({ tdd: 'strict' });
  assert.equal(resolved.decided.length, 1);
  assert.equal(resolved.decided[0].option.value, 'strict');
  assert.equal(resolved.open.length, DECISIONS.length - 1);
  assert.ok(!resolved.open.some((o) => o.decision.id === 'tdd'));
});

test('one ADR per decision, at the number the catalog reserved', () => {
  const resolved = guided({ 'architecture-style': 'microservices' });
  assert.equal(resolved.adrs.length, 1);
  assert.equal(resolved.adrs[0].relpath, 'docs/adr/0100-architecture-style.md');
});

test('an ADR carries every option that was not chosen', () => {
  const resolved = guided({ 'architecture-style': 'monolith' });
  const values = resolved.adrs[0].alternatives.map((o) => o.value);
  assert.ok(!values.includes('monolith'));
  assert.ok(values.includes('microservices'));
  assert.equal(values.length, 4);
});

test('a document required by two decisions is written once, citing both', () => {
  const resolved = guided({
    'architecture-style': 'microservices',
    'data-ownership': 'db-per-service',
  });
  const crossDb = resolved.rules.filter((r) => r.slug === 'no-cross-service-db');
  assert.equal(crossDb.length, 1, 'no duplicate file');
  assert.deepEqual(crossDb[0].sources, ['0100', '0310']);
});

test('the first option to emit a parametrised document supplies its variables', () => {
  // Deterministic because `decided` follows catalog order, not answer order.
  const a = guided({ 'coverage-gate': 'high' });
  const b = guided({ 'coverage-gate': 'moderate' });
  assert.equal(a.rules.find((r) => r.slug === 'coverage-gate').vars.threshold, '80');
  assert.equal(b.rules.find((r) => r.slug === 'coverage-gate').vars.threshold, '60');
});

test('an answer to a question a previous answer retired is reported, not honoured', () => {
  const resolved = guided({
    'architecture-style': 'modular-monolith',
    'contract-testing': 'yes',
  });
  assert.ok(!resolved.decided.some((d) => d.decision.id === 'contract-testing'));
  assert.equal(resolved.notApplicable.length, 1);
  assert.equal(resolved.notApplicable[0].decision.id, 'contract-testing');
});

test('a retired question is neither decided nor open', () => {
  const resolved = guided({ 'architecture-style': 'monolith' });
  const ids = new Set(resolved.open.map((o) => o.decision.id));
  assert.ok(!ids.has('data-ownership'), 'not outstanding — it does not apply');
  assert.ok(!ids.has('distributed-tracing'));
  assert.ok(ids.has('event-sourcing'), 'ungated questions stay open');
});

test('a question stays open while the answer that gates it is missing', () => {
  const resolved = guided({ tdd: 'strict' });
  const ids = resolved.open.map((o) => o.decision.id);
  assert.ok(ids.includes('contract-testing'), 'unknown architecture keeps it relevant');
});

test('unknown decisions and options are reported', () => {
  const resolved = guided({ 'not-a-decision': 'x', tdd: 'not-an-option' });
  assert.equal(resolved.decided.length, 0);
  assert.deepEqual(
    resolved.invalid.map((i) => i.id).sort(),
    ['not-a-decision', 'tdd'],
  );
});

test('recording more decisions never moves a document already written', () => {
  const before = guided({ 'event-sourcing': 'yes' });
  const after = guided({ 'event-sourcing': 'yes', 'clean-code': 'yes', tdd: 'strict' });

  for (const kind of ['adrs', 'rules', 'guidelines', 'runbooks']) {
    for (const item of before[kind]) {
      assert.ok(
        pathsOf(after[kind]).includes(item.relpath),
        `${item.relpath} moved when unrelated decisions were added`,
      );
    }
  }
});

test('output ordering is stable regardless of answer order', () => {
  const a = guided({ tdd: 'strict', 'clean-code': 'yes', 'event-sourcing': 'yes' });
  const b = guided({ 'event-sourcing': 'yes', tdd: 'strict', 'clean-code': 'yes' });
  assert.deepEqual(pathsOf(a.rules), pathsOf(b.rules));
  assert.deepEqual(pathsOf(a.guidelines), pathsOf(b.guidelines));
  assert.deepEqual(a.adrs.map((x) => x.relpath), b.adrs.map((x) => x.relpath));
});

test('documents are sorted by their permanent number', () => {
  const resolved = guided({ 'architecture-style': 'microservices', 'clean-code': 'yes' });
  const numbers = resolved.rules.map((r) => r.number);
  assert.deepEqual(numbers, [...numbers].sort());
});

test('glossary terms group into one file per area, alphabetically', () => {
  const resolved = guided({ 'architecture-style': 'microservices', 'event-sourcing': 'yes' });
  const data = resolved.glossaryGroups.find((g) => g.groupId === 'data');
  assert.equal(data.relpath, 'docs/glossary/0020-data.md');
  const terms = data.terms.map((t) => t.entry.term);
  assert.deepEqual(terms, [...terms].sort(), 'alphabetical inside the file');
  assert.ok(resolved.glossaryGroups.every((g) => g.terms.length > 0), 'no empty group files');
});

test('open decisions group in catalog order, skipping empty groups', () => {
  const allButTesting = Object.fromEntries(
    DECISIONS.filter((d) => d.group !== 'testing').map((d) => [d.id, d.options[0].value]),
  );
  const grouped = groupOpenDecisions(guided(allButTesting).open);
  assert.ok(grouped.every((g) => g.decisions.length > 0));
  assert.ok(grouped.some((g) => g.group.id === 'testing'));
});

test('summarize counts what will be written', () => {
  const s = summarize(guided({ 'event-sourcing': 'yes' }));
  assert.equal(s.decided, 1);
  assert.equal(s.adrs, 1);
  assert.equal(s.rules, 1);
  assert.equal(s.guidelines, 2);
  assert.equal(s.runbooks, 1);
  assert.equal(s.glossaryTerms, 3);
});
