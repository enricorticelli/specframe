import { test } from 'node:test';
import assert from 'node:assert/strict';

import { explainDecision } from '../src/decisions/explain.js';
import { getDecision, recommendedValue } from '../src/decisions/catalog.js';

// The brief `specframe explain` prints, and what `specframe-decide` reads
// before proposing anything — pure, fs-free, same as catalog.js and resolve.js.

test('unknown id returns null rather than throwing', () => {
  assert.equal(explainDecision('not-a-real-decision'), null);
});

test('an unanswered decision is open, relevant, and carries every option', () => {
  const decision = getDecision('architecture-style');
  const brief = explainDecision('architecture-style');

  assert.equal(brief.id, 'architecture-style');
  assert.equal(brief.group, 'architecture');
  assert.equal(brief.adr, decision.adr);
  assert.equal(brief.adrPath, `docs/adr/${decision.adr}-architecture-style.md`);
  assert.equal(brief.status, 'open');
  assert.equal(brief.current, null);
  assert.equal(brief.provenance, null);
  assert.equal(brief.relevant, true);
  assert.equal(brief.recommendedValue, recommendedValue(decision));
  assert.equal(brief.options.length, decision.options.length);

  const recommended = brief.options.find((o) => o.recommended);
  assert.equal(recommended.value, recommendedValue(decision));
});

test('every option carries the material the wizard shows on `?`', () => {
  const brief = explainDecision('architecture-style');
  for (const option of brief.options) {
    assert.equal(typeof option.statement, 'string');
    assert.ok(Array.isArray(option.consequences) && option.consequences.length > 0);
    assert.equal(typeof option.tradeoff, 'string');
    assert.ok(option.emits.rules && option.emits.guidelines && option.emits.runbooks && option.emits.glossary);
  }
});

test('an emitted slug resolves to its real id and title, not a bare slug', () => {
  const brief = explainDecision('architecture-style');
  const modular = brief.options.find((o) => o.value === 'modular-monolith');
  assert.ok(modular.emits.rules.length > 0);
  for (const rule of modular.emits.rules) {
    assert.match(rule.id, /^R-\d{4}$/);
    assert.equal(typeof rule.title, 'string');
  }
  assert.ok(modular.documents.every((doc) => doc.startsWith('docs/')));
});

test('a decided answer is reflected as current, with its provenance', () => {
  const brief = explainDecision('architecture-style', {
    answers: { 'architecture-style': 'microservices' },
    provenance: { 'architecture-style': 'detected' },
  });
  assert.equal(brief.status, 'decided');
  assert.equal(brief.current, 'microservices');
  assert.equal(brief.provenance, 'detected');
});

test('a decision retired by an earlier answer is marked not relevant', () => {
  // `event-sourcing` gates on persistence + distribution; with neither answered
  // it stays relevant (an unknown gate never hides its follow-ups), but once
  // the repository has answered persistence=none it should read as not relevant.
  const brief = explainDecision('event-sourcing', { answers: { persistence: 'none' } });
  assert.equal(brief.relevant, false);
});
