// The decision brief: everything the interactive wizard's `?` shows for one
// decision, available without a terminal so an agent can hold the same
// conversation a human would — the question, why it exists, every option with
// its statement/consequences/tradeoff, which is recommended, and exactly what
// each produces. Pure and fs-free, like catalog.js and resolve.js: it reads
// the catalog and the registries, nothing else.

import { getDecision, recommendedValue, isRelevant, REGISTRIES } from './catalog.js';

const ID_PREFIX = { rules: 'R', guidelines: 'GL', runbooks: 'RB', glossary: 'GLO' };
const DOC_DIR = { rules: 'docs/rules', guidelines: 'docs/guidelines', runbooks: 'docs/runbook' };
const EMIT_KINDS = ['rules', 'guidelines', 'runbooks', 'glossary'];

function slugOf(raw) {
  return typeof raw === 'string' ? raw : raw.slug;
}

// A bare slug means nothing to an agent that has not read rules.js — resolve
// it to the registry entry's real id and title, the way render.js does when
// it renders a "Source: R-0090" cross-link.
function resolveEmits(emits = {}) {
  const out = {};
  for (const kind of EMIT_KINDS) {
    out[kind] = (emits[kind] ?? []).map((raw) => {
      const slug = slugOf(raw);
      const entry = REGISTRIES[kind][slug];
      if (!entry) return { slug, id: null, title: null };
      return { slug, id: `${ID_PREFIX[kind]}-${entry.number}`, title: kind === 'glossary' ? entry.term : entry.title };
    });
  }
  return out;
}

function documentsFor(option) {
  const docs = [];
  for (const kind of ['rules', 'guidelines', 'runbooks']) {
    for (const raw of option.emits?.[kind] ?? []) {
      const slug = slugOf(raw);
      const entry = REGISTRIES[kind][slug];
      if (entry) docs.push(`${DOC_DIR[kind]}/${entry.number}-${slug}.md`);
    }
  }
  return docs;
}

/**
 * @param {string} id                the decision id, as used in --set and the manifest.
 * @param {object} [input]
 * @param {object} [input.answers]     { [decisionId]: optionValue } — the repository's
 *                                     current answers, so `current` and `relevant`
 *                                     reflect this repo rather than a blank one.
 * @param {object} [input.provenance]  { [decisionId]: 'chosen' | 'detected' }.
 * @returns the brief, or null when `id` is not in the catalog.
 */
export function explainDecision(id, { answers = {}, provenance = {} } = {}) {
  const decision = getDecision(id);
  if (!decision) return null;

  const current = answers[id] ?? null;
  const recommended = recommendedValue(decision) ?? null;

  return {
    id: decision.id,
    group: decision.group,
    title: decision.title,
    question: decision.question,
    help: decision.help,
    context: decision.context,
    adr: decision.adr,
    adrPath: `docs/adr/${decision.adr}-${decision.slug}.md`,
    relevant: isRelevant(decision, answers),
    status: current !== null ? 'decided' : 'open',
    current,
    provenance: current !== null ? (provenance[id] === 'detected' ? 'detected' : 'chosen') : null,
    recommendedValue: recommended,
    options: decision.options.map((option) => ({
      value: option.value,
      label: option.label,
      hint: option.hint ?? null,
      recommended: option.value === recommended,
      statement: option.statement,
      consequences: option.consequences,
      tradeoff: option.tradeoff,
      emits: resolveEmits(option.emits),
      documents: documentsFor(option),
    })),
  };
}
