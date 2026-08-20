// Non-interactive answer sources: `--set`, `--answers <file>`, `--preset` and
// `--blueprint`.
//
// These exist so the guided onboarding is scriptable — in CI, in a template
// repository, or when re-creating a known configuration — without anyone having
// to type through forty questions. Everything here is pure except the file
// read, and every source ends up as the same `{ decisionId: optionValue }` map
// the wizard produces.

import { readFile } from 'node:fs/promises';

import { resolveBlueprint } from './decisions/blueprints.js';
import { DECISIONS, getDecision, getOption, isRelevant, recommendedValue } from './decisions/catalog.js';
import { resolvePreset } from './decisions/presets.js';

// Parse `--set a=b,c=d` (repeatable, and tolerant of spaces after commas).
// A malformed pair throws rather than being dropped: silently ignoring half of
// `--set` would scaffold something the caller did not ask for.
export function parseSetFlag(value) {
  const answers = {};
  for (const pair of (value ?? '').split(',')) {
    const token = pair.trim();
    if (token === '') continue;
    const eq = token.indexOf('=');
    if (eq <= 0) {
      throw new Error(`Invalid --set entry: "${token}". Expected decision-id=option-value.`);
    }
    answers[token.slice(0, eq).trim()] = token.slice(eq + 1).trim();
  }
  return answers;
}

// An answers file is `{ "decision-id": "option-value" }`, optionally wrapped as
// `{ "mode": "...", "decisions": { … } }` — which is exactly the shape the
// manifest stores, so a manifest can be replayed into a new repository.
export async function readAnswersFile(filePath) {
  let parsed;
  try {
    parsed = JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`Could not read answers file ${filePath}: ${error.message}`);
  }

  if (parsed && typeof parsed === 'object' && parsed.decisions && typeof parsed.decisions === 'object') {
    return { mode: parsed.mode, answers: parsed.decisions };
  }
  if (parsed && typeof parsed === 'object') {
    return { mode: undefined, answers: parsed };
  }
  throw new Error(`Answers file ${filePath} must contain a JSON object.`);
}

// Split answers into the ones the catalog recognises and the ones it does not.
// Unknown entries are surfaced, never silently dropped — a typo in `--set`
// should be visible rather than quietly producing a smaller scaffold.
export function validateAnswers(answers = {}) {
  const valid = {};
  const invalid = [];

  for (const [id, value] of Object.entries(answers)) {
    const decision = getDecision(id);
    if (!decision) {
      invalid.push({ id, value, reason: 'no such decision' });
      continue;
    }
    if (value === 'skip' || value === '' || value === null || value === undefined) continue;
    if (!getOption(decision, value)) {
      const known = decision.options.map((o) => o.value).join(', ');
      invalid.push({ id, value, reason: `no such option (expected one of: ${known})` });
      continue;
    }
    valid[id] = value;
  }

  return { valid, invalid };
}

// Merge every non-interactive source in precedence order:
// preset < blueprint < answers file < --set. Later sources win per decision, so
// a preset can be adjusted with a single `--set` without restating the rest.
//
// A blueprint beats a preset because the two answer different questions: the
// preset is a posture applied to everything, the blueprint is the shape of this
// particular system. `--preset strict --blueprint microservices` is a real
// combination — strict everywhere, microservices in the architecture — and it
// only means that if the shape wins where they overlap.
export async function collectAnswerSources({ preset, blueprint, answersFile, set } = {}) {
  let mode;
  let answers = {};

  if (preset) {
    const resolved = resolvePreset(preset);
    mode = resolved.mode;
    answers = { ...resolved.answers };
  }

  if (blueprint) {
    const resolved = resolveBlueprint(blueprint);
    mode = resolved.mode;
    answers = { ...answers, ...resolved.answers };
  }

  if (answersFile) {
    const fromFile = await readAnswersFile(answersFile);
    if (fromFile.mode) mode = fromFile.mode;
    answers = { ...answers, ...fromFile.answers };
  }

  if (set) {
    answers = { ...answers, ...parseSetFlag(set) };
    // An explicit answer is an intent to configure, even without --preset.
    if (!mode) mode = 'guided';
  }

  return { mode, answers };
}

// Fill every still-unanswered decision with its recommendation. Used by `d` in
// the wizard and by `--yes` without a preset.
//
// Walks the catalog in order and re-checks relevance at each step, so a
// recommendation never answers a question that an earlier answer has retired.
//
// `dismissed` is relevant here for a reason that is easy to miss: a dismissed
// decision *is* relevant per `isRelevant` — a dismissal is not a gate — so
// without this it would look exactly like any other unanswered question and
// `--yes` (or the wizard's `d`) would silently un-dismiss it.
export function applyRecommendedDefaults(answers = {}, { only, dismissed = {} } = {}) {
  const filled = { ...answers };
  for (const decision of DECISIONS) {
    if (!isRelevant(decision, filled)) continue;
    if (only && !only.includes(decision.id)) continue;
    if (filled[decision.id] !== undefined) continue;
    if (dismissed[decision.id] !== undefined) continue;
    const value = recommendedValue(decision);
    if (value !== undefined) filled[decision.id] = value;
  }
  return filled;
}
