import { test } from 'node:test';
import assert from 'node:assert/strict';

import { collectAnswerSources, validateAnswers } from '../src/answers.js';
import {
  BLUEPRINTS,
  BLUEPRINT_IDS,
  blueprintCoverage,
  blueprintHeadline,
  resolveBlueprint,
} from '../src/decisions/blueprints.js';
import { DECISIONS, getDecision, getOption, isRelevant } from '../src/decisions/catalog.js';
import { resolvePreset } from '../src/decisions/presets.js';
import { resolveDecisions } from '../src/decisions/resolve.js';
import { askQuestions } from '../src/prompts.js';
import { createScriptedIo } from '../src/tui.js';

// Integrity tests for the blueprints, plus the two promises they make: that a
// blueprint is a *starting point* (it seeds the wizard and every answer stays
// editable), and that it is coherent (it never answers a question its own shape
// has retired).

const DISTRIBUTED = new Set(['service-based', 'microservices', 'serverless']);

test('every blueprint answer names a real decision and a real option', () => {
  for (const blueprint of BLUEPRINTS) {
    const { invalid } = validateAnswers(blueprint.answers);
    assert.deepEqual(invalid, [], `${blueprint.id} has answers the catalog does not know`);
  }
});

test('no blueprint answers a question its own shape retires', () => {
  for (const blueprint of BLUEPRINTS) {
    // Same walk resolve.js does: relevance is judged against the prefix, since
    // a gate can only reference decisions that come before it.
    const effective = {};
    for (const decision of DECISIONS) {
      const value = blueprint.answers[decision.id];
      if (!isRelevant(decision, effective)) {
        assert.equal(
          value,
          undefined,
          `${blueprint.id} answers ${decision.id}, which its own answers make irrelevant`,
        );
        continue;
      }
      if (value !== undefined) effective[decision.id] = value;
    }
  }
});

test('a blueprint resolves without a single not-applicable answer', () => {
  for (const id of BLUEPRINT_IDS) {
    const resolved = resolveDecisions({ mode: 'guided', answers: resolveBlueprint(id).answers });
    assert.deepEqual(
      resolved.notApplicable.map((n) => n.decision.id),
      [],
      `${id} would write ADRs for decisions that do not apply`,
    );
  }
});

test('a blueprint takes the architecture, design and data decisions', () => {
  const shape = ['architecture-style', 'component-structure', 'layering', 'persistence', 'migrations'];
  for (const blueprint of BLUEPRINTS) {
    for (const id of shape) {
      assert.ok(blueprint.answers[id], `${blueprint.id} leaves ${id} open, but it is part of the shape`);
    }
  }
});

test('a distributed blueprint pays the operational bill its shape implies', () => {
  for (const blueprint of BLUEPRINTS) {
    if (!DISTRIBUTED.has(blueprint.answers['architecture-style'])) continue;
    for (const id of ['contract-testing', 'structured-logging', 'metrics', 'tracing']) {
      assert.equal(
        blueprint.answers[id],
        'yes',
        `${blueprint.id} puts a network between components without answering ${id}`,
      );
    }
    assert.ok(blueprint.answers['data-ownership'], `${blueprint.id} does not say who owns the data`);
  }
});

test('a blueprint is a starting point, not a whole configuration', () => {
  for (const blueprint of BLUEPRINTS) {
    const { answered, relevant } = blueprintCoverage(blueprint);
    assert.ok(answered > 0 && answered < relevant, `${blueprint.id} answers ${answered} of ${relevant}`);
  }
});

test('no two blueprints are the same architecture twice', () => {
  const seen = new Map();
  for (const blueprint of BLUEPRINTS) {
    const key = JSON.stringify(blueprint.answers);
    assert.equal(seen.get(key), undefined, `${blueprint.id} duplicates ${seen.get(key)}`);
    seen.set(key, blueprint.id);
  }
});

test('the headline is built from the catalog labels', () => {
  const microservices = BLUEPRINTS.find((b) => b.id === 'microservices');
  const expected = getOption(getDecision('architecture-style'), 'microservices').label;
  assert.ok(blueprintHeadline(microservices).startsWith(expected));
});

test('an unknown blueprint id throws and lists the ones that exist', () => {
  assert.throws(() => resolveBlueprint('micoservices'), (error) => {
    assert.match(error.message, /Unknown blueprint: micoservices/);
    for (const id of BLUEPRINT_IDS) assert.ok(error.message.includes(id));
    return true;
  });
});

test('a blueprint wins over a preset on the shape, and loses to --set', async () => {
  const { mode, answers } = await collectAnswerSources({
    preset: 'strict',
    blueprint: 'microservices',
    set: 'architecture-style=serverless',
  });

  assert.equal(mode, 'guided');
  // --set is about one decision and was typed on purpose.
  assert.equal(answers['architecture-style'], 'serverless');
  // The blueprint overrides the posture where the two overlap...
  assert.equal(resolvePreset('strict').answers.persistence, 'relational');
  assert.equal(answers.persistence, 'mixed');
  assert.equal(answers['data-ownership'], 'db-per-service');
  // ...and leaves the posture alone everywhere else.
  assert.equal(answers.tdd, 'strict');
  assert.equal(answers['coverage-gate'], 'high');
});

// --- the wizard ------------------------------------------------------------

const seed = { projectName: 'acme', packageManager: 'npm', agentTargets: [] };

// mode 2 is the blueprint screen; the number after it picks one.
const run = (lines, options = {}) =>
  askQuestions({ io: createScriptedIo(lines), seed, basics: false, ...options });

test('picking a blueprint pre-answers the catalog and enter keeps every answer', async () => {
  const microservices = BLUEPRINTS.findIndex((b) => b.id === 'microservices') + 1;
  // mode: blueprint · pick microservices · then leave the rest open.
  const config = await run(['2', String(microservices), 'a']);

  assert.equal(config.mode, 'guided');
  assert.equal(config.decisions['architecture-style'], 'microservices');
  assert.equal(config.decisions['data-ownership'], 'db-per-service');
  assert.equal(config.decisions.tdd, undefined, 'the posture is still open');
});

test('a blueprint answer is a proposal: the first question can overrule it', async () => {
  const crud = BLUEPRINTS.findIndex((b) => b.id === 'crud') + 1;
  // mode · blueprint · enter the first section · pick option 4 (microservices).
  const config = await run(['2', String(crud), '', '4', 'a']);
  assert.equal(config.decisions['architecture-style'], 'microservices');
  // The rest of the blueprint survives the override — only what was asked changed.
  assert.equal(config.decisions.layering, 'layered');
});

test('enter on the blueprint screen goes back to the mode question', async () => {
  // mode: blueprint · enter (back) · mode: blank.
  const config = await run(['2', '', '3']);
  assert.equal(config.mode, 'blank');
  assert.deepEqual(config.decisions, {});
});

test('a blueprint reaches the review table with its answers in place', async () => {
  const io = createScriptedIo(['2', '1', 'a', 'r', 'q']);
  await askQuestions({ io, seed, basics: false });
  const screen = io.output.join('\n');
  assert.match(screen, /Layered CRUD application/);
  assert.match(screen, /Classic layered/);
});
