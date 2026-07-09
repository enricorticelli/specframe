import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { findRepoRoot, isGitRepoRoot } from '../src/repo.js';

async function makeDir() {
  return mkdtemp(path.join(os.tmpdir(), 'sf-repo-'));
}

test('findRepoRoot returns the dir containing .git', async () => {
  const dir = await makeDir();
  try {
    await mkdir(path.join(dir, '.git'));
    assert.equal(await findRepoRoot(dir), dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('findRepoRoot walks up from a subdirectory to the repo root', async () => {
  const dir = await makeDir();
  try {
    await mkdir(path.join(dir, '.git'));
    await mkdir(path.join(dir, 'packages', 'web', 'src'), { recursive: true });
    const sub = path.join(dir, 'packages', 'web', 'src');
    assert.equal(await findRepoRoot(sub), dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('findRepoRoot finds a dir with an existing manifest when no .git', async () => {
  const dir = await makeDir();
  try {
    await mkdir(path.join(dir, '.specframe'), { recursive: true });
    await writeFile(path.join(dir, '.specframe', 'manifest.json'), '{}', 'utf8');
    await mkdir(path.join(dir, 'deep', 'nested'), { recursive: true });
    assert.equal(await findRepoRoot(path.join(dir, 'deep', 'nested')), dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('findRepoRoot prefers the nearest .git over a deeper manifest', async () => {
  // outer repo has .git; inner has a manifest but no .git → should stop at outer.
  const dir = await makeDir();
  try {
    await mkdir(path.join(dir, '.git'));
    await mkdir(path.join(dir, 'sub', '.specframe'), { recursive: true });
    await writeFile(path.join(dir, 'sub', '.specframe', 'manifest.json'), '{}', 'utf8');
    assert.equal(await findRepoRoot(path.join(dir, 'sub')), dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('findRepoRoot returns null when no repo markers are found', async () => {
  const dir = await makeDir();
  try {
    assert.equal(await findRepoRoot(dir), null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('isGitRepoRoot is true only when .git is present', async () => {
  const dir = await makeDir();
  try {
    assert.equal(await isGitRepoRoot(dir), false);
    await mkdir(path.join(dir, '.git'));
    assert.equal(await isGitRepoRoot(dir), true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
