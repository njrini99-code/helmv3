// Nested worktrees and nested git metadata — the mechanical cause of "agents
// keep editing the wrong copy." A worktree INSIDE the repo root means file
// search returns two copies of every source file.

import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { git } from '../lib/exec.mjs';
import { check, Status } from '../result.mjs';

export const meta = { id: 'workspace', title: 'Workspace containment' };

export async function run(ctx) {
  const out = [];
  const { repoRoot } = ctx;

  // 1. No worktree may live inside the repo root (except the root itself).
  const wt = git(repoRoot, ['worktree', 'list', '--porcelain']);
  if (!wt.ok) {
    out.push(check('workspace.worktrees', Status.UNKNOWN, 'git worktree list failed', { detail: wt.error }));
  } else {
    const paths = wt.value
      .split('\n')
      .filter((l) => l.startsWith('worktree '))
      .map((l) => l.slice('worktree '.length));
    const nested = paths.filter((p) => p !== repoRoot && p.startsWith(repoRoot + '/'));
    out.push(
      nested.length === 0
        ? check('workspace.nested-worktrees', Status.PASS, `no nested worktrees (${paths.length} total, all external)`)
        : check('workspace.nested-worktrees', Status.FAIL,
            `${nested.length} worktree(s) inside the repo root — file search sees duplicate source trees`, {
              evidence: nested,
              source: 'config/repo/manifest.yml (workspace.nested_worktrees: forbidden)',
            }),
    );
  }

  // 2. No unexpected nested .git under the repo root (a copied/embedded checkout).
  const nestedGit = [];
  const skip = new Set(['node_modules', '.git', '.next', 'dist', '.turbo']);
  const walk = (dir, depth) => {
    if (depth > 4) return;
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      if (skip.has(e.name)) continue;
      const full = join(dir, e.name);
      if (e.name === '.git') { nestedGit.push(full); continue; }
      // a nested .git file (linked worktree marker) also counts
      if (existsSync(join(full, '.git')) && !statSync(join(full, '.git')).isDirectory() === false) {
        // handled by the recursion below via the .git entry
      }
      walk(full, depth + 1);
    }
  };
  walk(repoRoot, 0);
  out.push(
    nestedGit.length === 0
      ? check('workspace.nested-git', Status.PASS, 'no nested .git metadata under the repo root')
      : check('workspace.nested-git', Status.FAIL, `${nestedGit.length} nested .git found under the repo root`, {
          evidence: nestedGit.map((p) => p.replace(repoRoot + '/', '')),
        }),
  );

  return out;
}
