import { test } from 'node:test';
import assert from 'node:assert/strict';

import { BLUEPRINTS, resolveBlueprint } from '../src/decisions/blueprints.js';
import { DECISIONS, decisionsForGroup, isRelevant } from '../src/decisions/catalog.js';
import { GLOSSARY_TERMS } from '../src/decisions/glossary.js';
import { resolveDecisions } from '../src/decisions/resolve.js';

// The interface section is the only one in the catalog that can be retired
// wholesale, because it is the only one that does not apply to every
// repository. These tests pin that gate down from both ends: a service must
// never be asked where its buttons come from, and an interface must never have
// the section quietly vanish — which is the failure mode the section exists to
// prevent in the first place.

const guided = (answers) => resolveDecisions({ mode: 'guided', answers });
const FRONTEND = decisionsForGroup('frontend').map((d) => d.id);
// The blueprints whose archetype includes an interface; every other one is a
// backend shape and must leave the interface an open question.
const FRONTEND_BLUEPRINTS = ['spa-api', 'ssr-fullstack', 'content-site'];
const followUps = FRONTEND.filter((id) => id !== 'ui-surface');

test('the interface section is a section, not decisions scattered elsewhere', () => {
  assert.ok(FRONTEND.length >= 10, 'the frontend group should carry the interface decisions');
  for (const id of followUps) {
    const decision = DECISIONS.find((d) => d.id === id);
    assert.equal(typeof decision.when, 'function', `${id} must be gated on ui-surface`);
  }
});

test('no user interface retires the whole section', () => {
  const answers = { 'ui-surface': 'none' };
  for (const id of followUps) {
    const decision = DECISIONS.find((d) => d.id === id);
    assert.equal(isRelevant(decision, answers), false, `${id} is still asked of a repository with no UI`);
  }

  const resolved = guided({ ...answers, styling: 'utility-classes' });
  assert.deepEqual(resolved.adrs.map((a) => a.slug), ['user-interface-surface']);
  assert.deepEqual(
    resolved.notApplicable.map((n) => n.decision.id),
    ['styling'],
    'an answer to a retired question is dropped and reported, never written',
  );
  assert.ok(!resolved.open.some((o) => FRONTEND.includes(o.decision.id)));
});

test('a content site keeps the interface questions but retires the state model', () => {
  const answers = { 'ui-surface': 'content-site' };
  const retired = followUps.filter((id) => !isRelevant(DECISIONS.find((d) => d.id === id), answers));
  assert.deepEqual(retired, ['client-state'], 'a site with no session has no state model to decide');
});

test('an unanswered gate keeps the section open rather than hiding it', () => {
  // The whole point: a decision nobody took stays visible as a decision.
  const open = guided({}).open.map((o) => o.decision.id);
  for (const id of FRONTEND) assert.ok(open.includes(id), `${id} vanished instead of staying open`);
});

test('shipping an interface pins down the browser as an untrusted runtime', () => {
  const resolved = guided({ 'ui-surface': 'web-app' });
  assert.ok(resolved.rules.some((r) => r.slug === 'no-secrets-in-client-bundle'));
  assert.ok(resolved.runbooks.some((r) => r.slug === 'broken-frontend-release'));
});

test('the interface decisions carry the artifacts that make them enforceable', () => {
  const resolved = guided({
    'ui-surface': 'web-app',
    'rendering-strategy': 'hybrid',
    'ui-composition': 'presentation-and-feature',
    'design-system': 'headless-plus-tokens',
    'client-state': 'server-cache',
    styling: 'utility-classes',
    accessibility: 'wcag-aa',
    i18n: 'from-the-start',
    'ui-testing': 'component-and-flow',
    'frontend-performance': 'field-and-bundle',
  });

  assert.equal(resolved.adrs.length, 10);
  for (const slug of ['wcag-conformance', 'one-styling-system', 'frontend-performance-budget']) {
    assert.ok(resolved.rules.some((r) => r.slug === slug), `missing rule ${slug}`);
  }
  // A rule whose placeholder survived unfilled would ship a document telling
  // the reader to comply with "{{level}}".
  for (const rule of resolved.rules) {
    const needed = [...JSON.stringify(rule.entry).matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]);
    for (const key of needed) assert.ok(rule.vars[key], `${rule.slug} rendered without ${key}`);
  }
});

test('the glossary keeps the two meanings of "component" apart', () => {
  // The word is already taken by the architecture section, and an agent that
  // conflates the two puts a fetch call in a button.
  assert.equal(GLOSSARY_TERMS.component.group, 'architecture');
  assert.equal(GLOSSARY_TERMS['ui-component'].group, 'frontend');
  assert.match(GLOSSARY_TERMS['ui-component'].context, /Contrast with Component/);
});

test('a frontend blueprint takes the shape of the interface and leaves its posture open', () => {
  const shape = ['ui-surface', 'rendering-strategy', 'ui-composition', 'design-system', 'styling'];
  const posture = ['accessibility', 'i18n', 'ui-testing', 'frontend-performance'];

  for (const id of FRONTEND_BLUEPRINTS) {
    const { answers } = resolveBlueprint(id);
    for (const decision of shape) assert.ok(answers[decision], `${id} leaves ${decision} open`);
    for (const decision of posture) {
      assert.equal(answers[decision], undefined, `${id} answers ${decision}, which is a posture, not a shape`);
    }
  }
});

test('a backend blueprint does not decide the interface on the repository behalf', () => {
  for (const blueprint of BLUEPRINTS) {
    if (FRONTEND_BLUEPRINTS.includes(blueprint.id)) continue;
    assert.equal(
      blueprint.answers['ui-surface'],
      undefined,
      `${blueprint.id} decides whether there is a UI; it should stay an open question`,
    );
  }
});
