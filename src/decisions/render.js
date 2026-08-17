// Render a resolved decision set into markdown.
//
// Generated documents are composed here rather than kept as .tpl files: their
// content is data (see rules.js and friends), and one renderer per kind keeps
// every generated rule structurally identical to the next. The static
// scaffolding — READMEs, 0000 templates, examples — stays in src/templates/.
//
// Output must be deterministic: the same resolved set always renders the same
// bytes, because `specframe update` compares content hashes.

import { DECISIONS, GROUPS } from './catalog.js';
import { groupOpenDecisions } from './resolve.js';

// ADR number → decision slug, so a derived document can link back to the ADR
// filename without carrying it around.
const ADR_SLUG = new Map(DECISIONS.map((d) => [d.adr, d.slug]));

// Fill {{placeholders}} a catalog option supplied. Unknown placeholders are
// left alone on purpose: {{projectName}} and {{packageManager}} are global and
// substituted later, by the writer, for generated and static files alike.
function fill(text, vars = {}) {
  let out = text;
  for (const [key, value] of Object.entries(vars)) {
    out = out.replaceAll(`{{${key}}}`, value);
  }
  return out;
}

const bullets = (items) => items.map((item) => `- ${item}`).join('\n');

// Relative link between two docs/ paths, e.g. docs/adr/… → ../rules/0010-x.md
function relLink(fromRelpath, toRelpath) {
  const from = fromRelpath.split('/').slice(0, -1);
  const to = toRelpath.split('/');
  let i = 0;
  while (i < from.length && i < to.length - 1 && from[i] === to[i]) i += 1;
  const up = Array(from.length - i).fill('..');
  return [...up, ...to.slice(i)].join('/');
}

const ID_PREFIX = { rules: 'R', guidelines: 'GL', runbooks: 'RB', glossary: 'GLO' };

const docId = (kind, number) => `${ID_PREFIX[kind]}-${number}`;

// Every generated document that cites this ADR as its source.
function derivedFor(resolved, adrNumber) {
  const pick = (list) => list.filter((item) => item.sources.includes(adrNumber));
  return {
    rules: pick(resolved.rules),
    guidelines: pick(resolved.guidelines),
    runbooks: pick(resolved.runbooks),
  };
}

// --- ADR -------------------------------------------------------------------

export function renderAdr(adr, { date, resolved }) {
  const { decision, option, alternatives, number, relpath, provenance } = adr;
  const detected = provenance === 'detected';
  const revisions = adr.revisions ?? [];
  const revisedOn = revisions.length > 0 ? revisions[revisions.length - 1].date : null;
  const lines = [];

  lines.push(`# ADR-${number}: ${decision.title}`, '');
  lines.push('- Status: accepted');
  lines.push(`- Date: ${date}${detected ? ' (recorded, not decided — see Context)' : ''}`);
  // A revised ADR must say so in its header: the Decision section below is the
  // current one, and a reader who remembers the old answer needs to know the
  // document changed under them rather than assume they misremembered.
  if (revisedOn) lines.push(`- Revised: ${revisedOn} (see History)`);
  lines.push(`- Decision key: \`${decision.id}\` = \`${option.value}\``);
  if (detected) lines.push('- Recorded from: the existing implementation');
  lines.push('');

  lines.push('## Context', '', decision.context, '');
  if (detected) {
    // A reconstructed ADR that reads like a fresh choice is misleading: it
    // implies a deliberation that never happened at this date, and invites a
    // reader to trust the reasoning as contemporaneous.
    lines.push(
      'This decision was already implemented when this record was created. The ADR',
      'documents what the code does today; the date above is when it was written down,',
      'not when the choice was made. Correct the context if you know the original',
      'reason — that is the part the code cannot tell you.',
      '',
    );
  }

  lines.push('## Decision', '', `**${option.label}.** ${option.statement}`, '');

  if (detected) {
    lines.push('## Evidence in this repository', '');
    lines.push(
      '<!-- Where this decision is visible in the code. Cite `path/to/file.ext:line`.',
      '     If the codebase only partly follows it, say so here — a half-applied',
      '     decision is the most useful thing this document can record. -->',
      '',
      '-',
      '',
    );
  }

  lines.push('## Consequences', '', bullets(option.consequences), '');

  if (alternatives.length > 0) {
    // For a reconstructed ADR these were not weighed at the time — claiming they
    // were would be fiction. They are still worth recording: they are what a
    // future proposal to change this decision has to argue against.
    lines.push(detected ? '## Alternatives not taken' : '## Alternatives considered', '');
    lines.push(bullets(alternatives.map((alt) => `**${alt.label}** — ${alt.tradeoff}`)), '');
    if (detected) {
      lines.push(
        '<!-- Reconstructed: these were not necessarily weighed when the decision was',
        '     made. Add the ones that genuinely were, and why they lost. -->',
        '',
      );
    }
  }

  const derived = derivedFor(resolved, number);
  const sections = [
    ['Rules', derived.rules, 'rules'],
    ['Guidelines', derived.guidelines, 'guidelines'],
    ['Runbooks', derived.runbooks, 'runbooks'],
  ].filter(([, items]) => items.length > 0);

  if (sections.length > 0) {
    lines.push('## Documents this decision produced', '');
    for (const [label, items, kind] of sections) {
      const links = items.map(
        (item) => `[${docId(kind, item.number)}](${relLink(relpath, item.relpath)})`,
      );
      lines.push(`- ${label}: ${links.join(', ')}`);
    }
    lines.push('');
  }

  if (revisions.length > 0) {
    // Newest first: the most recent thing this decision used to be is the one a
    // reader is most likely to be holding in their head.
    lines.push('## History', '');
    for (const entry of [...revisions].reverse()) {
      const label = entry.option ? `**${entry.option.label}**` : `\`${entry.value}\``;
      const why = entry.option?.tradeoff ? ` ${entry.option.tradeoff}` : '';
      lines.push(`- Until ${entry.date} this decision was ${label}.${why}`);
    }
    lines.push(
      '',
      '<!-- Why it changed is the part no tool can fill in. Add it here: the next',
      '     person to propose changing it back will read this first. -->',
      '',
    );
  }

  lines.push(
    `<!-- To change this decision, run \`specframe revise ${decision.id}\`: it records`,
    '     the old choice under History, refreshes the documents listed above, and',
    '     reports the ones this decision no longer implies. -->',
    '',
  );

  return lines.join('\n');
}

