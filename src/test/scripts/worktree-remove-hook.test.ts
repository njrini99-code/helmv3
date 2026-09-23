// .claude/hooks/worktree-remove.mjs — the WorktreeRemove hook, run as a real
// subprocess against a disposable git fixture, the way Claude Code runs it:
// JSON with `worktree_path` on stdin; exit 0 = removed, anything else = kept.
//
// The decision matrix is pinned purely in worktree-lifecycle.test.ts
// (decideRemoval). This file proves the wiring: fact gathering, the stale-copy
// restore, the no---force removal, and branch deletion/archiving.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const HOOK = resolve(__dirname, '../../../.claude/hooks/worktree-remove.mjs');

function git(args: string[], cwd: string) {
  return execFileSync('git', args, { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function commit(dir: string, name: string) {
  writeFileSync(join(dir, `${name}.txt`), `${name}\n`);
  git(['add', '-A'], dir);
  git(['commit', '-q', '-m', name], dir);
}

describe('WorktreeRemove hook', () => {
  let tmp: string;
  let canonical: string;
  let stub: string;

  function prStub(table: Record<string, string>) {
    const lines = Object.entries(table).map(([b, v]) => `  "${b}") echo "${v}" ;;`).join('\n');
    writeFileSync(stub, `#!/usr/bin/env bash\ncase "$1" in\n${lines}\n  *) echo "" ;;\nesac\n`);
    chmodSync(stub, 0o755);
  }

  function worktree(name: string, parkPolicy = 'PARK_IF_REPRODUCIBLE') {
    const wt = join(tmp, name);
    git(['worktree', 'add', '-q', '--no-track', '-b', `agent/${name}`, wt, 'main'], canonical);
    mkdirSync(join(wt, '.helm'), { recursive: true });
    writeFileSync(join(wt, '.helm/workspace.json'), JSON.stringify({ parkPolicy }));
    return wt;
  }

  function hook(worktreePath: string) {
    return spawnSync('node', [HOOK], {
      input: JSON.stringify({ hook_event_name: 'WorktreeRemove', worktree_path: worktreePath, cwd: canonical }),
      encoding: 'utf-8',
      env: { ...process.env, HELM_PR_LOOKUP: stub },
    });
  }

  const branches = () => git(['branch', '--list', 'agent/*'], canonical);

  beforeEach(() => {
    tmp = realpathSync(mkdtempSync(join(tmpdir(), 'helm-wt-remove-')));
    canonical = join(tmp, 'helmv3');
    stub = join(tmp, 'pr-stub.sh');
    mkdirSync(canonical, { recursive: true });
    git(['init', '-q', '-b', 'main'], canonical);
    git(['config', 'user.email', 't@e.com'], canonical);
    git(['config', 'user.name', 'T'], canonical);
    writeFileSync(join(canonical, '.gitignore'), '.helm/\n');
    writeFileSync(join(canonical, '.mcp.json'), '{"v":1}\n');
    commit(canonical, 'base');
    writeFileSync(join(canonical, '.mcp.json'), '{"v":2}\n');
    git(['commit', '-q', '-am', 'mcp v2'], canonical);
    prStub({});
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('removes an untouched subagent worktree and its branch, without an archive tag', () => {
    const wt = worktree('agent-a1b2');
    const r = hook(wt);
    expect(r.status, r.stderr).toBe(0);
    expect(existsSync(wt)).toBe(false);
    expect(branches()).not.toContain('agent/agent-a1b2');
    expect(git(['tag', '--list', 'archive/*'], canonical)).toBe('');
  });

  it('removes a worktree whose only change is a stale .mcp.json copy', () => {
    const wt = worktree('agent-mcp');
    writeFileSync(join(wt, '.mcp.json'), '{"v":1}\n');
    const r = hook(wt);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stderr).toMatch(/restoring stale copies: \.mcp\.json/);
    expect(existsSync(wt)).toBe(false);
  });

  it('refuses uncommitted work and leaves everything in place', () => {
    const wt = worktree('agent-dirty');
    writeFileSync(join(wt, 'notes.txt'), 'unsaved\n');
    const r = hook(wt);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/REFUSE — 1 uncommitted file/);
    expect(existsSync(join(wt, 'notes.txt'))).toBe(true);
    expect(branches()).toContain('agent/agent-dirty');
  });

  it('refuses commits that are neither pushed nor in a merged PR', () => {
    const wt = worktree('wf_c0ffee-1');
    commit(wt, 'only-copy');
    const r = hook(wt);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/neither pushed nor in a merged PR/);
    expect(existsSync(wt)).toBe(true);
  });

  it('removes and archives a branch whose PR merged at this exact tip', () => {
    const wt = worktree('agent-merged');
    commit(wt, 'shipped');
    const sha = git(['rev-parse', 'HEAD'], wt);
    prStub({ 'agent/agent-merged': `910 MERGED ${sha}` });
    const r = hook(wt);
    expect(r.status, r.stderr).toBe(0);
    expect(existsSync(wt)).toBe(false);
    expect(branches()).not.toContain('agent/agent-merged');
    expect(git(['rev-parse', '--verify', 'refs/tags/archive/agent/agent-merged^{}'], canonical)).toBe(sha);
  });

  it('respects a workspace that said parkPolicy KEEP', () => {
    const wt = worktree('agent-keep', 'KEEP');
    expect(hook(wt).status).toBe(1);
    expect(existsSync(wt)).toBe(true);
  });

  it('never removes the canonical checkout', () => {
    const r = hook(canonical);
    expect(r.status).toBe(1);
    expect(existsSync(join(canonical, '.git'))).toBe(true);
  });

  it('treats a path that is already gone as removed', () => {
    const r = hook(join(tmp, 'never-existed'));
    expect(r.status, r.stderr).toBe(0);
    expect(r.stderr).toMatch(/ALREADY_GONE/);
  });
});
