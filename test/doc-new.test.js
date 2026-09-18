import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { writeTemplateSet, recordLocalDoc } from '../src/writer.js';
import { readManifest } from '../src/manifest.js';

// `specframe doc new` is `adr new` for the other four sections. What matters is
// the same three things: the number comes from the band the catalog promises
// never to use, the index row lands in the section README's generated part, and
// the prose the user wrote around it survives.

const BASE = {
  projectName: 'acme',
  packageManager: 'npm',
  mode: 'blank',
  initDate: '2026-09-18',
  agentTargets: [],
};

const abs = (dir, rel) => path.join(dir, ...rel.split('/'));

async function scaffold() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'sf-doc-new-'));
  await writeTemplateSet({ targetDir: dir, ...BASE, version: '0.8.0' });
  return dir;
}

const add = (dir, section, slug, title) =>
  recordLocalDoc({ targetDir: dir, version: '0.8.0', section, slug, title, date: '2026-09-18', quiet: true });

test('the first document of a section opens the local band', async () => {
  const dir = await scaffold();
  try {
    const result = await add(dir, 'rule', 'no-raw-sql', 'No raw SQL outside the repository layer');

    assert.equal(result.number, '9000', 'the band the catalog reserves');
    assert.equal(result.relpath, 'docs/rules/9000-no-raw-sql.md');

    const body = await readFile(abs(dir, result.relpath), 'utf8');
    assert.match(body, /^# R-9000: No raw SQL outside the repository layer$/m);
    // The skeleton is the section's own template, heading for heading.
    for (const heading of ['## Rule', '## Why', '## Enforcement']) assert.match(body, new RegExp(`^${heading}$`, 'm'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('each section numbers independently, in steps of ten', async () => {
  const dir = await scaffold();
  try {
    await add(dir, 'rule', 'first', 'First');
    const second = await add(dir, 'rule', 'second', 'Second');
    const guideline = await add(dir, 'guideline', 'first', 'First guideline');

    assert.equal(second.number, '9010');
    assert.equal(guideline.number, '9000', 'a different section starts over');
    assert.equal(guideline.relpath, 'docs/guidelines/9000-first.md');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('the index row lands in the README, and prose around it survives', async () => {
  const dir = await scaffold();
  try {
    const readme = 'docs/rules/README.md';
    const original = await readFile(abs(dir, readme), 'utf8');
    await writeFile(abs(dir, readme), `${original}\n## House notes\n\nOurs. Do not touch.\n`, 'utf8');

    await add(dir, 'rule', 'no-raw-sql', 'No raw SQL');

    const updated = await readFile(abs(dir, readme), 'utf8');
    assert.match(updated, /\| \[R-9000\]\(\.\/9000-no-raw-sql\.md\) \| No raw SQL \|/);
    assert.match(updated, /## House notes\n\nOurs\. Do not touch\./, 'the user\'s prose is kept');
    assert.doesNotMatch(updated, /None recorded yet/, 'the empty-state comment is replaced');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('the manifest records the document, so the next call numbers past it', async () => {
  const dir = await scaffold();
  try {
    await add(dir, 'runbook', 'restore-db', 'Restore the database');

    const manifest = await readManifest(dir);
    assert.deepEqual(manifest.config.localDocs.runbook, [
      { number: '9000', slug: 'restore-db', title: 'Restore the database', date: '2026-09-18' },
    ]);
    assert.ok(manifest.files['docs/runbook/README.md'], 'the refreshed index stays tracked');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('an unknown section is refused before anything is written', async () => {
  const dir = await scaffold();
  try {
    await assert.rejects(() => add(dir, 'adr', 'x', 'X'), /Unknown section/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('dry run writes nothing', async () => {
  const dir = await scaffold();
  try {
    const result = await recordLocalDoc({
      targetDir: dir,
      version: '0.8.0',
      section: 'glossary',
      slug: 'billing',
      title: 'Billing',
      date: '2026-09-18',
      dryRun: true,
      quiet: true,
    });

    await assert.rejects(() => readFile(abs(dir, result.relpath), 'utf8'), /ENOENT/);
    const manifest = await readManifest(dir);
    assert.deepEqual(manifest.config.localDocs?.glossary ?? [], []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
