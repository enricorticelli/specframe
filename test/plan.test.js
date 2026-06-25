import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildTemplatePlan } from '../src/writer.js';

const baseOpts = {
  projectName: 'acme',
  packageManager: 'pnpm',
  contentProfile: 'empty',
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
  assert.equal(entryFor(without, '.claude/agents/explorer.md'), undefined);

  const withClaude = await buildTemplatePlan({ ...baseOpts, agentTargets: ['claude'] });
  const explorer = entryFor(withClaude, '.claude/agents/explorer.md');
  assert.ok(explorer, 'explorer agent should be planned for claude');
  assert.equal(explorer.managed, true);

  const skill = entryFor(withClaude, '.claude/skills/specframe-adr-draft/SKILL.md');
  assert.equal(skill.managed, true);
});

test('content profile selects the matching template body', async () => {
  const universal = await buildTemplatePlan({ ...baseOpts, contentProfile: 'universal' });
  const empty = await buildTemplatePlan({ ...baseOpts, contentProfile: 'empty' });

  const uRules = entryFor(universal, 'docs/rules/README.md').content;
  const eRules = entryFor(empty, 'docs/rules/README.md').content;
  assert.notEqual(uRules, eRules, 'universal profile should differ from empty');
});
