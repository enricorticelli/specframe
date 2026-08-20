import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseArgs } from '../src/index.js';

test('the default command is init', () => {
  assert.equal(parseArgs([]).command, 'init');
  assert.equal(parseArgs(['-n']).command, 'init', 'a leading flag is not a command');
});

test('commands are recognised', () => {
  for (const command of ['init', 'decide', 'update', 'uninstall', 'help']) {
    assert.equal(parseArgs([command]).command, command);
  }
});

test('boolean flags parse in short and long form', () => {
  const { flags } = parseArgs(['update', '-f', '--dry-run', '--purge', '-y', '--detected']);
  assert.equal(flags.force, true);
  assert.equal(flags.dryRun, true);
  assert.equal(flags.purge, true);
  assert.equal(flags.yes, true);
  assert.equal(flags.detected, true);
});

test('--detected defaults to off, so an ADR is a fresh choice unless said otherwise', () => {
  assert.equal(parseArgs(['decide', '--set', 'tdd=strict']).flags.detected, false);
});

test('value flags accept both --flag value and --flag=value', () => {
  assert.equal(parseArgs(['--preset', 'strict']).flags.preset, 'strict');
  assert.equal(parseArgs(['--preset=strict']).flags.preset, 'strict');
  assert.equal(parseArgs(['--mode=blank']).flags.mode, 'blank');
  assert.equal(parseArgs(['--agents', 'claude,codex']).flags.agents, 'claude,codex');
  assert.equal(parseArgs(['--name', 'my repo']).flags.name, 'my repo');
});

test('--set accumulates so a preset can be adjusted one flag at a time', () => {
  const { flags } = parseArgs(['--preset=balanced', '--set', 'tdd=strict', '--set', 'cqrs=full']);
  assert.equal(flags.set, 'tdd=strict,cqrs=full');
});

test('a value flag with no value is an error, not a silent undefined', () => {
  assert.throws(() => parseArgs(['--preset']), /--preset requires a value/);
});

test('an unknown option is rejected rather than ignored', () => {
  assert.throws(() => parseArgs(['--prest=strict']), /Unknown option: --prest/);
});

test('the command is taken from the first bare argument only', () => {
  const { command, flags } = parseArgs(['decide', '--set', 'tdd=strict', 'extra']);
  assert.equal(command, 'decide');
  assert.equal(flags.set, 'tdd=strict');
});

test('a second bare argument is the command subject, and a third cannot override it', () => {
  assert.equal(parseArgs(['revise', 'architecture-style']).flags.target, 'architecture-style');
  assert.equal(parseArgs(['revise']).flags.target, undefined);
  assert.equal(
    parseArgs(['revise', 'tdd', 'coverage-gate']).flags.target,
    'tdd',
    'the first subject wins',
  );
  assert.equal(
    parseArgs(['revise', '--dry-run', 'tdd']).flags.target,
    'tdd',
    'a flag in between does not consume it',
  );
});

test('--json is a plain boolean flag', () => {
  assert.equal(parseArgs(['review']).flags.json, false);
  assert.equal(parseArgs(['review', '--json']).flags.json, true);
  assert.equal(parseArgs(['explain', 'tdd', '--json']).flags.json, true);
});

test('--title accepts both --flag value and --flag=value', () => {
  assert.equal(parseArgs(['adr', 'new', 'x', '--title', 'My title']).flags.title, 'My title');
  assert.equal(parseArgs(['adr', 'new', 'x', '--title=My title']).flags.title, 'My title');
});

test('explain takes its decision id as the command subject', () => {
  assert.equal(parseArgs(['explain', 'architecture-style']).command, 'explain');
  assert.equal(parseArgs(['explain', 'architecture-style']).flags.target, 'architecture-style');
});

test('`adr new <slug>` fills target and target2 in order', () => {
  const { command, flags } = parseArgs(['adr', 'new', 'payments-provider', '--title', 'Payment provider']);
  assert.equal(command, 'adr');
  assert.equal(flags.target, 'new');
  assert.equal(flags.target2, 'payments-provider');
  assert.equal(flags.title, 'Payment provider');
});
