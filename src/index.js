import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { readManifest } from './manifest.js';
import { askQuestions } from './prompts.js';
import { findRepoRoot, isGitRepoRoot } from './repo.js';
import { uninstallTemplateSet, updateTemplateSet, writeTemplateSet } from './writer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function getVersion() {
  const pkg = JSON.parse(await readFile(path.join(__dirname, '..', 'package.json'), 'utf8'));
  return pkg.version;
}

function parseArgs(argv) {
  const flags = { force: false, dryRun: false, purge: false, help: false };
  let command = 'init';
  let commandSeen = false;

  for (const arg of argv) {
    if (arg === '--force' || arg === '-f') flags.force = true;
    else if (arg === '--dry-run' || arg === '-n') flags.dryRun = true;
    else if (arg === '--purge') flags.purge = true;
    else if (arg === '--help' || arg === '-h') flags.help = true;
    else if (!arg.startsWith('-') && !commandSeen) {
      command = arg;
      commandSeen = true;
    }
  }

  return { command, flags };
}

const HELP = `specframe — scaffold and maintain AI-context files for a repository.

Usage:
  specframe [init]            Scaffold context files at the repo root.
  specframe update [options]  Refresh specframe-managed artifacts to this version.
  specframe uninstall [options]  Remove everything specframe created.

The scaffolding is always written to the root of the repository (the nearest
ancestor with a .git directory), even when you run the CLI from a subdirectory.

Update options:
  -f, --force      Overwrite managed files even if you edited them.
  -n, --dry-run    Show what would change without writing anything.

Uninstall options:
      --purge      Also remove user-owned starters (CLAUDE.md, docs/**, …).
                   By default only specframe-managed files are removed.
  -n, --dry-run    Show what would be removed without deleting anything.

Common options:
  -h, --help       Show this help.

On update, files you own (docs, ADRs, CLAUDE.md, …) are never overwritten.
A managed file you edited by hand is kept; the new version lands beside it as
<file>.specframe-new for you to merge.`;

async function runInit(cwd, version) {
  const targetDir = await resolveTargetDir(cwd);
  const answers = await askQuestions();
  await writeTemplateSet({ targetDir, ...answers, version });
  console.log(`\nDone. Context files are ready in: ${targetDir}`);
}

async function runUpdate(cwd, version, flags) {
  const targetDir = await resolveTargetDir(cwd);
  const manifest = await readManifest(targetDir);

  let config;
  if (manifest?.config) {
    config = manifest.config;
    console.log(
      `Updating to specframe ${version} (was ${manifest.version ?? 'unknown'}), ` +
        `using choices saved in ${'.specframe/manifest.json'}.\n`,
    );
  } else {
    console.log(
      'No .specframe/manifest.json found — this repo was scaffolded before update\n' +
        'tracking existed. Re-confirm your choices; edited files will be preserved\n' +
        'conservatively (a .specframe-new is written instead of overwriting).\n',
    );
    config = await askQuestions();
  }

  await updateTemplateSet({
    targetDir,
    ...config,
    version,
    force: flags.force,
    dryRun: flags.dryRun,
  });

  console.log(flags.dryRun ? '\nDry run complete. Nothing was written.' : '\nUpdate complete.');
}

async function runUninstall(cwd, flags) {
  const targetDir = await resolveTargetDir(cwd);
  await uninstallTemplateSet({ targetDir, purge: flags.purge, dryRun: flags.dryRun });
}

// Always operate on the repository root, never on an arbitrary subdirectory.
// `init`/`update`/`uninstall` resolve to the nearest ancestor containing a
// `.git` (the actual repo root) or an existing `.specframe/manifest.json` (a
// repo specframe already scaffolded). If neither is found we fall back to cwd
// and warn when it isn't itself a git repo root, so `init` still works in a
// brand-new folder that hasn't been `git init`-ed yet.
async function resolveTargetDir(cwd) {
  const root = await findRepoRoot(cwd);
  if (root) {
    if (root !== path.resolve(cwd)) {
      console.log(`Operating on repository root: ${root}`);
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

export async function run(argv = process.argv.slice(2)) {
  const { command, flags } = parseArgs(argv);
  const cwd = process.cwd();
  const version = await getVersion();

  if (flags.help || command === 'help') {
    console.log(HELP);
    return;
  }

  if (command === 'update') {
    await runUpdate(cwd, version, flags);
    return;
  }

  if (command === 'uninstall') {
    await runUninstall(cwd, flags);
    return;
  }

  if (command === 'init') {
    await runInit(cwd, version);
    return;
  }

  throw new Error(`Unknown command: ${command}\n\n${HELP}`);
}
