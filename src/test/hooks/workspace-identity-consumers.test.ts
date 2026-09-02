// Consumer parity for workspace/root identity.
//
// Phase 4 collapsed four independent implementations of "where am I" into one
// authority (.claude/hooks/lib/workspace-identity.mjs). The old failure mode
// was not that any single one was wrong — it was that four could DRIFT, and
// nothing compared them.
//
// So the assertion here is deliberately not "each consumer resolved
// something". It is "they resolved the SAME thing". A suite that only checks
// each consumer in isolation would have stayed green through the entire
// duplication era.
//
// Covered contexts: canonical checkout, linked worktree, explicit payload cwd,
// CLAUDE_PROJECT_DIR fallback, process.cwd() fallback, a plain non-git
// directory, and macOS /var vs /private/var path spelling.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import {
  workspaceRoots,
  resolveActiveRoot,
  canonicalRootOf,
} from '../../../.claude/hooks/lib/workspace-identity.mjs';

const REPO = resolve(__dirname, '../../..');
const MODULE = resolve(REPO, '.claude/hooks/lib/workspace-identity.mjs');
const ADAPTER = resolve(REPO, '.claude/hooks/lib/active-root.sh');

function git(args: string[], cwd: string) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

/** The module's own CLI — what a shell consumer reads. */
function viaCli(flag: string, cwd: string) {
  return execFileSync('node', [MODULE, flag, '--cwd', cwd], {
    encoding: 'utf-8',
  }).trim();
}

/** The shell adapter, sourced exactly as a hook sources it. */
function viaAdapter(fn: string, cwd: string) {
  return execFileSync('bash', ['-c', `. "${ADAPTER}"; ${fn}`], {
    cwd,
    encoding: 'utf-8',
  }).trim();
}

let tmp: string;
let canonical: string;
let worktree: string;

beforeAll(() => {
  tmp = realpathSync(mkdtempSync(join(tmpdir(), 'helm-parity-')));
  canonical = join(tmp, 'helmv3');
  worktree = join(tmp, 'worktrees', 'task-one');
  mkdirSync(canonical, { recursive: true });

  git(['init', '-q', '-b', 'main'], canonical);
  git(['config', 'user.email', 'test@example.com'], canonical);
  git(['config', 'user.name', 'Test'], canonical);
  writeFileSync(join(canonical, 'README.md'), '# canonical\n');
  git(['add', '-A'], canonical);
  git(['commit', '-qm', 'initial'], canonical);

  mkdirSync(join(tmp, 'worktrees'), { recursive: true });
  git(['worktree', 'add', '-q', '--no-track', '-b', 'agent/task-one', worktree], canonical);
});

