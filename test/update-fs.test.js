import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, access } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { writeTemplateSet, updateTemplateSet } from '../src/writer.js';
import { readManifest } from '../src/manifest.js';

const CONFIG = {
  projectName: 'acme',
  packageManager: 'npm',
  contentProfile: 'empty',
  agentTargets: ['claude'],
};

const EXPLORER = '.claude/agents/explorer.md';
const CLAUDE_MD = 'CLAUDE.md';

async function makeRepo() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'specframe-'));
  await writeTemplateSet({ targetDir: dir, ...CONFIG, version: '0.1.0' });
  return dir;
}

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

const abs = (dir, rel) => path.join(dir, ...rel.split('/'));

test('init writes a manifest capturing version and config', async () => {
  const dir = await makeRepo();
  try {
    const manifest = await readManifest(dir);
    assert.equal(manifest.version, '0.1.0');
    assert.deepEqual(manifest.config, CONFIG);
    assert.ok(manifest.files[EXPLORER].managed, 'explorer is managed');
    assert.equal(manifest.files[CLAUDE_MD].managed, false, 'CLAUDE.md is user-owned');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('update recreates a deleted managed file', async () => {
  const dir = await makeRepo();
  try {
    await rm(abs(dir, EXPLORER));
    await updateTemplateSet({ targetDir: dir, ...CONFIG, version: '0.2.0' });
    assert.ok(await exists(abs(dir, EXPLORER)), 'explorer should be restored');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('update never clobbers a user-edited user-owned file', async () => {
  const dir = await makeRepo();
  try {
    await writeFile(abs(dir, CLAUDE_MD), 'months of my own work', 'utf8');
    await updateTemplateSet({ targetDir: dir, ...CONFIG, version: '0.2.0' });
    assert.equal(await readFile(abs(dir, CLAUDE_MD), 'utf8'), 'months of my own work');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('update writes a .specframe-new beside a user-edited managed file', async () => {
  const dir = await makeRepo();
  try {
    await writeFile(abs(dir, EXPLORER), 'hand-edited agent', 'utf8');
    await updateTemplateSet({ targetDir: dir, ...CONFIG, version: '0.2.0' });

    assert.equal(await readFile(abs(dir, EXPLORER), 'utf8'), 'hand-edited agent', 'original kept');
    assert.ok(await exists(`${abs(dir, EXPLORER)}.specframe-new`), '.specframe-new written');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('update --force overwrites a user-edited managed file', async () => {
  const dir = await makeRepo();
  try {
    await writeFile(abs(dir, EXPLORER), 'hand-edited agent', 'utf8');
    await updateTemplateSet({ targetDir: dir, ...CONFIG, version: '0.2.0', force: true });
    assert.notEqual(await readFile(abs(dir, EXPLORER), 'utf8'), 'hand-edited agent');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('update bumps the manifest version', async () => {
  const dir = await makeRepo();
  try {
    await updateTemplateSet({ targetDir: dir, ...CONFIG, version: '0.2.0' });
    assert.equal((await readManifest(dir)).version, '0.2.0');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('update --dry-run changes nothing on disk', async () => {
  const dir = await makeRepo();
  try {
    await rm(abs(dir, EXPLORER));
    await updateTemplateSet({ targetDir: dir, ...CONFIG, version: '0.2.0', dryRun: true });
    assert.equal(await exists(abs(dir, EXPLORER)), false, 'no writes in dry-run');
    assert.equal((await readManifest(dir)).version, '0.1.0', 'manifest untouched');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
