// Turn a set of answers into the document set they imply — pure and fs-free, so
// the whole mapping from "what the user chose" to "what lands in docs/" can be
// reasoned about and tested without writing a file.
//
// Two properties matter more than anything else here:
//
//   Stability. A document's number comes from the registry, never from the
//   order answers were given. Answering three decisions today and three more
//   next month must not renumber or move anything already written.
//
//   Determinism. Two runs with the same answers produce byte-identical output,
//   including ordering, so `specframe update` sees no spurious changes.

import {
  DECISIONS,
  GROUPS,
  REGISTRIES,
  getDecision,
  getOption,
  isRelevant,
} from './catalog.js';
import { GLOSSARY_GROUPS } from './glossary.js';

const KINDS = ['rules', 'guidelines', 'runbooks', 'glossary'];

const DOC_DIR = {
  rules: 'docs/rules',
  guidelines: 'docs/guidelines',
  runbooks: 'docs/runbook',
};

// An emitted artifact is either a bare slug or { slug, vars }.
function normalizeEmit(emit) {
  return typeof emit === 'string' ? { slug: emit, vars: {} } : { slug: emit.slug, vars: emit.vars ?? {} };
}

// Answers may carry keys that are not decisions, or values no option declares —
// from a hand-edited manifest, a stale `--answers` file, or a typo in `--set`.
// They are reported rather than ignored so the CLI can say so out loud.
function partitionAnswers(answers) {
  const valid = {};
  const invalid = [];

  for (const [id, value] of Object.entries(answers)) {
    if (value === undefined || value === null || value === '' || value === 'skip') continue;
    const decision = getDecision(id);
    if (!decision) {
      invalid.push({ id, value, reason: 'unknown decision' });
      continue;
    }
    if (!getOption(decision, value)) {
      invalid.push({ id, value, reason: 'unknown option' });
      continue;
    }
    valid[id] = value;
  }

  return { valid, invalid };
}

/**
 * @param {object}  input
 * @param {string}  input.mode     'blank' | 'guided'. In blank mode answers are
 *                                 ignored entirely: every decision is open.
 * @param {object}  input.answers  { [decisionId]: optionValue }
 * @returns resolved document set — see the shape assembled at the end.
 */
export function resolveDecisions({ mode = 'blank', answers = {} } = {}) {
  const { valid, invalid } = partitionAnswers(mode === 'blank' ? {} : answers);

  const decided = [];
  const open = [];
  const notApplicable = [];

  // Walked in catalog order, accumulating the answers that actually apply.
  // Gates only ever reference decisions that come earlier, so relevance can be
  // judged against the prefix — and an answer to a question a previous answer
  // retired is dropped rather than honoured. Without that, `--set
  // contract-testing=yes` on a monolith would generate an ADR about services
  // this repository does not have.
  const effective = {};

  for (const decision of DECISIONS) {
    const value = valid[decision.id];

    if (!isRelevant(decision, effective)) {
      if (value !== undefined) notApplicable.push({ decision, value });
      continue;
    }

    if (value !== undefined) {
      effective[decision.id] = value;
      decided.push({ decision, option: getOption(decision, value) });
    } else {
      open.push({ decision });
    }
  }

  // --- ADRs: one per decision taken -----------------------------------------
  const adrs = decided.map(({ decision, option }) => ({
    kind: 'adr',
    number: decision.adr,
    slug: decision.slug,
    relpath: `docs/adr/${decision.adr}-${decision.slug}.md`,
    decision,
    option,
    // Everything not chosen, so the ADR records what was weighed and rejected.
    alternatives: decision.options.filter((o) => o.value !== option.value),
  }));

  // --- derived documents ----------------------------------------------------
  // Several decisions legitimately require the same rule. It is written once,
  // citing every ADR that depends on it; the first set of vars wins, which is
  // deterministic because `decided` follows catalog order.
  const collected = { rules: new Map(), guidelines: new Map(), runbooks: new Map(), glossary: new Map() };

  for (const { decision, option } of decided) {
    for (const kind of KINDS) {
      for (const raw of option.emits?.[kind] ?? []) {
        const { slug, vars } = normalizeEmit(raw);
        const entry = REGISTRIES[kind][slug];
        if (!entry) {
          throw new Error(
            `Catalog error: decision "${decision.id}" option "${option.value}" ` +
              `emits unknown ${kind} slug "${slug}".`,
          );
        }
        const existing = collected[kind].get(slug);
        if (existing) {
          existing.sources.push(decision.adr);
          continue;
        }
        collected[kind].set(slug, { slug, entry, vars, sources: [decision.adr] });
      }
    }
  }

  const byNumber = (a, b) => a.number.localeCompare(b.number);

  const materialize = (kind) =>
    [...collected[kind].values()]
      .map((item) => ({
        kind,
        slug: item.slug,
        number: item.entry.number,
        entry: item.entry,
        vars: item.vars,
        sources: [...new Set(item.sources)].sort(),
        relpath: `${DOC_DIR[kind]}/${item.entry.number}-${item.slug}.md`,
      }))
      .sort(byNumber);

  // --- glossary: terms are grouped into one file per area -------------------
  const glossaryGroups = Object.entries(GLOSSARY_GROUPS)
    .map(([groupId, group]) => {
      const terms = [...collected.glossary.values()]
        .filter((t) => t.entry.group === groupId)
        // Alphabetical inside the file, so which decision pulled a term in
        // never affects where it appears.
        .map((t) => ({ slug: t.slug, entry: t.entry, sources: [...new Set(t.sources)].sort() }))
        .sort((a, b) => a.entry.term.localeCompare(b.entry.term));

      return {
        kind: 'glossary',
        groupId,
        number: group.number,
        title: group.title,
        terms,
        relpath: `docs/glossary/${group.number}-${groupId}.md`,
      };
    })
    .filter((g) => g.terms.length > 0)
    .sort(byNumber);

  return {
    mode,
    answers: effective,
    decided,
    open,
    invalid,
    notApplicable,
    adrs,
    rules: materialize('rules'),
    guidelines: materialize('guidelines'),
    runbooks: materialize('runbooks'),
    glossaryGroups,
  };
}

// Group the open decisions for docs/DECISIONS.md, preserving catalog order and
// dropping groups with nothing outstanding.
export function groupOpenDecisions(open) {
  return GROUPS.map((group) => ({
    group,
    decisions: open.filter((o) => o.decision.group === group.id).map((o) => o.decision),
  })).filter((g) => g.decisions.length > 0);
}

// Counts for the wizard's confirmation screen and the CLI summary.
export function summarize(resolved) {
  return {
    decided: resolved.decided.length,
    open: resolved.open.length,
    adrs: resolved.adrs.length,
    rules: resolved.rules.length,
    guidelines: resolved.guidelines.length,
    runbooks: resolved.runbooks.length,
    glossaryTerms: resolved.glossaryGroups.reduce((n, g) => n + g.terms.length, 0),
  };
}
