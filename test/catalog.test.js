import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DECISIONS, GROUPS, LOCAL_ADR_MIN, REGISTRIES, isRelevant } from '../src/decisions/catalog.js';
import { GLOSSARY_GROUPS, GLOSSARY_TERMS } from '../src/decisions/glossary.js';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

// Integrity tests for the catalog itself. Everything the guided mode produces is
// derived from this data, so a broken reference here would surface as a missing
// or misnumbered document in a user's repository. These tests are the reason the
// catalog can grow without a manual review of every cross-reference.

const KINDS = ['rules', 'guidelines', 'runbooks', 'glossary'];
const GROUP_IDS = new Set(GROUPS.map((g) => g.id));

// Placeholders that are substituted globally by the writer, for every file.
const GLOBAL_VARS = new Set(['projectName', 'packageManager', 'initDate']);

const emittedEntries = (option, kind) =>
  (option.emits?.[kind] ?? []).map((e) => (typeof e === 'string' ? { slug: e, vars: {} } : { slug: e.slug, vars: e.vars ?? {} }));

const allOptions = () => DECISIONS.flatMap((d) => d.options.map((o) => ({ decision: d, option: o })));

function placeholdersIn(text) {
  return [...String(text).matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]);
}

function entryText(entry) {
  return Object.values(entry)
    .filter((v) => typeof v === 'string')
    .concat((entry.prerequisites ?? []).join(' '), (entry.steps ?? []).join(' '))
    .join('\n');
}

// --- decisions --------------------------------------------------------------

