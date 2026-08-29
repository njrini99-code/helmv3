// A failed worktree create must not COST disk.
//
// 2026-08-29: scripts/new-worktree.sh started a multi-GiB `npm ci` with the
// volume already at 99%, died on ENOSPC partway through, and left an 858 MiB
// partial tree behind. The volume then reached zero bytes free, and at zero
// bytes nothing runs at all — the harness cannot write a command's output
// file, so no command could be issued to clean anything up. A tool that
// consumes space in order to fail is how a disk problem becomes a total stop.
//
// Two behaviours are pinned here. The precheck is tested for real, by running
// the script. The cleanup-on-ENOSPC branch is asserted at source level,
// because reproducing it honestly means filling the volume, which is the exact
// condition that made the machine unusable.

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const REPO = resolve(__dirname, '../../..');
const SCRIPT = resolve(REPO, 'scripts/new-worktree.sh');

function run(task: string, env: Record<string, string>) {
  return spawnSync('bash', [SCRIPT, task], {
    cwd: REPO,
    encoding: 'utf-8',
    env: { ...process.env, ...env },
  });
}

describe('new-worktree.sh refuses rather than half-creating', () => {
  it('refuses when free space is below the floor, and creates NOTHING', () => {
    const home = mkdtempSync(join(tmpdir(), 'helm-wt-precheck-'));
    const task = 'precheck-fixture-task';
    try {
      const r = run(task, { HELM_WORKTREE_HOME: home, HELM_MIN_FREE_GIB: '9999999' });

      expect(r.status, 'must exit non-zero so a caller cannot continue').toBe(1);
      expect(r.stderr).toMatch(/refusing: \d+ GiB free/);

      // The point of refusing early: nothing is left behind to reclaim later.
      expect(existsSync(join(home, task))).toBe(false);
      const branches = spawnSync('git', ['branch', '--list', `agent/${task}`], {
        cwd: REPO,
        encoding: 'utf-8',
      }).stdout;
      expect(branches.trim()).toBe('');
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it('tells a blocked caller how to reclaim, not just that it failed', () => {
    // At the moment this fires, the reader may have no working shell budget to
    // go looking. The way out belongs in the refusal.
    const home = mkdtempSync(join(tmpdir(), 'helm-wt-precheck-'));
    try {
      const r = run('precheck-fixture-task-2', {
        HELM_WORKTREE_HOME: home,
        HELM_MIN_FREE_GIB: '9999999',
      });
      expect(r.stderr).toContain('scripts/retire-worktrees.sh --remove');
      expect(r.stderr).toMatch(/HELM_MIN_FREE_GIB/);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it('removes the partial tree when the install fails FOR SPACE (source-level)', () => {
    // Source-level on purpose — see the header. A transient npm failure must
    // still KEEP the tree, so this checks both halves of the branch exist.
    const src = readFileSync(SCRIPT, 'utf-8');
    expect(src).toMatch(/AFTER_GIB=/);
    expect(src).toMatch(/git worktree remove --force "\$DIR"/);
    expect(src).toContain('the worktree exists but has no node_modules');
  });
});

describe('worktree retirement carries a standing grant', () => {
  it('AGENTS.md says an agent may run --remove for RETIRABLE rows', () => {
    // #1654 shipped retirement as report-only with owner approval required,
    // and nothing ever invoked it. The approval was a seventh check on top of
    // six the tool already performs, and it is the one that never fired in
    // time. Without this recorded, the next session asks again and the leak
    // resumes.
    const agents = readFileSync(resolve(REPO, 'AGENTS.md'), 'utf-8');
    expect(agents).toMatch(/STANDING OWNER AUTHORIZATION/);
    expect(agents).toContain('scripts/retire-worktrees.sh --remove');
    expect(agents).toMatch(/same step that merges its PR/i);
  });

  it('the tool itself says so, for a reader who never opens AGENTS.md', () => {
    const src = readFileSync(resolve(REPO, 'scripts/retire-worktrees.sh'), 'utf-8');
    expect(src).toMatch(/standing owner authorization/i);
    expect(src).toMatch(/KEEP rows still need a human/);
  });
});
