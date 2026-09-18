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

// The one root-level file specframe still writes, and so the only one the
// legacy-overwrite question can ever be about.
const PR_TEMPLATE = path.join('.github', 'pull_request_template.md');

async function makeEmptyRepo() {
  return mkdtemp(path.join(os.tmpdir(), 'specframe-legacy-'));
}

// --- findExistingRootFiles ---------------------------------------------------

test('findExistingRootFiles reports nothing in an empty repo', async () => {
  const dir = await makeEmptyRepo();
  assert.deepEqual(await findExistingRootFiles(dir), []);
});

test('findExistingRootFiles finds a legacy root file specframe would write', async () => {
  const dir = await makeEmptyRepo();
  await mkdir(path.join(dir, '.github'), { recursive: true });
  await writeFile(path.join(dir, '.github', 'pull_request_template.md'), 'legacy\n', 'utf8');

  assert.deepEqual(await findExistingRootFiles(dir), ['.github/pull_request_template.md']);
});

test('a file specframe never writes is not reported, however agent-shaped', async () => {
  // specframe stopped scaffolding context files; a repository's own AGENTS.md or
  // CLAUDE.md is nothing to do with it and must not be offered for overwriting.
  const dir = await makeEmptyRepo();
  await writeFile(path.join(dir, 'AGENTS.md'), '# my own agents file\n', 'utf8');
  await writeFile(path.join(dir, 'CLAUDE.md'), '# my own claude file\n', 'utf8');

  assert.deepEqual(await findExistingRootFiles(dir), []);
});

// --- writeTemplateSet + overwrite --------------------------------------------

test('writeTemplateSet keeps a pre-existing legacy file by default', async () => {
  const dir = await makeEmptyRepo();
  await mkdir(path.join(dir, '.github'), { recursive: true });
  await writeFile(path.join(dir, PR_TEMPLATE), 'legacy content\n', 'utf8');

  await writeTemplateSet({ targetDir: dir, ...CONFIG, version: '0.1.0' });

  assert.equal(await readFile(path.join(dir, PR_TEMPLATE), 'utf8'), 'legacy content\n');

  const manifest = await readManifest(dir);
  assert.equal(
    manifest.files['.github/pull_request_template.md'].sha256,
    undefined,
    'no hash recorded for a file specframe did not write',
  );
});

test('writeTemplateSet overwrites a pre-existing legacy file named in `overwrite`', async () => {
  const dir = await makeEmptyRepo();
  await mkdir(path.join(dir, '.github'), { recursive: true });
  await writeFile(path.join(dir, PR_TEMPLATE), 'legacy content\n', 'utf8');
  await writeFile(path.join(dir, 'docs-own.md'), 'mine\n', 'utf8');

  await writeTemplateSet({
    targetDir: dir,
    ...CONFIG,
    version: '0.1.0',
    overwrite: new Set(['.github/pull_request_template.md']),
  });

  const written = await readFile(path.join(dir, PR_TEMPLATE), 'utf8');
  assert.notEqual(written, 'legacy content\n', 'it should be replaced with the template');
  assert.equal(await readFile(path.join(dir, 'docs-own.md'), 'utf8'), 'mine\n', 'a file outside the plan is untouched');

  const manifest = await readManifest(dir);
  assert.ok(manifest.files['.github/pull_request_template.md'].sha256, 'the new content is now tracked by the manifest');
});

test('a missing file is created whether or not it is named in `overwrite`', async () => {
  const dir = await makeEmptyRepo();
  await writeTemplateSet({
    targetDir: dir,
    ...CONFIG,
    version: '0.1.0',
    overwrite: new Set(['.github/pull_request_template.md']),
  });
  assert.ok((await readFile(path.join(dir, PR_TEMPLATE), 'utf8')).length > 0);
});
