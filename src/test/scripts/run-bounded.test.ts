/**
 * `scripts/run-bounded.mjs` — a wall-clock deadline that bounds the whole
 * process TREE.
 *
 * THE DEFECT THIS REPLACES, measured 2026-08-28 rather than assumed:
 *
 *   `perl -e 'alarm shift; exec @ARGV' 5 ./tree.sh`
 *       watchdog exit=142 at 5s
 *       parent      alive=no
 *       grandchild  alive=YES     <-- the run was never bounded
 *
 * The alarm fires correctly — on `/bin/sleep`, on the Claude binary,
 * interactively and under launchd. An earlier report claiming the watchdog
 * "does not reliably fire" was wrong and is retracted. The real defect is
 * narrower: `exec` replaces perl with the child, so SIGALRM reaches exactly one
 * PID and every descendant outlives the deadline.
 *
 *     direct child died   !=   the run is bounded
 *
 * A Repair run spawns npm, vitest, tsc and git. Leaving those behind is how a
 * "timed out" run keeps holding a worktree, a lockfile and several GB of RAM.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, chmodSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const RUNNER = resolve(__dirname, '../../../scripts/run-bounded.mjs');
const TIMEOUT_EXIT_CODE = 124;

// Fixture commands sleep 20s, not 300s. Long enough to outlast every 2s
// deadline here, short enough that a BROKEN watchdog fails these tests in
// seconds instead of five minutes. A test that takes 300s to go red is a test
// nobody runs under injection.
function run(seconds: number, command: string, args: string[] = []) {
  return spawnSync('node', [RUNNER, String(seconds), command, ...args], {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

/** True while the pid exists. `kill -0` never actually signals. */
function alive(pid: number): boolean {
  try {
    execFileSync('kill', ['-0', String(pid)], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

describe('run-bounded — the deadline bounds the whole process tree', () => {
  it('A — a fast command succeeds and its exit code is 0', () => {
    const r = run(10, '/bin/echo', ['ok']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('ok');
  });

  it('E — a non-zero exit is PROPAGATED, not reported as a timeout', () => {
    // The distinction the caller depends on: a failing command is not a hung
    // one, and collapsing the two would make every real failure look like an
    // infrastructure problem.
    const r = run(10, '/bin/sh', ['-c', 'exit 3']);
    expect(r.status).toBe(3);
    expect(r.status).not.toBe(TIMEOUT_EXIT_CODE);
  });

  it('B + F — a hanging direct child is killed, with the timeout exit code', () => {
    const started = Date.now();
    const r = run(2, '/bin/sleep', ['20']);
    const elapsed = Date.now() - started;

    expect(r.status).toBe(TIMEOUT_EXIT_CODE);
    expect(elapsed).toBeLessThan(15_000);
    expect(r.stderr).toContain('deadline');
  });

  it('C — a hanging GRANDCHILD is killed too (the defect that motivated this)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'helm-bounded-'));
    const pidFile = join(dir, 'pids.txt');
    const script = join(dir, 'tree.sh');
    writeFileSync(
      script,
      // The grandchild's stdio is detached from the inherited pipes ON PURPOSE.
      // With `stdio: 'inherit'`, an ORPHANED grandchild keeps the parent's
      // stdout open and `spawnSync` blocks on EOF — so a broken watchdog would
      // make this test HANG instead of fail. A hang is not a red test; it is an
      // absent one. Detaching the fd means liveness is what decides the result.
      `#!/bin/sh\n/bin/sleep 20 >/dev/null 2>&1 &\necho "grandchild=$!" >> ${pidFile}\n/bin/sleep 20 >/dev/null 2>&1\n`,
    );
    chmodSync(script, 0o755);

    try {
      const r = run(2, script);
      expect(r.status).toBe(TIMEOUT_EXIT_CODE);

      const recorded = readFileSync(pidFile, 'utf-8');
      const gc = Number(/grandchild=(\d+)/.exec(recorded)?.[1]);
      expect(Number.isFinite(gc)).toBe(true);

      // The assertion the old watchdog fails. Give the group a moment to die.
      execFileSync('/bin/sleep', ['1']);
      expect(alive(gc)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('D — a child that IGNORES SIGTERM is still killed after the grace period', () => {
    // `trap '' TERM` makes SIGTERM a no-op. Without the KILL escalation this
    // hangs forever and the deadline means nothing.
    const started = Date.now();
    const r = run(2, '/bin/sh', ['-c', "trap '' TERM; /bin/sleep 20"]);
    const elapsed = Date.now() - started;

    expect(r.status).toBe(TIMEOUT_EXIT_CODE);
    expect(elapsed).toBeLessThan(20_000);
  });

  it('a command that does not exist fails fast rather than waiting out the clock', () => {
    const r = run(30, '/nonexistent/definitely-not-here');
    expect(r.status).toBe(127);
    expect(r.status).not.toBe(TIMEOUT_EXIT_CODE);
  });

  it('the runner script is executable and self-documenting about the defect', () => {
    expect(existsSync(RUNNER)).toBe(true);
    const src = readFileSync(RUNNER, 'utf-8');
    // The negative-pid group signal IS the fix; a bare pid is the old bug.
    expect(src).toContain('process.kill(-child.pid');
    expect(src).toContain('detached: true');
  });
});
