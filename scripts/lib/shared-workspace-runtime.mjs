import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, realpathSync, renameSync, symlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const RESOURCES = [
  '.env', '.env.local', '.env.development', '.env.development.local',
  '.env.test', '.env.test.local', '.env.production', '.env.production.local',
  '.vercel/project.json', '.claude/settings.local.json',
];

function ignored(root, name) {
  return spawnSync('git', ['-C', root, 'check-ignore', '-q', '--', name]).status === 0;
}

/** Share ignored runtime inputs, without reading or printing credential values. */
export function shareWorkspaceRuntime({ canonicalRoot, workspaceRoot, replaceExisting = false }) {
  const sourceRoot = realpathSync(canonicalRoot);
  const targetRoot = realpathSync(workspaceRoot);
  const result = { source: sourceRoot, linked: [], preserved: [], unavailable: [] };
  if (sourceRoot === targetRoot) return result;
  const backupRoot = join(targetRoot, '.helm', 'runtime-backups', String(Date.now()));
  for (const name of RESOURCES) {
    const source = join(sourceRoot, name);
    const target = join(targetRoot, name);
    if (!existsSync(source)) { result.unavailable.push(name); continue; }
    if (!ignored(sourceRoot, name) || !ignored(targetRoot, name)) {
      result.preserved.push(name);
      continue;
    }
    let current;
    try { current = lstatSync(target); } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    if (current) {
      if (existsSync(target) && realpathSync(target) === realpathSync(source)) {
        result.linked.push(name);
        continue;
      }
      if (!replaceExisting) { result.preserved.push(name); continue; }
      const backup = join(backupRoot, name);
      mkdirSync(dirname(backup), { recursive: true, mode: 0o700 });
      renameSync(target, backup);
    }
    mkdirSync(dirname(target), { recursive: true });
    symlinkSync(resolve(source), target, lstatSync(source).isDirectory() ? 'dir' : 'file');
    result.linked.push(name);
  }
  return result;
}