// --- derived documents -----------------------------------------------------

// Back-links to every ADR that requires this document. All derived documents
// live one directory below docs/, so the relative path is always `../adr/`.
function sourceLine(item) {
  return item.sources
    .map((adr) => `[ADR-${adr}](../adr/${adr}-${ADR_SLUG.get(adr)}.md)`)
    .join(', ');
}

export function renderRule(item) {
  const { entry, vars, number } = item;
  return [
    `# R-${number}: ${fill(entry.title, vars)}`,
    '',
    `- Status: ${entry.status}`,
    `- Source: ${sourceLine(item)}`,
    '',
    '## Rule',
    '',
    fill(entry.statement, vars),
    '',
    '## Why',
    '',
    fill(entry.why, vars),
    '',
    '## Enforcement',
    '',
    fill(entry.enforcement, vars),
    '',
  ].join('\n');
}

export function renderGuideline(item) {
  const { entry, vars, number } = item;
  const lines = [
    `# GL-${number}: ${fill(entry.title, vars)}`,
    '',
    `- Status: ${entry.status ?? 'active'}`,
    `- Source: ${sourceLine(item)}`,
    '',
    '## Scope',
    '',
    fill(entry.scope, vars),
    '',
    '## Guideline',
    '',
    fill(entry.statement, vars),
    '',
    '## Rationale',
    '',
    fill(entry.rationale, vars),
    '',
  ];

  if (entry.good || entry.avoid) {
    lines.push('## Examples', '');
    if (entry.good) lines.push('Prefer:', '', '```', fill(entry.good, vars), '```', '');
    if (entry.avoid) lines.push('Avoid:', '', '```', fill(entry.avoid, vars), '```', '');
  }

  return lines.join('\n');
}

export function renderRunbook(item) {
  const { entry, number } = item;
  return [
    `# RB-${number}: ${entry.title}`,
    '',
    `- Source: ${sourceLine(item)}`,
    '',
    '## When to use',
    '',
    entry.when,
    '',
    '## Prerequisites',
    '',
    bullets(entry.prerequisites),
    '',
    '## Steps',
    '',
    entry.steps.map((step, i) => `${i + 1}. ${step}`).join('\n'),
    '',
    '## Verification',
    '',
    entry.verification,
    '',
    '## Rollback',
    '',
    entry.rollback,
    '',
    '<!-- Replace the placeholder commands above with the real ones for this repository. -->',
    '',
  ].join('\n');
}

export function renderGlossaryGroup(group) {
  const lines = [`# GLO-${group.number}: ${group.title}`, '', '- Status: active', ''];

  for (const { entry } of group.terms) {
    lines.push(`## ${entry.term}`, '');
    lines.push(`**Definition.** ${entry.definition}`, '');
    lines.push(`- **Aliases / Acronyms**: ${entry.aliases}`);
    lines.push(`- **Context**: ${entry.context}`);
    lines.push(`- **Related**: ${entry.related}`);
    lines.push('- **Source**: _add `path/to/file.ext:line` where this concept lives in the code._');
    lines.push('');
  }

  return lines.join('\n');
}

