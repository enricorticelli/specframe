import { sha256 } from './manifest.js';

// Decide, per file, what `specframe update` should do — pure and fs-free so it
// can be reasoned about and tested in isolation.
//
// Inputs:
//   plan        Array<{ relpath, content, managed }> — the files this version
//               of specframe wants to produce.
//   manifest    The manifest written by a previous run, or null when absent.
//   diskHashes  { relpath: sha256 } for files currently on disk; a missing key
//               means the file does not exist.
//   force       When true, overwrite managed files even if the user edited them.
//
// Output: Array<{ relpath, managed, action, content? }> where action is one of
//   create | up-to-date | overwrite | conflict | skip-user | orphan
export function planUpdateActions({ plan, manifest, diskHashes = {}, force = false }) {
  const actions = [];
  const planned = new Set();

  for (const entry of plan) {
    const { relpath, content, managed } = entry;
    planned.add(relpath);

    const newHash = sha256(content);
    const diskHash = diskHashes[relpath];
    const oldHash = manifest?.files?.[relpath]?.sha256;

    if (diskHash === undefined) {
      actions.push({ relpath, managed, action: 'create', content });
      continue;
    }

    if (diskHash === newHash) {
      actions.push({ relpath, managed, action: 'up-to-date' });
      continue;
    }

    if (!managed) {
      actions.push({ relpath, managed, action: 'skip-user' });
      continue;
    }

    const untouchedSinceWrite = oldHash !== undefined && diskHash === oldHash;
    if (force || untouchedSinceWrite) {
      actions.push({ relpath, managed, action: 'overwrite', content });
    } else {
      actions.push({ relpath, managed, action: 'conflict', content });
    }
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
