import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, access } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { buildTemplatePlan, writeTemplateSet, updateTemplateSet } from '../src/writer.js';
import { parseAgentTargets } from '../src/prompts.js';
import { readManifest } from '../src/manifest.js';

const baseOpts = {
  projectName: 'acme',
  packageManager: 'npm',
  contentProfile: 'empty',
  agentTargets: [],
};

const entryFor = (plan, relpath) => plan.find((e) => e.relpath === relpath);
const abs = (dir, rel) => path.join(dir, ...rel.split('/'));

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

// --- plan shape ------------------------------------------------------------

test('gemini target emits a user-owned GEMINI.md pointing at the canon', async () => {
  const plan = await buildTemplatePlan({ ...baseOpts, agentTargets: ['gemini'] });
  const e = entryFor(plan, 'GEMINI.md');
  assert.ok(e, 'GEMINI.md should be planned');
  assert.equal(e.managed, false, 'GEMINI.md is a user-owned starter');
  assert.match(e.content, /AGENTS\.md/);
  assert.match(e.content, /docs\/rules/);
  assert.match(e.content, /acme/, 'projectName rendered');
  assert.ok(!e.content.startsWith('---'), 'plain markdown, no frontmatter');
});

test('continue target emits a managed always-apply rule', async () => {
  const plan = await buildTemplatePlan({ ...baseOpts, agentTargets: ['continue'] });
  const e = entryFor(plan, '.continue/rules/specframe.md');
  assert.ok(e, '.continue/rules/specframe.md should be planned');
  assert.equal(e.managed, true);
  assert.ok(e.content.startsWith('---'), 'has frontmatter');
  assert.match(e.content, /alwaysApply:\s*true/);
  assert.match(e.content, /AGENTS\.md/);
});

test('amazonq target emits a managed plain-markdown rule', async () => {
  const plan = await buildTemplatePlan({ ...baseOpts, agentTargets: ['amazonq'] });
  const e = entryFor(plan, '.amazonq/rules/specframe.md');
  assert.ok(e, '.amazonq/rules/specframe.md should be planned');
  assert.equal(e.managed, true);
  assert.ok(!e.content.startsWith('---'), 'plain markdown, no frontmatter');
  assert.match(e.content, /AGENTS\.md/);
});

test('triad and rules targets coexist in one plan', async () => {
  const plan = await buildTemplatePlan({ ...baseOpts, agentTargets: ['claude', 'gemini'] });
  assert.ok(entryFor(plan, '.claude/agents/explorer.md'), 'claude triad present');
  assert.ok(entryFor(plan, 'GEMINI.md'), 'gemini rules present');
});

// --- prompt parsing --------------------------------------------------------

test('parseAgentTargets accepts the new rules targets and drops unknown ones', () => {
  assert.deepEqual(
    parseAgentTargets('claude, gemini, continue, amazonq, bogus'),
    ['claude', 'gemini', 'continue', 'amazonq'],
  );
});

// --- update behaviour ------------------------------------------------------

test('update keeps a hand-edited GEMINI.md but conflicts a managed rule', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'sf-rules-'));
  const opts = { ...baseOpts, agentTargets: ['gemini', 'continue'] };
  try {
    await writeTemplateSet({ targetDir: dir, ...opts, version: '0.1.0' });

    // user edits both
    await writeFile(abs(dir, 'GEMINI.md'), 'my own gemini notes', 'utf8');
    await writeFile(abs(dir, '.continue/rules/specframe.md'), 'my own continue rule', 'utf8');

    await updateTemplateSet({ targetDir: dir, ...opts, version: '0.2.0' });

    // user-owned: untouched, no sibling
    assert.equal(await readFile(abs(dir, 'GEMINI.md'), 'utf8'), 'my own gemini notes');
    assert.equal(await exists(`${abs(dir, 'GEMINI.md')}.specframe-new`), false);

    // managed: kept, new version lands beside it
    assert.equal(
      await readFile(abs(dir, '.continue/rules/specframe.md'), 'utf8'),
      'my own continue rule',
    );
    assert.ok(await exists(`${abs(dir, '.continue/rules/specframe.md')}.specframe-new`));

    const manifest = await readManifest(dir);
    assert.equal(manifest.files['GEMINI.md'].managed, false);
    assert.equal(manifest.files['.continue/rules/specframe.md'].managed, true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
