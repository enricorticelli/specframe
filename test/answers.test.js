import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  applyRecommendedDefaults,
  collectAnswerSources,
  parseSetFlag,
  readAnswersFile,
  validateAnswers,
} from '../src/answers.js';
import { DECISIONS, isRelevant } from '../src/decisions/catalog.js';
import { PRESET_IDS, PRESETS, resolvePreset } from '../src/decisions/presets.js';

// --- --set ------------------------------------------------------------------

test('--set parses pairs and tolerates spacing', () => {
  assert.deepEqual(parseSetFlag('tdd=strict,clean-code=yes'), {
    tdd: 'strict',
    'clean-code': 'yes',
  });
  assert.deepEqual(parseSetFlag(' tdd = strict , '), { tdd: 'strict' });
  assert.deepEqual(parseSetFlag(''), {});
});

test('a malformed --set entry throws rather than being dropped', () => {
  assert.throws(() => parseSetFlag('tdd'), /Invalid --set entry/);
  assert.throws(() => parseSetFlag('=strict'), /Invalid --set entry/);
});

// --- validation -------------------------------------------------------------

test('validation separates known answers from typos', () => {
  const { valid, invalid } = validateAnswers({
    tdd: 'strict',
    'clean-cod': 'yes',
    'coverage-gate': 'ludicrous',
  });
  assert.deepEqual(valid, { tdd: 'strict' });
  assert.equal(invalid.length, 2);
  assert.match(invalid.find((i) => i.id === 'clean-cod').reason, /no such decision/);
  assert.match(invalid.find((i) => i.id === 'coverage-gate').reason, /no such option/);
});

test('an explicit skip is neither valid nor an error', () => {
  const { valid, invalid } = validateAnswers({ tdd: 'skip' });
  assert.deepEqual(valid, {});
  assert.deepEqual(invalid, []);
});

// --- answers file -----------------------------------------------------------

test('an answers file accepts both the bare map and a manifest config', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'sf-answers-'));
  try {
    const bare = path.join(dir, 'bare.json');
    await writeFile(bare, JSON.stringify({ tdd: 'strict' }));
    assert.deepEqual(await readAnswersFile(bare), { mode: undefined, answers: { tdd: 'strict' } });

    // The shape a manifest stores, so one repo's setup can be replayed in another.
    const manifest = path.join(dir, 'manifest.json');
    await writeFile(manifest, JSON.stringify({ mode: 'guided', decisions: { tdd: 'pragmatic' } }));
    assert.deepEqual(await readAnswersFile(manifest), {
      mode: 'guided',
      answers: { tdd: 'pragmatic' },
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('an unreadable answers file reports its path', async () => {
  await assert.rejects(readAnswersFile('/nope/nope.json'), /Could not read answers file/);
});

// --- precedence -------------------------------------------------------------

test('--set overrides an answers file, which overrides the preset', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'sf-answers-'));
  try {
    const file = path.join(dir, 'a.json');
    await writeFile(file, JSON.stringify({ tdd: 'no', 'clean-code': 'no' }));

    const merged = await collectAnswerSources({
      preset: 'balanced',
      answersFile: file,
      set: 'tdd=strict',
    });

    assert.equal(merged.mode, 'guided');
    assert.equal(merged.answers.tdd, 'strict', '--set wins');
    assert.equal(merged.answers['clean-code'], 'no', 'file beats preset');
    assert.equal(merged.answers['coverage-gate'], 'moderate', 'preset fills the rest');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('--set alone implies guided mode', async () => {
  const { mode } = await collectAnswerSources({ set: 'tdd=strict' });
  assert.equal(mode, 'guided');
});

test('no source at all leaves the mode unset, so the wizard asks', async () => {
  const { mode, answers } = await collectAnswerSources({});
  assert.equal(mode, undefined);
  assert.deepEqual(answers, {});
});

// --- defaults ---------------------------------------------------------------

test('recommended defaults never answer a question a previous answer retired', () => {
  const filled = applyRecommendedDefaults({ 'architecture-style': 'monolith' });
  assert.equal(filled['data-ownership'], undefined, 'no services, no data ownership question');
  assert.equal(filled['distributed-tracing'], undefined);
  assert.equal(filled['contract-testing'], undefined);
  assert.equal(filled['clean-code'], 'yes', 'ungated decisions are still filled');
});

test('recommended defaults respect answers already given', () => {
  const filled = applyRecommendedDefaults({ tdd: 'no' });
  assert.equal(filled.tdd, 'no');
});

test('defaults can be limited to a subset, for `specframe decide`', () => {
  const filled = applyRecommendedDefaults({}, { only: ['tdd'] });
  assert.deepEqual(filled, { tdd: 'pragmatic' });
});

test('recommended defaults never fill in a dismissed decision', () => {
  // The regression this guards: a dismissal is not a gate, so `isRelevant`
  // alone cannot tell it apart from an ordinary unanswered question — without
  // the explicit check, `--yes` or the wizard's `d` would silently un-dismiss
  // every decision the user declared out of scope.
  const filled = applyRecommendedDefaults(
    {},
    { dismissed: { tdd: { date: '2026-01-01', reason: 'no code here yet' } } },
  );
  assert.equal(filled.tdd, undefined, 'still not answered');
  assert.equal(filled['clean-code'], 'yes', 'everything else is still filled as usual');
});

// --- presets ----------------------------------------------------------------

test('every preset resolves to answers the catalog accepts', () => {
  for (const id of PRESET_IDS) {
    const { mode, answers } = resolvePreset(id);
    assert.ok(mode === 'blank' || mode === 'guided', `${id} has mode ${mode}`);
    const { invalid } = validateAnswers(answers);
    assert.deepEqual(invalid, [], `${id} produced invalid answers`);
  }
});

test('an unknown preset throws and lists the real ones', () => {
  assert.throws(() => resolvePreset('balenced'), /Unknown preset.*balanced/s);
});

test('blank takes no decisions; balanced answers every relevant one', () => {
  assert.deepEqual(resolvePreset('blank').answers, {});

  const { answers } = resolvePreset('balanced');
  const effective = {};
  for (const decision of DECISIONS) {
    if (!isRelevant(decision, effective)) continue;
    if (answers[decision.id] === undefined) continue;
    effective[decision.id] = answers[decision.id];
  }
  assert.deepEqual(
    Object.keys(answers).sort(),
    Object.keys(effective).sort(),
    'balanced must not answer a question that its own earlier answers retired',
  );
});

test('strict is balanced with the demanding options substituted', () => {
  const balanced = resolvePreset('balanced').answers;
  const strict = resolvePreset('strict').answers;

  assert.equal(balanced.tdd, 'pragmatic');
  assert.equal(strict.tdd, 'strict');
  assert.equal(strict['coverage-gate'], 'high');
  assert.equal(strict['pr-policy'], 'two-reviews');
  // Same shape, different values: strict must not introduce new questions.
  assert.deepEqual(Object.keys(strict).sort(), Object.keys(balanced).sort());
});

test('every preset has a description the help text can print', () => {
  for (const id of PRESET_IDS) {
    assert.ok(PRESETS[id].description?.length > 20, `${id} needs a description`);
  }
});
