import { test } from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { readManifest } from '../src/manifest.js';
import { decideTemplateSet, writeTemplateSet } from '../src/writer.js';

// `specframe decide` is the bridge between the two modes: a repository can start
// blank and record decisions later without anything already written moving.

const BASE = {
  projectName: 'acme',
  packageManager: 'npm',
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
  const dir = await mkdtemp(path.join(os.tmpdir(), 'sf-decide-'));
  await writeTemplateSet({ targetDir: dir, ...BASE, mode: 'blank', version: '0.5.0' });
  return dir;
}

test('deciding in a blank repo writes the ADR and the documents it implies', async () => {
  const dir = await blankRepo();
  try {
    assert.equal(await exists(abs(dir, 'docs/adr/0320-event-sourcing.md')), false);

    await decideTemplateSet({
      targetDir: dir,
      ...BASE,
      mode: 'guided',
      decisions: { 'event-sourcing': 'yes' },
      version: '0.5.0',
    });

    assert.ok(await exists(abs(dir, 'docs/adr/0320-event-sourcing.md')));
    assert.ok(await exists(abs(dir, 'docs/rules/0130-events-are-immutable.md')));
    assert.ok(await exists(abs(dir, 'docs/runbook/0040-rebuild-projections.md')));
    assert.ok(await exists(abs(dir, 'docs/glossary/0020-data.md')));

    const manifest = await readManifest(dir);
    assert.equal(manifest.config.mode, 'guided');
    assert.deepEqual(manifest.config.decisions, { 'event-sourcing': 'yes' });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('the backlog and the indexes are brought up to date', async () => {
  const dir = await blankRepo();
  try {
    const before = await readFile(abs(dir, 'docs/DECISIONS.md'), 'utf8');
    assert.match(before, /_None yet\._/);
    assert.match(before, /\*\*Event sourcing\*\*/, 'listed as open');

    await decideTemplateSet({
      targetDir: dir,
      ...BASE,
      mode: 'guided',
      decisions: { 'event-sourcing': 'yes' },
      version: '0.5.0',
    });

    const after = await readFile(abs(dir, 'docs/DECISIONS.md'), 'utf8');
    assert.match(after, /\[ADR-0320\]\(adr\/0320-event-sourcing\.md\)/, 'moved to taken');
    assert.ok(!/\[ \] \*\*Event sourcing\*\*/.test(after), 'no longer open');

    const rulesIndex = await readFile(abs(dir, 'docs/rules/README.md'), 'utf8');
    assert.match(rulesIndex, /\[R-0130\]\(\.\/0130-events-are-immutable\.md\)/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('a document the user edited is never overwritten', async () => {
  const dir = await blankRepo();
  try {
    const config = { targetDir: dir, ...BASE, mode: 'guided', version: '0.5.0' };
    await decideTemplateSet({ ...config, decisions: { 'event-sourcing': 'yes' } });

    const rule = abs(dir, 'docs/rules/0130-events-are-immutable.md');
    await writeFile(rule, 'my own wording', 'utf8');

    // Recording a second decision must not touch the first decision's documents.
    await decideTemplateSet({ ...config, decisions: { 'event-sourcing': 'yes', tdd: 'strict' } });

    assert.equal(await readFile(rule, 'utf8'), 'my own wording');
    assert.equal(await exists(`${rule}.specframe-new`), false, 'no noise beside a user document');
    assert.ok(await exists(abs(dir, 'docs/adr/0500-test-driven-development.md')));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('a hand-edited index is kept, with the refreshed version beside it', async () => {
  const dir = await blankRepo();
  try {
    const index = abs(dir, 'docs/rules/README.md');
    await writeFile(index, '# My own rules index', 'utf8');

    await decideTemplateSet({
      targetDir: dir,
      ...BASE,
      mode: 'guided',
      decisions: { 'event-sourcing': 'yes' },
      version: '0.5.0',
    });

    assert.equal(await readFile(index, 'utf8'), '# My own rules index');
    const sibling = await readFile(`${index}.specframe-new`, 'utf8');
    assert.match(sibling, /\[R-0130\]/, 'the refreshed index is available to merge');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('recording more decisions never moves what is already on disk', async () => {
  const dir = await blankRepo();
  try {
    const config = { targetDir: dir, ...BASE, mode: 'guided', version: '0.5.0' };
    await decideTemplateSet({ ...config, decisions: { 'event-sourcing': 'yes' } });

    const first = await readFile(abs(dir, 'docs/adr/0320-event-sourcing.md'), 'utf8');

    await decideTemplateSet({
      ...config,
      decisions: {
        'event-sourcing': 'yes',
        'architecture-style': 'microservices',
        'clean-code': 'yes',
      },
    });

    assert.equal(
      await readFile(abs(dir, 'docs/adr/0320-event-sourcing.md'), 'utf8'),
      first,
      'the existing ADR is byte-identical',
    );
    assert.ok(await exists(abs(dir, 'docs/adr/0100-architecture-style.md')));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('the worked examples from blank mode survive being decided over', async () => {
  const dir = await blankRepo();
  try {
    // They are the user's files by then; removing them is not specframe's call.
    await decideTemplateSet({
      targetDir: dir,
      ...BASE,
      mode: 'guided',
      decisions: { 'clean-code': 'yes' },
      version: '0.5.0',
    });
    assert.ok(await exists(abs(dir, 'docs/guidelines/0001-example.md')));
    assert.ok(await exists(abs(dir, 'docs/guidelines/0010-naming-conventions.md')));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('dry run writes nothing', async () => {
  const dir = await blankRepo();
  try {
    await decideTemplateSet({
      targetDir: dir,
      ...BASE,
      mode: 'guided',
      decisions: { 'event-sourcing': 'yes' },
      version: '0.5.0',
      dryRun: true,
    });
    assert.equal(await exists(abs(dir, 'docs/adr/0320-event-sourcing.md')), false);
    const manifest = await readManifest(dir);
    assert.equal(manifest.config.mode, 'blank', 'the manifest is untouched');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
