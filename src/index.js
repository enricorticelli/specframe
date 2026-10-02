import { readFile } from 'node:fs/promises';
import process from 'node:process';
import { HELP, parseArgs } from './cli-args.js';
import { configureTheme } from './style.js';

// Preserve the public entry points used by consumers and tests.
export { parseArgs } from './cli-args.js';
export { buildInstalledMenu, buildNotInstalledMenu } from './menu.js';
import { runInit } from './commands/init.js';
import { runDecide } from './commands/decide.js';
import { runRevise } from './commands/revise.js';
import { runDismiss, runRestore } from './commands/dismiss.js';
import { runReview, runExplain } from './commands/inspect.js';
import { runAdrNew, runDocNew, runAdrRemove } from './commands/documents.js';
import { runAgents } from './commands/agents.js';
import { runUpdate, runUninstall } from './commands/maintenance.js';

async function getVersion() {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  return pkg.version;
}

export async function run(argv = process.argv.slice(2)) {
  const { command, flags, commandSeen } = parseArgs(argv);
  const cwd = process.cwd();
  const version = await getVersion();

  // `--no-color` has to be honoured before anything is printed, and it only
  // turns colour off: a flag cannot force it on where the terminal says no.
  if (flags.noColor) configureTheme({ color: false });

  if (flags.help || command === 'help') {
    console.log(HELP);
    return;
  }

  const handlers = {
    init: () => runInit(cwd, version, flags, { explicit: commandSeen }),
    decide: () => runDecide(cwd, version, flags),
    review: () => runReview(cwd, flags),
    explain: () => runExplain(cwd, flags),
    adr: () => (flags.target === 'rm' ? runAdrRemove : runAdrNew)(cwd, version, flags),
    doc: () => runDocNew(cwd, version, flags),
    revise: () => runRevise(cwd, version, flags),
    dismiss: () => runDismiss(cwd, version, flags),
    restore: () => runRestore(cwd, version, flags),
    agents: () => runAgents(cwd, version, flags),
    update: () => runUpdate(cwd, version, flags),
    uninstall: () => runUninstall(cwd, flags),
  };

  if (!Object.hasOwn(handlers, command)) {
    throw new Error(`Unknown command: ${command}\n\n${HELP}`);
  }
  await handlers[command]();
}
