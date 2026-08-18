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
 * @param {string} disk      what the file holds now.
 * @param {string} planned   what this version of specframe renders for it.
 * @param {string[]} headings the generated section headings, e.g. ['## Index'].
 * @returns {string|null} the merged document, or null when a heading is missing
 *   on either side — the file has been restructured enough that specframe
 *   cannot know where the generated part belongs, so the caller falls back to
 *   writing a `.specframe-new` sibling rather than guessing.
 */
export function mergeGeneratedSections(disk, planned, headings = []) {
  if (headings.length === 0) return null;

  let lines = disk.split('\n');
  const plannedLines = planned.split('\n');

  for (const heading of headings) {
    const target = sectionBounds(lines, heading);
    const source = sectionBounds(plannedLines, heading);
    if (target === null || source === null) return null;

    lines = [
      ...lines.slice(0, target.start),
      ...plannedLines.slice(source.start, source.end),
      ...lines.slice(target.end),
    ];
  }

  return lines.join('\n');
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
//   create | up-to-date | overwrite | merge | conflict | skip-user | orphan
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
    const { relpath, content, managed, sections } = entry;
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
    if (managed && (force || wroteTheWholeFile)) {
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

  // Managed files specframe used to produce but no longer does: surface them so
  // the user can delete leftovers. User-owned files are their data — stay quiet.
  for (const [relpath, info] of Object.entries(manifest?.files ?? {})) {
    if (planned.has(relpath)) continue;
    if (!info.managed) continue;
    actions.push({ relpath, managed: true, action: 'orphan' });
  }

  return actions;
}

// Decide, per file recorded in the manifest, what `specframe uninstall` should
// do — pure and fs-free so it can be tested in isolation.
//
// Inputs:
//   manifest   The manifest written by a previous run (must not be null).
//   purge      When true, remove every file specframe created, including
//              user-owned starters (CLAUDE.md, docs/**, …). When false (the
//              default), only specframe-managed files are removed; user-owned
//              files are reported as kept so the user can review them.
//
// Output: Array<{ relpath, managed, action }> where action is one of
//   remove | keep
export function planUninstallActions({ manifest, purge = false }) {
  if (!manifest?.files) return [];

  const actions = [];
  for (const [relpath, info] of Object.entries(manifest.files)) {
    const managed = info.managed === true;
    if (managed || purge) {
      actions.push({ relpath, managed, action: 'remove' });
    } else {
      actions.push({ relpath, managed, action: 'keep' });
    }
  }
  return actions;
}
