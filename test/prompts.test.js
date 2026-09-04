import { test } from 'node:test';
import assert from 'node:assert/strict';

import process from 'node:process';

import { askQuestions, askRevision, parseAgentTargets } from '../src/prompts.js';
import { resolvePreset } from '../src/decisions/presets.js';
import { configureTheme, stripAnsi, visibleWidth } from '../src/style.js';
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

test('picking no agent assistant asks to confirm, and a "no" loops back to pick one', async () => {
  const config = await askQuestions({
    io: createScriptedIo([
      '', // project name: accept default
      '', // package manager: accept default (npm)
      '', // agent assistants: nothing marked -> "none"
      'n', // decline "continue with none?" -> re-asks
      '1', // agent assistants, second pass: pick option 1 (claude)
    ]),
    seed: { projectName: 'acme' },
    mode: 'blank',
    basics: true,
  });
  assert.deepEqual(config.agentTargets, ['claude']);
});

test('picking no agent assistant twice, then confirming, proceeds with none', async () => {
  const config = await askQuestions({
    io: createScriptedIo([
      '', // project name
      '', // package manager
      '', // agent assistants: nothing marked
      'y', // confirm "continue with none?"
    ]),
    seed: { projectName: 'acme' },
    mode: 'blank',
    basics: true,
  });
  assert.deepEqual(config.agentTargets, []);
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

test('s is the only way to leave a question unanswered', async () => {
  const config = await run(['', 's', 'a']);
  assert.equal(config.decisions['architecture-style'], undefined);
});

test('x dismisses a single decision, with the typed reason', async () => {
  const config = await run(['', 'x', 'no architecture decisions apply here', 'a']);
  assert.equal(config.decisions['architecture-style'], undefined, 'dismissed, not decided');
  assert.deepEqual(config.dismissed['architecture-style'], { reason: 'no architecture decisions apply here' });
});

test('an empty reason at x records null, not a placeholder string', async () => {
  const config = await run(['', 'x', '', 'a']);
  assert.equal(config.dismissed['architecture-style'].reason, null);
});

test('x at a section gate dismisses every decision in it, with one shared reason', async () => {
  const config = await run(['x', 'backend-only service', 'a']);
  for (const id of ['architecture-style', 'inter-component-comm', 'api-style']) {
    assert.deepEqual(config.dismissed[id], { reason: 'backend-only service' }, `${id} was dismissed`);
    assert.equal(config.decisions[id], undefined);
  }
  // The next section was reached and closed with 'a', proving the dismissed
  // section was not re-asked question by question.
  assert.equal(config.decisions.layering, undefined);
});

test('enter takes the recommended option, because that is what enter means', async () => {
  const config = await run(['', '', 'a']);
  assert.equal(
    config.decisions['architecture-style'],
    'modular-monolith',
    'the option marked ★ recommended',
  );
});

test('enter through the whole catalog records it, rather than reaching the end empty', async () => {
  // The failure this prevents: someone presses enter forty times, believing they
  // are taking the defaults, and arrives at the summary with nothing decided.
  const io = createScriptedIo(Array.from({ length: 120 }, () => ''));
  const config = await askQuestions({ io, seed, mode: 'guided', basics: false });
  assert.deepEqual(config.decisions, resolvePreset('balanced').answers);
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

// --- review -----------------------------------------------------------------

test('review changes one answer by its row number, without another pass', async () => {
  // Stop, review, change row 1, take its first option, back, write.
  const config = await run(['a', 'r', '1', '1', '', '']);
  assert.equal(config.decisions['architecture-style'], 'monolith');
});

test('review can still walk every section again', async () => {
  const config = await run(['a', 'r', 'w', '', '1', 'a']);
  assert.equal(config.decisions['architecture-style'], 'monolith');
});

test('review answers only what is open when asked to', async () => {
  const config = await run(['a', 'r', 'o', '', '1', 'a']);
  assert.equal(config.decisions['architecture-style'], 'monolith');
});

test('review shows every decision that applies, open ones included', async () => {
  const io = createScriptedIo(['a', 'r', '', '']);
  await askQuestions({ io, seed, mode: 'guided', basics: false });
  const text = io.output.join('\n');
  assert.match(text, /Architecture/, 'sections are named');
  assert.match(text, /Architecture style/, 'decisions are listed by title');
  assert.match(text, /not decided/, 'an unanswered decision says so');
});

test('review reports a row that does not exist rather than guessing', async () => {
  const io = createScriptedIo(['a', 'r', '999', '', '']);
  await askQuestions({ io, seed, mode: 'guided', basics: false });
  assert.ok(io.output.some((line) => /no row 999/.test(line)), 'the reason was shown');
});

test('a taken decision shows in the table with its ADR number', async () => {
  const io = createScriptedIo(['d', 'r', '', '']);
  await askQuestions({ io, seed, mode: 'guided', basics: false });
  const text = io.output.join('\n');
  assert.match(text, /ADR-0100|0100/, 'the ADR the decision produces');
});

// --- keeping and reopening --------------------------------------------------

test('enter keeps an answer already given instead of discarding it', async () => {
  // Answer, go back to the same question, press enter: the answer survives.
  const config = await run(['', '1', 'b', '', 'a']);
  assert.equal(config.decisions['architecture-style'], 'monolith');
});

test('s reopens a decision already answered', async () => {
  const config = await run(['', '1', 'b', 's', 'a']);
  assert.equal(config.decisions['architecture-style'], undefined);
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

test('a decision outside this run cannot be re-answered from the review table', async () => {
  // `specframe decide` reopens only what is still open. Row 1 here is a decision
  // already recorded, so the table refuses it and points at its ADR.
  const io = createScriptedIo(['a', 'r', '1', '', '']);
  const config = await askQuestions({
    io,
    seed: { ...seed, decisions: { 'architecture-style': 'monolith' } },
    mode: 'guided',
    basics: false,
    only: ['tdd'],
  });
  const text = io.output.join('\n');
  assert.match(text, /already recorded/);
  assert.match(text, /docs\/adr\/0100-architecture-style\.md/, 'and how to supersede it');
  assert.equal(config.decisions['architecture-style'], 'monolith', 'left untouched');
});

test('the prompt names the option enter will take', async () => {
  // The bug this guards: an unnamed default. If enter is going to answer, the
  // line above the cursor has to say what it is answering with.
  const io = createScriptedIo(['', '', 'a']);
  await askQuestions({ io, seed, mode: 'guided', basics: false });
  const text = io.output.join('\n');
  assert.match(text, /\[enter\] Modular monolith/, 'the recommended option, by name');
  assert.match(text, /\[s\] leave it open/, 'and how to not answer');
  assert.match(text, /recommended/, 'the echo says the answer came from the recommendation');
});

test('nothing the wizard prints is wider than the terminal', async () => {
  // Colour on, because every width here is measured with escape sequences in the
  // string: a padding bug shows up as a torn table only when styling is live.
  const columns = Object.getOwnPropertyDescriptor(process.stdout, 'columns');
  try {
    for (const limit of [60, 80]) {
      Object.defineProperty(process.stdout, 'columns', { value: limit, configurable: true });
      configureTheme({ color: true, unicode: true });

      const io = createScriptedIo(
        // Mostly enter, an occasional `s`, then a look at the review table: enough
        // to print every screen the wizard has.
        [...Array.from({ length: 60 }, (_, i) => (i % 7 === 3 ? 's' : '')), 'r', '', ''],
      );
      await askQuestions({ io, seed, mode: 'guided', basics: false, version: '9.9.9' });

      const wide = io.output
        .flatMap((entry) => String(entry).split('\n'))
        .filter((line) => visibleWidth(line) > limit);
      assert.deepEqual(wide.map(stripAnsi), [], `lines wider than ${limit} columns`);
    }
  } finally {
    configureTheme({ color: false, unicode: false });
    if (columns) Object.defineProperty(process.stdout, 'columns', columns);
  }
});

// --- revising what is already recorded --------------------------------------

const RECORDED = { 'architecture-style': 'modular-monolith', tdd: 'strict' };

const revise = (lines, options = {}) =>
  askRevision({ io: createScriptedIo(lines), decisions: RECORDED, ...options });

test('revising opens the table first, and every row is editable', async () => {
  // Row 1 is a recorded decision — in `decide` it would be refused, here it is
  // the whole point of the command.
  const io = createScriptedIo(['1', '1', '', '']);
  const answers = await askRevision({ io, decisions: RECORDED });
  assert.equal(answers['architecture-style'], 'monolith', 'changed by row number');
  assert.equal(answers.tdd, 'strict', 'everything else is left alone');
  assert.doesNotMatch(io.output.join('\n'), /already recorded/);
});

test('the confirmation is a before/after table', async () => {
  const io = createScriptedIo(['1', '1', '', '']);
  await askRevision({ io, decisions: RECORDED });
  const text = io.output.join('\n');
  assert.match(text, /Modular monolith/, 'what it was');
  assert.match(text, /Monolith/, 'what it becomes');
  assert.match(text, /write 1 revision/);
});

test('a revision that changes nothing says so and offers no write', async () => {
  const io = createScriptedIo(['', 'q']);
  assert.equal(await askRevision({ io, decisions: RECORDED }), null);
  assert.match(io.output.join('\n'), /Nothing changed/);
});

test('quitting the revision returns nothing, so the caller writes nothing', async () => {
  assert.equal(await revise(['q']), null, 'from the table');
  assert.equal(await revise(['1', '1', '', 'q']), null, 'from the confirmation');
});

test('a target opens that decision straight away', async () => {
  const io = createScriptedIo(['2', '', '']);
  const answers = await askRevision({ io, decisions: RECORDED, target: 'tdd' });
  assert.equal(answers.tdd, 'pragmatic', 'the second option of the targeted decision');
  assert.match(io.output.join('\n'), /Revising tdd/);
});

test('a target that does not apply here is refused rather than guessed at', async () => {
  // Contract testing is gated on a distributed architecture; this repo is a
  // modular monolith, so the question does not exist to revise.
  const io = createScriptedIo(['']);
  assert.equal(await askRevision({ io, decisions: RECORDED, target: 'contract-testing' }), null);
  assert.match(io.output.join('\n'), /does not apply/);
});

test('the summary reports what will be written', async () => {
  const io = createScriptedIo(['d']);
  await askQuestions({ io, seed, mode: 'guided', basics: false });
  const text = io.output.join('\n');
  assert.match(text, /decisions taken/);
  assert.match(text, /ADRs, \d+ rules/);
});
