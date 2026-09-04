import { sha256 } from './manifest.js';

// A generated section is a `## Heading` whose body specframe renders inside a
// document that is otherwise the user's: the `## Index` of each README, the two
// halves of the decision backlog. Being able to find one is what lets a refresh
// land *in* the file someone has been writing in, instead of beside it as a
// `.specframe-new` they have to merge by hand.
//
// A section runs from its heading to the next `##` heading or `---` rule. Both
// are safe boundaries: rendered content only ever goes down to `###`, and its
// table separators (`| --- |`) never start a line.
const SECTION_END = /^(?:##\s|-{3,}\s*$)/;

function sectionBounds(lines, heading) {
  const start = lines.findIndex((line) => line.trimEnd() === heading);
  if (start === -1) return null;

  let end = start + 1;
  while (end < lines.length && !SECTION_END.test(lines[end])) end += 1;
  return { start, end };
}

/**
 * Splice the generated sections of `planned` into `disk`, keeping every line
 * around them as the user left it.
 *
 * A heading missing from `planned` means the template moved: specframe cannot
 * know where the generated part belongs any more, so the whole merge bails.
 * A heading missing from `disk`, though, is the ordinary shape of a version
 * upgrade — this version's catalog grew a new generated section that no
 * existing file has ever seen — and is inserted right after the section that
 * merged just before it, rather than treated as a restructure. Without this,
 * shipping so much as one new generated heading would make every file it
 * appears in fail to merge on every repo scaffolded before that version:
 * `update` would leave it forever un-refreshed (`skip-user`, a user-owned
 * file is never overwritten), and `decide`/`revise` would drop a
 * `.specframe-new` beside it on every single run.
 *
 * The one case this cannot help is a heading missing from disk with no
 * earlier heading having matched yet — there is nowhere to anchor it, so it
 * is dropped rather than guessed at (the same conservatism as before). In
 * practice a new heading is appended after existing ones, so this only bites
 * a section inserted ahead of every heading a repo already has.
 *
 * @param {string} disk      what the file holds now.
 * @param {string} planned   what this version of specframe renders for it.
 * @param {string[]} headings the generated section headings, in document order,
 *   e.g. ['## Decisions taken', '## Open decisions'].
 * @returns {string|null} the merged document, or null when no heading matched
 *   at all — the file has been restructured beyond recognition, or a heading
 *   is missing from `planned` — so the caller falls back to writing a
 *   `.specframe-new` sibling rather than guessing.
 */
export function mergeGeneratedSections(disk, planned, headings = []) {
  if (headings.length === 0) return null;

  let lines = disk.split('\n');
  const plannedLines = planned.split('\n');

  let matched = false;
  // Where the next section with no home on disk gets inserted: right after
  // the end of whichever section merged most recently. Null until one has.
  let insertAt = null;

  for (const heading of headings) {
    const source = sectionBounds(plannedLines, heading);
    if (source === null) return null; // gone from the template — do not guess.
    const sectionLines = plannedLines.slice(source.start, source.end);

    const target = sectionBounds(lines, heading);
    if (target === null) {
      if (insertAt === null) continue; // no anchor yet — see the doc comment.
      lines = [...lines.slice(0, insertAt), ...sectionLines, ...lines.slice(insertAt)];
      insertAt += sectionLines.length;
      matched = true;
      continue;
    }

    lines = [...lines.slice(0, target.start), ...sectionLines, ...lines.slice(target.end)];
    insertAt = target.start + sectionLines.length;
    matched = true;
  }

  return matched ? lines.join('\n') : null;
}

// Decide, per file, what `specframe update` should do — pure and fs-free so it
// can be reasoned about and tested in isolation.
//
// Inputs:
//   plan        Array<{ relpath, content, managed }> — the files this version
//               of specframe wants to produce.
//   manifest    The manifest written by a previous run, or null when absent.
//   diskHashes  { relpath: sha256 } for files currently on disk; a missing key
//               means the file does not exist.
//   diskContents { relpath: text } for the same files, when the caller has read
//               them. Required to merge generated sections; hashes are derived
//               from it, so a caller passing contents can skip diskHashes.
//   force       When true, overwrite managed files even if the user edited them.
//
// Output: Array<{ relpath, managed, action, content? }> where action is one of
//   create | up-to-date | overwrite | merge | conflict | skip-user | orphan |
//   orphan-remove
export function planUpdateActions({
  plan,
  manifest,
  diskHashes = {},
  diskContents = {},
  force = false,
}) {
  const actions = [];
  const planned = new Set();

  for (const entry of plan) {
    const { relpath, content, managed, sections, alternates } = entry;
    planned.add(relpath);

    const newHash = sha256(content);
    const diskText = diskContents[relpath];
    const diskHash = diskText !== undefined ? sha256(diskText) : diskHashes[relpath];
    const oldHash = manifest?.files?.[relpath]?.sha256;

    if (diskHash === undefined) {
      actions.push({ relpath, managed, action: 'create', content });
      continue;
    }

    if (diskHash === newHash) {
      actions.push({ relpath, managed, action: 'up-to-date' });
      continue;
    }

    // A managed file specframe wrote whole, and nobody touched since, is simply
    // refreshed; --force says to refresh it even when they did touch it.
    // `merged` marks a file specframe wrote only *part* of: the hash matches
    // because the last run put those sections there, not because the document
    // is specframe's, and overwriting it would delete the rest of what the user
    // wrote around them.
    const untouchedSinceWrite = oldHash !== undefined && diskHash === oldHash;
    const wroteTheWholeFile = untouchedSinceWrite && manifest?.files?.[relpath]?.merged !== true;
    // `alternates` are other renderings an older specframe wrote to this same
    // path (see buildAgentEntries). Disk matching one of them is specframe's
    // own output under a hash that no longer identifies it — not the user's
    // work, so refreshing it loses nothing and stops the conflict recurring.
    const isOwnStaleRendering = (alternates ?? []).some((text) => sha256(text) === diskHash);
    if (managed && (force || wroteTheWholeFile || isOwnStaleRendering)) {
      actions.push({ relpath, managed, action: 'overwrite', content });
      continue;
    }

    // What is on disk is not what specframe last wrote. If the file declares
    // generated sections, only those are refreshed — in place, in the file the
    // user has been writing in, leaving everything around them alone.
    const merged =
      sections && diskText !== undefined
        ? mergeGeneratedSections(diskText, content, sections)
        : null;
    if (merged !== null) {
      // `content` is what the file holds once this action is applied — the same
      // either way, so the manifest records what is really on disk rather than
      // the pristine template that is not.
      actions.push({
        relpath,
        managed,
        action: merged === diskText ? 'up-to-date' : 'merge',
        content: merged,
        merged: true,
      });
      continue;
    }

    actions.push(
      managed
        ? { relpath, managed, action: 'conflict', content }
        : { relpath, managed, action: 'skip-user' },
    );
  }

  // Managed files specframe used to produce but no longer does. User-owned
  // files are their data — stay quiet, never listed here. A managed one is
  // removed outright when it still holds exactly what specframe last wrote —
  // there is nothing of the user's in it to lose — and only reported when it
  // was edited by hand, or already gone, so nothing is silently discarded.
  for (const [relpath, info] of Object.entries(manifest?.files ?? {})) {
    if (planned.has(relpath)) continue;
    if (!info.managed) continue;

    const diskText = diskContents[relpath];
    const diskHash = diskText !== undefined ? sha256(diskText) : diskHashes[relpath];
    if (diskHash === undefined) continue; // already gone — nothing to report or remove

    const untouchedSinceWrite = info.sha256 !== undefined && diskHash === info.sha256;
    actions.push({ relpath, managed: true, action: untouchedSinceWrite ? 'orphan-remove' : 'orphan' });
  }

  return actions;
}

/**
 * Decide, per file, what dropping an agent harness should do to it — pure and
 * fs-free so it can be tested in isolation.
 *
 * The rule is `uninstall`'s, narrowed to one harness's files: specframe removes
 * what it owns and wrote, and never quietly deletes what somebody has written
 * in. A managed file edited by hand is therefore kept and reported, and the
 * harness's user-owned file (GEMINI.md is the one) is kept unless `purge` says
 * otherwise — the whole point of that file is that it is yours to extend, and
 * changing your mind about which assistant reads it is no reason to lose it.
 *
 * Inputs:
 *   relpaths     the files the dropped harness(es) contributed.
 *   manifest     the manifest written by a previous run, or null.
 *   diskContents { relpath: text } for those files; a missing key means the
 *                file is not on disk and there is nothing to do.
 *   purge        also remove the harness's user-owned files.
 *   force        also remove a managed file that was edited by hand.
 *
 * Output: Array<{ relpath, managed, action }> where action is one of
 *   orphan-remove | orphan | skip-user
 */
export function planAgentRemoval({
  relpaths,
  manifest,
  diskHashes = {},
  diskContents = {},
  purge = false,
  force = false,
}) {
  const actions = [];

  for (const relpath of relpaths) {
    const diskText = diskContents[relpath];
    const diskHash = diskText !== undefined ? sha256(diskText) : diskHashes[relpath];
    if (diskHash === undefined) continue; // already gone

    const info = manifest?.files?.[relpath];
    // Ownership comes from the manifest where it is recorded, and from the plan
    // that produced these paths otherwise (a file specframe wrote before it
    // tracked ownership, or one added outside a manifest-writing run).
    const managed = info?.managed ?? true;

    if (!managed) {
      // `forced` says the file went because the caller asked, not because
      // specframe could see it had nothing of the user's in it. The report says
      // so — "never edited, so removed" about a file somebody just edited is
      // the kind of wrong that makes the rest of the output untrustworthy.
      actions.push(
        purge
          ? { relpath, managed: false, action: 'orphan-remove', forced: true }
          : { relpath, managed: false, action: 'skip-user' },
      );
      continue;
    }

    const untouchedSinceWrite = info?.sha256 !== undefined && diskHash === info.sha256;
    if (untouchedSinceWrite) {
      actions.push({ relpath, managed: true, action: 'orphan-remove' });
      continue;
    }
    actions.push(
      force
        ? { relpath, managed: true, action: 'orphan-remove', forced: true }
        : { relpath, managed: true, action: 'orphan' },
    );
  }

  return actions;
}

// Decide, per file recorded in the manifest, what `specframe uninstall` should
// do — pure and fs-free so it can be tested in isolation.
//
// Inputs:
//   manifest    The manifest written by a previous run (must not be null).
//   purge       When true, remove every file specframe created, including
//               user-owned starters (CLAUDE.md, docs/**, …). When false (the
//               default), only specframe-managed files are removed; user-owned
//               files are reported as kept so the user can review them.
//   purgePaths  Specific user-owned relpaths to remove alongside the managed
//               ones, without going as far as `purge`'s everything — the
//               interactive uninstall prompt's per-file picks. Ignored where
//               `purge` already covers the file.
//
// Output: Array<{ relpath, managed, action }> where action is one of
//   remove | keep
export function planUninstallActions({ manifest, purge = false, purgePaths }) {
  if (!manifest?.files) return [];

  const purgeSet = purgePaths ? new Set(purgePaths) : null;
  const actions = [];
  for (const [relpath, info] of Object.entries(manifest.files)) {
    const managed = info.managed === true;
    if (managed || purge || purgeSet?.has(relpath)) {
      actions.push({ relpath, managed, action: 'remove' });
    } else {
      actions.push({ relpath, managed, action: 'keep' });
    }
  }
  return actions;
}
