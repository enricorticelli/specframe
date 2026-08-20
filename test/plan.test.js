import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildTemplatePlan } from '../src/writer.js';

const baseOpts = {
  projectName: 'acme',
  packageManager: 'pnpm',
  mode: 'blank',
  initDate: '2026-08-17',
  agentTargets: [],
};

function entryFor(plan, relpath) {
  return plan.find((e) => e.relpath === relpath);
}

test('plan includes core scaffolding as user-owned with variables rendered', async () => {
  const plan = await buildTemplatePlan(baseOpts);

  const agents = entryFor(plan, 'AGENTS.md');
  assert.ok(agents, 'AGENTS.md should be in the plan');
  assert.equal(agents.managed, false);
  assert.ok(!agents.content.includes('{{projectName}}'), 'variables must be rendered');
});

test('plan includes docs scaffolding as user-owned', async () => {
  const plan = await buildTemplatePlan(baseOpts);
  assert.equal(entryFor(plan, 'docs/adr/0000-template.md').managed, false);
  assert.equal(entryFor(plan, 'docs/rules/README.md').managed, false);
});

test('plan uses forward-slash relpaths (manifest keys)', async () => {
  const plan = await buildTemplatePlan(baseOpts);
  assert.ok(plan.every((e) => !e.relpath.includes('\\')), 'no backslashes in relpaths');
});

test('agent artifacts are managed and only present when targeted', async () => {
  const without = await buildTemplatePlan(baseOpts);
  assert.equal(entryFor(without, '.claude/agents/bootstrapper.md'), undefined);

  const withClaude = await buildTemplatePlan({ ...baseOpts, agentTargets: ['claude'] });
  const bootstrapper = entryFor(withClaude, '.claude/agents/bootstrapper.md');
  assert.ok(bootstrapper, 'bootstrapper agent should be planned for claude');
  assert.equal(bootstrapper.managed, true);

  const skill = entryFor(withClaude, '.claude/skills/specframe-decide/SKILL.md');
  assert.equal(skill.managed, true);
});

test('specframe-decide is shipped as both a command and a skill, sharing one body', async () => {
  const plan = await buildTemplatePlan({ ...baseOpts, agentTargets: ['claude'] });
  const command = entryFor(plan, '.claude/commands/specframe-decide.md');
  const skill = entryFor(plan, '.claude/skills/specframe-decide/SKILL.md');
  assert.ok(command && skill, 'both the command and the skill should be planned');

  const bodyOf = (content) => content.slice(content.indexOf('\n\n') + 2);
  assert.equal(bodyOf(command.content), bodyOf(skill.content), 'one body, two surfaces');
});

test('the harness-shaped assets specframe used to ship are gone', async () => {
  const plan = await buildTemplatePlan({ ...baseOpts, agentTargets: ['claude'] });
  for (const relpath of [
    '.claude/agents/explorer.md',
    '.claude/agents/planner.md',
    '.claude/commands/specframe-specify.md',
    '.claude/commands/specframe-plan.md',
  ]) {
    assert.equal(entryFor(plan, relpath), undefined, `${relpath} should not be planned`);
  }
});

// --- modes -----------------------------------------------------------------

test('blank mode ships the full template set and no decision documents', async () => {
  const plan = await buildTemplatePlan(baseOpts);
  const paths = plan.map((e) => e.relpath);

  for (const section of ['adr', 'rules', 'guidelines', 'runbook', 'glossary']) {
    assert.ok(paths.includes(`docs/${section}/README.md`), `${section} index`);
    assert.ok(paths.includes(`docs/${section}/0000-template.md`), `${section} template`);
  }
  assert.ok(paths.includes('docs/README.md'), 'the map of the decision log');
  assert.ok(paths.includes('docs/DECISIONS.md'), 'the decision backlog');

  // Worked examples exist only where there is no generated content to learn from.
  assert.ok(paths.includes('docs/rules/0001-example.md'));

  const generated = paths.filter((p) => /^docs\/(rules|guidelines|runbook)\/0[1-9]/.test(p));
  assert.deepEqual(generated, [], 'blank mode generates no decision documents');
});

