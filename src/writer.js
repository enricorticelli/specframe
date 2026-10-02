import { access, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { manifestFromActions, readManifest, writeManifest, MANIFEST_RELPATH } from './manifest.js';
import { planAgentRemoval, planUpdateActions, planUninstallActions } from './update.js';
import { resolveDecisions } from './decisions/resolve.js';
import { LOCAL_ADR_MIN, LOCAL_ADR_STEP } from './decisions/catalog.js';
import { pad, theme } from './style.js';
import { renderLocalAdr, renderLocalDoc, LOCAL_DOC_SECTIONS } from './decisions/render.js';
import { buildTemplatePlan, normalizeConfig, TEMPLATE_TARGETS } from './template-plan.js';

// Preserve the writer API while keeping rendering separate from file changes.
export { buildTemplatePlan, normalizeConfig };

export function today() {
  return new Date().toISOString().slice(0, 10);
}

// Every file the CLI touches is reported on one line, and a run writes dozens of
// them. Colouring the verb and aligning the paths is what turns that wall into
// something you can skim for the two lines that are not `[write]`.
const ACTION_TONE = {
  write: 'good',
  update: 'good',
  refresh: 'good',
  ok: 'muted',
  skip: 'muted',
  keep: 'warn',
  orphan: 'warn',
  conflict: 'bad',
  remove: 'bad',
};

function actionTag(label, { dryRun = false } = {}) {
  const tone = theme[ACTION_TONE[label] ?? 'muted'];
  const prefix = dryRun ? theme.muted('[dry-run] ') : '';
  // 11, not 10: `[conflict]` is itself ten columns wide, and padding to its own
  // length leaves the path with no space in front of it.
  return prefix + pad(tone(`[${label}]`), 11);
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function writeIfMissing(targetPath, content, targetDir, { overwrite = false } = {}) {
  const alreadyThere = await exists(targetPath);
  if (alreadyThere && !overwrite) {
    console.log(`${actionTag('skip')}${theme.muted(path.relative(targetDir, targetPath))}`);
    return { written: false, existed: true };
  }

  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, content, 'utf8');
  console.log(`${actionTag(alreadyThere ? 'update' : 'write')}${path.relative(targetDir, targetPath)}`);
  return { written: true, existed: alreadyThere };
}

// Root-level files init would create that are already on disk in a repo
// specframe has never scaffolded. `init` never overwrites a file it did not
// create, so left unquestioned these would just be skipped — checked up front
// so the CLI can ask instead of skipping quietly.
export async function findExistingRootFiles(targetDir) {
  const found = [];
  for (const { target } of TEMPLATE_TARGETS) {
    if (await exists(toAbsPath(targetDir, target))) found.push(target);
  }
  return found;
}

// Absolute path for a forward-slash manifest-key relpath on the host OS.
function toAbsPath(targetDir, relpath) {
  return path.join(targetDir, ...relpath.split('/'));
}

export async function writeTemplateSet(rawConfig) {
  const { targetDir, version, overwrite = new Set() } = rawConfig;
  const config = normalizeConfig(rawConfig);
  const plan = await buildTemplatePlan(config);
  const previous = await readManifest(targetDir);

  // A file already on disk is left alone unless its relpath is in `overwrite`
  // (the CLI asked, up front, whether to replace a pre-existing one of its root
  // files). Left alone, it is reported as `skip-user`: the manifest
  // must not claim specframe wrote whatever is in it.
  const actions = [];
  for (const entry of plan) {
    const { written, existed } = await writeIfMissing(toAbsPath(targetDir, entry.relpath), entry.content, targetDir, {
      overwrite: overwrite.has(entry.relpath),
    });
    actions.push({
      relpath: entry.relpath,
      managed: entry.managed,
      action: written ? (existed ? 'overwrite' : 'create') : 'skip-user',
      ...(written ? { content: entry.content } : {}),
    });
  }

  await writeManifest(targetDir, manifestFromActions({ plan, actions, previous, version, config }));
  return plan;
}

// Read whatever each planned file currently holds on disk; a missing file is
// simply absent from the returned map. Contents rather than hashes, because
// refreshing a generated section in place needs the surrounding text.
//
// Also reads every file the *previous* manifest tracked but this plan no
// longer produces: an orphan. Without this, planUpdateActions would never see
// disk state for one and could not tell "never touched, safe to remove" from
// "the user edited this" — it would have to guess, which is exactly the
// silent-discard risk orphan-remove exists to avoid. `manifest` is optional so
// a caller reading disk for an unrelated reason (recordLocalAdr's single-file
// refresh) can skip the extra reads.
async function readDiskFiles(targetDir, plan, manifest) {
  const relpaths = new Set(plan.map((entry) => entry.relpath));
  for (const relpath of Object.keys(manifest?.files ?? {})) relpaths.add(relpath);

  const diskContents = {};
  for (const relpath of relpaths) {
    try {
      diskContents[relpath] = await readFile(toAbsPath(targetDir, relpath), 'utf8');
    } catch {
      // not on disk — leave it out so it is treated as "create" (planned) or
      // as already gone (orphaned).
    }
  }
  return diskContents;
}

// Reconcile an already-scaffolded repo with this version of specframe. Managed
// artifacts are refreshed when untouched; user-edited managed files get a
// `.specframe-new` sibling; user-owned files are never written. Returns the
// list of actions taken so the CLI can report them.
export async function updateTemplateSet(rawConfig) {
  const { targetDir, version, force = false, dryRun = false } = rawConfig;
  const config = normalizeConfig(rawConfig);
  const plan = await buildTemplatePlan(config);
  const manifest = await readManifest(targetDir);
  const diskContents = await readDiskFiles(targetDir, plan, manifest);

  const actions = planUpdateActions({ plan, manifest, diskContents, force });

  await applyActions({ targetDir, actions, dryRun });

  if (!dryRun) {
    await writeManifest(
      targetDir,
      manifestFromActions({ plan, actions, previous: manifest, version, config }),
    );
  }

  return actions;
}

/**
 * What changing a set of answers does to the document set.
 *
 * Computed by resolving both the old and the new answers, which is the only
 * honest way to answer "what is now stale": a rule is not orphaned because the
 * decision that emitted it changed, but because *no* decision emits it any more.
 * Nothing is deleted — these documents are the user's, and a rule they extended
 * by hand is worth more than the tidiness of removing it.
 *
 * @returns {{ orphaned: object[], added: object[] }} both in document order.
 */
export function planRevisionEffects({ before, after }) {
  const KINDS = ['rules', 'guidelines', 'runbooks'];

  const index = (resolved) => {
    const map = new Map();
    for (const kind of KINDS) {
      for (const item of resolved[kind]) {
        map.set(item.relpath, { kind, number: item.number, title: item.entry.title, relpath: item.relpath });
      }
    }
    return map;
  };

  const oldDocs = index(before);
  const newDocs = index(after);

  return {
    orphaned: [...oldDocs.values()].filter((doc) => !newDocs.has(doc.relpath)),
    added: [...newDocs.values()].filter((doc) => !oldDocs.has(doc.relpath)),
  };
}

/**
 * Revise decisions already recorded in a repository.
 *
 * The one operation that rewrites a document specframe wrote and the user owns,
 * so it is deliberately narrow: only the documents a decision produces are in
 * scope (`derived`), plus the indexes that describe the set. Each is treated as
 * managed *for this operation only* — refreshed when untouched since specframe
 * wrote it, and landing as `.specframe-new` beside a version you edited by hand
 * (an index instead has only its generated sections replaced, in place).
 * That is what makes a revision safe to run on a decision log someone has been
 * writing in for a year.
 */
export async function reviseTemplateSet(rawConfig) {
  const { targetDir, version, force = false, dryRun = false } = rawConfig;
  const config = normalizeConfig(rawConfig);
  const plan = await buildTemplatePlan(config);
  const manifest = await readManifest(targetDir);
  const diskContents = await readDiskFiles(targetDir, plan, manifest);

  const actions = planUpdateActions({
    plan: plan.map((entry) =>
      entry.regenerable || entry.derived ? { ...entry, managed: true } : entry,
    ),
    manifest,
    diskContents,
    force,
  });

  await applyActions({ targetDir, actions, dryRun });

  if (!dryRun) {
    await writeManifest(
      targetDir,
      manifestFromActions({ plan, actions, previous: manifest, version, config }),
    );
  }

  return actions;
}

/**
 * Record decisions in an already-scaffolded repository.
 *
 * New documents are created and nothing existing is overwritten — the decision
 * log is the user's. The indexes and DECISIONS.md are the exception: they exist
 * to describe the set, so leaving them stale would be worse than refreshing
 * them. Untouched since specframe wrote them, they are rewritten wholesale like
 * a managed file; edited by hand, only their generated sections are replaced, so
 * the prose someone added around an index survives every later `decide`.
 */
export async function decideTemplateSet(rawConfig) {
  const { targetDir, version, force = false, dryRun = false, quiet = false } = rawConfig;
  const config = normalizeConfig(rawConfig);
  const plan = await buildTemplatePlan(config);
  const manifest = await readManifest(targetDir);
  const diskContents = await readDiskFiles(targetDir, plan, manifest);

  // Treat the indexes as managed for this operation only; their recorded
  // ownership in the manifest stays user-owned. Every other planned file keeps
  // user ownership, so applyActions creates what is missing and leaves the rest.
  const actions = planUpdateActions({
    plan: plan.map((entry) => (entry.regenerable ? { ...entry, managed: true } : entry)),
    manifest,
    diskContents,
    force,
  });

  // `quiet` is for a caller that wants the actions as data (`specframe decide
  // --json`) rather than the per-file console lines meant for a terminal.
  await applyActions({ targetDir, actions, dryRun, quiet });

  if (!dryRun) {
    await writeManifest(
      targetDir,
      manifestFromActions({ plan, actions, previous: manifest, version, config }),
    );
  }

  return actions;
}

// --- decisions outside the catalog -----------------------------------------
//
// A project-specific ADR — "which payment provider" — has no catalog entry and
// therefore no reserved number. It gets one from a band the catalog promises
// never to use (LOCAL_ADR_MIN, see catalog.js).
//
// Disk is the primary source: those files are user-owned from the moment they
// are written, so disk cannot drift from what `adr new` actually allocated. It
// is no longer the *only* source, though — `adr rm` can take a file away, and a
// number that has been used must never be handed out again (docs/README.md:
// "Numbers are permanent. They appear in links, in commit messages, and in
// agent output."). Removed entries stay in the manifest as tombstones for
// exactly this, so the high-water mark is the max across both.
// The high-water mark across disk and the manifest's own record, one step on.
// Disk is primary — these files are the user's from the moment they are written
// — and the manifest carries removed entries as tombstones so a number that has
// been used is never handed out twice.
async function nextLocalNumber(targetDir, dir, known = []) {
  let entries = [];
  try {
    entries = await readdir(path.join(targetDir, ...dir.split('/')));
  } catch {
    entries = [];
  }

  const used = [
    ...entries.map((name) => name.match(/^(\d{4,})-/)).filter(Boolean).map((m) => Number(m[1])),
    ...known.map((item) => Number(item.number)),
  ].filter((n) => Number.isFinite(n) && n >= LOCAL_ADR_MIN);

  return String(used.length === 0 ? LOCAL_ADR_MIN : Math.max(...used) + LOCAL_ADR_STEP);
}

const nextLocalAdrNumber = (targetDir, config) =>
  nextLocalNumber(targetDir, 'docs/adr', config?.localAdrs ?? []);

/**
 * Record an ADR for a decision the catalog does not ask about — the CLI half
 * of the `specframe-record` skill (`specframe adr new`). Allocates the next
 * free number in the local band, writes the file with empty sections for the
 * caller to fill, and refreshes docs/adr/README.md's "Decisions outside the
 * catalog" section through the same generated-section merge every other index
 * on this repository uses.
 */
export async function recordLocalAdr({ targetDir, version, slug, title, date, dryRun = false, quiet = false }) {
  const manifest = await readManifest(targetDir);
  if (!manifest?.config) {
    throw new Error(
      `No ${MANIFEST_RELPATH} in ${targetDir}.\n` +
        'Run `specframe init` first — `adr new` extends an existing scaffold.',
    );
  }

  const config = normalizeConfig(manifest.config);
  const number = await nextLocalAdrNumber(targetDir, config);
  const relpath = `docs/adr/${number}-${slug}.md`;
  const absPath = toAbsPath(targetDir, relpath);

  // nextLocalAdrNumber always returns one past every number already on disk,
  // so this only ever fires on a genuine race — two `adr new` calls reading
  // the same directory before either has written its file. Cheap to check,
  // and the alternative is silently clobbering whichever call loses the race.
  if (await exists(absPath)) {
    throw new Error(`${relpath} already exists.`);
  }

  const localAdrs = [...config.localAdrs, { number, slug, title, date }];
  const nextConfig = { ...config, localAdrs };

  if (!dryRun) {
    await mkdir(path.dirname(absPath), { recursive: true });
    await writeFile(absPath, renderLocalAdr({ number, title, date }), 'utf8');
  }

  await refreshLocalIndex({
    targetDir, version, manifest, nextConfig,
    readmeRelpath: 'docs/adr/README.md',
    configPatch: { localAdrs },
    dryRun, quiet,
  });

  return { number, slug, title, relpath, dryRun };
}

/**
 * Record a rule, guideline, runbook or glossary group the catalog never asked
 * about (`specframe doc new <section> <slug>`) — `adr new` for the other four
 * sections, and the CLI primitive the doc-sync skill delegates to instead of
 * writing a file by hand.
 *
 * Same contract: the number comes from the band the catalog promises never to
 * use, the file is written with empty sections for the caller to fill and is
 * theirs from that moment, and only the section README's `## Added here` index
 * stays specframe's to keep current.
 */
export async function recordLocalDoc({ targetDir, version, section, slug, title, date, dryRun = false, quiet = false }) {
  const meta = LOCAL_DOC_SECTIONS[section];
  if (!meta) {
    throw new Error(
      `Unknown section \`${section}\`.\n\n` + `One of: ${Object.keys(LOCAL_DOC_SECTIONS).join(', ')}.`,
    );
  }

  const manifest = await readManifest(targetDir);
  if (!manifest?.config) {
    throw new Error(
      `No ${MANIFEST_RELPATH} in ${targetDir}.\n` +
        'Run `specframe init` first — `doc new` extends an existing scaffold.',
    );
  }

  const config = normalizeConfig(manifest.config);
  const number = await nextLocalNumber(targetDir, meta.dir, config.localDocs[section]);
  const relpath = `${meta.dir}/${number}-${slug}.md`;
  const absPath = toAbsPath(targetDir, relpath);

  // Only reachable on a genuine race between two `doc new` calls — see the
  // identical guard in recordLocalAdr.
  if (await exists(absPath)) {
    throw new Error(`${relpath} already exists.`);
  }

  const localDocs = {
    ...config.localDocs,
    [section]: [...config.localDocs[section], { number, slug, title, date }],
  };
  const nextConfig = { ...config, localDocs };

  if (!dryRun) {
    await mkdir(path.dirname(absPath), { recursive: true });
    await writeFile(absPath, renderLocalDoc({ section, number, title, date }), 'utf8');
  }

  await refreshLocalIndex({
    targetDir, version, manifest, nextConfig,
    readmeRelpath: `${meta.dir}/README.md`,
    configPatch: { localDocs },
    dryRun, quiet,
  });

  return { section, number, slug, title, relpath, dryRun };
}

/**
 * Withdraw an ADR recorded outside the catalog (`specframe adr rm`). The
 * counterpart to recordLocalAdr, and the primitive the audit skill needs: an
 * ADR that should never have been written can be taken out in one step instead
 * of leaving a dangling index row and a stale manifest behind.
 *
 * Only the local band. A catalog ADR is a reserved decision with canonical
 * wording, and "this repository should not have recorded it" is `dismiss`,
 * while "we decided differently" is `revise` — neither is a deletion.
 *
 * The manifest entry is kept as a tombstone rather than dropped: the number it
 * holds must never be allocated again.
 */
export async function removeLocalAdr({ targetDir, version, number, date, dryRun = false, quiet = false }) {
  const manifest = await readManifest(targetDir);
  if (!manifest?.config) {
    throw new Error(
      `No ${MANIFEST_RELPATH} in ${targetDir}.\n` +
        'Run `specframe init` first — `adr rm` withdraws an ADR from an existing scaffold.',
    );
  }

  if (!/^\d{4,}$/.test(String(number)) || Number(number) < LOCAL_ADR_MIN) {
    throw new Error(
      `ADR-${number} is not a decision \`adr rm\` can withdraw.\n\n` +
        `Only ADRs numbered ${LOCAL_ADR_MIN} and up — the ones \`specframe adr new\` allocates.\n` +
        'A catalog ADR is a reserved decision: use `specframe dismiss <id>` if it can never\n' +
        'apply here, or `specframe revise <id>` if the choice itself changed.',
    );
  }

  const config = normalizeConfig(manifest.config);
  const entry = config.localAdrs.find((a) => a.number === String(number) && a.removed === undefined);
  if (!entry) {
    const tombstoned = config.localAdrs.some((a) => a.number === String(number));
    throw new Error(
      tombstoned
        ? `ADR-${number} was already withdrawn.`
        : `No ADR-${number} recorded in ${MANIFEST_RELPATH}.\n\n` +
          'Run `specframe review --json` to see what is recorded. An ADR file written by\n' +
          'hand was never allocated by specframe and is not tracked here: remove it, and\n' +
          "its row in docs/adr/README.md's index, yourself.",
    );
  }

  const relpath = `docs/adr/${entry.number}-${entry.slug}.md`;
  const absPath = toAbsPath(targetDir, relpath);

  const localAdrs = config.localAdrs.map((a) =>
    a === entry ? { ...a, removed: date ?? today() } : a,
  );
  const nextConfig = { ...config, localAdrs };

  if (!dryRun) {
    await rm(absPath, { force: true });
    await pruneEmptyDirs(path.dirname(absPath), targetDir);
  }
  if (!quiet) reportAction({ relpath, managed: false, action: 'remove' }, dryRun);

  await refreshLocalIndex({
    targetDir, version, manifest, nextConfig,
    readmeRelpath: 'docs/adr/README.md',
    configPatch: { localAdrs },
    removedRelpath: relpath,
    dryRun, quiet,
  });

  return { number: entry.number, slug: entry.slug, title: entry.title, relpath, dryRun };
}

// Local document changes all refresh one index and preserve the rest of the manifest.
async function refreshLocalIndex({
  targetDir, version, manifest, nextConfig, readmeRelpath, configPatch,
  removedRelpath, dryRun, quiet,
}) {
  const templatePlan = await buildTemplatePlan(nextConfig);
  const readmeEntry = templatePlan.find((entry) => entry.relpath === readmeRelpath);
  const plan = [{ ...readmeEntry, managed: true }];
  const diskContents = await readDiskFiles(targetDir, plan);
  const actions = planUpdateActions({ plan, manifest, diskContents, force: false });

  await applyActions({ targetDir, actions, dryRun, quiet });
  if (dryRun) return;

  const updated = manifestFromActions({
    plan, actions, previous: manifest, version, config: nextConfig,
  });
  const files = { ...manifest.files, ...updated.files };
  if (removedRelpath !== undefined) delete files[removedRelpath];
  await writeManifest(targetDir, {
    ...manifest,
    config: { ...manifest.config, ...configPatch },
    files,
  });
}

async function applyActions({ targetDir, actions, dryRun, quiet = false }) {
  for (const action of actions) {
    const rel = action.relpath;
    if (!dryRun) {
      if (action.action === 'create' || action.action === 'overwrite' || action.action === 'merge') {
        const absPath = toAbsPath(targetDir, rel);
        await mkdir(path.dirname(absPath), { recursive: true });
        await writeFile(absPath, action.content, 'utf8');
      } else if (action.action === 'conflict') {
        await writeFile(`${toAbsPath(targetDir, rel)}.specframe-new`, action.content, 'utf8');
      } else if (action.action === 'orphan-remove') {
        const absPath = toAbsPath(targetDir, rel);
        await rm(absPath, { force: true });
        await pruneEmptyDirs(path.dirname(absPath), targetDir);
      }
    }
    if (!quiet) reportAction(action, dryRun);
  }
}

const ACTION_LABEL = {
  create: 'write',
  overwrite: 'update',
  merge: 'refresh',
  'up-to-date': 'ok',
  conflict: 'conflict',
  'skip-user': 'keep',
  orphan: 'orphan',
  'orphan-remove': 'remove',
};

function reportAction(action, dryRun) {
  if (action.action === 'up-to-date') return; // nothing changed; stay quiet
  const label = ACTION_LABEL[action.action] ?? action.action;
  let suffix = '';
  if (action.action === 'merge') suffix = ' (generated sections only — your text kept)';
  if (action.action === 'conflict') suffix = ` ${theme.glyph.arrow} wrote ${action.relpath}.specframe-new (yours kept)`;
  if (action.action === 'skip-user') suffix = ' (your file, untouched)';
  if (action.action === 'orphan') suffix = ' (no longer generated — edited by hand, so kept; remove it yourself if unused)';
  if (action.action === 'orphan-remove') {
    suffix = action.forced
      ? ' (no longer generated — removed as asked)'
      : ' (no longer generated — never edited, so removed)';
  }
  console.log(`${actionTag(label, { dryRun })}${action.relpath}${theme.muted(suffix)}`);
}

// The user-owned files (CLAUDE.md, docs/**, …) `uninstall` would keep by
// default in this repository — what the interactive prompt offers to purge
// individually instead of the all-or-nothing --purge flag. Returns null when
// there is nothing to uninstall (no manifest).
export async function previewUninstallKept({ targetDir }) {
  const manifest = await readManifest(targetDir);
  if (!manifest) return null;
  return planUninstallActions({ manifest, purge: false })
    .filter((action) => action.action === 'keep')
    .map((action) => action.relpath);
}

// Remove specframe-managed artifacts from a repository, leaving it as if
// specframe had never run. By default only specframe-owned (managed) files are
// deleted; user-owned starters (CLAUDE.md, docs/**, …) are reported as kept so
// the user can review them — pass `purge: true` to remove those too, or
// `purgePaths` to remove specific ones by relpath (the interactive prompt's
// per-file picks). The manifest itself is always removed at the end. Empty
// directories left behind are pruned up to (but not including) targetDir.
// Returns the list of actions.
export async function uninstallTemplateSet({ targetDir, purge = false, purgePaths, dryRun = false }) {
  const manifest = await readManifest(targetDir);
  if (!manifest) {
    throw new Error(
      `No ${MANIFEST_RELPATH} found in ${targetDir}.\n` +
        'Nothing to uninstall — run `specframe init` first.',
    );
  }

  const actions = planUninstallActions({ manifest, purge, purgePaths });

  for (const action of actions) {
    if (action.action === 'remove') {
      const absPath = toAbsPath(targetDir, action.relpath);
      if (!dryRun) {
        await rm(absPath, { force: true });
        await pruneEmptyDirs(path.dirname(absPath), targetDir);
      }
      console.log(`${actionTag('remove', { dryRun })}${action.relpath}`);
    } else {
      console.log(
        `${actionTag('keep', { dryRun })}${action.relpath}` +
          theme.muted(' (user-owned — use --purge to remove)'),
      );
    }
  }

  if (!dryRun) {
    const manifestPath = path.join(targetDir, MANIFEST_RELPATH);
    await rm(manifestPath, { force: true });
    await pruneEmptyDirs(path.dirname(manifestPath), targetDir);
    console.log(`${actionTag('remove')}${MANIFEST_RELPATH}`);
  } else {
    console.log(`${actionTag('remove', { dryRun: true })}${MANIFEST_RELPATH}`);
  }

  console.log(dryRun ? '\nDry run complete. Nothing was removed.' : '\nUninstall complete.');
  return actions;
}

// Walk up from `startDir` removing empty directories, stopping at (and never
// removing) `rootDir`. Used to clean up scaffolding dirs like `.claude/agents/`
// once the last file inside them is gone.
async function pruneEmptyDirs(startDir, rootDir) {
  const root = path.resolve(rootDir);
  let dir = path.resolve(startDir);
  while (dir !== root && dir.startsWith(root + path.sep)) {
    let entries;
    try {
      entries = await readdir(dir);
    } catch {
      break; // gone already
    }
    if (entries.length > 0) break; // not empty — leave it
    await rm(dir, { recursive: true, force: true });
    dir = path.dirname(dir);
  }
}

// --- agent harnesses added after onboarding ---------------------------------

/**
 * Add native support for one or more agent harnesses to a repository that is
 * already scaffolded — the CLI half of `specframe agents add`.
 *
 * Deliberately narrower than `update`: the only files in scope are the ones the
 * newly added targets contribute (`.claude/**`, `GEMINI.md`, …), computed as the
 * difference between the plan for the merged target list and the plan for the
 * one already recorded. Everything else — docs, ADRs — is left
 * exactly as it stands, so adding a second harness can never rewrite prose
 * written for the first.
 *
 * Only the fresh files' disk state is read, so the untouched remainder of the
 * manifest cannot look like an orphan (see readDiskFiles / planUpdateActions).
 *
 * @param {string[]} previousTargets  the targets already recorded in the manifest.
 */
export async function addAgentTargets(rawConfig) {
  const { targetDir, version, previousTargets = [], dryRun = false, force = false, quiet = false } = rawConfig;
  const config = normalizeConfig(rawConfig);
  const manifest = await readManifest(targetDir);

  const plan = await buildTemplatePlan(config);
  const already = new Set(
    (await buildTemplatePlan({ ...config, agentTargets: previousTargets })).map((entry) => entry.relpath),
  );
  const fresh = plan.filter((entry) => !already.has(entry.relpath));

  const diskContents = await readDiskFiles(targetDir, fresh);
  const actions = planUpdateActions({ plan: fresh, manifest, diskContents, force });

  await applyActions({ targetDir, actions, dryRun, quiet });

  if (!dryRun) {
    const rendered = manifestFromActions({ plan: fresh, actions, previous: manifest, version, config });
    // Merged into the manifest rather than replacing it: this run planned a
    // handful of files, and manifestFromActions only knows about those. The
    // recorded `version` stays as it was — `update` is what moves a repository
    // to a new specframe version, and claiming it here would make it a no-op.
    await writeManifest(targetDir, {
      ...manifest,
      version: manifest?.version ?? version,
      config: { ...(manifest?.config ?? {}), agentTargets: config.agentTargets },
      files: { ...(manifest?.files ?? {}), ...rendered.files },
    });
  }

  return actions;
}

/**
 * Drop native support for one or more agent harnesses from a repository — the
 * CLI half of `specframe agents remove`.
 *
 * The mirror of addAgentTargets, and narrow in the same way: the files in scope
 * are exactly the ones the dropped targets contributed, computed as the
 * difference between the plan before and the plan after. docs/ is untouched, so the repository keeps its whole decision log — it just stops
 * shipping that tool's native files. Removing the last one is a supported
 * position: docs/ is the log and reads the same without a harness.
 *
 * @param {string[]} previousTargets  the targets recorded in the manifest.
 * @param {boolean} purge  also remove a file the manifest records as the user's.
 * @param {boolean} force  also remove a managed file that was edited by hand.
 */
export async function removeAgentTargets(rawConfig) {
  const {
    targetDir,
    previousTargets = [],
    dryRun = false,
    purge = false,
    force = false,
    quiet = false,
  } = rawConfig;
  const config = normalizeConfig(rawConfig);
  const manifest = await readManifest(targetDir);

  const keptRelpaths = new Set((await buildTemplatePlan(config)).map((entry) => entry.relpath));
  const before = await buildTemplatePlan({ ...config, agentTargets: previousTargets });
  // A path the remaining targets still produce is not this harness's to remove
  // — nothing shares one today, but the set difference is what makes that a
  // property of the code rather than of the adapter table.
  const gone = before.filter((entry) => !keptRelpaths.has(entry.relpath));

  const diskContents = await readDiskFiles(targetDir, gone);
  const actions = planAgentRemoval({
    relpaths: gone.map((entry) => entry.relpath),
    manifest,
    diskContents,
    purge,
    force,
  });

  await applyActions({ targetDir, actions, dryRun, quiet });

  // A `<file>.specframe-new` beside a file that just went is specframe's own
  // output for a document that no longer exists — nothing left to merge it
  // into, so it goes too rather than sitting there as litter.
  if (!dryRun) {
    for (const action of actions) {
      if (action.action !== 'orphan-remove') continue;
      const pending = `${toAbsPath(targetDir, action.relpath)}.specframe-new`;
      if (!(await exists(pending))) continue;
      await rm(pending, { force: true });
      await pruneEmptyDirs(path.dirname(pending), targetDir);
    }
  }

  if (!dryRun) {
    const files = { ...(manifest?.files ?? {}) };
    // A file that is really gone leaves the manifest with it. One kept — edited
    // by hand, or user-owned — stays tracked, so `uninstall` still knows about
    // it and `update` can go on reporting it as an orphan.
    for (const action of actions) {
      if (action.action === 'orphan-remove') delete files[action.relpath];
    }
    // A path that was never on disk is absent from `actions` entirely; it has
    // no business staying in the manifest either.
    const acted = new Set(actions.map((action) => action.relpath));
    for (const entry of gone) {
      if (!acted.has(entry.relpath)) delete files[entry.relpath];
    }

    await writeManifest(targetDir, {
      ...manifest,
      config: { ...(manifest?.config ?? {}), agentTargets: config.agentTargets },
      files,
    });
  }

  return actions;
}
