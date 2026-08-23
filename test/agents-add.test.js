import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile, rm, access } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { addAgentTargets, removeAgentTargets, writeTemplateSet } from '../src/writer.js';
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

// --- removing ---------------------------------------------------------------

test('removing a harness deletes its files and nothing else', async () => {
  const dir = await makeRepo(['claude', 'codex']);
  try {
    const before = await readFile(abs(dir, 'AGENTS.md'), 'utf8');
    const actions = await removeAgentTargets({
      targetDir: dir,
      ...CONFIG,
      agentTargets: ['claude'],
      previousTargets: ['claude', 'codex'],
      version: '0.1.0',
      quiet: true,
    });

    assert.ok(actions.length > 0);
    assert.ok(actions.every((a) => a.action === 'orphan-remove'), 'untouched files just go');
    assert.equal(await exists(abs(dir, '.codex/agents/bootstrapper.toml')), false);
    assert.equal(await exists(abs(dir, '.codex')), false, 'the empty directory is pruned too');
    assert.ok(await exists(abs(dir, '.claude/agents/bootstrapper.md')), 'the kept harness is intact');
    assert.equal(await readFile(abs(dir, 'AGENTS.md'), 'utf8'), before, 'AGENTS.md untouched');
    assert.ok(await exists(abs(dir, 'docs/DECISIONS.md')), 'the decision log is untouched');

    const manifest = await readManifest(dir);
    assert.deepEqual(manifest.config.agentTargets, ['claude']);
    assert.equal(manifest.files['.codex/agents/bootstrapper.toml'], undefined, 'and stops being tracked');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('removing the last harness is a supported position', async () => {
  const dir = await makeRepo(['claude']);
  try {
    await removeAgentTargets({
      targetDir: dir,
      ...CONFIG,
      agentTargets: [],
      previousTargets: ['claude'],
      version: '0.1.0',
      quiet: true,
    });

    assert.equal(await exists(abs(dir, '.claude')), false);
    assert.ok(await exists(abs(dir, 'AGENTS.md')), 'AGENTS.md still covers most tools');
    const manifest = await readManifest(dir);
    assert.deepEqual(manifest.config.agentTargets, []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('a managed file you edited is kept, and stays tracked', async () => {
  const dir = await makeRepo(['claude']);
  const rel = '.claude/agents/bootstrapper.md';
  try {
    await writeFile(abs(dir, rel), 'mine now\n', 'utf8');
    const actions = await removeAgentTargets({
      targetDir: dir,
      ...CONFIG,
      agentTargets: [],
      previousTargets: ['claude'],
      version: '0.1.0',
      quiet: true,
    });

    assert.equal(actions.find((a) => a.relpath === rel).action, 'orphan');
    assert.equal(await readFile(abs(dir, rel), 'utf8'), 'mine now\n');
    // Still in the manifest, so `uninstall` knows about it and `update` can go
    // on reporting it as an orphan.
    assert.ok((await readManifest(dir)).files[rel]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('--force removes a file you edited, and says that is why', async () => {
  const dir = await makeRepo(['claude']);
  const rel = '.claude/agents/bootstrapper.md';
  try {
    await writeFile(abs(dir, rel), 'mine now\n', 'utf8');
    const actions = await removeAgentTargets({
      targetDir: dir,
      ...CONFIG,
      agentTargets: [],
      previousTargets: ['claude'],
      version: '0.1.0',
      force: true,
      quiet: true,
    });

    const action = actions.find((a) => a.relpath === rel);
    assert.equal(action.action, 'orphan-remove');
    assert.equal(action.forced, true, 'reported as asked-for, not as never-edited');
    assert.equal(await exists(abs(dir, rel)), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('a user-owned file is kept unless purged', async () => {
  for (const purge of [false, true]) {
    const dir = await makeRepo(['gemini']);
    try {
      const actions = await removeAgentTargets({
        targetDir: dir,
        ...CONFIG,
        agentTargets: [],
        previousTargets: ['gemini'],
        version: '0.1.0',
        purge,
        quiet: true,
      });

      const action = actions.find((a) => a.relpath === 'GEMINI.md');
      assert.equal(action.action, purge ? 'orphan-remove' : 'skip-user');
      assert.equal(await exists(abs(dir, 'GEMINI.md')), !purge);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
});

test('a stale .specframe-new goes with the file it was written for', async () => {
  const dir = await makeRepo(['claude']);
  const rel = '.claude/agents/bootstrapper.md';
  try {
    await writeFile(abs(dir, `${rel}.specframe-new`), 'pending\n', 'utf8');
    await removeAgentTargets({
      targetDir: dir,
      ...CONFIG,
      agentTargets: [],
      previousTargets: ['claude'],
      version: '0.1.0',
      quiet: true,
    });

    assert.equal(await exists(abs(dir, `${rel}.specframe-new`)), false);
    assert.equal(await exists(abs(dir, '.claude')), false, 'nothing left to keep the directory alive');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('remove dry run touches nothing', async () => {
  const dir = await makeRepo(['claude']);
  try {
    await removeAgentTargets({
      targetDir: dir,
      ...CONFIG,
      agentTargets: [],
      previousTargets: ['claude'],
      version: '0.1.0',
      dryRun: true,
      quiet: true,
    });

    assert.ok(await exists(abs(dir, '.claude/agents/bootstrapper.md')));
    assert.deepEqual((await readManifest(dir)).config.agentTargets, ['claude']);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
