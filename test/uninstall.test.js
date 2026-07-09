import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, access, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { planUninstallActions } from '../src/update.js';
import { writeTemplateSet, uninstallTemplateSet } from '../src/writer.js';
import { readManifest } from '../src/manifest.js';

const CONFIG = {
  projectName: 'acme',
  packageManager: 'npm',
  contentProfile: 'empty',
  agentTargets: ['claude'],
};

const EXPLORER = '.claude/agents/explorer.md';
const CLAUDE_MD = 'CLAUDE.md';

const abs = (dir, rel) => path.join(dir, ...rel.split('/'));

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function makeRepo() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'sf-uninstall-'));
  await writeTemplateSet({ targetDir: dir, ...CONFIG, version: '0.1.0' });
  return dir;
}

// --- pure planning ---------------------------------------------------------

test('planUninstallActions removes only managed files by default', () => {
  const manifest = {
    version: '0.1.0',
    files: {
      [EXPLORER]: { sha256: 'x', managed: true },
      [CLAUDE_MD]: { sha256: 'y', managed: false },
    },
  };
  const actions = planUninstallActions({ manifest });
  const byRel = Object.fromEntries(actions.map((a) => [a.relpath, a.action]));
  assert.equal(byRel[EXPLORER], 'remove');
  assert.equal(byRel[CLAUDE_MD], 'keep');
});

test('planUninstallActions with purge removes user-owned files too', () => {
  const manifest = {
    version: '0.1.0',
    files: {
      [EXPLORER]: { sha256: 'x', managed: true },
      [CLAUDE_MD]: { sha256: 'y', managed: false },
    },
  };
  const actions = planUninstallActions({ manifest, purge: true });
  assert.ok(actions.every((a) => a.action === 'remove'));
});

test('planUninstallActions returns [] when there is no manifest', () => {
  assert.deepEqual(planUninstallActions({ manifest: null }), []);
  assert.deepEqual(planUninstallActions({ manifest: { files: {} } }), []);
});

// --- fs behaviour ----------------------------------------------------------

test('uninstall removes managed files and the manifest, leaves user-owned', async () => {
  const dir = await makeRepo();
  try {
    await uninstallTemplateSet({ targetDir: dir });

    assert.equal(await exists(abs(dir, EXPLORER)), false, 'managed file removed');
    assert.equal(await exists(abs(dir, '.specframe/manifest.json')), false, 'manifest removed');
    assert.equal(await exists(abs(dir, CLAUDE_MD)), true, 'user-owned file kept');
    assert.equal(await exists(abs(dir, 'AGENTS.md')), true, 'AGENTS.md kept');
    assert.equal(await exists(abs(dir, 'docs/adr/README.md')), true, 'docs kept');
    // managed scaffolding dirs are pruned when empty
    assert.equal(await exists(abs(dir, '.claude')), false, '.claude pruned');
    assert.equal(await exists(abs(dir, '.specframe')), false, '.specframe pruned');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('uninstall --purge removes everything including user-owned files', async () => {
  const dir = await makeRepo();
  try {
    await uninstallTemplateSet({ targetDir: dir, purge: true });

    assert.equal(await exists(abs(dir, EXPLORER)), false, 'managed file removed');
    assert.equal(await exists(abs(dir, CLAUDE_MD)), false, 'user-owned file removed');
    assert.equal(await exists(abs(dir, 'AGENTS.md')), false, 'AGENTS.md removed');
    assert.equal(await exists(abs(dir, 'docs')), false, 'docs dir pruned');
    assert.equal(await exists(abs(dir, '.specframe/manifest.json')), false, 'manifest removed');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('uninstall --dry-run removes nothing', async () => {
  const dir = await makeRepo();
  try {
    await uninstallTemplateSet({ targetDir: dir, dryRun: true });

    assert.equal(await exists(abs(dir, EXPLORER)), true, 'managed file untouched');
    assert.equal(await exists(abs(dir, '.specframe/manifest.json')), true, 'manifest untouched');
    const manifest = await readManifest(dir);
    assert.equal(manifest.version, '0.1.0', 'manifest intact');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('uninstall throws when there is no manifest', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'sf-empty-'));
  try {
    await assert.rejects(() => uninstallTemplateSet({ targetDir: dir }), /No .specframe/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('uninstall prunes only empty dirs, never touches targetDir', async () => {
  const dir = await makeRepo();
  try {
    // drop a user file inside docs/adr so that dir must survive
    await import('node:fs/promises').then((fs) =>
      fs.writeFile(abs(dir, 'docs/adr/0001-real.md'), 'mine', 'utf8'),
    );
    await uninstallTemplateSet({ targetDir: dir, purge: false });

    assert.equal(await exists(abs(dir, 'docs/adr/0001-real.md')), true, 'user file survives');
    assert.equal(await exists(abs(dir, 'docs/adr')), true, 'non-empty dir survives');
    assert.equal(await exists(dir), true, 'targetDir never removed');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
