import { lstat, realpath } from 'node:fs/promises';
import path from 'node:path';

// Manifest keys are portable relative paths, never filesystem instructions.
export function repoPath(targetDir, relpath) {
  if (typeof relpath !== 'string' || !relpath || relpath.includes('\0') ||
      relpath.includes('\\') || path.posix.isAbsolute(relpath) ||
      path.win32.isAbsolute(relpath) || /^[A-Za-z]:/.test(relpath) ||
      relpath.split('/').some((part) => part === '' || part === '.' || part === '..')) {
    throw new Error(`Unsafe repository path: ${JSON.stringify(relpath)}`);
  }
  return path.join(path.resolve(targetDir), ...relpath.split('/'));
}

// Check existing components too: a relative path can escape through a symlink.
export async function safeRepoPath(targetDir, relpath) {
  const absolute = repoPath(targetDir, relpath);
  const root = await realpath(targetDir);
  let current = path.resolve(targetDir);
  for (const part of relpath.split('/')) {
    current = path.join(current, part);
    try {
      await lstat(current);
    } catch (error) {
      if (error.code === 'ENOENT') break;
      throw error;
    }
    const resolved = await realpath(current);
    const relative = path.relative(root, resolved);
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw new Error(`Unsafe repository path: ${JSON.stringify(relpath)} resolves outside the repository.`);
    }
  }
  return absolute;
}
