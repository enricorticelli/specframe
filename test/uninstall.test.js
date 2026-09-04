import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, access, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { planUninstallActions } from '../src/update.js';
import { writeTemplateSet, uninstallTemplateSet, previewUninstallKept } from '../src/writer.js';
import { readManifest } from '../src/manifest.js';

const CONFIG = {
  projectName: 'acme',
  packageManager: 'npm',
  mode: 'blank',
  initDate: '2026-08-17',
  agentTargets: ['claude'],
};

const MANAGED_AGENT = '.claude/agents/bootstrapper.md';
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
      [MANAGED_AGENT]: { sha256: 'x', managed: true },
      [CLAUDE_MD]: { sha256: 'y', managed: false },
    },
  };
  const actions = planUninstallActions({ manifest });
  const byRel = Object.fromEntries(actions.map((a) => [a.relpath, a.action]));
  assert.equal(byRel[MANAGED_AGENT], 'remove');
  assert.equal(byRel[CLAUDE_MD], 'keep');
});

test('planUninstallActions with purge removes user-owned files too', () => {
  const manifest = {
    version: '0.1.0',
    files: {
      [MANAGED_AGENT]: { sha256: 'x', managed: true },
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

test('planUninstallActions with purgePaths removes only the named user-owned files', () => {
  const manifest = {
    version: '0.1.0',
    files: {
      [MANAGED_AGENT]: { sha256: 'x', managed: true },
      [CLAUDE_MD]: { sha256: 'y', managed: false },
      'AGENTS.md': { sha256: 'z', managed: false },
    },
  };
  const actions = planUninstallActions({ manifest, purgePaths: [CLAUDE_MD] });
  const byRel = Object.fromEntries(actions.map((a) => [a.relpath, a.action]));
  assert.equal(byRel[MANAGED_AGENT], 'remove', 'managed files always go');
  assert.equal(byRel[CLAUDE_MD], 'remove', 'named in purgePaths');
  assert.equal(byRel['AGENTS.md'], 'keep', 'not named, so kept');
});

// --- fs behaviour ----------------------------------------------------------

test('uninstall removes managed files and the manifest, leaves user-owned', async () => {
  const dir = await makeRepo();
  try {
    await uninstallTemplateSet({ targetDir: dir });

    assert.equal(await exists(abs(dir, MANAGED_AGENT)), false, 'managed file removed');
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

    assert.equal(await exists(abs(dir, MANAGED_AGENT)), false, 'managed file removed');
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

    assert.equal(await exists(abs(dir, MANAGED_AGENT)), true, 'managed file untouched');
    assert.equal(await exists(abs(dir, '.specframe/manifest.json')), true, 'manifest untouched');
    const manifest = await readManifest(dir);
    assert.equal(manifest.version, '0.1.0', 'manifest intact');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('uninstall with purgePaths removes only the named user-owned files', async () => {
  const dir = await makeRepo();
  try {
    await uninstallTemplateSet({ targetDir: dir, purgePaths: [CLAUDE_MD] });

    assert.equal(await exists(abs(dir, MANAGED_AGENT)), false, 'managed file removed');
    assert.equal(await exists(abs(dir, CLAUDE_MD)), false, 'named user-owned file removed');
    assert.equal(await exists(abs(dir, 'AGENTS.md')), true, 'AGENTS.md kept — not named');
    assert.equal(await exists(abs(dir, 'docs/adr/README.md')), true, 'docs kept — not named');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('previewUninstallKept lists the user-owned files that would be kept', async () => {
  const dir = await makeRepo();
  try {
    const kept = await previewUninstallKept({ targetDir: dir });
    assert.ok(kept.includes(CLAUDE_MD));
    assert.ok(kept.includes('AGENTS.md'));
    assert.ok(!kept.includes(MANAGED_AGENT), 'managed files are not "kept"');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('previewUninstallKept returns null when there is no manifest', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'sf-empty-'));
  try {
    assert.equal(await previewUninstallKept({ targetDir: dir }), null);
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
