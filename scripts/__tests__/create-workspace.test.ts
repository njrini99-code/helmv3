// scripts/lib/create-workspace.mjs is the one door every worktree in this
// repo goes through — scripts/new-worktree.sh (the CLI), and, once wired into
// .claude/settings.json, the WorktreeCreate hook
// (.claude/hooks/worktree-create.mjs). Before this module a worktree could
// also be made by a raw `git worktree add` or by the harness's own
// ungoverned WorktreeCreate default, and neither got the mutation budget, the
// disk reserve, the .helm/workspace.json marker, or the local-only
// .env.local that scripts/new-worktree.sh always gave a human.
//
// These tests exercise the library function directly against a real,
// disposable git repo — a bare origin plus a seed clone, same shape as
// src/test/scripts/worktree-lifecycle.test.ts and
// scripts/__tests__/deploy-prod-verify.test.ts — and the hook as a real
// subprocess against the same fixture. Nothing here mocks git.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  readFileSync,
  realpathSync,
  existsSync,
  lstatSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { createWorkspace } from '../lib/create-workspace.mjs';

const REPO = resolve(__dirname, '../..');
const HOOK = resolve(REPO, '.claude/hooks/worktree-create.mjs');

function git(args: string[], cwd: string): string {
  return execFileSync('git', args, { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

let tmp: string;
let seed: string;
let home: string;

beforeEach(() => {
  // realpathSync matters on macOS: /var/folders/... vs /private/var/folders/...
  // is exactly the string mismatch that made canonical-root comparisons
  // manufacture false budget refusals elsewhere in this repo (see
  // workspace-identity.mjs's own comment on the same trap).
  tmp = realpathSync(mkdtempSync(join(tmpdir(), 'helmv3-cw-')));
  const origin = join(tmp, 'origin.git');
  seed = join(tmp, 'seed');
  home = join(tmp, 'home');

  mkdirSync(origin, { recursive: true });
  git(['init', '-q', '--bare', '-b', 'main'], origin);

  mkdirSync(seed, { recursive: true });
  git(['init', '-q', '-b', 'main'], seed);
  git(['config', 'user.email', 't@e.com'], seed);
  git(['config', 'user.name', 'T'], seed);

  // Match the real repo's gitignore shape for node_modules/.env.local/.helm
  // (including the bare `node_modules` line that also catches a SYMLINK,
  // which the dir-only `node_modules/` pattern would miss) so a
  // clean-worktree assertion here means what it means in the real repo.
  writeFileSync(join(seed, '.gitignore'), 'node_modules/\nnode_modules\n.env.local\n.env*.local\n.helm/\n');
  mkdirSync(join(seed, 'node_modules'), { recursive: true });
  writeFileSync(join(seed, 'node_modules/marker.json'), '{}\n');
  writeFileSync(join(seed, '.node-version'), '22\n');
  writeFileSync(join(seed, 'app.txt'), 'app\n');
  git(['add', '-A'], seed);
  git(['commit', '-qm', 'seed'], seed);
  git(['remote', 'add', 'origin', origin], seed);
  git(['push', '-q', 'origin', 'main'], seed);
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe('createWorkspace — refusals', () => {
  it('refuses an empty name', async () => {
    await expect(createWorkspace({ name: '', repo: seed, home })).rejects.toMatchObject({ code: 'EMPTY_NAME' });
    await expect(createWorkspace({ name: '   ', repo: seed, home })).rejects.toMatchObject({ code: 'EMPTY_NAME' });
  });

  it('normalises a slash in the name to a dash rather than refusing', async () => {
    const result = await createWorkspace({ name: 'feat/foo', repo: seed, home });
    expect(result.branch).toBe('agent/feat-foo');
    expect(result.path).toBe(join(home, 'feat-foo'));
    expect(existsSync(result.path)).toBe(true);
  });

  it('refuses when the path already exists, and creates nothing new', async () => {
    await createWorkspace({ name: 'dup', repo: seed, home });
    await expect(createWorkspace({ name: 'dup', repo: seed, home })).rejects.toMatchObject({ code: 'PATH_EXISTS' });
  });

  it('refuses when the branch already exists', async () => {
    git(['branch', 'agent/dup-branch'], seed);
    await expect(createWorkspace({ name: 'dup-branch', repo: seed, home })).rejects.toMatchObject({
      code: 'BRANCH_EXISTS',
    });
  });

  it('refuses over budget, and creates NOTHING — not the directory, not the branch', async () => {
    await createWorkspace({ name: 'first', repo: seed, home });
    const prev = process.env.HELM_MAX_MUTATION_WORKTREES;
    process.env.HELM_MAX_MUTATION_WORKTREES = '1';
    try {
      await expect(createWorkspace({ name: 'second', repo: seed, home })).rejects.toMatchObject({
        code: 'BUDGET_EXCEEDED',
      });
    } finally {
      if (prev === undefined) delete process.env.HELM_MAX_MUTATION_WORKTREES;
      else process.env.HELM_MAX_MUTATION_WORKTREES = prev;
    }
    expect(existsSync(join(home, 'second'))).toBe(false);
    expect(git(['branch', '--list', 'agent/second'], seed)).toBe('');
  });

  it('allows exactly the default budget of 3, and refuses the 4th', async () => {
    await createWorkspace({ name: 'b1', repo: seed, home });
    await createWorkspace({ name: 'b2', repo: seed, home });
    const r3 = await createWorkspace({ name: 'b3', repo: seed, home });
    expect(existsSync(r3.path)).toBe(true);
    await expect(createWorkspace({ name: 'b4', repo: seed, home })).rejects.toMatchObject({
      code: 'BUDGET_EXCEEDED',
    });
  });
});

describe('createWorkspace — what it writes', () => {
  it('returns { path, branch }', async () => {
    const result = await createWorkspace({ name: 'shape', repo: seed, home });
    expect(result.path).toBe(join(home, 'shape'));
    expect(result.branch).toBe('agent/shape');
  });

  it('writes the marker with the right fields, defaulting parkPolicy to PARK_IF_REPRODUCIBLE', async () => {
    const result = await createWorkspace({ name: 'marked', repo: seed, home, base: 'origin/main' });
    const marker = JSON.parse(readFileSync(join(result.path, '.helm/workspace.json'), 'utf-8'));
    expect(marker).toMatchObject({
      kind: 'task',
      task: 'marked',
      branch: 'agent/marked',
      base: 'origin/main',
      environment: 'local',
      supabase: 'local',
      productionWrites: false,
      parkPolicy: 'PARK_IF_REPRODUCIBLE',
      createdBy: 'create-workspace.mjs',
    });
    expect(typeof marker.createdAt).toBe('string');
    expect(Number.isNaN(new Date(marker.createdAt).getTime())).toBe(false);
  });

  it('stamps parkPolicy: KEEP when { keep: true } is passed', async () => {
    const result = await createWorkspace({ name: 'kept', repo: seed, home, keep: true });
    const marker = JSON.parse(readFileSync(join(result.path, '.helm/workspace.json'), 'utf-8'));
    expect(marker.parkPolicy).toBe('KEEP');
  });

  it('symlinks node_modules to the source repo by default', async () => {
    const result = await createWorkspace({ name: 'symlinked', repo: seed, home });
    const nm = join(result.path, 'node_modules');
    expect(lstatSync(nm).isSymbolicLink()).toBe(true);
    expect(existsSync(join(nm, 'marker.json'))).toBe(true);
    expect(result.deps).toBe('symlinked');
  });

  it('copies .node-version from the source repo', async () => {
    const result = await createWorkspace({ name: 'nodever', repo: seed, home });
    expect(readFileSync(join(result.path, '.node-version'), 'utf-8')).toBe('22\n');
  });

  it('writes .env.local pointed at the local stack, with no service-role key', async () => {
    const result = await createWorkspace({ name: 'envtest', repo: seed, home });
    const env = readFileSync(join(result.path, '.env.local'), 'utf-8');
    expect(env).toContain('NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321');
    expect(env).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY=\S/);
    expect(env).not.toContain('SUPABASE_SERVICE_ROLE_KEY=');
    expect(env).toContain('GENERATED for a task worktree');
  });

  it('leaves the new worktree with a clean `git status --porcelain`', async () => {
    const result = await createWorkspace({ name: 'clean', repo: seed, home });
    expect(git(['status', '--porcelain'], result.path)).toBe('');
  });
});

describe('worktree-create.mjs — the WorktreeCreate hook contract', () => {
  function runHook(input: Record<string, unknown>, extraEnv: Record<string, string> = {}) {
    return spawnSync('node', [HOOK], {
      input: JSON.stringify(input),
      encoding: 'utf-8',
      env: { ...process.env, HELM_WORKTREE_HOME: home, ...extraEnv },
    });
  }

  it('prints the absolute path as the LAST non-empty stdout line and exits 0', () => {
    const r = runHook({ name: 'hooked', cwd: seed });
    expect(r.status).toBe(0);
    const lines = r.stdout.trim().split('\n').filter(Boolean);
    const last = lines[lines.length - 1];
    expect(last).toBe(join(home, 'hooked'));
    expect(existsSync(last)).toBe(true);
  });

  it('an over-budget call exits 1 with NOTHING on stdout', () => {
    runHook({ name: 'first-hook', cwd: seed });
    const r = runHook({ name: 'second-hook', cwd: seed }, { HELM_MAX_MUTATION_WORKTREES: '1' });
    expect(r.status).toBe(1);
    expect(r.stdout.trim()).toBe('');
    expect(r.stderr).toMatch(/refused/i);
  });

  it('generates a name in the documented shape when none is given', () => {
    const r = runHook({ cwd: seed });
    expect(r.status).toBe(0);
    const lines = r.stdout.trim().split('\n').filter(Boolean);
    expect(lines[lines.length - 1]).toMatch(/wt-[0-9a-f]{6}$/);
  });
});
