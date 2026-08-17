// Answer presets — a named set of answers over the catalog.
//
// `balanced` is derived from the catalog's own `recommended` flags rather than
// duplicated here, so a new decision joins it automatically and the two can
// never disagree. `strict` layers the more demanding options on top.
//
// Presets are a starting point, not a mode: `--preset=balanced` without
// `--yes` seeds the wizard, so every answer is still reviewable.

import { DECISIONS, isRelevant, recommendedValue } from './catalog.js';

// Every decision that carries a recommendation, at its recommended value.
//
// Filled in catalog order and checked for relevance as it goes, because gates
// depend on earlier answers: once the architecture is a modular monolith, the
// questions about data ownership across services stop applying and must not be
// answered on the user's behalf.
function balancedAnswers() {
  const answers = {};
  for (const decision of DECISIONS) {
    if (!isRelevant(decision, answers)) continue;
    const value = recommendedValue(decision);
    if (value !== undefined) answers[decision.id] = value;
  }
  return answers;
}

// Deliberately stricter than the recommendation, for repositories where the
// cost of a defect outweighs delivery speed.
const STRICT_OVERRIDES = {
  'complexity-budget': 'strict',
  tdd: 'strict',
  'coverage-gate': 'high',
  'mutation-testing': 'yes',
  'pr-policy': 'two-reviews',
  slo: 'yes',
  compliance: 'gdpr',
  ddd: 'full',
};

export const PRESET_IDS = ['blank', 'balanced', 'strict'];

export const PRESETS = {
  blank: {
    id: 'blank',
    mode: 'blank',
    label: 'Blank',
    description: 'No decisions taken. Full template set, filling instructions, and every decision listed as open.',
    answers: () => ({}),
  },
  balanced: {
    id: 'balanced',
    mode: 'guided',
    label: 'Balanced',
    description: 'The recommended option for every decision. A sensible default for a new product codebase.',
    answers: balancedAnswers,
  },
  strict: {
    id: 'strict',
    mode: 'guided',
    label: 'Strict',
    description: 'Balanced, tightened: strict TDD, higher coverage, two reviewers, mutation testing, SLOs, GDPR.',
    answers: () => ({ ...balancedAnswers(), ...STRICT_OVERRIDES }),
  },
};

export function isPresetId(value) {
  return Object.prototype.hasOwnProperty.call(PRESETS, value);
}

// Resolve a preset id to { mode, answers }. Unknown ids throw: a typo in
// `--preset` must not silently scaffold something else.
export function resolvePreset(id) {
  const preset = PRESETS[id];
  if (!preset) {
    throw new Error(
      `Unknown preset: ${id}\nAvailable presets: ${PRESET_IDS.join(', ')}`,
    );
  }
  return { mode: preset.mode, answers: preset.answers() };
}
