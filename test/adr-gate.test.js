import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { writeTemplateSet } from '../src/writer.js';
import { mergeGeneratedSections } from '../src/update.js';

// The gate that keeps an ADR from being written for a variable name. It lives in
// one place — ADR_GATE_NOTE in src/writer.js, substituted as {{adrGate}} — and
// the point of these tests is that it reaches *every* harness. A harness whose
// files carry the loose version of the instruction is the whole bug this guards.

const BASE = {
  projectName: 'acme',
  packageManager: 'npm',
  mode: 'blank',
  initDate: '2026-08-17',
};

const ALL_TARGETS = ['claude', 'codex', 'copilot'];

// Phrases from ADR_GATE_NOTE. Deliberately not the whole string: the wording will
// be edited, the three-question shape and the null outcome must not disappear.
const GATE_MARKERS = [/two or more \*\*credible options\*\*|\*\*two or more credible options\*\*/, /reversing it later be expensive/i, /writing\s*\n?\s*nothing is the correct outcome/i];

// Every file an agent could read as its only instruction before creating an ADR.
// specframe writes no context file any more, so the surfaces are exactly the
// skill each harness gets — including Copilot, whose prompt is the only slot it
// has for one. A harness missing from this list cannot see the gate at all.
const GATED_SURFACES = [
  '.claude/skills/specframe-record/SKILL.md',
  '.agents/skills/specframe-record/SKILL.md',
  '.github/prompts/specframe-record.prompt.md',
];

const abs = (dir, rel) => path.join(dir, ...rel.split('/'));

async function scaffold(agentTargets = ALL_TARGETS) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'sf-adr-gate-'));
  await writeTemplateSet({ targetDir: dir, ...BASE, agentTargets, version: '0.8.0' });
  return dir;
}

async function allFiles(dir, base = dir) {
  const out = [];
  for (const entry of await readdir(dir)) {
    const full = path.join(dir, entry);
    if ((await stat(full)).isDirectory()) out.push(...(await allFiles(full, base)));
    else out.push(path.relative(base, full));
  }
  return out;
}

test('the gate reaches every surface that can create an ADR', async () => {
  const dir = await scaffold();
  try {
    for (const relpath of GATED_SURFACES) {
      const content = await readFile(abs(dir, relpath), 'utf8');
      for (const marker of GATE_MARKERS) {
        assert.match(content, marker, `${relpath} is missing the gate (${marker})`);
      }
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('docs/adr/README.md names the sections a rejected candidate goes to, ending in nowhere', async () => {
  const dir = await scaffold([]);
  try {
    const content = await readFile(abs(dir, 'docs/adr/README.md'), 'utf8');
    assert.match(content, /If any one of the three fails, there is no ADR/);
    assert.match(content, /\| nowhere \|/, 'the routing table must offer nowhere');
    assert.match(content, /Nowhere is a legitimate outcome/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("specframe-record's trigger is conjunctive and carries an explicit negative list", async () => {
  const dir = await scaffold(['claude']);
  try {
    const skill = await readFile(abs(dir, '.claude/skills/specframe-record/SKILL.md'), 'utf8');
    assert.match(skill, /Invoke when \*\*all\*\* of these hold/, 'a disjunctive trigger is what over-fired');
    assert.match(skill, /## Do not invoke when/);
    assert.match(skill, /Do not record an ADR to be safe/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('conformance flags an ADR that should not have been written', async () => {
  const dir = await scaffold(['claude']);
  try {
    const agent = await readFile(abs(dir, '.claude/agents/conformance.md'), 'utf8');
    assert.match(agent, /fails the gate/);
    assert.match(agent, /Over-recording erodes the log/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('no template placeholder survives rendering', async () => {
  const dir = await scaffold();
  try {
    for (const relpath of await allFiles(dir)) {
      const content = await readFile(abs(dir, relpath), 'utf8');
      assert.doesNotMatch(content, /\{\{[a-zA-Z]/, `${relpath} leaked an unsubstituted placeholder`);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// --- reaching repositories scaffolded before the gate existed -----------------
// The gate is worthless if it only lands in new repos: the failure it fixes is
// happening right now in repos already scaffolded. docs/adr/README.md is
// user-owned, so `update` would report `[keep] your file` and leave the loose
// instruction in place. It declares generated sections instead — see
// ADR_README_SECTIONS in src/writer.js.

test("docs/adr/README.md's gate section merges without needing an anchor", async () => {
  const dir = await scaffold([]);
  try {
    const planned = await readFile(abs(dir, 'docs/adr/README.md'), 'utf8');
    const disk = `# Architecture Decision Records

## When to write one

Write an ADR when **all** of these hold:

- there was more than one credible option;

## Conventions

Our house rules, kept.

## Index

<!-- stale -->

## Decisions outside the catalog

<!-- stale -->
`;
    const merged = mergeGeneratedSections(disk, planned, [
      '## When to write one',
      '## Index',
      '## Decisions outside the catalog',
    ]);
    assert.notEqual(merged, null);
    assert.match(merged, /\| nowhere \|/);
    assert.match(merged, /Nowhere is a legitimate outcome/);
    assert.match(merged, /Our house rules, kept\./);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
