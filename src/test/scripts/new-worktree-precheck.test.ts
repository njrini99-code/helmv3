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
    // The mutation budget is checked BEFORE the disk reserve, so it would
    // refuse first and these cases would never reach the gate they are about.
    // Raised here to isolate the disk gate — the budget has its own tests.
    env: { HELM_MAX_MUTATION_WORKTREES: '99', ...process.env, ...env },
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
      // The reclaim path is now PARKING, which frees a checkout without
      // abandoning its branch — so a blocked caller is not forced to choose
      // between disk and unfinished work.
      expect(r.stderr).toContain('scripts/worktree-lifecycle.mjs --park');
      expect(r.stderr).toMatch(/HELM_DISK_RESERVE_GIB/);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it('removes partial state when the install fails FOR SPACE (source-level)', () => {
    // Source-level on purpose — see the header. Both halves of the branch must
    // exist: a transient npm failure KEEPS the tree, an ENOSPC failure does not.
    //
    // This logic moved out of new-worktree.sh when installs became lazy. It now
    // lives with the install, which is the only thing that can exhaust a disk.
    const deps = readFileSync(resolve(REPO, 'scripts/ensure-worktree-deps.mjs'), 'utf-8');
    expect(deps).toMatch(/RESERVE_GIB/);
    expect(deps).toMatch(/rm.*node_modules|'-rf'/s);
    expect(deps).toContain('The worktree is intact');
  });
});

describe('a new workspace starts undisposable', () => {
  // The half of the ownership problem the OPEN-PR gate cannot reach: before a
  // PR exists there is no row to key intent on, and a five-minute-old worktree
  // is clean, pushed and lsof-silent — every signal the old rule read as
  // "disposable". So the marker starts at KEEP and releasing it is a positive
  // act. Asserted at the SOURCE because creating a real worktree here would
  // spend the mutation budget scripts/lib/create-workspace.mjs itself
  // enforces (default 3 as of the "one workspace door" change — see
  // docs/operations/WORKSPACES.md).
  //
  // The marker is written by scripts/lib/create-workspace.mjs, not
  // scripts/new-worktree.sh directly — that file is now a thin CLI wrapper
  // that only parses flags and hands them to the shared module.
  const module = readFileSync(resolve(REPO, 'scripts/lib/create-workspace.mjs'), 'utf-8');

  /** The object literal that is actually written, not the prose around it. */
  const emitted = (() => {
    const open = module.indexOf('const marker = {', module.indexOf('.helm/workspace.json'));
    return module.slice(open, module.indexOf('};', open));
  })();

  it('scripts/lib/create-workspace.mjs writes parkPolicy: KEEP into the marker', () => {
    expect(emitted).toMatch(/parkPolicy:\s*'KEEP'/);
  });

  it('it never EMITS PARK_IF_REPRODUCIBLE at creation', () => {
    // Scoped to the heredoc on purpose: the comment above it names the value a
    // human must type to release a checkout, and that is the point of the
    // comment. A whole-file match would forbid explaining the mechanism.
    expect(emitted).not.toMatch(/PARK_IF_REPRODUCIBLE/);
  });

  it('the lifecycle tool refuses anything the marker has not released', () => {
    const lib = readFileSync(resolve(REPO, 'scripts/lib/worktree-lifecycle.mjs'), 'utf-8');
    // The gate must sit BEFORE the reproducibility checks, or a released-looking
    // checkout could be parked on pushed-ness alone — the #1681 shape.
    const gate = lib.indexOf('KEEP_WORKSPACE_INTENT_REQUIRED,\n      reason:');
    const upstream = lib.indexOf("verdict: UNKNOWN_REMOTE");
    expect(gate).toBeGreaterThan(0);
    expect(upstream).toBeGreaterThan(gate);
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
    expect(agents).toContain('scripts/worktree-lifecycle.mjs --retire');
    expect(agents).toMatch(/same step that merges its PR/i);
  });

  it('the tool itself says so, for a reader who never opens AGENTS.md', () => {
    // retire-worktrees.sh is now a forwarding shim; the authority carries the
    // grant text, and the shim explains where it went.
    const cli = readFileSync(resolve(REPO, 'scripts/worktree-lifecycle.mjs'), 'utf-8');
    expect(cli).toMatch(/STANDING OWNER AUTHORIZATION/i);
    expect(cli).toMatch(/still needs a human/i);
    const shim = readFileSync(resolve(REPO, 'scripts/retire-worktrees.sh'), 'utf-8');
    expect(shim).toMatch(/worktree-lifecycle\.mjs/);
  });
});
