import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildInstalledMenu, buildNotInstalledMenu } from '../src/index.js';
import { askMenu, askUninstallPurgeSelection } from '../src/prompts.js';
import { createScriptedIo } from '../src/tui.js';
import { AGENT_TARGET_LIST } from '../src/prompts.js';

const manifestOf = (config, version = '0.2.0') => ({ version, config });

const BASE = {
  projectName: 'acme',
  packageManager: 'npm',
  mode: 'guided',
  initDate: '2026-08-17',
  agentTargets: ['claude'],
  decisions: {},
};

const values = (manifest, version = '0.2.0') =>
  buildInstalledMenu({ manifest, version }).options.map((option) => option.value);

test('a repo with open decisions and none recorded offers decide, not revise', () => {
  const menu = values(manifestOf(BASE));
  assert.deepEqual(menu, [
    'decide',
    'review',
    'agents',
    'agents-remove',
    'update',
    'uninstall',
  ]);
});

test('a repo with no harness configured cannot be asked to remove one', () => {
  const menu = values(manifestOf({ ...BASE, agentTargets: [] }));
  assert.ok(!menu.includes('agents-remove'));
  assert.ok(menu.includes('agents'), 'but it can add the first');
});

test('a repo with recorded decisions offers revise', () => {
  const menu = values(manifestOf({ ...BASE, decisions: { tdd: 'strict' } }));
  assert.ok(menu.includes('revise'));
  assert.ok(menu.includes('decide'), 'and still decide, with the rest of the catalog open');
});

test('nothing left to decide drops the decide row', async () => {
  const { resolvePreset } = await import('../src/decisions/presets.js');
  const menu = values(manifestOf({ ...BASE, decisions: resolvePreset('balanced').answers }));
  assert.ok(!menu.includes('decide'), 'no row for work that does not exist');
  assert.ok(menu.includes('revise'));
});

test('every harness configured drops the agents row', () => {
  const all = AGENT_TARGET_LIST.map((target) => target.value);
  const menu = values(manifestOf({ ...BASE, agentTargets: all }));
  assert.ok(!menu.includes('agents'));
});

test('review, update and uninstall are always offered', () => {
  for (const config of [BASE, { ...BASE, mode: 'blank' }, { ...BASE, agentTargets: [] }]) {
    const menu = values(manifestOf(config));
    for (const value of ['review', 'update', 'uninstall']) {
      assert.ok(menu.includes(value), `${value} missing in ${config.mode}`);
    }
  }
});

test('the state line names the version, the mode and the counts', () => {
  const { preamble } = buildInstalledMenu({
    manifest: manifestOf({ ...BASE, decisions: { tdd: 'strict' } }, '0.1.0'),
    version: '0.2.0',
  });
  assert.match(preamble[0], /specframe 0\.1\.0 is installed here, in guided mode; this CLI is 0\.2\.0\./);
  assert.match(preamble[0], /1 recorded, \d+ open\./);
});

test('a dismissed decision counts as neither recorded nor open', () => {
  const withDismissal = manifestOf({
    ...BASE,
    dismissed: { 'ui-surface': { date: '2026-08-17', reason: 'backend only' } },
  });
  const { preamble } = buildInstalledMenu({ manifest: withDismissal, version: '0.2.0' });
  const open = Number(preamble[0].match(/(\d+) open/)[1]);
  const { preamble: plain } = buildInstalledMenu({ manifest: manifestOf(BASE), version: '0.2.0' });
  const openPlain = Number(plain[0].match(/(\d+) open/)[1]);
  assert.ok(open < openPlain, 'a dismissal leaves the backlog smaller');
});

test('the menu returns the chosen row, and null when quit', async () => {
  const options = [
    { value: 'review', label: 'Review' },
    { value: 'update', label: 'Update' },
  ];
  assert.equal(await askMenu({ title: 't', options, io: createScriptedIo(['2']) }), 'update');
  assert.equal(await askMenu({ title: 't', options, io: createScriptedIo(['q']) }), null);
  // A bare enter has no highlighted row to take when the list is typed at.
  assert.equal(await askMenu({ title: 't', options, io: createScriptedIo(['']) }), null);
});

test('a repo with no manifest offers only onboarding', () => {
  const { options, preamble } = buildNotInstalledMenu({ version: '0.2.0' });
  assert.deepEqual(options.map((o) => o.value), ['init']);
  assert.match(preamble[0], /specframe 0\.2\.0 is not installed here yet\./);
});

test('the uninstall picker removes what is chosen, keeps all on a bare enter, and null on quit', async () => {
  const paths = ['CLAUDE.md', 'AGENTS.md'];
  assert.deepEqual(
    await askUninstallPurgeSelection({ paths, io: createScriptedIo(['1']) }),
    ['CLAUDE.md'],
  );
  assert.deepEqual(await askUninstallPurgeSelection({ paths, io: createScriptedIo(['']) }), []);
  assert.equal(await askUninstallPurgeSelection({ paths, io: createScriptedIo(['q']) }), null);
});
