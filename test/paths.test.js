import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { repoPath } from '../src/paths.js';
import { readManifest } from '../src/manifest.js';
import { uninstallTemplateSet, writeTemplateSet } from '../src/writer.js';

test('repository paths reject traversal and absolute paths on every platform', () => {
  for (const key of ['../outside.txt', 'docs/../../outside.txt', '/tmp/outside.txt',
    'C:/outside.txt', 'C:outside.txt', '..\\outside.txt', 'docs//file', '.', '', 'a\0b']) {
    assert.throws(() => repoPath('/tmp/repo', key), /Unsafe repository path/);
  }
  assert.equal(repoPath('/tmp/repo', 'docs/adr/0100-design.md'), '/tmp/repo/docs/adr/0100-design.md');
});

for (const escape of ['traversal', 'directory symlink', 'file symlink']) {
  test(`uninstall rejects ${escape} before deleting any file`, async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'sf-paths-'));
    const repo = path.join(dir, 'repo');
    try {
      await mkdir(path.join(repo, '.specframe'), { recursive: true });
      await writeFile(path.join(dir, 'outside.txt'), 'outside');
      await writeFile(path.join(repo, 'owned.txt'), 'owned');
      let key = '../outside.txt';
      if (escape === 'directory symlink') {
        await symlink(dir, path.join(repo, 'linked'), 'dir');
        key = 'linked/outside.txt';
      } else if (escape === 'file symlink') {
        await symlink(path.join(dir, 'outside.txt'), path.join(repo, 'linked.txt'));
        key = 'linked.txt';
      }
      const manifest = { files: { 'owned.txt': { managed: true }, [key]: { managed: true } } };
      const manifestPath = path.join(repo, '.specframe/manifest.json');
      await writeFile(manifestPath, JSON.stringify(manifest));
      await assert.rejects(uninstallTemplateSet({ targetDir: repo }), /Unsafe repository path/);
      assert.equal(await readFile(path.join(dir, 'outside.txt'), 'utf8'), 'outside');
      assert.equal(await readFile(path.join(repo, 'owned.txt'), 'utf8'), 'owned');
      assert.deepEqual(JSON.parse(await readFile(manifestPath, 'utf8')), manifest);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
}

test('init refuses to scaffold through an external directory symlink', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'sf-paths-'));
  const repo = path.join(dir, 'repo');
  const outside = path.join(dir, 'outside');
  try {
    await mkdir(repo);
    await mkdir(outside);
    await symlink(outside, path.join(repo, 'docs'), 'dir');
    await assert.rejects(writeTemplateSet({ targetDir: repo, mode: 'blank' }), /Unsafe repository path/);
    await assert.rejects(readFile(path.join(repo, '.github/pull_request_template.md')), { code: 'ENOENT' });
    await assert.rejects(readFile(path.join(outside, 'README.md')), { code: 'ENOENT' });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('a symlinked manifest outside the repository is rejected', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'sf-paths-'));
  const repo = path.join(dir, 'repo');
  try {
    await mkdir(path.join(repo, '.specframe'), { recursive: true });
    await writeFile(path.join(dir, 'manifest.json'), '{"files":{}}');
    await symlink(path.join(dir, 'manifest.json'), path.join(repo, '.specframe/manifest.json'));
    await assert.rejects(readManifest(repo), /Unsafe repository path/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