afterAll(() => {
  try {
    rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
});

describe('workspaceRoots — the regression matrix', () => {
  it('canonical checkout resolves as kind=canonical', () => {
    const r = workspaceRoots({ cwd: canonical });
    expect(r.activeRoot).toBe(canonical);
    expect(r.canonicalRoot).toBe(canonical);
    expect(r.kind).toBe('canonical');
  });

  it('linked worktree resolves as kind=task, with the canonical root found', () => {
    const r = workspaceRoots({ cwd: worktree });
    expect(r.activeRoot).toBe(worktree);
    expect(r.canonicalRoot).toBe(canonical);
    expect(r.kind).toBe('task');
  });

  it('explicit payload cwd beats CLAUDE_PROJECT_DIR', () => {
    const prev = process.env.CLAUDE_PROJECT_DIR;
    process.env.CLAUDE_PROJECT_DIR = canonical;
    try {
      expect(workspaceRoots({ cwd: worktree }).activeRoot).toBe(worktree);
    } finally {
      if (prev === undefined) delete process.env.CLAUDE_PROJECT_DIR;
      else process.env.CLAUDE_PROJECT_DIR = prev;
    }
  });

  it('falls back to CLAUDE_PROJECT_DIR when the payload carries no cwd', () => {
    const prev = process.env.CLAUDE_PROJECT_DIR;
    process.env.CLAUDE_PROJECT_DIR = canonical;
    try {
      expect(workspaceRoots({}).activeRoot).toBe(canonical);
    } finally {
      if (prev === undefined) delete process.env.CLAUDE_PROJECT_DIR;
      else process.env.CLAUDE_PROJECT_DIR = prev;
    }
  });

  it('falls back to process.cwd() only when nothing else is supplied', () => {
    const prev = process.env.CLAUDE_PROJECT_DIR;
    delete process.env.CLAUDE_PROJECT_DIR;
    try {
      // process.cwd() during tests is the helmv3 repo.
      expect(workspaceRoots({}).activeRoot).toBe(REPO);
    } finally {
      if (prev !== undefined) process.env.CLAUDE_PROJECT_DIR = prev;
    }
  });

  it('trusts a plain non-git directory the caller named', () => {
    const plain = join(tmp, 'plain');
    mkdirSync(plain, { recursive: true });
    const r = workspaceRoots({ cwd: plain });
    expect(r.activeRoot).toBe(plain);
    expect(r.inRepo).toBe(false);
    expect(r.kind).toBe('unknown');
  });

  it('preserves the caller path spelling (macOS /var vs /private/var)', () => {
    // git resolves symlinks; the caller's spelling must survive, or an
    // absolute file_path relativised against it yields '../../…'.
    const unresolved = join(tmpdir(), 'helm-parity-spelling');
    mkdirSync(unresolved, { recursive: true });
    try {
      expect(resolveActiveRoot({ cwd: unresolved })).toBe(unresolved);
    } finally {
      rmSync(unresolved, { recursive: true, force: true });
    }
  });

  it('never throws outside a repository', () => {
    const outside = join(tmp, 'nowhere');
    mkdirSync(outside, { recursive: true });
    expect(() => workspaceRoots({ cwd: outside })).not.toThrow();
  });
});

describe('consumer parity — module, CLI and shell adapter must agree', () => {
  it.each([
    ['canonical checkout', () => canonical],
    ['linked worktree', () => worktree],
  ])('activeRoot agrees across all three consumers in the %s', (_label, get) => {
    const dir = get();
    const fromModule = workspaceRoots({ cwd: dir }).activeRoot;
    const fromCli = viaCli('--active-root', dir);
    const fromAdapter = viaAdapter('helm_active_root', dir);

    expect(fromCli).toBe(fromModule);
    expect(fromAdapter).toBe(fromModule);
  });

  it.each([
    ['canonical checkout', () => canonical],
    ['linked worktree', () => worktree],
  ])('canonicalRoot agrees across all three consumers in the %s', (_label, get) => {
    const dir = get();
    const fromModule = canonicalRootOf(workspaceRoots({ cwd: dir }).activeRoot);
    const fromCli = viaCli('--canonical-root', dir);
    const fromAdapter = viaAdapter('helm_canonical_root', dir);

    expect(fromCli).toBe(fromModule);
    expect(fromAdapter).toBe(fromModule);
  });

  it('kind agrees between module and CLI', () => {
    expect(viaCli('--kind', canonical)).toBe(workspaceRoots({ cwd: canonical }).kind);
    expect(viaCli('--kind', worktree)).toBe(workspaceRoots({ cwd: worktree }).kind);
  });

  it('the adapter carries NO resolution policy of its own', () => {
    // Structural assertion, not behavioural: the adapter must not reimplement
    // the rules. If it grows its own git calls or env precedence, this fails
    // and the duplication has started again.
    const src = execFileSync('cat', [ADAPTER], { encoding: 'utf-8' });
    expect(src).not.toMatch(/rev-parse/);
    expect(src).not.toMatch(/CLAUDE_PROJECT_DIR/);
  });
});

describe('workspaceRoots — scope boundary', () => {
  it('does not compute ahead/behind', () => {
    // Phase 4 consolidates ROOT identity only. Integration distance is a
    // separate question (this module measures against origin/main;
    // session-context.sh still measures against local main). Keeping them
    // apart is what lets consumers adopt this without silently changing that.
    const r = workspaceRoots({ cwd: worktree }) as Record<string, unknown>;
    expect(r.ahead).toBeUndefined();
    expect(r.behind).toBeUndefined();
    expect(Object.keys(r).sort()).toEqual(
      ['activeRoot', 'canonicalRoot', 'inRepo', 'kind'].sort(),
    );
  });
});
