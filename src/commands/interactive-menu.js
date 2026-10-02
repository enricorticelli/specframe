import { buildInstalledMenu, buildNotInstalledMenu } from '../menu.js';
import { askMenu } from '../prompts.js';
import { theme } from '../style.js';
import { createReadlineIo } from '../tui.js';
import { runDecide } from './decide.js';
import { runRevise } from './revise.js';
import { runReview } from './inspect.js';
import { runAgents } from './agents.js';
import { runUpdate, runUninstall } from './maintenance.js';

// What `specframe` (bare, no subcommand) shows in a repository that is not
// scaffolded yet: a summary of what onboarding does, with the wizard itself
// one deliberate keystroke away — the not-yet-installed counterpart to
// `runInstalledMenu` below. `specframe init` skips straight past this.
export async function runNotInstalledMenu(version) {
  const { options, preamble } = buildNotInstalledMenu({ version });
  const chosen = await askMenu({ title: 'specframe', preamble, options, acceptValue: 'init' });
  if (chosen !== 'init') {
    console.log(theme.muted('\nNothing to do.'));
    return false;
  }
  return true;
}

// What `specframe` does when the repository is already scaffolded and there is
// somebody at the terminal: offer the operations that apply *here*, rather than
// print the three commands it used to name and exit. The list is built from
// this repo's own state — no "revise a decision" in a repo that has recorded
// none, no "add an assistant" once all six are configured — because a menu
// listing what cannot be done is how a menu becomes something to read past.
//
// One action per run, deliberately: each of these is a session of its own
// (`decide` walks the catalog, `update` rewrites files), and dropping back into
// a menu afterwards would bury what just happened.
export async function runInstalledMenu(cwd, version, flags, manifest) {
  const { options, preamble } = buildInstalledMenu({ manifest, version });

  const chosen = await askMenu({ title: 'specframe', preamble, options });
  if (chosen === null) {
    console.log(theme.muted('\nNothing to do.'));
    return;
  }

  if (chosen === 'decide') return runDecide(cwd, version, flags);
  if (chosen === 'review') return runReview(cwd, flags);
  if (chosen === 'revise') return runRevise(cwd, version, flags);
  // The menu is the interactive surface, so `agents` gets its picker rather
  // than the list-of-ids form the flag-driven command takes.
  if (chosen === 'agents') return runAgents(cwd, version, { ...flags, target: 'add', target2: undefined });
  if (chosen === 'agents-remove') return runAgents(cwd, version, { ...flags, target: 'remove', target2: undefined });
  if (chosen === 'update') return runUpdate(cwd, version, flags);

  // Uninstall is one keystroke from the top of a menu, unlike `specframe
  // uninstall` which somebody had to type — so it asks first.
  console.log(
    theme.muted(
      flags.purge
        ? '\n--purge: your docs and ADRs go too.'
        : '\nManaged files are removed; docs/ and ADRs are kept by ' +
            'default — the next screen offers to keep, remove or pick among them.',
    ),
  );
  const io = createReadlineIo();
  const raw = await io.question(`${theme.accent(theme.glyph.prompt)} Remove specframe from this repository? [y/N] `);
  io.close();
  if (!['y', 'yes'].includes(raw.trim().toLowerCase())) {
    console.log(theme.muted('\nCancelled. Nothing was removed.'));
    return;
  }
  console.log('');
  return runUninstall(cwd, flags);
}