// --- indexes ---------------------------------------------------------------

const EMPTY_INDEX = '<!-- No entries yet. Add them as NNNN-slug.md files following 0000-template.md. -->';

export function renderAdrIndex(resolved) {
  if (resolved.adrs.length === 0) {
    return '<!-- No decisions recorded yet. See ../DECISIONS.md for the open ones. -->';
  }

  const rows = GROUPS.flatMap((group) => {
    const inGroup = resolved.adrs.filter((a) => a.decision.group === group.id);
    if (inGroup.length === 0) return [];
    return [
      '',
      `### ${group.title}`,
      '',
      '| ADR | Decision | Choice |',
      '| --- | --- | --- |',
      ...inGroup.map(
        (a) =>
          `| [ADR-${a.number}](./${a.number}-${a.slug}.md) | ${a.decision.title} | ${a.option.label} |`,
      ),
    ];
  });

  return rows.join('\n').trim();
}

function renderDocIndex(items, kind, columns) {
  if (items.length === 0) return EMPTY_INDEX;
  const header = `| ID | ${columns} | Source |`;
  const sep = `| --- | ${columns.split(' | ').map(() => '---').join(' | ')} | --- |`;
  return [header, sep, ...items.map((item) => renderDocRow(item, kind))].join('\n');
}

function renderDocRow(item, kind) {
  const id = docId(kind, item.number);
  const file = item.relpath.split('/').pop();
  const title = fill(item.entry.title, item.vars);
  const sources = item.sources.map((adr) => `ADR-${adr}`).join(', ');
  if (kind === 'rules') {
    return `| [${id}](./${file}) | ${title} | ${item.entry.status} | ${sources} |`;
  }
  if (kind === 'guidelines') {
    return `| [${id}](./${file}) | ${title} | ${item.entry.status ?? 'active'} | ${sources} |`;
  }
  return `| [${id}](./${file}) | ${title} | ${sources} |`;
}

export const renderRulesIndex = (resolved) => renderDocIndex(resolved.rules, 'rules', 'Rule | Status');
export const renderGuidelinesIndex = (resolved) =>
  renderDocIndex(resolved.guidelines, 'guidelines', 'Guideline | Status');
export const renderRunbookIndex = (resolved) => renderDocIndex(resolved.runbooks, 'runbooks', 'Procedure');

export function renderGlossaryIndex(resolved) {
  if (resolved.glossaryGroups.length === 0) {
    return '| File | Domain area | Terms |\n| --- | --- | --- |\n| _(none yet)_ | | |';
  }
  return [
    '| File | Domain area | Terms |',
    '| --- | --- | --- |',
    ...resolved.glossaryGroups.map((g) => {
      const file = g.relpath.split('/').pop();
      const terms = g.terms.map((t) => t.entry.term).join(', ');
      return `| [${file}](./${file}) | ${g.title} | ${terms} |`;
    }),
  ].join('\n');
}

// --- docs/DECISIONS.md -----------------------------------------------------

export function renderOpenDecisions(resolved) {
  if (resolved.open.length === 0) {
    return 'Every decision in the specframe catalog has been recorded. When a new\ndecision arises that no ADR covers, add it under `docs/adr/` and list it here.';
  }

  const lines = [];
  for (const { group, decisions } of groupOpenDecisions(resolved.open)) {
    lines.push(`### ${group.title}`, '');
    for (const decision of decisions) {
      const options = decision.options
        .map((o) => (o.recommended ? `\`${o.value}\` _(recommended)_` : `\`${o.value}\``))
        .join(' · ');
      lines.push(`- [ ] **${decision.title}** — \`${decision.id}\`, ADR-${decision.adr} reserved`);
      lines.push(`  - ${decision.question}`);
      lines.push(`  - Options: ${options}`);
      lines.push(`  - Why it matters: ${decision.help}`);
      lines.push('');
    }
  }
  return lines.join('\n').trimEnd();
}

export function renderTakenDecisions(resolved) {
  if (resolved.decided.length === 0) {
    return '_None yet._ Run `specframe decide` to record one, or write the ADR by hand.';
  }

  const lines = ['| Decision | Choice | ADR |', '| --- | --- | --- |'];
  for (const adr of resolved.adrs) {
    lines.push(
      `| ${adr.decision.title} | ${adr.option.label} | [ADR-${adr.number}](adr/${adr.number}-${adr.slug}.md) |`,
    );
  }
  return lines.join('\n');
}
