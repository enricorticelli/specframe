import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const workflow = await readFile(new URL('../.github/workflows/publish.yml', import.meta.url), 'utf8');

function stepScript(name) {
  const step = workflow.split(`      - name: ${name}\n`)[1]?.split('\n      - ')[0];
  assert.ok(step, `workflow step exists: ${name}`);
  const body = step.split('        run: |\n')[1];
  assert.ok(body, `workflow step has a shell script: ${name}`);
  return body.split('\n').map((line) => line.replace(/^          /, '')).join('\n');
}

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

test('syncing main leaves the package to publish on the release tag', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'sf-publish-'));
  const remote = path.join(dir, 'remote.git');
  const repo = path.join(dir, 'release');
  const runnerTemp = path.join(dir, 'runner');
  try {
    await mkdir(repo);
    await mkdir(runnerTemp);
    git(dir, 'init', '--bare', remote);
    git(repo, 'init', '-b', 'main');
    git(repo, 'config', 'user.name', 'Release Test');
    git(repo, 'config', 'user.email', 'release@example.test');
    git(repo, 'config', 'commit.gpgsign', 'false');
    await writeFile(path.join(repo, 'package.json'), JSON.stringify({ name: 'release-test', version: '0.2.0' }));
    await writeFile(path.join(repo, 'code.txt'), 'tagged code');
    git(repo, 'add', '.');
    git(repo, 'commit', '-m', 'release');
    git(repo, 'tag', 'v0.3.0');
    const taggedCommit = git(repo, 'rev-parse', 'HEAD');
    await writeFile(path.join(repo, 'code.txt'), 'newer main code');
    git(repo, 'add', '.');
    git(repo, 'commit', '-m', 'advance main');
    git(repo, 'remote', 'add', 'origin', remote);
    git(repo, 'push', 'origin', 'main');
    git(repo, 'checkout', '--detach', 'v0.3.0');
    // The preceding release step adjusts package.json without committing it.
    await writeFile(path.join(repo, 'package.json'), JSON.stringify({ name: 'release-test', version: '0.3.0' }));

    execFileSync('bash', ['-e', '-c', stepScript('Sync package.json version on main')], {
      cwd: repo,
      env: { ...process.env, GITHUB_REF_NAME: 'v0.3.0', RUNNER_TEMP: runnerTemp },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    assert.equal(git(repo, 'rev-parse', 'HEAD'), taggedCommit);
    assert.equal(await readFile(path.join(repo, 'code.txt'), 'utf8'), 'tagged code');
    assert.equal(JSON.parse(await readFile(path.join(repo, 'package.json'), 'utf8')).version, '0.3.0');
    assert.equal(git(dir, '--git-dir', remote, 'show', 'main:code.txt'), 'newer main code');
    assert.equal(JSON.parse(git(dir, '--git-dir', remote, 'show', 'main:package.json')).version, '0.3.0');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
