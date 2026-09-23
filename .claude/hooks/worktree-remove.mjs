#!/usr/bin/env node
// .claude/hooks/worktree-remove.mjs — the WorktreeRemove hook.
//
// The counterpart of worktree-create.mjs. Claude Code calls it when it
// removes a worktree it created (a finished isolated subagent or workflow
// step, or a --worktree session the user chose to remove). Without it the
// harness fell back to a bare `git worktree remove`, which refused, and the
// checkouts piled up.
//
// CONTRACT (Claude Code 2.1.280 hook reference):
//   - stdin carries JSON with `worktree_path` (absolute).
//   - exit 0 = removed; any other exit = not removed, stderr shown to the user.
//
// The decision lives in scripts/lib/worktree-lifecycle.mjs (decideRemoval),
// resolved from canonical like the create hook. It refuses uncommitted work,
// commits that are neither pushed nor in a merged PR, and parkPolicy KEEP.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

function readStdinJson() {
  try {
    const raw = readFileSync(0, 'utf-8');
    return raw.trim() ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function moduleUrl(from) {
  try {
    const commonDir = execFileSync('git', ['-C', from, 'rev-parse', '--path-format=absolute', '--git-common-dir'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
    const shared = join(dirname(commonDir), 'scripts/lib/remove-workspace.mjs');
    if (existsSync(shared)) return pathToFileURL(shared);
  } catch {
    /* fall through to this checkout's copy */
  }
  return new URL('../../scripts/lib/remove-workspace.mjs', import.meta.url);
}

async function main() {
  const input = readStdinJson();
  const worktreePath = typeof input.worktree_path === 'string' ? input.worktree_path : '';
  if (!worktreePath) {
    process.stderr.write('worktree-remove: no worktree_path on stdin — nothing removed\n');
    process.exit(1);
  }
  const cwd = typeof input.cwd === 'string' && input.cwd ? input.cwd : process.cwd();
  try {
    const from = existsSync(worktreePath) ? worktreePath : cwd;
    const { removeWorkspace } = await import(moduleUrl(from).href);
    const r = removeWorkspace({ worktreePath, cwd, log: (m) => process.stderr.write(`worktree-remove: ${m}\n`) });
    process.stderr.write(`worktree-remove: ${r.action} — ${r.reason}\n`);
    if (!r.ok) {
      process.stderr.write('worktree-remove: kept; inspect with `npm run worktrees` from the canonical checkout\n');
    }
    process.exit(r.ok ? 0 : 1);
  } catch (err) {
    process.stderr.write(`worktree-remove failed: ${err?.message ?? err}\n`);
    process.exit(1);
  }
}

main();
