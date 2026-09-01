import { test } from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { LOCAL_ADR_MIN, LOCAL_ADR_STEP } from '../src/decisions/catalog.js';
import { readManifest } from '../src/manifest.js';
import { recordLocalAdr, removeLocalAdr, writeTemplateSet } from '../src/writer.js';

// `specframe adr rm` — withdrawing an ADR that should never have been written,
// and the primitive the specframe-audit skill applies once a document has been
// judged not to belong. Doing it by hand is three steps (file, index row,
// manifest entry) and missing any one leaves the log inconsistent.

const BASE = {
  projectName: 'acme',
  packageManager: 'npm',
  mode: 'blank',
  agentTargets: [],
  initDate: '2026-08-17',
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

async function repoWith(...titles) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'sf-adr-rm-'));
  await writeTemplateSet({ targetDir: dir, ...BASE, version: '0.8.0' });
  for (const [i, title] of titles.entries()) {
    await recordLocalAdr({
      targetDir: dir,
      version: '0.8.0',
      slug: `slug-${i}`,
      title,
      date: '2026-08-19',
      quiet: true,
    });
  }
  return dir;
}

const remove = (dir, number) =>
  removeLocalAdr({ targetDir: dir, version: '0.8.0', number, date: '2026-08-20', quiet: true });

test('withdrawing an ADR takes the file, the index row and the manifest entry together', async () => {
  const dir = await repoWith('Naming of hook files', 'Payment provider');
  try {
    const result = await remove(dir, String(LOCAL_ADR_MIN));
    assert.equal(result.title, 'Naming of hook files');
    assert.equal(await exists(abs(dir, result.relpath)), false, 'the file is gone');

    const index = await readFile(abs(dir, 'docs/adr/README.md'), 'utf8');
    assert.doesNotMatch(index, new RegExp(`ADR-${LOCAL_ADR_MIN}\\b`), 'no dangling index row');
    assert.match(index, new RegExp(`ADR-${LOCAL_ADR_MIN + LOCAL_ADR_STEP}\\b`), 'the other one stays');

    const manifest = await readManifest(dir);
    assert.equal(manifest.files[result.relpath], undefined, 'no stale manifest file entry');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('a withdrawn number is spent, never reissued', async () => {
  const dir = await repoWith('Only one');
  try {
    // docs/README.md: "Numbers are permanent. They appear in links, in commit
    // messages, and in agent output." Withdrawing the highest ADR must not let
    // the next `adr new` hand the same number to a different decision.
    await remove(dir, String(LOCAL_ADR_MIN));
    const next = await recordLocalAdr({
      targetDir: dir,
      version: '0.8.0',
      slug: 'something-else',
      title: 'Something else',
      date: '2026-08-21',
      quiet: true,
    });
    assert.equal(next.number, String(LOCAL_ADR_MIN + LOCAL_ADR_STEP));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('the tombstone stays in the manifest but never reaches the index', async () => {
  const dir = await repoWith('Only one');
  try {
    await remove(dir, String(LOCAL_ADR_MIN));
    const manifest = await readManifest(dir);
    const entry = manifest.config.localAdrs.find((a) => a.number === String(LOCAL_ADR_MIN));
    assert.ok(entry, 'the entry is kept — dropping it would free the number');
    assert.equal(entry.removed, '2026-08-20');

    const index = await readFile(abs(dir, 'docs/adr/README.md'), 'utf8');
    assert.match(index, /None recorded yet/, 'a tombstone-only log reads as empty');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('a catalog ADR cannot be withdrawn this way', async () => {
  const dir = await repoWith('Only one');
  try {
    await assert.rejects(() => remove(dir, '0100'), /dismiss|revise/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('withdrawing twice, or withdrawing what was never recorded, says which', async () => {
  const dir = await repoWith('Only one');
  try {
    await remove(dir, String(LOCAL_ADR_MIN));
    await assert.rejects(() => remove(dir, String(LOCAL_ADR_MIN)), /already withdrawn/);
    await assert.rejects(() => remove(dir, '9999'), /written by\s*\n?hand|No ADR-9999/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('--dry-run withdraws nothing', async () => {
  const dir = await repoWith('Only one');
  try {
    const result = await removeLocalAdr({
      targetDir: dir,
      version: '0.8.0',
      number: String(LOCAL_ADR_MIN),
      dryRun: true,
      quiet: true,
    });
    assert.equal(await exists(abs(dir, result.relpath)), true);
    const manifest = await readManifest(dir);
    assert.equal(manifest.config.localAdrs[0].removed, undefined);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// --- the skill ---------------------------------------------------------------

test('the audit skill ships to every harness that takes skills, and carries the gate', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'sf-audit-'));
  try {
    await writeTemplateSet({
      targetDir: dir,
      ...BASE,
      agentTargets: ['claude', 'codex', 'copilot'],
      version: '0.8.0',
    });
    for (const relpath of [
      '.claude/skills/specframe-audit/SKILL.md',
      '.claude/commands/specframe-audit.md',
      '.agents/skills/specframe-audit/SKILL.md',
      '.github/prompts/specframe-audit.prompt.md',
    ]) {
      const body = await readFile(abs(dir, relpath), 'utf8');
      assert.match(body, /\*\*two or more credible options\*\*/, `${relpath} lacks the gate`);
      // The distinction that keeps it from duplicating specframe-conform.
      assert.match(body, /Not a diff review/);
      // The two invariants that make it safe to run on someone's log.
      assert.match(body, /Report first, always/);
      assert.match(body, /Do not audit a catalog ADR against the ADR gate/);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('CLAUDE.md lists the audit command and skill it actually ships', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'sf-audit-claude-'));
  try {
    await writeTemplateSet({ targetDir: dir, ...BASE, agentTargets: ['claude'], version: '0.8.0' });
    const claude = await readFile(abs(dir, 'CLAUDE.md'), 'utf8');
    assert.match(claude, /\/specframe-audit/);
    assert.match(claude, /specframe-doc-sync, specframe-audit/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
