import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { readManifest } from './manifest.js';
import { askQuestions } from './prompts.js';
import { updateTemplateSet, writeTemplateSet } from './writer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function getVersion() {
  const pkg = JSON.parse(await readFile(path.join(__dirname, '..', 'package.json'), 'utf8'));
  return pkg.version;
}

function parseArgs(argv) {
  const flags = { force: false, dryRun: false, help: false };
  let command = 'init';
  let commandSeen = false;

  for (const arg of argv) {
    if (arg === '--force' || arg === '-f') flags.force = true;
    else if (arg === '--dry-run' || arg === '-n') flags.dryRun = true;
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
  specframe [init]            Scaffold context files (never overwrites existing ones).
  specframe update [options]  Refresh specframe-managed artifacts to this version.

Update options:
  -f, --force      Overwrite managed files even if you edited them.
  -n, --dry-run    Show what would change without writing anything.
  -h, --help       Show this help.

On update, files you own (docs, ADRs, CLAUDE.md, …) are never overwritten.
A managed file you edited by hand is kept; the new version lands beside it as
<file>.specframe-new for you to merge.`;

async function runInit(targetDir, version) {
  const answers = await askQuestions();
  await writeTemplateSet({ targetDir, ...answers, version });
  console.log(`\nDone. Context files are ready in: ${targetDir}`);
}

async function runUpdate(targetDir, version, flags) {
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

export async function run(argv = process.argv.slice(2)) {
  const { command, flags } = parseArgs(argv);
  const targetDir = process.cwd();
  const version = await getVersion();

  if (flags.help || command === 'help') {
    console.log(HELP);
    return;
  }

  if (command === 'update') {
    await runUpdate(targetDir, version, flags);
    return;
  }

  if (command === 'init') {
    await runInit(targetDir, version);
    return;
  }

  throw new Error(`Unknown command: ${command}\n\n${HELP}`);
}
