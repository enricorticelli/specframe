import { test } from 'node:test';
import assert from 'node:assert/strict';

import { askQuestions, parseAgentTargets } from '../src/prompts.js';
import { resolvePreset } from '../src/decisions/presets.js';
import { createScriptedIo } from '../src/tui.js';

// The wizard is driven through a scripted io, so the "how fast can this be
// skipped" claims are tested rather than asserted in a README.

const seed = { projectName: 'acme', packageManager: 'npm', agentTargets: [] };

const run = (lines, options = {}) =>
  askQuestions({
    io: createScriptedIo(lines),
    seed,
    mode: 'guided',
    basics: false,
    ...options,
  });

test('parseAgentTargets accepts the known targets and drops the rest', () => {
  assert.deepEqual(parseAgentTargets('claude, gemini, bogus'), ['claude', 'gemini']);
  assert.deepEqual(parseAgentTargets('none'), []);
  assert.deepEqual(parseAgentTargets(undefined), []);
});

test('one key at the first gate skips the entire catalog', async () => {
  const config = await run(['a']);
  assert.deepEqual(config.decisions, {}, 'nothing was decided');
  assert.equal(config.mode, 'guided');
});

test('one key at the first gate accepts every recommendation', async () => {
  const config = await run(['d']);
  assert.deepEqual(config.decisions, resolvePreset('balanced').answers);
});

test('skipping a group leaves its decisions open and moves to the next', async () => {
  // Skip architecture, enter design, answer its first question, then stop.
  const config = await run(['s', '', '1', 'a']);
  assert.equal(config.decisions['architecture-style'], undefined);
  assert.equal(config.decisions.layering, 'clean');
});

test('a question a previous answer retired is never asked', async () => {
  // Choosing a modular monolith retires the questions about distribution, so
  // the next question in the group is the API style, not the transport.
  const config = await run(['', '2', '1', 'a']);
  assert.equal(config.decisions['architecture-style'], 'modular-monolith');
  assert.equal(config.decisions['inter-component-comm'], undefined, 'gated off');
  assert.equal(config.decisions['api-style'], 'rest');
});

test('back re-asks the previous question and the new answer wins', async () => {
  const config = await run(['', '2', 'b', '1', '1', 'a']);
  assert.equal(config.decisions['architecture-style'], 'monolith', 'overwritten after going back');
  assert.equal(config.decisions['api-style'], 'rest');
});

test('back at the first question of a group re-asks that question', async () => {
  const config = await run(['', 'b', '3', 'a']);
  assert.equal(config.decisions['architecture-style'], 'service-based');
});

test('skipping a single question clears it rather than defaulting it', async () => {
  const config = await run(['', 's', 'a']);
  assert.equal(config.decisions['architecture-style'], undefined);
});

test('d part-way through fills only what is still ahead', async () => {
  const config = await run(['', '1', 'd']);
  const balanced = resolvePreset('balanced').answers;
  assert.equal(config.decisions['architecture-style'], 'monolith', 'the answer given is kept');
  assert.notEqual(config.decisions['architecture-style'], balanced['architecture-style']);
  assert.equal(config.decisions['clean-code'], 'yes', 'later groups took the recommendation');
});

test('quitting returns nothing, so the caller writes nothing', async () => {
  assert.equal(await run(['q']), null);
  assert.equal(await run(['', 'q']), null, 'quit from a question');
});

test('invalid input re-asks instead of guessing', async () => {
  const io = createScriptedIo(['', '99', '1', 'a']);
  const config = await askQuestions({ io, seed, mode: 'guided', basics: false });
  assert.equal(config.decisions['architecture-style'], 'monolith');
  assert.ok(io.output.some((line) => /out of range/.test(line)), 'the reason was shown');
});

test('help does not consume the answer', async () => {
  const io = createScriptedIo(['', '?', '1', 'a']);
  const config = await askQuestions({ io, seed, mode: 'guided', basics: false });
  assert.equal(config.decisions['architecture-style'], 'monolith');
});

test('review runs the loop again, seeded with the answers already given', async () => {
  // Stop, ask to review, then change the architecture and stop again.
  const config = await run(['a', 'r', '', '1', 'a']);
  assert.equal(config.decisions['architecture-style'], 'monolith');
});

test('blank mode asks no decisions at all', async () => {
  const io = createScriptedIo([]);
  const config = await askQuestions({ io, seed, mode: 'blank', basics: false });
  assert.equal(config.mode, 'blank');
  assert.deepEqual(config.decisions, {});
});

test('the wizard can be limited to a subset, for `specframe decide`', async () => {
  const config = await askQuestions({
    io: createScriptedIo(['', '1']),
    seed: { ...seed, decisions: { 'clean-code': 'yes' } },
    mode: 'guided',
    basics: false,
    only: ['tdd'],
  });
  assert.equal(config.decisions.tdd, 'strict', 'the only question asked');
  assert.equal(config.decisions['clean-code'], 'yes', 'existing answers are preserved');
  assert.equal(config.decisions['architecture-style'], undefined, 'out of scope, never asked');
});

test('the summary reports what will be written', async () => {
  const io = createScriptedIo(['d']);
  await askQuestions({ io, seed, mode: 'guided', basics: false });
  const text = io.output.join('\n');
  assert.match(text, /decisions taken/);
  assert.match(text, /ADRs, \d+ rules/);
});
