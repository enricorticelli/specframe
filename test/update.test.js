import { test } from 'node:test';
import assert from 'node:assert/strict';

import { sha256 } from '../src/manifest.js';
import { mergeGeneratedSections, planUpdateActions } from '../src/update.js';

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

test('a managed file the plan no longer produces is removed, untouched since specframe wrote it', () => {
  const plan = [{ relpath: 'a.md', content: 'x', managed: true }];
  const diskHashes = { 'a.md': sha256('x'), 'removed-agent.md': sha256('gone') };
  const manifest = manifestOf({
    'a.md': { content: 'x', managed: true },
    'removed-agent.md': { content: 'gone', managed: true },
  });

  const actions = planUpdateActions({ plan, manifest, diskHashes });

  assert.equal(actionFor(actions, 'removed-agent.md').action, 'orphan-remove');
});

test('a managed file the plan no longer produces is only reported when it was edited by hand', () => {
  const plan = [{ relpath: 'a.md', content: 'x', managed: true }];
  const diskHashes = { 'a.md': sha256('x'), 'removed-agent.md': sha256('my own edits') };
  const manifest = manifestOf({
    'a.md': { content: 'x', managed: true },
    'removed-agent.md': { content: 'gone', managed: true },
  });

  const actions = planUpdateActions({ plan, manifest, diskHashes });

  assert.equal(actionFor(actions, 'removed-agent.md').action, 'orphan');
});

