import { explainDecision } from '../decisions/explain.js';
import { resolveDecisions, summarize } from '../decisions/resolve.js';
import { readManifest } from '../manifest.js';
import { renderReview } from '../prompts.js';
import { buildReview, reviewToJSON } from '../review.js';
import { terminalWidth, theme } from '../style.js';
import { normalizeConfig } from '../writer.js';
import { resolveTargetDir } from './context.js';

// Read back what this repository has decided, as the same table the wizard
// shows. It answers the question a scaffolded repo raises months later — "what
// did we actually agree, and what is still open" — without opening 30 ADRs.
export async function runReview(cwd, flags) {
  const targetDir = await resolveTargetDir(cwd);
  const manifest = await readManifest(targetDir);
  if (!manifest?.config) {
    throw new Error(
      `No ${'.specframe/manifest.json'} in ${targetDir}.\n` +
        'Run `specframe init` first — `review` reads the decisions it recorded.',
    );
  }

  const stored = normalizeConfig(manifest.config);

  if (flags.json) {
    const review = buildReview(stored.decisions ?? {}, { dismissed: stored.dismissed ?? {} });
    console.log(JSON.stringify({ version: manifest.version ?? null, ...reviewToJSON(review) }, null, 2));
    return;
  }

  const width = terminalWidth();

  console.log('');
  console.log(theme.rule(width, stored.projectName ?? 'specframe'));
  console.log(
    theme.muted(
      `  mode ${stored.mode ?? 'unknown'} ${theme.glyph.bullet} scaffolded with specframe ` +
        `${manifest.version ?? 'unknown'} ${theme.glyph.bullet} ${stored.initDate ?? 'unknown date'}`,
    ),
  );
  console.log('');
  console.log(renderReview(stored.decisions ?? {}, { width, openOnly: flags.open, dismissed: stored.dismissed ?? {} }));
  console.log('');

  const s = summarize(
    resolveDecisions({ mode: 'guided', answers: stored.decisions ?? {}, dismissed: stored.dismissed ?? {} }),
  );
  console.log(
    theme.muted(
      s.open > 0
        ? '  `specframe decide` records the open ones.'
        : s.dismissed > 0
          ? '  Every applicable decision is recorded; the rest were dismissed as not applicable.'
          : '  Every decision in this catalog is recorded. Supersede one by editing its ADR.',
    ),
  );
}

// The decision brief — the `?` the interactive wizard shows for one question,
// available without a terminal. Works even without a manifest (a fresh
// directory, before `init`): there is simply no repository context to fold in,
// so the decision shows as open and always relevant. This is what
// `specframe-decide` reads before proposing anything, and what a human can run
// on its own to see the alternatives a given decision weighs.
export async function runExplain(cwd, flags) {
  const targetDir = await resolveTargetDir(cwd);
  const id = flags.target;
  if (!id) {
    throw new Error('Usage: specframe explain <decision-id> [--json]\n\nRun `specframe review` to see decision ids.');
  }

  const manifest = await readManifest(targetDir);
  const stored = manifest?.config ? normalizeConfig(manifest.config) : null;
  const explanation = explainDecision(id, {
    answers: stored?.decisions ?? {},
    provenance: stored?.provenance ?? {},
  });
  if (!explanation) {
    throw new Error(
      `Unknown decision: ${id}\nRun \`specframe review\` to see the decisions this repository records.`,
    );
  }

  if (flags.json) {
    console.log(JSON.stringify(explanation, null, 2));
    return;
  }

  console.log(formatExplanation(explanation));
}

function formatExplanation(exp) {
  const lines = [];
  lines.push(`${theme.bold(exp.title)} ${theme.muted(`(ADR-${exp.adr})`)}`, '');
  lines.push(exp.question, '');
  lines.push(theme.muted(exp.help), '');
  lines.push(exp.context, '');

  if (exp.status === 'decided') {
    lines.push(
      `${theme.good('Current:')} ${exp.current}` +
        (exp.provenance === 'detected' ? theme.muted(' (detected, not chosen)') : ''),
    );
  } else {
    lines.push(theme.warn('Not yet decided.'));
  }
  if (!exp.relevant) lines.push(theme.muted('Not currently relevant to this configuration.'));
  lines.push('');

  for (const option of exp.options) {
    const marker = option.recommended ? theme.good(' ★ recommended') : '';
    lines.push(`${theme.bold(option.label)}${marker}` + (option.hint ? theme.muted(`  — ${option.hint}`) : ''));
    lines.push(`  ${option.statement}`);
    for (const consequence of option.consequences) lines.push(`  - ${consequence}`);
    lines.push(theme.muted(`  Tradeoff: ${option.tradeoff}`));
    lines.push('');
  }

  return lines.join('\n').trimEnd();
}
