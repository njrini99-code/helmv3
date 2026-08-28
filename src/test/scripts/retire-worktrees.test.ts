// Worktree retirement must refuse before it removes.
//
// Every assertion here is about a REFUSAL. That is deliberate: this is the one
// tool in the control plane that deletes things, and the failure mode people
// actually fear is not "it kept a tree too long" — it is "it removed work that
// existed nowhere else". So the suite is weighted toward proving each guard
// independently, with a report line naming which fact saved the tree.
//
// THE TRAP THE TOOL EXISTS TO AVOID, verified on the real repo before writing
// any of this:
//
//   agent/canonical-write-boundary   ancestor-of-main=NO  unique=2  PR MERGED
//   agent/stop-verification          ancestor-of-main=NO  unique=1  PR MERGED
//   git branch --merged origin/main  ->  lists NONE of them
//
// This repo squash-merges, so a merged branch's commits never become ancestors
// of main and it reports unique commits forever. "Has unique commits, so keep
// it" would therefore keep every merged worktree permanently — which is the
// leak, not a guard against it.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, chmodSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const REPO = resolve(__dirname, '../../..');
const SCRIPT = resolve(REPO, 'scripts/retire-worktrees.sh');

function git(args: string[], cwd: string) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function commit(dir: string, name: string) {
  writeFileSync(join(dir, `${name}.txt`), `${name}\n`);
  git(['add', '-A'], dir);
  git(['commit', '-qm', name], dir);
}

let tmp: string;
let canonical: string;
let stub: string;

/**
 * A stub standing in for `gh`. It answers from a table written per-test,
 * because gh cannot report on fixture branches that were never pushed.
 */
function writePrStub(table: Record<string, string>) {
  const lines = Object.entries(table)
    .map(([b, v]) => `  "${b}") echo "${v}" ;;`)
    .join('\n');
  writeFileSync(
    stub,
    `#!/usr/bin/env bash\ncase "$1" in\n${lines}\n  *) echo "" ;;\nesac\n`,
  );
  chmodSync(stub, 0o755);
}

function run(): string {
  return execFileSync('bash', [SCRIPT], {
    cwd: canonical,
    encoding: 'utf-8',
    env: { ...process.env, HELM_PR_LOOKUP: stub },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

/** The verdict line for a branch, from the report. */
function verdict(out: string, branch: string): string {
  const line = out.split('\n').find((l) => l.includes(` ${branch} `));
  return line ?? '';
}

beforeEach(() => {
  tmp = realpathSync(mkdtempSync(join(tmpdir(), 'helm-retire-')));
  canonical = join(tmp, 'helmv3');
  stub = join(tmp, 'pr-stub.sh');
  mkdirSync(canonical, { recursive: true });

  git(['init', '-q', '-b', 'main'], canonical);
  git(['config', 'user.email', 't@e.com'], canonical);
  git(['config', 'user.name', 'T'], canonical);
  commit(canonical, 'base');
});

afterEach(() => {
  try {
    rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
});

describe('retire-worktrees — what it refuses', () => {
  it('KEEPS the canonical checkout even when a PR lookup would say CLOSED', () => {
    // The real repo returns an unrelated ancient "186 CLOSED" for --head main.
    // A tool that consulted PR state before identifying canonical would read
    // that as "safe to delete" and try to remove the control tower.
    writePrStub({ main: '186 CLOSED' });
    expect(verdict(run(), 'main')).toContain('KEEP');
    expect(verdict(run(), 'main')).toContain('canonical');
  });

  it('KEEPS a worktree with uncommitted work, even on a MERGED branch', () => {
    const wt = join(tmp, 'dirty');
    git(['worktree', 'add', '-q', '--no-track', '-b', 'agent/dirty', wt, 'HEAD'], canonical);
    writeFileSync(join(wt, 'unsaved.ts'), 'export const x = 1;\n');
    writePrStub({ 'agent/dirty': '900 MERGED' });

    const v = verdict(run(), 'agent/dirty');
    expect(v).toContain('KEEP');
    expect(v).toMatch(/uncommitted/);
  });

  it('KEEPS a branch whose PR is OPEN', () => {
    const wt = join(tmp, 'open');
    git(['worktree', 'add', '-q', '--no-track', '-b', 'agent/open', wt, 'HEAD'], canonical);
    writePrStub({ 'agent/open': '901 OPEN' });

    const v = verdict(run(), 'agent/open');
    expect(v).toContain('KEEP');
    expect(v).toMatch(/OPEN, not MERGED/);
  });

  it('KEEPS a branch whose PR is CLOSED but not merged', () => {
    const wt = join(tmp, 'closed');
    git(['worktree', 'add', '-q', '--no-track', '-b', 'agent/closed', wt, 'HEAD'], canonical);
    writePrStub({ 'agent/closed': '902 CLOSED' });

    const v = verdict(run(), 'agent/closed');
    expect(v).toContain('KEEP');
    expect(v).toMatch(/CLOSED, not MERGED/);
  });

  it('KEEPS a branch with NO PR at all — the work may exist nowhere else', () => {
    const wt = join(tmp, 'nopr');
    git(['worktree', 'add', '-q', '--no-track', '-b', 'agent/nopr', wt, 'HEAD'], canonical);
    commit(wt, 'local-only-work');
    writePrStub({});

    const v = verdict(run(), 'agent/nopr');
    expect(v).toContain('KEEP');
    expect(v).toMatch(/no PR found/);
  });

  it('KEEPS a detached HEAD — there is no branch to verify', () => {
    const wt = join(tmp, 'detached');
    git(['worktree', 'add', '-q', '--detach', wt, 'HEAD'], canonical);
    writePrStub({});

    expect(run()).toMatch(/\(detached\).*KEEP.*no branch to verify/);
  });
});

describe('retire-worktrees — what it allows', () => {
  it('RETIRABLE only when merged, clean, and idle', () => {
    const wt = join(tmp, 'merged');
    git(['worktree', 'add', '-q', '--no-track', '-b', 'agent/merged', wt, 'HEAD'], canonical);
    commit(wt, 'work-that-landed');
    writePrStub({ 'agent/merged': '903 MERGED' });

    const v = verdict(run(), 'agent/merged');
    expect(v).toContain('RETIRABLE');
    expect(v).toMatch(/#903 MERGED/);
  });

  it('a merged branch still reports unique commits — and is retired anyway', () => {
    // The heart of it. Under squash-merge this count is non-zero for every
    // merged branch, so a tool keyed on it would never retire anything.
    const wt = join(tmp, 'unique');
    git(['worktree', 'add', '-q', '--no-track', '-b', 'agent/unique', wt, 'HEAD'], canonical);
    commit(wt, 'a');
    commit(wt, 'b');
    writePrStub({ 'agent/unique': '904 MERGED' });

    const unique = Number(git(['rev-list', '--count', 'main..agent/unique'], canonical));
    expect(unique).toBe(2);
    expect(verdict(run(), 'agent/unique')).toContain('RETIRABLE');
  });

  it('removes nothing without --remove', () => {
    const wt = join(tmp, 'merged2');
    git(['worktree', 'add', '-q', '--no-track', '-b', 'agent/merged2', wt, 'HEAD'], canonical);
    writePrStub({ 'agent/merged2': '905 MERGED' });

    const out = run();
    expect(out).toMatch(/RETIRABLE/);
    expect(out).toMatch(/Re-run with --remove/);
    // Still present: reporting is the default.
    expect(git(['worktree', 'list'], canonical)).toContain(wt);
  });
});