test('decision ids are unique', () => {
  const ids = DECISIONS.map((d) => d.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate decision id');
});

test('every decision belongs to a declared group', () => {
  for (const d of DECISIONS) {
    assert.ok(GROUP_IDS.has(d.group), `${d.id} has unknown group "${d.group}"`);
  }
});

test('decisions are ordered by group, so gates only reference earlier answers', () => {
  const order = GROUPS.map((g) => g.id);
  const seen = [];
  for (const d of DECISIONS) {
    if (seen[seen.length - 1] !== d.group) seen.push(d.group);
  }
  assert.deepEqual(seen, order, 'decisions must be grouped in GROUPS order');
});

test('ADR numbers are unique, four digits, and in their group range', () => {
  const seen = new Set();
  for (const d of DECISIONS) {
    assert.match(d.adr, /^\d{4}$/, `${d.id} has malformed ADR number "${d.adr}"`);
    assert.ok(!seen.has(d.adr), `ADR number ${d.adr} used twice (${d.id})`);
    seen.add(d.adr);

    // 01xx architecture, 02xx design, … in GROUPS order.
    const expectedPrefix = String(GROUPS.findIndex((g) => g.id === d.group) + 1);
    assert.equal(d.adr[1], expectedPrefix, `${d.id} (${d.group}) should be in ${expectedPrefix}xx`);
  }
});

test('generated ADR paths are unique', () => {
  const paths = DECISIONS.map((d) => `docs/adr/${d.adr}-${d.slug}.md`);
  assert.equal(new Set(paths).size, paths.length, 'two decisions render to the same file');
});

test('no catalog ADR ever reaches the local band reserved for `specframe adr new`', () => {
  // A decision outside the catalog gets its number from LOCAL_ADR_MIN upward
  // (writer.js's recordLocalAdr) precisely because the catalog promises never
  // to allocate one there. Appending a group could in principle push numbers
  // that high one day — this is the tripwire that would catch it.
  for (const d of DECISIONS) {
    assert.ok(Number(d.adr) < LOCAL_ADR_MIN, `${d.id} (ADR-${d.adr}) has entered the local ADR band`);
  }
});

test('reserved ADR numbers do not collide with the static scaffolding', () => {
  // docs/adr/0000-template.md and 0001-repository-decision-policy.md are written
  // in both modes and must never be overwritten by a generated ADR.
  for (const d of DECISIONS) {
    assert.ok(d.adr !== '0000' && d.adr !== '0001', `${d.id} collides with a static ADR file`);
  }
});

test('every decision is answerable and explains itself', () => {
  for (const d of DECISIONS) {
    assert.ok(d.question?.endsWith('?'), `${d.id} question should be a question`);
    assert.ok(d.help?.length > 20, `${d.id} needs a help line`);
    assert.ok(d.context?.length > 60, `${d.id} needs an ADR context paragraph`);
    assert.ok(d.slug && /^[a-z0-9-]+$/.test(d.slug), `${d.id} has a bad slug`);
    assert.ok(d.options.length >= 2, `${d.id} needs at least two options`);
    if (d.when !== undefined) assert.equal(typeof d.when, 'function', `${d.id}.when must be a predicate`);
  }
});

test('a gate returns true when the answer it depends on is missing', () => {
  // Otherwise skipping a gate question would silently hide its follow-ups, and
  // they would vanish from the backlog instead of staying open.
  for (const d of DECISIONS) {
    assert.equal(isRelevant(d, {}), true, `${d.id} is hidden when nothing is answered yet`);
  }
});

test('each decision recommends exactly one option', () => {
  // Exactly one, not at most one: `enter` in the wizard takes the recommendation,
  // so a decision without one is a question enter cannot answer — and `--yes`
  // and the presets would quietly leave it open.
  for (const d of DECISIONS) {
    const recommended = d.options.filter((o) => o.recommended);
    assert.equal(recommended.length, 1, `${d.id} recommends ${recommended.length} options`);
  }
});

test('every option can be rendered into an ADR', () => {
  for (const { decision, option } of allOptions()) {
    const where = `${decision.id}/${option.value}`;
    assert.match(option.value, /^[a-z0-9-]+$/, `${where} has a bad value`);
    assert.ok(option.label?.length > 0, `${where} needs a label`);
    assert.ok(option.statement?.length > 20, `${where} needs a Decision statement`);
    assert.ok(Array.isArray(option.consequences) && option.consequences.length >= 2,
      `${where} needs at least two consequences`);
    assert.ok(option.tradeoff?.length > 15,
      `${where} needs a tradeoff line — it is what other ADRs cite as the reason it was rejected`);
  }
});

test('option values are unique within a decision', () => {
  for (const d of DECISIONS) {
    const values = d.options.map((o) => o.value);
    assert.equal(new Set(values).size, values.length, `${d.id} has duplicate option values`);
  }
});

// --- registries -------------------------------------------------------------

test('registry numbers are unique and four digits within each kind', () => {
  for (const kind of KINDS) {
    const seen = new Map();
    for (const [slug, entry] of Object.entries(REGISTRIES[kind])) {
      if (kind === 'glossary') continue; // terms are grouped, not numbered
      assert.match(entry.number, /^\d{4}$/, `${kind}/${slug} has malformed number`);
      assert.ok(!seen.has(entry.number),
        `${kind} number ${entry.number} used by both ${seen.get(entry.number)} and ${slug}`);
      seen.set(entry.number, slug);
    }
  }
});

test('registry numbers do not collide with the static scaffolding', () => {
  for (const kind of ['rules', 'guidelines', 'runbooks']) {
    for (const [slug, entry] of Object.entries(REGISTRIES[kind])) {
      assert.ok(entry.number !== '0000' && entry.number !== '0001',
        `${kind}/${slug} would overwrite a template or example file`);
    }
  }
});

test('every emitted slug exists in its registry', () => {
  for (const { decision, option } of allOptions()) {
    for (const kind of KINDS) {
      for (const { slug } of emittedEntries(option, kind)) {
        assert.ok(REGISTRIES[kind][slug],
          `${decision.id}/${option.value} emits unknown ${kind} "${slug}"`);
      }
    }
  }
});

test('every registry entry is reachable from at least one option', () => {
  const referenced = { rules: new Set(), guidelines: new Set(), runbooks: new Set(), glossary: new Set() };
  for (const { option } of allOptions()) {
    for (const kind of KINDS) {
      for (const { slug } of emittedEntries(option, kind)) referenced[kind].add(slug);
    }
  }

  for (const kind of KINDS) {
    const orphans = Object.keys(REGISTRIES[kind]).filter((slug) => !referenced[kind].has(slug));
    assert.deepEqual(orphans, [], `unreachable ${kind}: ${orphans.join(', ')}`);
  }
});

test('every placeholder in a registry entry is supplied by every option that emits it', () => {
  for (const kind of KINDS) {
    for (const [slug, entry] of Object.entries(REGISTRIES[kind])) {
      const needed = placeholdersIn(entryText(entry)).filter((v) => !GLOBAL_VARS.has(v));
      if (needed.length === 0) continue;

      for (const { decision, option } of allOptions()) {
        for (const emitted of emittedEntries(option, kind)) {
          if (emitted.slug !== slug) continue;
          for (const key of needed) {
            assert.ok(emitted.vars[key] !== undefined,
              `${decision.id}/${option.value} emits ${kind}/${slug} without vars.${key}`);
          }
        }
      }
    }
  }
});

test('rules declare an enforceable status', () => {
  for (const [slug, entry] of Object.entries(REGISTRIES.rules)) {
    assert.ok(['enforced', 'advisory'].includes(entry.status), `rules/${slug} has status "${entry.status}"`);
    assert.ok(entry.enforcement?.length > 10, `rules/${slug} must name what enforces it`);
  }
});

test('runbooks have steps, verification, and a rollback', () => {
  for (const [slug, entry] of Object.entries(REGISTRIES.runbooks)) {
    assert.ok(entry.steps.length >= 3, `runbooks/${slug} needs real steps`);
    assert.ok(entry.prerequisites.length >= 1, `runbooks/${slug} needs prerequisites`);
    assert.ok(entry.verification?.length > 10, `runbooks/${slug} needs verification`);
    assert.ok(entry.rollback?.length > 10, `runbooks/${slug} needs a rollback`);
  }
});

test('glossary terms belong to a declared group', () => {
  const groups = new Set(Object.keys(GLOSSARY_GROUPS));
  for (const [slug, term] of Object.entries(GLOSSARY_TERMS)) {
    assert.ok(groups.has(term.group), `glossary/${slug} has unknown group "${term.group}"`);
    assert.ok(term.term?.length > 0, `glossary/${slug} needs a display term`);
    assert.ok(term.definition?.length > 30, `glossary/${slug} needs a real definition`);
  }
});

test('glossary group numbers are unique', () => {
  const numbers = Object.values(GLOSSARY_GROUPS).map((g) => g.number);
  assert.equal(new Set(numbers).size, numbers.length, 'duplicate glossary group number');
});

// --- documentation ----------------------------------------------------------

test('the README quotes the real size of the catalog', async () => {
  // The README advertises a count in three places. Adding a decision without
  // updating them would turn the pitch into a lie nobody notices.
  const readme = await readFile(path.join(repoRoot, 'README.md'), 'utf8');
  const quoted = [...readme.matchAll(/(\d+)\s+(?:architecture\s+)?decisions/g)].map((m) =>
    Number(m[1]),
  );

  assert.ok(quoted.length > 0, 'the README should say how many decisions there are');
  for (const n of quoted) {
    assert.equal(n, DECISIONS.length, `README says ${n} decisions, catalog has ${DECISIONS.length}`);
  }
});

test('the README lists every section of the catalog', async () => {
  const readme = await readFile(path.join(repoRoot, 'README.md'), 'utf8');
  // Prose is allowed to write "design & modelling" for "Design and modelling",
  // so compare on a normalised form rather than the literal title.
  const normalise = (s) => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z]+/g, ' ').trim();
  const haystack = normalise(readme);

  for (const group of GROUPS) {
    assert.ok(
      haystack.includes(normalise(group.title)),
      `README does not mention the "${group.title}" section`,
    );
  }
});
