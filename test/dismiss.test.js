import { test } from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { readManifest } from '../src/manifest.js';
import { buildTemplatePlan, decideTemplateSet, normalizeConfig, updateTemplateSet, writeTemplateSet } from '../src/writer.js';

// `specframe dismiss` records that a catalog decision will never apply to this
// repository — every frontend decision in a backend-only service, say — so it
// leaves the open backlog without ever being "decided". No ADR is written for
// it: the record lives in docs/DECISIONS.md and the manifest only.

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
  const dir = await mkdtemp(path.join(os.tmpdir(), 'sf-dismiss-'));
  await writeTemplateSet({ targetDir: dir, ...BASE, mode: 'blank', version: '0.5.0' });
  return dir;
}

// --- normalizeConfig pruning (pure) -----------------------------------------

test('normalizeConfig prunes a dismissal once its decision is answered', () => {
  const config = normalizeConfig({
    mode: 'guided',
    decisions: { tdd: 'strict' },
    dismissed: { tdd: { date: '2026-01-01', reason: 'stale' } },
  });
  assert.deepEqual(config.dismissed, {});
});

test('normalizeConfig prunes a dismissal naming an unknown decision', () => {
  const config = normalizeConfig({
    mode: 'guided',
    decisions: {},
    dismissed: { 'not-a-real-decision': { date: '2026-01-01', reason: 'x' } },
  });
  assert.deepEqual(config.dismissed, {});
});

test('normalizeConfig drops a malformed dismissal entry', () => {
  const config = normalizeConfig({
    mode: 'guided',
    decisions: {},
    dismissed: { tdd: 'not-an-object', 'clean-code': null },
  });
  assert.deepEqual(config.dismissed, {});
});

test('normalizeConfig keeps a well-formed dismissal, trimming the reason', () => {
  const config = normalizeConfig({
    mode: 'guided',
    decisions: {},
    dismissed: { tdd: { date: '2026-01-01', reason: '  no code here yet  ' } },
  });
  assert.deepEqual(config.dismissed, { tdd: { date: '2026-01-01', reason: 'no code here yet' } });
});

test('normalizeConfig defaults an omitted reason to null, not a placeholder', () => {
  const config = normalizeConfig({
    mode: 'guided',
    decisions: {},
    dismissed: { tdd: { date: '2026-01-01' } },
  });
  assert.equal(config.dismissed.tdd.reason, null);
});

test('dismissals survive blank mode, unlike decisions', () => {
  const config = normalizeConfig({
    mode: 'blank',
    decisions: { tdd: 'strict' }, // blank mode discards this anyway
    dismissed: { 'clean-code': { date: '2026-01-01', reason: 'legacy' } },
  });
  assert.deepEqual(config.decisions, {});
  assert.deepEqual(config.dismissed, { 'clean-code': { date: '2026-01-01', reason: 'legacy' } });
});

// --- what a dismissal actually writes (fs) ----------------------------------

test('a dismissal writes no ADR, only the backlog entry and the manifest', async () => {
  const dir = await blankRepo();
  try {
    await decideTemplateSet({
      targetDir: dir,
      ...BASE,
      mode: 'blank',
      decisions: {},
      dismissed: { 'event-sourcing': { date: '2026-08-20', reason: 'plain CRUD app' } },
      version: '0.5.0',
    });

    assert.equal(await exists(abs(dir, 'docs/adr/0320-event-sourcing.md')), false, 'no ADR for a dismissal');

    const decisionsMd = await readFile(abs(dir, 'docs/DECISIONS.md'), 'utf8');
    assert.match(decisionsMd, /## Decisions that do not apply/);
    assert.match(decisionsMd, /Event sourcing/);
    assert.match(decisionsMd, /plain CRUD app/);
    assert.match(decisionsMd, /2026-08-20/);
    assert.doesNotMatch(
      decisionsMd.slice(0, decisionsMd.indexOf('## Decisions that do not apply')),
      /Event sourcing/,
      'dropped from the open list',
    );

    const manifest = await readManifest(dir);
    assert.equal(manifest.config.mode, 'blank', 'dismissing does not switch the repo to guided mode');
    assert.deepEqual(manifest.config.dismissed, {
      'event-sourcing': { date: '2026-08-20', reason: 'plain CRUD app' },
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('an omitted reason renders the canonical "not applicable" sentence', async () => {
  const dir = await blankRepo();
  try {
    await decideTemplateSet({
      targetDir: dir,
      ...BASE,
      mode: 'blank',
      decisions: {},
      dismissed: { 'event-sourcing': { date: '2026-08-20' } },
      version: '0.5.0',
    });

    const decisionsMd = await readFile(abs(dir, 'docs/DECISIONS.md'), 'utf8');
    assert.match(decisionsMd, /Not applicable to this repository\./);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('re-running the same dismissal twice produces no further change', async () => {
  const dir = await blankRepo();
  const config = {
    targetDir: dir,
    ...BASE,
    mode: 'blank',
    decisions: {},
    dismissed: { 'event-sourcing': { date: '2026-08-20', reason: 'plain CRUD app' } },
    version: '0.5.0',
  };
  try {
    await decideTemplateSet(config);
    const first = await readFile(abs(dir, 'docs/DECISIONS.md'), 'utf8');

    await decideTemplateSet(config);
    const second = await readFile(abs(dir, 'docs/DECISIONS.md'), 'utf8');

    assert.equal(first, second, 'idempotent — the same input produces byte-identical output');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// --- reaching a repo scaffolded before dismissals existed -------------------

test('update inserts the new backlog section into a DECISIONS.md written before dismissals existed, without a .specframe-new', async () => {
  const dir = await blankRepo();
  try {
    // Stand in for a real pre-existing repo: a DECISIONS.md in the two-heading
    // shape this file had before the third section was added, with a note the
    // user wrote in by hand.
    const oldStyle =
      '# Decisions\n\nThe decision backlog for acme.\n\n' +
      'A note the user added here.\n\n' +
      '## Decisions taken\n\n_None yet._\n\n' +
      '## Open decisions\n\n### Architecture\n\n- [ ] mine, untouched\n\n' +
      '---\n\n<!-- footer -->\n';
    await writeFile(abs(dir, 'docs/DECISIONS.md'), oldStyle, 'utf8');

    await updateTemplateSet({ targetDir: dir, ...BASE, mode: 'blank', decisions: {}, version: '0.6.0' });

    const after = await readFile(abs(dir, 'docs/DECISIONS.md'), 'utf8');
    assert.match(after, /A note the user added here\./, 'prose the user wrote around the sections survives');
    assert.match(after, /## Decisions that do not apply/, 'the new section reached an existing repo');
    // The other two headings are themselves generated content, so they refresh
    // to what this version renders — only the prose *outside* any heading is
    // the user's to keep, which the assertion above already covers.
    assert.match(after, /## Open decisions\n\n### Architecture/, 'the sibling section is still there, refreshed');
    assert.equal(
      await exists(`${abs(dir, 'docs/DECISIONS.md')}.specframe-new`),
      false,
      'no conflict file — this is an insert, not a restructure',
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('buildTemplatePlan renders the empty state when nothing is dismissed', async () => {
  const plan = await buildTemplatePlan({ ...BASE, mode: 'blank', decisions: {} });
  const decisionsMd = plan.find((e) => e.relpath === 'docs/DECISIONS.md');
  assert.match(decisionsMd.content, /Dismiss one with `specframe dismiss <id>`/);
});
