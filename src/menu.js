import { isRelevant } from './decisions/catalog.js';
import { resolveDecisions } from './decisions/resolve.js';
import { AGENT_TARGET_LIST } from './prompts.js';
import { normalizeConfig } from './template-plan.js';

// The menu's rows and preamble for a repository specframe has not scaffolded
// yet — pure, like buildInstalledMenu below, so the copy is a test rather than
// a claim.
export function buildNotInstalledMenu({ version }) {
  const preamble = [
    `specframe ${version} is not installed here yet.`,
    'Onboarding answers a catalog of architecture decisions and writes an ADR, ' +
      'rules, guidelines, runbooks and glossary terms for each — plus native files ' +
      '(agents, commands, skills) for whichever AI assistants you pick, including Claude.',
    'Nothing is written until you reach the review step at the end of that wizard.',
  ];
  const options = [
    {
      value: 'init',
      label: 'Start onboarding',
      hint: 'Runs `specframe init`: pick a mode (blank/guided/blueprint), answer decisions, choose AI assistants, review, then write.',
      // The one row here: enter should take it, same as every other single-choice
      // screen in this wizard. Without this the picker's cursor starts on no row
      // (nothing to accept), so a bare enter quits instead — which reads as the
      // CLI hanging, since askMenu prints nothing for that case here (see the
      // explicit "Nothing to do." below).
      recommended: true,
    },
  ];
  return { options, preamble };
}

// The menu's rows and the state line above them, from a manifest alone — pure,
// so what the list offers in which repository is a test rather than a claim.
export function buildInstalledMenu({ manifest, version }) {
  const stored = normalizeConfig(manifest.config);
  const resolved = resolveDecisions({
    mode: 'guided',
    answers: stored.decisions,
    dismissed: stored.dismissed,
  });
  const open = resolved.open.filter((entry) => isRelevant(entry.decision, stored.decisions)).length;
  const decided = Object.keys(stored.decisions).length;
  const addableAgents = AGENT_TARGET_LIST.map((t) => t.value).filter(
    (value) => !stored.agentTargets.includes(value),
  );
  const stale = manifest.version !== undefined && manifest.version !== version;

  const options = [];
  if (open > 0) {
    options.push({
      value: 'decide',
      label: `Record decisions still open (${open})`,
      hint: 'Walk the ones this repository has not answered. Each becomes an ADR plus the rules, guidelines, runbooks and glossary terms it implies.',
    });
  }
  options.push({
    value: 'review',
    label: 'Review what is recorded here',
    hint: 'The decisions table: what was decided, what is open, what was dismissed.',
  });
  if (decided > 0) {
    options.push({
      value: 'revise',
      label: `Change a decision already recorded (${decided})`,
      hint: 'The ADR keeps its number and gains a History section naming what the decision used to be.',
    });
  }
  if (addableAgents.length > 0) {
    options.push({
      value: 'agents',
      label: `Add an AI assistant (${addableAgents.length} available)`,
      hint: `Native files for ${addableAgents.join(', ')}, wired to the docs/ already here.`,
    });
  }
  if (stored.agentTargets.length > 0) {
    options.push({
      value: 'agents-remove',
      label: `Remove an AI assistant (${stored.agentTargets.join(', ')})`,
      hint: 'Drops that tool\'s native files. docs/ and the decision log stay as they are — a repo with no harness is a supported position.',
    });
  }
  options.push({
    value: 'update',
    label: stale ? `Refresh generated files for specframe ${version}` : 'Refresh generated files',
    hint: 'Re-renders what specframe manages. Files you own are never overwritten; one you edited is kept, with the new version beside it.',
  });
  options.push({
    value: 'uninstall',
    label: 'Remove what specframe created',
    hint: 'Managed files by default; you are asked which user-owned files (docs/, …) to remove too.',
  });

  const preamble = [
    `specframe ${manifest.version ?? 'unknown'} is installed here, in ${stored.mode} mode` +
      (stale ? `; this CLI is ${version}.` : '.') +
      ` ${decided} recorded, ${open} open.`,
    'Run `specframe init --force` to re-run onboarding from scratch instead.',
  ];

  return { options, preamble };
}

