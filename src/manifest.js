import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Relative path of the manifest inside a scaffolded repository.
export const MANIFEST_RELPATH = '.specframe/manifest.json';

// sha256 hex digest of a UTF-8 string. Stable across platforms.
export function sha256(content) {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

// Manifest keys use forward slashes regardless of host OS so a repo cloned
// across Windows/macOS/Linux keeps matching its manifest.
export function toManifestKey(relpath) {
  return relpath.split(path.sep).join('/');
}

export async function readManifest(targetDir) {
  const manifestPath = path.join(targetDir, MANIFEST_RELPATH);
  try {
    const raw = await readFile(manifestPath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function writeManifest(targetDir, manifest) {
  const manifestPath = path.join(targetDir, MANIFEST_RELPATH);
  await mkdir(path.dirname(manifestPath), { recursive: true });
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

// Actions after which the file on disk holds what specframe rendered.
const WROTE = new Set(['create', 'overwrite', 'merge', 'up-to-date']);

/**
 * Build a manifest from what a run actually put on disk.
 *
 * The recorded hash means one thing only: *the content specframe last wrote
 * here*. It is what every later run compares against to tell "you edited this"
 * from "the template moved", so recording a hash for a file specframe decided
 * not to write would be a lie with teeth — the file would look edited forever
 * after, and every `decide` would leave another `.specframe-new` beside it.
 * Skipped, kept and conflicting files therefore carry the previous manifest's
 * hash forward, and a file specframe has never written carries none at all.
 *
 * A file whose generated sections were refreshed in place is recorded as it now
 * stands on disk, marked `merged`: the hash is honest, and the marker says the
 * document around those sections is still the user's.
 *
 * @param {object[]} plan     the files this version renders (order is kept).
 * @param {object[]} actions  the outcome of planUpdateActions for that plan.
 * @param {object|null} previous  the manifest this run started from.
 */
export function manifestFromActions({ plan, actions, previous, version, config }) {
  const outcome = new Map(actions.map((action) => [action.relpath, action]));

  const files = {};
  for (const { relpath, content, managed } of plan) {
    const action = outcome.get(relpath);
    const before = previous?.files?.[relpath];

    if (action && WROTE.has(action.action)) {
      // `merged` says specframe wrote only the generated sections of this file.
      // A later run needs to know that: the hash matching does not mean the
      // document is specframe's to rewrite. It is set by whoever planned the
      // action, so a file that has since become identical to the template
      // correctly loses the marker.
      //
      // `up-to-date` may carry no content, in which case the plan's is what is
      // already there.
      files[relpath] = {
        sha256: sha256(action.content ?? content),
        managed,
        ...(action.merged === true ? { merged: true } : {}),
      };
      continue;
    }

    if (before?.sha256 === undefined) {
      files[relpath] = { managed };
      continue;
    }
    files[relpath] = { sha256: before.sha256, managed, ...(before.merged ? { merged: true } : {}) };
  }

  return { version, config, files };
}