test('a managed orphan already gone from disk is neither removed nor reported', () => {
  const plan = [{ relpath: 'a.md', content: 'x', managed: true }];
  const diskHashes = { 'a.md': sha256('x') }; // no entry for removed-agent.md — already deleted
  const manifest = manifestOf({
    'a.md': { content: 'x', managed: true },
    'removed-agent.md': { content: 'gone', managed: true },
  });

  const actions = planUpdateActions({ plan, manifest, diskHashes });

  assert.equal(actionFor(actions, 'removed-agent.md'), undefined);
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

// Generated sections ---------------------------------------------------------

// The `## Index` of a README and the two halves of the decision backlog are
// specframe's to render; the prose around them is the user's to write. Keeping
// the two apart is what stops a refresh landing as a duplicate README.

const INDEX = ['## Index'];

const readme = (index, note = '') =>
  `# Rules\n\n${note}## Conventions\n\nOne per file.\n\n## Index\n\n${index}\n`;

test('a refreshed index lands inside the document, around the user text', () => {
  const disk = readme('| R-0010 |', 'Reviewed quarterly by the platform team.\n\n');
  const planned = readme('| R-0010 |\n| R-0020 |');

  const merged = mergeGeneratedSections(disk, planned, INDEX);

  assert.match(merged, /Reviewed quarterly/, 'their note survives');
  assert.match(merged, /R-0020/, 'the index is current');
  assert.equal(merged.match(/# Rules/g).length, 1, 'one document, not two');
});

test('a section is bounded by the next heading, not the end of the file', () => {
  const disk = '## Decisions taken\n\n_None yet._\n\n## Open decisions\n\nmine\n\n---\n\nfooter\n';
  const planned = '## Decisions taken\n\n| ADR-0100 |\n\n## Open decisions\n\ntheirs\n\n---\n\nfooter\n';

  const merged = mergeGeneratedSections(disk, planned, ['## Decisions taken']);

  assert.match(merged, /ADR-0100/);
  assert.match(merged, /## Open decisions\n\nmine/, 'the neighbouring section is untouched');
  assert.match(merged, /footer/);
});

test('a missing heading is not guessed at', () => {
  // Restructured beyond recognition: the caller falls back to a sibling file.
  assert.equal(mergeGeneratedSections('# My own index\n', readme('| R-0010 |'), INDEX), null);
  assert.equal(mergeGeneratedSections(readme('| R-0010 |'), '# no index here\n', INDEX), null);
  assert.equal(mergeGeneratedSections(readme('x'), readme('y'), []), null);
});

test('an index the user edited around is refreshed, not duplicated', () => {
  const disk = readme('| R-0010 |', 'A note of mine.\n\n');
  const plan = [{ relpath: 'docs/rules/README.md', content: readme('| R-0010 |\n| R-0020 |'), managed: true, sections: INDEX }];
  const manifest = manifestOf({ 'docs/rules/README.md': { content: readme('| R-0010 |'), managed: false } });

  const actions = planUpdateActions({ plan, manifest, diskContents: { 'docs/rules/README.md': disk } });

  const a = actionFor(actions, 'docs/rules/README.md');
  assert.equal(a.action, 'merge');
  assert.match(a.content, /A note of mine/);
  assert.match(a.content, /R-0020/);
});

test('an index whose generated section is already current is left alone', () => {
  // The prose differs from this version's template — that is the user's call,
  // and nothing specframe renders has changed.
  const disk = readme('| R-0010 |', 'My own preamble.\n\n');
  const plan = [{ relpath: 'docs/rules/README.md', content: readme('| R-0010 |'), managed: true, sections: INDEX }];

  const actions = planUpdateActions({ plan, manifest: null, diskContents: { 'docs/rules/README.md': disk } });

  assert.equal(actionFor(actions, 'docs/rules/README.md').action, 'up-to-date');
});

test('an index with no recognisable section still falls back to a sibling', () => {
  const plan = [{ relpath: 'docs/rules/README.md', content: readme('| R-0010 |'), managed: true, sections: INDEX }];

  const actions = planUpdateActions({
    plan,
    manifest: null,
    diskContents: { 'docs/rules/README.md': '# My own rules index\n' },
  });

  assert.equal(actionFor(actions, 'docs/rules/README.md').action, 'conflict');
});

test('a stale manifest baseline no longer forces a conflict on a mergeable file', () => {
  // The regression: a run that skipped this file recorded the hash of the
  // content it did not write, so disk matched neither baseline nor plan.
  const disk = readme('| R-0010 |');
  const plan = [{ relpath: 'docs/rules/README.md', content: readme('| R-0020 |'), managed: true, sections: INDEX }];
  const manifest = manifestOf({ 'docs/rules/README.md': { content: 'a hash nobody ever wrote', managed: false } });

  const actions = planUpdateActions({ plan, manifest, diskContents: { 'docs/rules/README.md': disk } });

  assert.equal(actionFor(actions, 'docs/rules/README.md').action, 'merge');
});

test('a file specframe only partly wrote is refreshed, never rewritten', () => {
  // The hash matches because the last run put the index there — not because the
  // document is specframe's. Overwriting it would delete the user's section.
  const relpath = 'docs/rules/README.md';
  const disk = readme('| R-0010 |', 'A note of mine.\n\n');
  const plan = [{ relpath, content: readme('| R-0020 |'), managed: true, sections: INDEX }];
  const manifest = { files: { [relpath]: { sha256: sha256(disk), managed: false, merged: true } } };

  const actions = planUpdateActions({ plan, manifest, diskContents: { [relpath]: disk } });

  const a = actionFor(actions, relpath);
  assert.equal(a.action, 'merge');
  assert.match(a.content, /A note of mine/, 'their section is still there');
  assert.match(a.content, /R-0020/);
});

test('an untouched index specframe wrote whole is still refreshed whole', () => {
  // No `merged` marker: the file is specframe's from top to bottom, so a
  // changed template reaches the prose too.
  const relpath = 'docs/rules/README.md';
  const disk = readme('| R-0010 |');
  const plan = [{ relpath, content: `${readme('| R-0020 |')}new prose\n`, managed: true, sections: INDEX }];
  const manifest = { files: { [relpath]: { sha256: sha256(disk), managed: false } } };

  const actions = planUpdateActions({ plan, manifest, diskContents: { [relpath]: disk } });

  const a = actionFor(actions, relpath);
  assert.equal(a.action, 'overwrite');
  assert.match(a.content, /new prose/);
});

test('--force rewrites a partly-written file whole', () => {
  const relpath = 'docs/rules/README.md';
  const disk = readme('| R-0010 |', 'A note of mine.\n\n');
  const plan = [{ relpath, content: readme('| R-0020 |'), managed: true, sections: INDEX }];
  const manifest = { files: { [relpath]: { sha256: sha256(disk), managed: false, merged: true } } };

  const actions = planUpdateActions({ plan, manifest, diskContents: { [relpath]: disk }, force: true });

  assert.equal(actionFor(actions, relpath).action, 'overwrite');
});
