import path from 'node:path';
import { summarize } from '../decisions/resolve.js';
import { findRepoRoot, isGitRepoRoot } from '../repo.js';
import { theme } from '../style.js';

export function reportInvalidAnswers(invalid) {
  if (invalid.length === 0) return;
  console.warn(theme.warn('\nIgnoring answers that do not match the decision catalog:'));
  for (const { id, value, reason } of invalid) {
    console.warn(`  ${theme.bold(`${id}=${value}`)} ${theme.muted(`— ${reason}`)}`);
  }
  console.warn('');
}

// The wizard's `x` key records only a reason (see applyDecisionResult in
// prompts.js) — dating it happens once, here, when the run's config is
// finalized, exactly like every ADR this same run produces shares one
// `initDate` rather than a per-keystroke timestamp. `?? date` makes this safe
// to call on a dismissal that already carries one (from a previous run).
export function stampDismissed(dismissed, date) {
  return Object.fromEntries(
    Object.entries(dismissed).map(([id, entry]) => [id, { date: entry.date ?? date, reason: entry.reason ?? null }]),
  );
}

export function logPlanSummary(resolved) {
  const s = summarize(resolved);
  console.log(
    `\n${theme.bold(String(s.decided))} ${theme.muted('decisions recorded')} ${theme.muted(theme.glyph.bullet)} ` +
      `${s.open > 0 ? theme.warn(String(s.open)) : theme.bold('0')} ${theme.muted('open')} ` +
      `${theme.muted(theme.glyph.bullet)} ` +
      theme.muted(
        `${s.adrs} ADRs, ${s.rules} rules, ${s.guidelines} guidelines, ` +
          `${s.runbooks} runbooks, ${s.glossaryTerms} glossary terms`,
      ),
  );
}

// Always operate on the repository root, never on an arbitrary subdirectory.
// `init`/`decide`/`update`/`uninstall` resolve to the nearest ancestor
// containing a `.git` (the actual repo root) or an existing
// `.specframe/manifest.json` (a repo specframe already scaffolded). If neither
// is found we fall back to cwd and warn when it isn't itself a git repo root,
// so `init` still works in a brand-new folder that hasn't been `git init`-ed yet.
export async function resolveTargetDir(cwd) {
  const root = await findRepoRoot(cwd);
  if (root) {
    if (root !== path.resolve(cwd)) {
      // Informational, not the command's output — stderr, so `--json` callers
      // piping stdout into a parser never see it mixed in.
      console.error(`Operating on repository root: ${root}`);
    }
    return root;
  }

  if (!(await isGitRepoRoot(cwd))) {
    console.warn(
      `Warning: no .git found at or above ${cwd}.\n` +
        `Scaffolding in ${cwd} anyway — run \`git init\` first for a real repository.`,
    );
  }
  return cwd;
}
