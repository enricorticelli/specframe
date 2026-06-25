import { test } from 'node:test';
import assert from 'node:assert/strict';

import { sha256 } from '../src/manifest.js';
import { planUpdateActions } from '../src/update.js';

// Helpers -------------------------------------------------------------------

// Build a manifest from { relpath: { content, managed } }.
function manifestOf(entries) {
  const files = {};
  for (const [relpath, { content, managed }] of Object.entries(entries)) {
    files[relpath] = { sha256: sha256(content), managed };
  }
  return { version: '0.1.0', files };
}

// Find the single action for a relpath.
function actionFor(actions, relpath) {
  return actions.find((a) => a.relpath === relpath);
}

// Tests ---------------------------------------------------------------------

test('creates a file that is missing on disk', () => {
  const plan = [{ relpath: 'a.md', content: 'new', managed: true }];
  const actions = planUpdateActions({ plan, manifest: null, diskHashes: {} });

  const a = actionFor(actions, 'a.md');
  assert.equal(a.action, 'create');
  assert.equal(a.content, 'new');
});

test('reports up-to-date when disk already equals new content', () => {
  const plan = [{ relpath: 'a.md', content: 'same', managed: true }];
  const diskHashes = { 'a.md': sha256('same') };
  const manifest = manifestOf({ 'a.md': { content: 'same', managed: true } });

  const actions = planUpdateActions({ plan, manifest, diskHashes });

  assert.equal(actionFor(actions, 'a.md').action, 'up-to-date');
});

test('overwrites a managed file untouched since specframe wrote it', () => {
  // Template changed (old -> new); user never edited the file (disk == old).
  const plan = [{ relpath: 'agent.md', content: 'new', managed: true }];
  const diskHashes = { 'agent.md': sha256('old') };
  const manifest = manifestOf({ 'agent.md': { content: 'old', managed: true } });

  const actions = planUpdateActions({ plan, manifest, diskHashes });

  const a = actionFor(actions, 'agent.md');
  assert.equal(a.action, 'overwrite');
  assert.equal(a.content, 'new');
});

test('flags a conflict for a managed file the user modified', () => {
  // disk differs from BOTH the recorded baseline and the new content.
  const plan = [{ relpath: 'agent.md', content: 'new', managed: true }];
  const diskHashes = { 'agent.md': sha256('user-edited') };
  const manifest = manifestOf({ 'agent.md': { content: 'old', managed: true } });

  const actions = planUpdateActions({ plan, manifest, diskHashes });

  const a = actionFor(actions, 'agent.md');
  assert.equal(a.action, 'conflict');
  assert.equal(a.content, 'new'); // content destined for the .specframe-new file
});

test('never overwrites a user-owned file that differs', () => {
  const plan = [{ relpath: 'CLAUDE.md', content: 'new template', managed: false }];
  const diskHashes = { 'CLAUDE.md': sha256('months of my own work') };
  const manifest = manifestOf({ 'CLAUDE.md': { content: 'new template', managed: false } });

  const actions = planUpdateActions({ plan, manifest, diskHashes });

  assert.equal(actionFor(actions, 'CLAUDE.md').action, 'skip-user');
});

test('--force overwrites a modified managed file', () => {
  const plan = [{ relpath: 'agent.md', content: 'new', managed: true }];
  const diskHashes = { 'agent.md': sha256('user-edited') };
  const manifest = manifestOf({ 'agent.md': { content: 'old', managed: true } });

  const actions = planUpdateActions({ plan, manifest, diskHashes, force: true });

  assert.equal(actionFor(actions, 'agent.md').action, 'overwrite');
});

test('treats a managed file with no manifest baseline as a conflict', () => {
  // User ran an old specframe (no manifest), then updates: be conservative.
  const plan = [{ relpath: 'agent.md', content: 'new', managed: true }];
  const diskHashes = { 'agent.md': sha256('whatever is there') };

  const actions = planUpdateActions({ plan, manifest: null, diskHashes });

  assert.equal(actionFor(actions, 'agent.md').action, 'conflict');
});

test('reports managed manifest entries missing from the plan as orphans', () => {
  const plan = [{ relpath: 'a.md', content: 'x', managed: true }];
  const diskHashes = { 'a.md': sha256('x') };
  const manifest = manifestOf({
    'a.md': { content: 'x', managed: true },
    'removed-agent.md': { content: 'gone', managed: true },
  });

  const actions = planUpdateActions({ plan, manifest, diskHashes });

  assert.equal(actionFor(actions, 'removed-agent.md').action, 'orphan');
});

test('does not report user-owned manifest entries as orphans', () => {
  const plan = [{ relpath: 'a.md', content: 'x', managed: true }];
  const diskHashes = { 'a.md': sha256('x') };
  const manifest = manifestOf({
    'a.md': { content: 'x', managed: true },
    'docs/old-note.md': { content: 'gone', managed: false },
  });

  const actions = planUpdateActions({ plan, manifest, diskHashes });

  assert.equal(actionFor(actions, 'docs/old-note.md'), undefined);
});