test('blank mode leaves every section index empty', async () => {
  const plan = await buildTemplatePlan(baseOpts);
  const rules = entryFor(plan, 'docs/rules/README.md').content;
  assert.match(rules, /## Index\n\n<!-- No entries yet\./);
  assert.ok(!rules.includes('{{index}}'), 'placeholder must be substituted');
});

test('blank mode lists the whole catalog as open decisions', async () => {
  const plan = await buildTemplatePlan(baseOpts);
  const decisions = entryFor(plan, 'docs/DECISIONS.md').content;

  assert.match(decisions, /## Open decisions/);
  assert.match(decisions, /\*\*Architecture style\*\* — `architecture-style`, ADR-0100 reserved/);
  assert.match(decisions, /_None yet\._/, 'nothing recorded yet');
  assert.ok(!decisions.includes('{{'), 'no unsubstituted placeholders');
});

test('guided mode writes an ADR per decision plus the documents it implies', async () => {
  const plan = await buildTemplatePlan({
    ...baseOpts,
    mode: 'guided',
    decisions: { 'architecture-style': 'microservices', 'event-sourcing': 'yes' },
  });
  const paths = plan.map((e) => e.relpath);

  assert.ok(paths.includes('docs/adr/0100-architecture-style.md'));
  assert.ok(paths.includes('docs/adr/0320-event-sourcing.md'));
  assert.ok(paths.includes('docs/rules/0090-no-cross-service-db.md'));
  assert.ok(paths.includes('docs/rules/0130-events-are-immutable.md'));
  assert.ok(paths.includes('docs/runbook/0040-rebuild-projections.md'));
  assert.ok(paths.includes('docs/glossary/0020-data.md'));

  // Examples would be noise beside real content.
  assert.ok(!paths.includes('docs/rules/0001-example.md'));

  // Generated documents are the user's decision log, never specframe's.
  for (const entry of plan.filter((e) => e.relpath.startsWith('docs/'))) {
    assert.equal(entry.managed, false, `${entry.relpath} must be user-owned`);
  }
});

test('a generated ADR records alternatives and links what it produced', async () => {
  const plan = await buildTemplatePlan({
    ...baseOpts,
    mode: 'guided',
    decisions: { 'event-sourcing': 'yes' },
  });
  const adr = entryFor(plan, 'docs/adr/0320-event-sourcing.md').content;

  assert.match(adr, /^# ADR-0320: Event sourcing/);
  assert.match(adr, /- Date: 2026-08-17/, 'date comes from initDate, not the clock');
  assert.match(adr, /## Alternatives considered/);
  assert.match(adr, /\*\*No, store current state\*\*/, 'the rejected option and its trade-off');
  assert.match(adr, /\[R-0130\]\(\.\.\/rules\/0130-events-are-immutable\.md\)/);
});

test('a generated rule links back to every ADR that requires it', async () => {
  const plan = await buildTemplatePlan({
    ...baseOpts,
    mode: 'guided',
    // Both decisions require the outbox rule.
    decisions: { 'architecture-style': 'microservices', 'distributed-transactions': 'saga-orchestration' },
  });
  const rule = entryFor(plan, 'docs/rules/0300-outbox-for-cross-service-writes.md').content;
  assert.match(rule, /- Source: \[ADR-0340\]\(\.\.\/adr\/0340-distributed-transactions\.md\)/);
});

test('guided mode indexes only the documents it generated', async () => {
  const plan = await buildTemplatePlan({
    ...baseOpts,
    mode: 'guided',
    decisions: { 'clean-code': 'yes' },
  });
  const index = entryFor(plan, 'docs/guidelines/README.md').content;
  assert.match(index, /\[GL-0010\]\(\.\/0010-naming-conventions\.md\)/);
  assert.ok(!index.includes('0150-module-layout'), 'undecided documents stay out');
});

test('a parametrised document is filled from the option that emitted it', async () => {
  const plan = await buildTemplatePlan({
    ...baseOpts,
    mode: 'guided',
    decisions: { 'coverage-gate': 'high', 'complexity-budget': 'strict' },
  });
  const coverage = entryFor(plan, 'docs/rules/0170-coverage-gate.md').content;
  const complexity = entryFor(plan, 'docs/rules/0280-complexity-budget.md').content;

  assert.match(coverage, /at or above 80%/);
  assert.match(complexity, /at or below 10/);
  assert.ok(!coverage.includes('{{'), 'no unsubstituted placeholders');
  assert.ok(!complexity.includes('{{'));
});

test('answers to questions a previous answer retired are dropped', async () => {
  const plan = await buildTemplatePlan({
    ...baseOpts,
    mode: 'guided',
    // Contract testing only applies to a distributed architecture.
    decisions: { 'architecture-style': 'modular-monolith', 'contract-testing': 'yes' },
  });
  const paths = plan.map((e) => e.relpath);
  assert.ok(paths.includes('docs/adr/0100-architecture-style.md'));
  assert.ok(!paths.includes('docs/adr/0530-contract-testing.md'), 'gated off, so not recorded');
});

test('blank mode ignores decisions it was handed', async () => {
  const plan = await buildTemplatePlan({
    ...baseOpts,
    mode: 'blank',
    decisions: { 'architecture-style': 'microservices' },
  });
  assert.equal(entryFor(plan, 'docs/adr/0100-architecture-style.md'), undefined);
});

// --- documenting an existing codebase --------------------------------------

test('a detected decision is recorded as reconstructed, not as a fresh choice', async () => {
  const plan = await buildTemplatePlan({
    ...baseOpts,
    mode: 'guided',
    decisions: { 'architecture-style': 'microservices' },
    provenance: { 'architecture-style': 'detected' },
  });
  const adr = entryFor(plan, 'docs/adr/0100-architecture-style.md').content;

  assert.match(adr, /- Recorded from: the existing implementation/);
  assert.match(adr, /recorded, not decided/);
  assert.match(adr, /## Evidence in this repository/);
  assert.match(adr, /## Alternatives not taken/, 'they were not weighed at the time');
  assert.ok(!adr.includes('## Alternatives considered'));
  // Still a full ADR: the decision, its consequences and its documents.
  assert.match(adr, /\*\*Microservices\.\*\*/);
  assert.match(adr, /## Consequences/);
  assert.match(adr, /\[R-0090\]/);
});

test('the documents a detected decision implies are identical to a chosen one', async () => {
  // Only the ADR's framing changes: a rule is a rule however it was arrived at.
  const opts = { ...baseOpts, mode: 'guided', decisions: { 'event-sourcing': 'yes' } };
  const chosen = await buildTemplatePlan(opts);
  const detected = await buildTemplatePlan({ ...opts, provenance: { 'event-sourcing': 'detected' } });

  const nonAdr = (plan) =>
    plan.filter((e) => !e.relpath.startsWith('docs/adr/')).map((e) => [e.relpath, e.content]);
  assert.deepEqual(nonAdr(detected), nonAdr(chosen));
  assert.notEqual(
    entryFor(detected, 'docs/adr/0320-event-sourcing.md').content,
    entryFor(chosen, 'docs/adr/0320-event-sourcing.md').content,
  );
});

test('provenance for a decision that was not recorded is discarded', async () => {
  // A stale manifest entry must not change how anything renders.
  const plan = await buildTemplatePlan({
    ...baseOpts,
    mode: 'guided',
    decisions: { tdd: 'strict' },
    provenance: { 'event-sourcing': 'detected', tdd: 'chosen' },
  });
  const adr = entryFor(plan, 'docs/adr/0500-test-driven-development.md').content;
  assert.ok(!adr.includes('Recorded from'), 'an explicit "chosen" stays a normal ADR');
});

test('no planned file ships an unsubstituted placeholder', async () => {
  // Generated documents and static templates go through different renderers;
  // this is what catches one of them forgetting the global variables.
  for (const mode of ['blank', 'guided']) {
    const plan = await buildTemplatePlan({
      ...baseOpts,
      mode,
      agentTargets: ['claude', 'copilot', 'codex', 'gemini', 'continue', 'amazonq'],
      decisions: (await import('../src/decisions/presets.js')).resolvePreset('strict').answers,
    });

    for (const entry of plan) {
      const leftovers = [...entry.content.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[0]);
      assert.deepEqual(leftovers, [], `${entry.relpath} (${mode}) has ${leftovers.join(', ')}`);
    }
  }
});

test('the package manager reaches generated documents, not just templates', async () => {
  const plan = await buildTemplatePlan({
    ...baseOpts,
    packageManager: 'pnpm',
    mode: 'guided',
    decisions: { 'lint-format': 'ci-enforced' },
  });
  const rule = entryFor(plan, 'docs/rules/0060-lint-format-ci.md').content;
  assert.match(rule, /`pnpm run lint`/);
});

test('rendering is deterministic for the same answers', async () => {
  const opts = { ...baseOpts, mode: 'guided', decisions: { tdd: 'strict', 'clean-code': 'yes' } };
  const a = await buildTemplatePlan(opts);
  const b = await buildTemplatePlan(opts);
  assert.deepEqual(
    a.map((e) => [e.relpath, e.content]),
    b.map((e) => [e.relpath, e.content]),
  );
});
