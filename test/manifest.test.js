import { test } from 'node:test';
import assert from 'node:assert/strict';

import { manifestFromActions, sha256 } from '../src/manifest.js';

// The manifest answers one question, for every later run: "is what is on disk
// what specframe put there?" Recording a hash for a file specframe chose *not*
// to write breaks that answer permanently — the file reads as hand-edited from
// then on, and every `decide` drops another `.specframe-new` beside it.

const CONFIG = { projectName: 'acme' };
const build = ({ plan, actions, previous = null }) =>
  manifestFromActions({ plan, actions, previous, version: '0.3.0', config: CONFIG });

test('records the content of a file it wrote', () => {
  const plan = [{ relpath: 'a.md', content: 'written', managed: true }];
  const manifest = build({ plan, actions: [{ relpath: 'a.md', action: 'create', content: 'written' }] });

  assert.equal(manifest.files['a.md'].sha256, sha256('written'));
  assert.equal(manifest.files['a.md'].managed, true);
});

test('records what was merged, not what was planned', () => {
  // A merge writes the user's document with its generated sections replaced —
  // that hybrid, not the pristine template, is what is now on disk.
  const plan = [{ relpath: 'docs/rules/README.md', content: 'planned', managed: false }];
  const actions = [{ relpath: 'docs/rules/README.md', action: 'merge', content: 'their prose + fresh index' }];

  const manifest = build({ plan, actions });

  assert.equal(manifest.files['docs/rules/README.md'].sha256, sha256('their prose + fresh index'));
});

test('a file left alone keeps the hash specframe last wrote', () => {
  const plan = [{ relpath: 'CLAUDE.md', content: 'v2 template', managed: false }];
  const actions = [{ relpath: 'CLAUDE.md', action: 'skip-user' }];
  const previous = { files: { 'CLAUDE.md': { sha256: sha256('v1 template'), managed: false } } };

  const manifest = build({ plan, actions, previous });

  assert.equal(manifest.files['CLAUDE.md'].sha256, sha256('v1 template'), 'not the v2 hash');
});

test('a conflicting file keeps the hash specframe last wrote', () => {
  // Otherwise the next run compares the user's file against itself, decides it
  // was untouched, and silently overwrites the edit the conflict protected.
  const plan = [{ relpath: 'agent.md', content: 'v2 template', managed: true }];
  const actions = [{ relpath: 'agent.md', action: 'conflict', content: 'v2 template' }];
  const previous = { files: { 'agent.md': { sha256: sha256('v1 template'), managed: true } } };

  const manifest = build({ plan, actions, previous });

  assert.equal(manifest.files['agent.md'].sha256, sha256('v1 template'));
});

test('a file specframe has never written carries no hash at all', () => {
  const plan = [{ relpath: 'docs/README.md', content: 'template', managed: false }];
  const actions = [{ relpath: 'docs/README.md', action: 'skip-user' }];

  const manifest = build({ plan, actions });

  assert.equal(manifest.files['docs/README.md'].sha256, undefined);
  assert.equal(manifest.files['docs/README.md'].managed, false, 'still tracked for uninstall');
});

test('up-to-date records the planned content it matches', () => {
  const plan = [{ relpath: 'a.md', content: 'same', managed: true }];
  const manifest = build({ plan, actions: [{ relpath: 'a.md', action: 'up-to-date' }] });

  assert.equal(manifest.files['a.md'].sha256, sha256('same'));
});

test('a merge is recorded as a partial write, and stays one', () => {
  const plan = [{ relpath: 'docs/rules/README.md', content: 'planned', managed: false }];
  const merged = build({
    plan,
    actions: [{ relpath: 'docs/rules/README.md', action: 'merge', content: 'theirs + fresh index', merged: true }],
  });
  assert.equal(merged.files['docs/rules/README.md'].merged, true);

  // Nothing to do on the next run: the marker must survive, or the run after
  // that would take the matching hash as licence to rewrite the whole file.
  const again = build({
    plan,
    actions: [{ relpath: 'docs/rules/README.md', action: 'up-to-date', content: 'theirs + fresh index', merged: true }],
    previous: merged,
  });
  assert.equal(again.files['docs/rules/README.md'].merged, true);
  assert.equal(again.files['docs/rules/README.md'].sha256, sha256('theirs + fresh index'));
});

test('a full rewrite clears the partial-write marker', () => {
  const plan = [{ relpath: 'docs/rules/README.md', content: 'the whole template', managed: false }];
  const previous = { files: { 'docs/rules/README.md': { sha256: sha256('theirs'), managed: false, merged: true } } };

  const manifest = build({
    plan,
    actions: [{ relpath: 'docs/rules/README.md', action: 'overwrite', content: 'the whole template' }],
    previous,
  });

  assert.equal(manifest.files['docs/rules/README.md'].merged, undefined);
});
