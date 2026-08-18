import { test } from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { readManifest, sha256, writeManifest } from '../src/manifest.js';
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

test('provenance survives in the manifest and only marks what it recorded', async () => {
  const dir = await blankRepo();
  try {
    const config = { targetDir: dir, ...BASE, mode: 'guided', version: '0.5.0' };

    // A first pass documents what the codebase already does.
    await decideTemplateSet({
      ...config,
      decisions: { 'architecture-style': 'microservices' },
      provenance: { 'architecture-style': 'detected' },
    });

    // A later pass records a genuinely new choice.
    await decideTemplateSet({
      ...config,
      decisions: { 'architecture-style': 'microservices', 'event-sourcing': 'yes' },
      provenance: { 'architecture-style': 'detected' },
    });

    const manifest = await readManifest(dir);
    assert.deepEqual(manifest.config.provenance, { 'architecture-style': 'detected' });

    const reconstructed = await readFile(abs(dir, 'docs/adr/0100-architecture-style.md'), 'utf8');
    const chosen = await readFile(abs(dir, 'docs/adr/0320-event-sourcing.md'), 'utf8');
    assert.match(reconstructed, /Recorded from: the existing implementation/);
    assert.ok(!chosen.includes('Recorded from'), 'the new decision is a normal ADR');
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

test('an index the user wrote around is refreshed in place, not duplicated', async () => {
  const dir = await blankRepo();
  try {
    const index = abs(dir, 'docs/rules/README.md');
    const original = await readFile(index, 'utf8');
    await writeFile(index, original.replace('## Index', '## House rules\n\nReviewed quarterly.\n\n## Index'), 'utf8');

    await decideTemplateSet({
      targetDir: dir,
      ...BASE,
      mode: 'guided',
      decisions: { 'event-sourcing': 'yes' },
      version: '0.5.0',
    });

    const after = await readFile(index, 'utf8');
    assert.match(after, /Reviewed quarterly/, 'their section survives');
    assert.match(after, /\[R-0130\]/, 'the index is up to date');
    assert.equal(await exists(`${index}.specframe-new`), false, 'no second README');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('a stale manifest baseline does not duplicate the indexes', async () => {
  // What a poisoned manifest looked like: a hash for content that was never
  // written, which made every later `decide` report a conflict on an index
  // nobody had touched and leave a `.specframe-new` beside it.
  const dir = await blankRepo();
  try {
    const manifest = await readManifest(dir);
    for (const relpath of ['docs/DECISIONS.md', 'docs/rules/README.md', 'docs/adr/README.md']) {
      manifest.files[relpath].sha256 = sha256('a version specframe never wrote');
    }
    await writeManifest(dir, manifest);

    await decideTemplateSet({
      targetDir: dir,
      ...BASE,
      mode: 'guided',
      decisions: { 'event-sourcing': 'yes' },
      version: '0.5.0',
    });

    for (const relpath of ['docs/DECISIONS.md', 'docs/rules/README.md', 'docs/adr/README.md']) {
      assert.equal(await exists(`${abs(dir, relpath)}.specframe-new`), false, `${relpath} was not duplicated`);
    }
    assert.match(await readFile(abs(dir, 'docs/rules/README.md'), 'utf8'), /\[R-0130\]/);
    assert.match(await readFile(abs(dir, 'docs/DECISIONS.md'), 'utf8'), /\[ADR-0320\]/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('an index the user wrote in stays theirs across later runs', async () => {
  const dir = await blankRepo();
  try {
    const index = abs(dir, 'docs/rules/README.md');
    const original = await readFile(index, 'utf8');
    await writeFile(index, original.replace('## Index', '## House rules\n\nReviewed quarterly.\n\n## Index'), 'utf8');

    const config = { targetDir: dir, ...BASE, mode: 'guided', version: '0.5.0' };
    await decideTemplateSet({ ...config, decisions: { tdd: 'strict' } });
    await decideTemplateSet({ ...config, decisions: { tdd: 'strict', 'event-sourcing': 'yes' } });

    const after = await readFile(index, 'utf8');
    assert.match(after, /Reviewed quarterly/, 'still theirs two runs later');
    assert.match(after, /\[R-0130\]/, 'and still current');
    assert.equal(await exists(`${index}.specframe-new`), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
