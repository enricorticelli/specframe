import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { findExistingRootFiles, writeTemplateSet } from '../src/writer.js';
import { readManifest } from '../src/manifest.js';

const CONFIG = {
  projectName: 'acme',
  packageManager: 'npm',
  mode: 'blank',
  initDate: '2026-08-17',
  agentTargets: [],
};

async function makeEmptyRepo() {
  return mkdtemp(path.join(os.tmpdir(), 'specframe-legacy-'));
}

// --- findExistingRootFiles ---------------------------------------------------

test('findExistingRootFiles reports nothing in an empty repo', async () => {
  const dir = await makeEmptyRepo();
  assert.deepEqual(await findExistingRootFiles(dir), []);
});

test('findExistingRootFiles finds a legacy AGENTS.md and CLAUDE.md', async () => {
  const dir = await makeEmptyRepo();
  await writeFile(path.join(dir, 'AGENTS.md'), '# my own agents file\n', 'utf8');
  await writeFile(path.join(dir, 'CLAUDE.md'), '# my own claude file\n', 'utf8');

  const found = await findExistingRootFiles(dir);
  assert.ok(found.includes('AGENTS.md'));
  assert.ok(found.includes('CLAUDE.md'));
  assert.equal(found.length, 2);
});

test('findExistingRootFiles finds a legacy .github template too', async () => {
  const dir = await makeEmptyRepo();
  await mkdir(path.join(dir, '.github'), { recursive: true });
  await writeFile(path.join(dir, '.github', 'copilot-instructions.md'), 'legacy\n', 'utf8');

  assert.deepEqual(await findExistingRootFiles(dir), ['.github/copilot-instructions.md']);
});

// --- writeTemplateSet + overwrite --------------------------------------------

test('writeTemplateSet keeps a pre-existing legacy file by default', async () => {
  const dir = await makeEmptyRepo();
  await writeFile(path.join(dir, 'CLAUDE.md'), 'legacy content\n', 'utf8');

  await writeTemplateSet({ targetDir: dir, ...CONFIG, version: '0.1.0' });

  assert.equal(await readFile(path.join(dir, 'CLAUDE.md'), 'utf8'), 'legacy content\n');

  const manifest = await readManifest(dir);
  assert.equal(manifest.files['CLAUDE.md'].sha256, undefined, 'no hash recorded for a file specframe did not write');
});

test('writeTemplateSet overwrites a pre-existing legacy file named in `overwrite`', async () => {
  const dir = await makeEmptyRepo();
  await writeFile(path.join(dir, 'CLAUDE.md'), 'legacy content\n', 'utf8');
  await writeFile(path.join(dir, 'AGENTS.md'), 'legacy agents\n', 'utf8');

  await writeTemplateSet({
    targetDir: dir,
    ...CONFIG,
    version: '0.1.0',
    overwrite: new Set(['CLAUDE.md']),
  });

  const claude = await readFile(path.join(dir, 'CLAUDE.md'), 'utf8');
  assert.notEqual(claude, 'legacy content\n', 'CLAUDE.md should be replaced with the template');
  assert.equal(await readFile(path.join(dir, 'AGENTS.md'), 'utf8'), 'legacy agents\n', 'AGENTS.md was not named — left alone');

  const manifest = await readManifest(dir);
  assert.ok(manifest.files['CLAUDE.md'].sha256, 'the new content is now tracked by the manifest');
  assert.equal(manifest.files['AGENTS.md'].sha256, undefined);
});

test('a missing file is created whether or not it is named in `overwrite`', async () => {
  const dir = await makeEmptyRepo();
  await writeTemplateSet({ targetDir: dir, ...CONFIG, version: '0.1.0', overwrite: new Set(['CLAUDE.md']) });
  assert.ok((await readFile(path.join(dir, 'CLAUDE.md'), 'utf8')).length > 0);
});
