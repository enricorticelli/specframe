import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile, rm, access } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { addAgentTargets, writeTemplateSet } from '../src/writer.js';
import { readManifest } from '../src/manifest.js';
import { splitAgentTargets } from '../src/prompts.js';

const CONFIG = {
  projectName: 'acme',
  packageManager: 'npm',
  mode: 'blank',
  initDate: '2026-08-17',
  agentTargets: ['claude'],
};

const abs = (dir, rel) => path.join(dir, ...rel.split('/'));

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function makeRepo(agentTargets = CONFIG.agentTargets) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'specframe-agents-'));
  await writeTemplateSet({ targetDir: dir, ...CONFIG, agentTargets, version: '0.1.0' });
  return dir;
}

test('adding a harness writes only its own files', async () => {
  const dir = await makeRepo();
  try {
    const before = await readFile(abs(dir, 'AGENTS.md'), 'utf8');
    const actions = await addAgentTargets({
      targetDir: dir,
      ...CONFIG,
      agentTargets: ['claude', 'gemini'],
      previousTargets: ['claude'],
      version: '0.1.0',
      quiet: true,
    });

    assert.ok(await exists(abs(dir, 'GEMINI.md')), 'the new harness got its file');
    assert.deepEqual(
      actions.map((a) => a.relpath),
      ['GEMINI.md'],
      'nothing outside the new harness was planned',
    );
    assert.equal(await readFile(abs(dir, 'AGENTS.md'), 'utf8'), before, 'AGENTS.md untouched');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('the manifest records the merged target list and the new files', async () => {
  const dir = await makeRepo();
  try {
    await addAgentTargets({
      targetDir: dir,
      ...CONFIG,
      agentTargets: ['claude', 'gemini'],
      previousTargets: ['claude'],
      version: '0.1.0',
      quiet: true,
    });

    const manifest = await readManifest(dir);
    assert.deepEqual(manifest.config.agentTargets, ['claude', 'gemini']);
    // GEMINI.md is a user-owned pointer, like the other rules files — what
    // matters here is that it is tracked at all.
    assert.ok(manifest.files['GEMINI.md'], 'the new file is tracked');
    // Everything init wrote is still tracked — the merge must not drop the
    // rest of the manifest, or `update` would treat those files as unknown.
    assert.ok(manifest.files['.claude/agents/bootstrapper.md'], 'claude files kept');
    assert.ok(manifest.files['docs/DECISIONS.md'], 'user-owned files kept');
    // `agents` does not move the repository to a new specframe version.
    assert.equal(manifest.version, '0.1.0');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('the first harness can be added to a repo scaffolded without one', async () => {
  const dir = await makeRepo([]);
  try {
    await addAgentTargets({
      targetDir: dir,
      ...CONFIG,
      agentTargets: ['claude'],
      previousTargets: [],
      version: '0.1.0',
      quiet: true,
    });

    assert.ok(await exists(abs(dir, '.claude/agents/bootstrapper.md')));
    const manifest = await readManifest(dir);
    assert.deepEqual(manifest.config.agentTargets, ['claude']);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('a managed file the user already wrote there is kept, new version beside it', async () => {
  const dir = await makeRepo();
  const rel = '.github/agents/bootstrapper.agent.md';
  try {
    await mkdir(path.dirname(abs(dir, rel)), { recursive: true });
    await writeFile(abs(dir, rel), 'ours\n', 'utf8');
    const actions = await addAgentTargets({
      targetDir: dir,
      ...CONFIG,
      agentTargets: ['claude', 'copilot'],
      previousTargets: ['claude'],
      version: '0.1.0',
      quiet: true,
    });

    const action = actions.find((a) => a.relpath === rel);
    assert.equal(action.action, 'conflict');
    assert.equal(await readFile(abs(dir, rel), 'utf8'), 'ours\n');
    assert.ok(await exists(abs(dir, `${rel}.specframe-new`)));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('dry run writes nothing at all', async () => {
  const dir = await makeRepo();
  try {
    await addAgentTargets({
      targetDir: dir,
      ...CONFIG,
      agentTargets: ['claude', 'gemini'],
      previousTargets: ['claude'],
      version: '0.1.0',
      dryRun: true,
      quiet: true,
    });

    assert.equal(await exists(abs(dir, 'GEMINI.md')), false);
    const manifest = await readManifest(dir);
    assert.deepEqual(manifest.config.agentTargets, ['claude']);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('splitAgentTargets separates known ids from typos', () => {
  assert.deepEqual(splitAgentTargets('codex, Gemini,codexx'), {
    valid: ['codex', 'gemini'],
    unknown: ['codexx'],
  });
  assert.deepEqual(splitAgentTargets('claude,claude'), { valid: ['claude'], unknown: [] });
  assert.deepEqual(splitAgentTargets('none'), { valid: [], unknown: [] });
  assert.deepEqual(splitAgentTargets(''), { valid: [], unknown: [] });
});
