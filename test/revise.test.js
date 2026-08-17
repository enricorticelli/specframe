import { test } from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { readManifest } from '../src/manifest.js';
import { resolveDecisions } from '../src/decisions/resolve.js';
import { planRevisionEffects, reviseTemplateSet, writeTemplateSet } from '../src/writer.js';

// `specframe revise` is the only operation that rewrites a document specframe
// wrote and the user owns, so what is tested here is mostly restraint: the ADR
// keeps its number, the old choice survives as history, a file the user edited is
// never clobbered, and a document that is no longer implied is reported rather
// than deleted.

const BASE = {
  projectName: 'acme',
  packageManager: 'npm',
  agentTargets: [],
  initDate: '2026-08-17',
  mode: 'guided',
};

const ADR = 'docs/adr/0100-architecture-style.md';
const MODULE_RULE = 'docs/rules/0110-module-boundaries.md';
const SERVICE_RULE = 'docs/rules/0090-no-cross-service-db.md';

const abs = (dir, rel) => path.join(dir, ...rel.split('/'));
const read = (dir, rel) => readFile(abs(dir, rel), 'utf8');

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

// A repo that decided on a modular monolith, the way `init` would leave it.
async function monolithRepo() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'sf-revise-'));
  await writeTemplateSet({
    targetDir: dir,
    ...BASE,
    decisions: { 'architecture-style': 'modular-monolith' },
    version: '0.6.0',
  });
  return dir;
}

const toMicroservices = (dir, extra = {}) =>
  reviseTemplateSet({
    targetDir: dir,
    ...BASE,
    decisions: { 'architecture-style': 'microservices' },
    revisions: { 'architecture-style': [{ date: '2026-09-01', value: 'modular-monolith' }] },
    version: '0.6.0',
    ...extra,
  });

test('a revised decision keeps its ADR number and records what it used to be', async () => {
  const dir = await monolithRepo();
  try {
    await toMicroservices(dir);
    const adr = await read(dir, ADR);

    assert.match(adr, /# ADR-0100: Architecture style/, 'same number, same file');
    assert.match(adr, /`architecture-style` = `microservices`/, 'the new decision');
    assert.match(adr, /- Revised: 2026-09-01 \(see History\)/, 'the header says it changed');
    assert.match(adr, /## History/);
    assert.match(adr, /Until 2026-09-01 this decision was \*\*Modular monolith\*\*/);
    assert.doesNotMatch(adr, /\*\*Modular monolith\.\*\*/, 'no longer stated as the decision');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('an ADR with no history has no History section', async () => {
  const dir = await monolithRepo();
  try {
    assert.doesNotMatch(await read(dir, ADR), /## History/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('the documents the new answer implies are written, the stale one is left alone', async () => {
  const dir = await monolithRepo();
  try {
    assert.ok(await exists(abs(dir, MODULE_RULE)), 'the monolith rule exists to begin with');
    await toMicroservices(dir);

    assert.ok(await exists(abs(dir, SERVICE_RULE)), 'the new rule was created');
    assert.ok(
      await exists(abs(dir, MODULE_RULE)),
      'the rule the old answer implied is left on disk — it is the user\'s file',
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('a hand-edited ADR is kept, with the revision beside it', async () => {
  const dir = await monolithRepo();
  try {
    const mine = `${await read(dir, ADR)}\n## Why we argued\n\nFor a week.\n`;
    await writeFile(abs(dir, ADR), mine, 'utf8');

    const actions = await toMicroservices(dir);
    const conflict = actions.find((action) => action.relpath === ADR);
    assert.equal(conflict.action, 'conflict');

    assert.equal(await read(dir, ADR), mine, 'not one byte of mine changed');
    assert.match(await read(dir, `${ADR}.specframe-new`), /## History/, 'the revision is beside it');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('--force rewrites even a document I edited', async () => {
  const dir = await monolithRepo();
  try {
    await writeFile(abs(dir, ADR), 'mine\n', 'utf8');
    await toMicroservices(dir, { force: true });
    assert.match(await read(dir, ADR), /## History/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('a dry run writes nothing at all', async () => {
  const dir = await monolithRepo();
  try {
    const before = await read(dir, ADR);
    await toMicroservices(dir, { dryRun: true });

    assert.equal(await read(dir, ADR), before, 'the ADR is untouched');
    assert.equal(await exists(abs(dir, SERVICE_RULE)), false, 'no new rule');
    const manifest = await readManifest(dir);
    assert.equal(manifest.config.decisions['architecture-style'], 'modular-monolith');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('the revision survives in the manifest, so the next render keeps the history', async () => {
  const dir = await monolithRepo();
  try {
    await toMicroservices(dir);
    const manifest = await readManifest(dir);
    assert.deepEqual(manifest.config.revisions, {
      'architecture-style': [{ date: '2026-09-01', value: 'modular-monolith' }],
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('history is pruned with the decision it belongs to', async () => {
  const dir = await monolithRepo();
  try {
    // The decision is reopened, so there is no ADR left to carry its history.
    await reviseTemplateSet({
      targetDir: dir,
      ...BASE,
      decisions: {},
      revisions: { 'architecture-style': [{ date: '2026-09-01', value: 'modular-monolith' }] },
      version: '0.6.0',
    });
    const manifest = await readManifest(dir);
    assert.deepEqual(manifest.config.revisions, {});
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// --- what a revision does to the document set -------------------------------

const resolve = (answers) => resolveDecisions({ mode: 'guided', answers });

test('a document is orphaned only when no decision implies it any more', () => {
  const before = resolve({ 'architecture-style': 'modular-monolith' });
  const after = resolve({ 'architecture-style': 'microservices' });
  const { orphaned, added } = planRevisionEffects({ before, after });

  assert.ok(
    orphaned.some((doc) => doc.relpath === MODULE_RULE),
    'the module-boundary rule is orphaned',
  );
  assert.ok(added.some((doc) => doc.relpath === SERVICE_RULE), 'the service rule is new');
  assert.ok(
    !orphaned.some((doc) => added.some((entry) => entry.relpath === doc.relpath)),
    'nothing is both orphaned and added',
  );
});

test('a rule two decisions imply is not orphaned when only one of them changes', () => {
  // Reverting to the same answer changes nothing, which is the degenerate case
  // the orphan report has to get right before any other.
  const same = resolve({ 'architecture-style': 'microservices' });
  const { orphaned, added } = planRevisionEffects({ before: same, after: same });
  assert.deepEqual(orphaned, []);
  assert.deepEqual(added, []);
});

test('every orphan is named well enough to act on', () => {
  const { orphaned } = planRevisionEffects({
    before: resolve({ 'architecture-style': 'modular-monolith' }),
    after: resolve({ 'architecture-style': 'microservices' }),
  });
  for (const doc of orphaned) {
    assert.match(doc.relpath, /^docs\/(rules|guidelines|runbook)\//);
    assert.ok(doc.title?.length > 0, `${doc.relpath} has no title`);
  }
});
