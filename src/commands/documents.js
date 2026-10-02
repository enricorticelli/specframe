import { LOCAL_DOC_SECTIONS } from '../decisions/render.js';
import { theme } from '../style.js';
import { recordLocalAdr, recordLocalDoc, removeLocalAdr, today } from '../writer.js';
import { resolveTargetDir } from './context.js';

// Record an ADR for a decision the catalog does not ask about — the CLI half
// of the `specframe-record` skill. See writer.js's recordLocalAdr: the number
// comes from the local band the catalog promises never to use, derived from
// disk so it can never collide with what a future catalog adds.
export async function runAdrNew(cwd, version, flags) {
  if (flags.target !== 'new') {
    throw new Error(
      `Unknown \`adr\` subcommand: ${flags.target ?? '(none)'}\n\n` +
        'Usage: specframe adr new <slug> --title "..."\n' +
        '       specframe adr rm <number>',
    );
  }
  const slug = flags.target2;
  if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
    throw new Error('Usage: specframe adr new <slug> --title "..."\n\n<slug> must be lowercase, digits and hyphens.');
  }
  if (!flags.title) {
    throw new Error('Usage: specframe adr new <slug> --title "..."\n\n--title is required.');
  }

  const targetDir = await resolveTargetDir(cwd);
  const result = await recordLocalAdr({
    targetDir,
    version,
    slug,
    title: flags.title,
    date: today(),
    dryRun: flags.dryRun,
    quiet: flags.json,
  });

  if (flags.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`${theme.good('[write]')} ${result.relpath}`);
  console.log(theme.muted(`ADR-${result.number}: ${result.title}`));
  console.log(
    theme.muted(
      flags.dryRun
        ? '\nDry run complete. Nothing was written.'
        : '\nFill in Context, Decision, Consequences and Alternatives, then set its Status.',
    ),
  );
}

// Record a rule, guideline, runbook or glossary group the catalog does not ask
// about — `adr new` for the other four sections, and the CLI half of the
// `specframe-add-*` commands. See writer.js's recordLocalDoc.
export async function runDocNew(cwd, version, flags) {
  const sections = Object.keys(LOCAL_DOC_SECTIONS);
  const usage =
    `Usage: specframe doc new <section> <slug> --title "..."\n\n` + `<section> is one of: ${sections.join(', ')}.`;

  if (flags.target !== 'new') {
    throw new Error(`Unknown \`doc\` subcommand: ${flags.target ?? '(none)'}\n\n${usage}`);
  }
  const section = flags.target2;
  if (!sections.includes(section)) {
    throw new Error(`${usage}\n\nGot: ${section ?? '(none)'}`);
  }
  const slug = flags.target3;
  if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
    throw new Error(`${usage}\n\n<slug> must be lowercase, digits and hyphens.`);
  }
  if (!flags.title) {
    throw new Error(`${usage}\n\n--title is required.`);
  }

  const targetDir = await resolveTargetDir(cwd);
  const result = await recordLocalDoc({
    targetDir,
    version,
    section,
    slug,
    title: flags.title,
    date: today(),
    dryRun: flags.dryRun,
    quiet: flags.json,
  });

  if (flags.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  const { prefix, label } = LOCAL_DOC_SECTIONS[section];
  console.log(`${theme.good('[write]')} ${result.relpath}`);
  console.log(theme.muted(`${prefix}-${result.number}: ${result.title}`));
  console.log(
    theme.muted(
      flags.dryRun
        ? '\nDry run complete. Nothing was written.'
        : `\nFill in the ${label}'s sections — the headings are the ones its template asks for.`,
    ),
  );
}

/**
 * Withdraw an ADR outside the catalog — the counterpart to `adr new`, and what
 * the audit skill runs once a document has been judged not to belong in
 * docs/adr/. Doing this by hand means three steps (the file, the index row, the
 * manifest entry) and forgetting any one of them leaves the log inconsistent.
 */
export async function runAdrRemove(cwd, version, flags) {
  const number = flags.target2;
  if (!number || !/^\d{4,}$/.test(number)) {
    throw new Error('Usage: specframe adr rm <number>\n\n<number> is the ADR number, e.g. 9000.');
  }

  const targetDir = await resolveTargetDir(cwd);
  const result = await removeLocalAdr({
    targetDir,
    version,
    number,
    date: today(),
    dryRun: flags.dryRun,
    quiet: flags.json,
  });

  if (flags.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(theme.muted(`ADR-${result.number}: ${result.title}`));
  console.log(
    theme.muted(
      flags.dryRun
        ? '\nDry run complete. Nothing was removed.'
        : `\nWithdrawn. ADR-${result.number} will never be reissued — the number stays spent.`,
    ),
  );
}
