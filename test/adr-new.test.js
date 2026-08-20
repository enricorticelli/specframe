import { test } from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { LOCAL_ADR_MIN } from '../src/decisions/catalog.js';
import { readManifest } from '../src/manifest.js';
import { recordLocalAdr, writeTemplateSet } from '../src/writer.js';

// `specframe adr new` — recording a decision the catalog never asked about.
// See src/writer.js's recordLocalAdr and catalog.js's LOCAL_ADR_MIN.

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

async function blankRepo() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'sf-adr-new-'));
  await writeTemplateSet({ targetDir: dir, ...BASE, version: '0.8.0' });
  return dir;
}

test('the first local ADR lands at LOCAL_ADR_MIN', async () => {
  const dir = await blankRepo();
  try {
    const result = await recordLocalAdr({
      targetDir: dir,
      version: '0.8.0',
      slug: 'payments-provider',
      title: 'Payment provider',
      date: '2026-08-19',
    });

    assert.equal(result.number, String(LOCAL_ADR_MIN));
    assert.equal(result.relpath, `docs/adr/${LOCAL_ADR_MIN}-payments-provider.md`);
    assert.ok(await exists(abs(dir, result.relpath)));

    const content = await readFile(abs(dir, result.relpath), 'utf8');
    assert.match(content, new RegExp(`^# ADR-${LOCAL_ADR_MIN}: Payment provider`));
    assert.match(content, /Status: proposed/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('a second local ADR is allocated ten past the first, never reused', async () => {
  const dir = await blankRepo();
  try {
    await recordLocalAdr({ targetDir: dir, version: '0.8.0', slug: 'a', title: 'A', date: '2026-08-19' });
    const second = await recordLocalAdr({ targetDir: dir, version: '0.8.0', slug: 'b', title: 'B', date: '2026-08-19' });
    assert.equal(second.number, String(LOCAL_ADR_MIN + 10));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('the manifest tracks every local ADR recorded', async () => {
  const dir = await blankRepo();
  try {
    await recordLocalAdr({ targetDir: dir, version: '0.8.0', slug: 'a', title: 'A', date: '2026-08-19' });
    const manifest = await readManifest(dir);
    assert.deepEqual(manifest.config.localAdrs, [
      { number: String(LOCAL_ADR_MIN), slug: 'a', title: 'A', date: '2026-08-19' },
    ]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('docs/adr/README.md lists it under "Decisions outside the catalog"', async () => {
  const dir = await blankRepo();
  try {
    const before = await readFile(abs(dir, 'docs/adr/README.md'), 'utf8');
    assert.match(before, /None recorded yet/);

    const result = await recordLocalAdr({
      targetDir: dir,
      version: '0.8.0',
      slug: 'payments-provider',
      title: 'Payment provider',
      date: '2026-08-19',
    });

    const after = await readFile(abs(dir, 'docs/adr/README.md'), 'utf8');
    assert.match(after, new RegExp(`\\[ADR-${result.number}\\]\\(\\./${result.number}-payments-provider\\.md\\)`));
    assert.match(after, /Payment provider/);
    assert.equal(await exists(`${abs(dir, 'docs/adr/README.md')}.specframe-new`), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('a README the user wrote around is refreshed in place, not duplicated', async () => {
  const dir = await blankRepo();
  try {
    const index = abs(dir, 'docs/adr/README.md');
    const original = await readFile(index, 'utf8');
    const { writeFile } = await import('node:fs/promises');
    await writeFile(index, original.replace('## Index', '## House rules\n\nReviewed quarterly.\n\n## Index'), 'utf8');

    await recordLocalAdr({ targetDir: dir, version: '0.8.0', slug: 'a', title: 'A', date: '2026-08-19' });

    const after = await readFile(index, 'utf8');
    assert.match(after, /Reviewed quarterly/, 'their section survives');
    assert.match(after, /ADR-9000/, 'the local index is current');
    assert.equal(await exists(`${index}.specframe-new`), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('dry run writes nothing', async () => {
  const dir = await blankRepo();
  try {
    const result = await recordLocalAdr({
      targetDir: dir,
      version: '0.8.0',
      slug: 'payments-provider',
      title: 'Payment provider',
      date: '2026-08-19',
      dryRun: true,
    });
    assert.equal(await exists(abs(dir, result.relpath)), false);
    const manifest = await readManifest(dir);
    assert.deepEqual(manifest.config.localAdrs ?? [], []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('throws without an existing manifest', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'sf-adr-new-empty-'));
  try {
    await assert.rejects(
      () => recordLocalAdr({ targetDir: dir, version: '0.8.0', slug: 'a', title: 'A', date: '2026-08-19' }),
      /Run `specframe init` first/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
