import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { run } from '../src/index.js';
import { readManifest } from '../src/manifest.js';

// The full CLI surface for `dismiss`/`restore`, driven through `run()` exactly
// as the binary is, rather than through the lower-level writer functions —
// this is what exercises the guards that live in index.js itself: refusing an
// already-decided or gated-off id, the --group blast-radius confirmation, and
// `--set` refusing a dismissed decision.

async function initRepo() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'sf-dismiss-cli-'));
  const cwd = process.cwd();
  process.chdir(dir);
  try {
    await run(['init', '--mode', 'blank', '--yes']);
  } finally {
    process.chdir(cwd);
  }
  return dir;
}

// Runs `run(argv)` with cwd set to `dir` for the duration of the call, always
// restoring cwd afterward even if `run` throws.
async function runIn(dir, argv) {
  const cwd = process.cwd();
  process.chdir(dir);
  try {
    return await run(argv);
  } finally {
    process.chdir(cwd);
  }
}

test('dismiss writes no ADR and records the reason in the manifest', async () => {
  const dir = await initRepo();
  try {
    await runIn(dir, ['dismiss', 'event-sourcing', '--reason', 'plain CRUD app']);

    const manifest = await readManifest(dir);
    assert.deepEqual(manifest.config.dismissed['event-sourcing'], {
      date: manifest.config.dismissed['event-sourcing'].date,
      reason: 'plain CRUD app',
    });
    assert.equal(manifest.config.mode, 'blank', 'dismissing does not switch the repo to guided mode');

    const decisionsMd = await readFile(path.join(dir, 'docs/DECISIONS.md'), 'utf8');
    assert.match(decisionsMd, /## Decisions that do not apply/);
    assert.match(decisionsMd, /plain CRUD app/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('dismiss refuses an already-decided decision, pointing at revise', async () => {
  const dir = await initRepo();
  try {
    await runIn(dir, ['decide', '--set', 'tdd=strict', '--yes']);
    await assert.rejects(runIn(dir, ['dismiss', 'tdd']), /already recorded.*specframe revise/s);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('dismiss refuses a decision an earlier answer has already gated off', async () => {
  const dir = await initRepo();
  try {
    await runIn(dir, ['decide', '--set', 'architecture-style=modular-monolith']);
    await assert.rejects(runIn(dir, ['dismiss', 'contract-testing']), /does not apply to this configuration/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('dismiss --group off a terminal requires --yes', async () => {
  const dir = await initRepo();
  try {
    await assert.rejects(runIn(dir, ['dismiss', '--group', 'frontend']), /Pass --yes to confirm/);
    await runIn(dir, ['dismiss', '--group', 'frontend', '--reason', 'no UI here', '--yes']);

    const manifest = await readManifest(dir);
    assert.ok(Object.keys(manifest.config.dismissed).length >= 9, 'the whole section was dismissed');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('decide --yes never fills in a dismissed decision', async () => {
  const dir = await initRepo();
  try {
    await runIn(dir, ['dismiss', 'tdd', '--reason', 'n/a']);
    await runIn(dir, ['decide', '--yes']);

    const manifest = await readManifest(dir);
    assert.equal(manifest.config.decisions.tdd, undefined, 'still not answered');
    assert.ok(manifest.config.dismissed.tdd, 'still dismissed');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('decide --set on a dismissed decision is ignored, not silently recorded', async () => {
  const dir = await initRepo();
  try {
    await runIn(dir, ['dismiss', 'event-sourcing', '--reason', 'n/a']);
    await runIn(dir, ['decide', '--set', 'event-sourcing=yes', '--yes']);

    const manifest = await readManifest(dir);
    assert.equal(manifest.config.decisions['event-sourcing'], undefined);
    assert.ok(manifest.config.dismissed['event-sourcing'], 'the dismissal survives untouched');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('restore returns a dismissed decision to the open backlog', async () => {
  const dir = await initRepo();
  try {
    await runIn(dir, ['dismiss', 'event-sourcing', '--reason', 'n/a']);
    await runIn(dir, ['restore', 'event-sourcing']);

    const manifest = await readManifest(dir);
    assert.equal(manifest.config.dismissed['event-sourcing'], undefined);

    const decisionsMd = await readFile(path.join(dir, 'docs/DECISIONS.md'), 'utf8');
    assert.match(decisionsMd, /Event sourcing/);
    assert.doesNotMatch(
      decisionsMd.slice(decisionsMd.indexOf('## Decisions that do not apply')),
      /Event sourcing/,
      'gone from the dismissed section',
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('restore refuses a decision that was never dismissed', async () => {
  const dir = await initRepo();
  try {
    await assert.rejects(runIn(dir, ['restore', 'tdd']), /Not dismissed, so nothing to restore/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('dismiss --json reports the plan without console prose', async () => {
  const dir = await initRepo();
  const originalLog = console.log;
  const lines = [];
  try {
    console.log = (line) => lines.push(line);
    await runIn(dir, ['dismiss', 'event-sourcing', '--reason', 'n/a', '--json']);
  } finally {
    console.log = originalLog;
    await rm(dir, { recursive: true, force: true });
  }
  const json = JSON.parse(lines.join('\n'));
  assert.deepEqual(json.dismissed, ['event-sourcing']);
  assert.equal(json.reason, 'n/a');
  assert.ok(json.files.some((f) => f.relpath === 'docs/DECISIONS.md'));
});
