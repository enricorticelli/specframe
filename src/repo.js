import { stat } from 'node:fs/promises';
import path from 'node:path';

// A directory is considered a "repo root" for specframe's purposes if it
// contains a `.git` (the actual repository root) or a `.specframe/manifest.json`
// (a repo specframe already scaffolded). Walking up from cwd lets `init`,
// `update` and `uninstall` always operate on the repo root even when the user
// invokes the CLI from a subdirectory.
//
// `.git` always wins over a manifest: if a nested directory happens to carry a
// `.specframe/manifest.json` but sits inside a real git working tree, the git
// root is the authoritative place to scaffold into. The manifest fallback only
// applies when there is no `.git` anywhere up the tree (e.g. a folder that was
// scaffolded before being `git init`-ed).
//
// Returns the absolute path of the nearest repo root, or null when none is
// found before hitting the filesystem root.
async function hasEntry(absPath) {
  try {
    await stat(absPath);
    return true;
  } catch {
    return false;
  }
}

async function firstMarkerUp(startDir, marker) {
  let dir = path.resolve(startDir);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (await hasEntry(path.join(dir, marker))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export async function findRepoRoot(startDir) {
  // 1. The real git root, if any ancestor has a `.git`.
  const gitRoot = await firstMarkerUp(startDir, '.git');
  if (gitRoot) return gitRoot;

  // 2. Otherwise, a previously-scaffolded specframe repo (manifest present).
  return firstMarkerUp(startDir, path.join('.specframe', 'manifest.json'));
}

// True when `dir` itself is a git working tree root (has `.git`).
export async function isGitRepoRoot(dir) {
  return hasEntry(path.join(dir, '.git'));
}
