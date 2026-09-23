import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configDrift, driftWarning, resolveLaunchDirectory } from '../claude.mjs';

const roots = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

/** A repo whose `main` doubles as origin/main (a local ref named like the remote one). */
function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'helm-launch-')));
  roots.push(root);
  const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'config', 'user.name', 'Fixture');
  git(root, 'config', 'user.email', 'fixture@example.test');
  mkdirSync(join(root, '.claude/rules'), { recursive: true });
  writeFileSync(join(root, 'AGENTS.md'), 'policy v1\n');
  writeFileSync(join(root, 'CLAUDE.md'), '@AGENTS.md\n');
  writeFileSync(join(root, '.claude/rules/db.md'), 'rule v1\n');
  writeFileSync(join(root, 'app.ts'), 'export {}\n');
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'initial');
  git(root, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
  return { root, git };
}

describe('h launcher', () => {
  it('launches in the current checkout, or canonical when outside the repo', () => {
    const { root, git } = fixture();
    const wt = join(root, '..', `${root.split('/').pop()}-wt`);
    roots.push(wt);
    git(root, 'worktree', 'add', '-qb', 'agent/task', wt, 'main');
    mkdirSync(join(wt, 'nested'), { recursive: true });
    expect(resolveLaunchDirectory(join(wt, 'nested'), root)).toEqual({ canonicalRoot: root, cwd: realpathSync(wt) });
    expect(resolveLaunchDirectory(tmpdir(), root)).toEqual({ canonicalRoot: root, cwd: root });
  });

  it('reports a control-plane file main changed but the branch did not as stale', () => {
    const { root, git } = fixture();
    git(root, 'switch', '-qc', 'agent/old');
    writeFileSync(join(root, 'app.ts'), 'export const x = 1\n');
    git(root, 'commit', '-qam', 'feature work');
    git(root, 'switch', '-q', 'main');
    writeFileSync(join(root, 'AGENTS.md'), 'policy v2\n');
    git(root, 'commit', '-qam', 'policy update');
    git(root, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
    git(root, 'switch', '-q', 'agent/old');

    const drift = configDrift(root);
    expect(drift.stale).toEqual(['AGENTS.md']);
    expect(driftWarning(drift)).toMatch(/1 file\(s\).*AGENTS\.md/);
    expect(readFileSync(join(root, 'AGENTS.md'), 'utf8')).toBe('policy v1\n'); // never touched
  });

  it('does not flag control-plane files the branch changed on purpose, committed or not', () => {
    const { root, git } = fixture();
    git(root, 'switch', '-qc', 'agent/config');
    writeFileSync(join(root, '.claude/rules/db.md'), 'rule v2\n');
    git(root, 'commit', '-qam', 'rule change');
    writeFileSync(join(root, 'CLAUDE.md'), '@AGENTS.md\nmore\n');

    const drift = configDrift(root);
    expect(drift.stale).toEqual([]);
    expect(drift.changedHere.sort()).toEqual(['.claude/rules/db.md', 'CLAUDE.md']);
    expect(driftWarning(drift)).toBeNull();
  });

  it('says nothing when it cannot compare', () => {
    expect(configDrift(tmpdir())).toBeNull();
    expect(driftWarning(null)).toBeNull();
  });
});
