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

// Build a manifest from a template plan. Records, per file, the hash of the
// content specframe rendered plus whether specframe owns it.
export function manifestFromPlan(plan, { version, config }) {
  const files = {};
  for (const { relpath, content, managed } of plan) {
    files[relpath] = { sha256: sha256(content), managed };
  }
  return { version, config, files };
}
