import process from 'node:process';
import { isRelevant } from '../decisions/catalog.js';
import { resolveDecisions } from '../decisions/resolve.js';
import { readManifest } from '../manifest.js';
import { askQuestions, askUninstallPurgeSelection } from '../prompts.js';
import { theme } from '../style.js';
import { normalizeConfig, previewUninstallKept, today, uninstallTemplateSet, updateTemplateSet } from '../writer.js';
import { stampDismissed, resolveTargetDir } from './context.js';

export async function runUpdate(cwd, version, flags) {
  const targetDir = await resolveTargetDir(cwd);
  const manifest = await readManifest(targetDir);

  let config;
  if (manifest?.config) {
    config = normalizeConfig(manifest.config);
    console.log(
      `Updating to specframe ${version} (was ${manifest.version ?? 'unknown'}), ` +
        `using choices saved in ${'.specframe/manifest.json'}.\n`,
    );
    if (manifest.config.contentProfile !== undefined && manifest.config.mode === undefined) {
      console.warn(
        'This repository was scaffolded before the two onboarding modes existed.\n' +
          `The old "${manifest.config.contentProfile}" content profile no longer exists; your\n` +
          'documents under docs/ are yours and are left untouched. Run `specframe decide`\n' +
          'to record decisions as ADRs going forward.\n',
      );
    }
  } else {
    console.log(
      'No .specframe/manifest.json found — this repo was scaffolded before update\n' +
        'tracking existed. Re-confirm your choices; edited files will be preserved\n' +
        'conservatively (a .specframe-new is written instead of overwriting).\n',
    );
    const answers = await askQuestions({});
    if (answers === null) {
      console.log('\nCancelled. Nothing was written.');
      return;
    }
    const initDate = today();
    config = { ...answers, dismissed: stampDismissed(answers.dismissed ?? {}, initDate), initDate };
  }

  await updateTemplateSet({
    targetDir,
    ...config,
    version,
    force: flags.force,
    dryRun: flags.dryRun,
  });

  // A newer catalog can introduce decisions this repo has never seen. They are
  // not re-prompted: they surface in docs/DECISIONS.md, and `specframe decide`
  // is how you answer them.
  if (config.mode === 'guided') {
    const resolved = resolveDecisions({ mode: 'guided', answers: config.decisions, dismissed: config.dismissed });
    const newOpen = resolved.open.filter((o) => isRelevant(o.decision, config.decisions));
    if (newOpen.length > 0) {
      console.log(
        `\n${newOpen.length} decisions in this version's catalog are unanswered here.\n` +
          'They are listed in docs/DECISIONS.md — run `specframe decide` to record them.',
      );
    }
  }

  console.log(flags.dryRun ? '\nDry run complete. Nothing was written.' : '\nUpdate complete.');
}

export async function runUninstall(cwd, flags) {
  const targetDir = await resolveTargetDir(cwd);

  // `--purge` already says "everything"; off a terminal or with `-y` there is
  // nobody to ask. Otherwise, rather than the all-or-nothing flag, offer the
  // user-owned files (docs/, the PR template, …) one at a time.
  let purgePaths;
  if (!flags.purge && !flags.yes && process.stdin.isTTY) {
    const kept = await previewUninstallKept({ targetDir });
    if (kept === null) {
      throw new Error(
        `No .specframe/manifest.json in ${targetDir}.\n` + 'Nothing to uninstall — run `specframe init` first.',
      );
    }
    if (kept.length > 0) {
      purgePaths = await askUninstallPurgeSelection({ paths: kept });
      if (purgePaths === null) {
        console.log(theme.muted('\nCancelled. Nothing was removed.'));
        return;
      }
    }
  }

  await uninstallTemplateSet({ targetDir, purge: flags.purge, purgePaths, dryRun: flags.dryRun });
}
