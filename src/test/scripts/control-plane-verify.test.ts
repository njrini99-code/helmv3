// The verifier must be able to fail, and must fail for the right reason.
//
// A green verifier is worthless until injection proves it discriminates. This
// repo's whole failure pattern is controls that stopped running while their
// documentation stayed put — a verifier that cannot go red is just one more.
//
// EVERY INJECTION RUNS AGAINST A DISPOSABLE COPY. The live checkout is never
// mutated to test the test. That is not fastidiousness: on 2026-08-29 a fixture
// test resolved its target back to the real repository and removed a live
// worktree (#1676). `HELM_CONTROL_PLANE_ROOT` exists so this suite can aim
// somewhere else, and the last test in this file proves it is actually aimed
// there.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, cpSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';

const REPO = resolve(__dirname, '../../..');
const VERIFY = resolve(REPO, 'scripts/control-plane-verify.mjs');

/** Only the surface the static checks read. Copying the repo is not required. */
const FIXTURE_PATHS = [
  '.claude/settings.json',
  '.claude/hooks',
  '.claude/rules',
  'config/tool-authority.json',
  'config/control-plane-observations.json',
  'config/control-plane-gaps.json',
  'docs/CONTROL_PLANE_ENFORCEMENT.md',
  'docs/TOOL_AUTHORITY_MATRIX.md',
  'scripts/new-worktree.sh',
  'CLAUDE.md',
  'AGENTS.md',
  '.mcp.json',
];

let base: string;

function makeFixture(): string {
  const dir = mkdtempSync(join(tmpdir(), 'helm-cpv-'));
  for (const rel of FIXTURE_PATHS) {
    const src = resolve(REPO, rel);
    if (!existsSync(src)) continue;
    const dest = join(dir, rel);
    mkdirSync(dirname(dest), { recursive: true });
    cpSync(src, dest, { recursive: true });
  }
  return dir;
}

/** Run the verifier against a fixture and return the result for one check id. */
function checkIn(root: string, id: string) {
  const r = spawnSync('node', [VERIFY, '--static', '--json'], {
    cwd: REPO,
    encoding: 'utf-8',
    // Skip the nested vitest run — see the guard in control-plane-verify.mjs.
    // It reports UNKNOWN when skipped, so nothing here is silently upgraded.
    env: { ...process.env, HELM_CONTROL_PLANE_ROOT: root, HELM_CP_SKIP_NESTED_TESTS: '1' },
  });
  const parsed = JSON.parse(r.stdout);
  return parsed.results.find((x: { id: string }) => x.id === id) ?? null;
}

beforeAll(() => {
  base = makeFixture();
});
afterAll(() => {
  rmSync(base, { recursive: true, force: true });
});

describe('failure injection — each control goes red for its own reason', () => {
  it('baseline fixture: the checks under test are green before injection', () => {
    for (const id of [
      'hook-scripts-exist',
      'canonical-write-guard-reachable',
      'no-prose-overclaims-enforcement',
      'every-declared-namespace-observed',
      'mutation-budget-enforced',
    ]) {
      expect(checkIn(base, id)?.state, id).toBe('PASS');
    }
  });

  it('DELETE a configured hook -> hook-scripts-exist FAILS', () => {
    const fx = makeFixture();
    try {
      rmSync(join(fx, '.claude/hooks/guard-canonical-write.mjs'));
      const r = checkIn(fx, 'hook-scripts-exist');
      expect(r?.state).toBe('FAIL');
      expect(r?.detail).toMatch(/guard-canonical-write/);
    } finally {
      rmSync(fx, { recursive: true, force: true });
    }
  });

  it('POINT a hook at a nonexistent script -> hook-scripts-exist FAILS', () => {
    const fx = makeFixture();
    try {
      const p = join(fx, '.claude/settings.json');
      const d = JSON.parse(readFileSync(p, 'utf-8'));
      d.hooks.Stop[0].hooks[0].command = '"$CLAUDE_PROJECT_DIR"/.claude/hooks/guard-sql.sh';
      writeFileSync(p, JSON.stringify(d, null, 2));
      expect(checkIn(fx, 'hook-scripts-exist')?.state).toBe('FAIL');
    } finally {
      rmSync(fx, { recursive: true, force: true });
    }
  });

  it('BREAK the blocking hook matcher -> guard-reachable FAILS', () => {
    // guard-bash.sh's exact shape: wired, and unable to fire.
    const fx = makeFixture();
    try {
      const p = join(fx, '.claude/settings.json');
      const d = JSON.parse(readFileSync(p, 'utf-8'));
      d.hooks.PreToolUse[0].matcher = 'Bash';
      writeFileSync(p, JSON.stringify(d, null, 2));
      const r = checkIn(fx, 'canonical-write-guard-reachable');
      expect(r?.state).toBe('FAIL');
      expect(r?.detail).toMatch(/cannot reach/);
    } finally {
      rmSync(fx, { recursive: true, force: true });
    }
  });

  it('REINTRODUCE a false safety claim -> claim consistency FAILS', () => {
    const fx = makeFixture();
    try {
      const p = join(fx, '.claude/rules/database.md');
      writeFileSync(p, `${readFileSync(p, 'utf-8')}\n\nThose statements are blocked by a PreToolUse hook.\n`);
      const r = checkIn(fx, 'no-prose-overclaims-enforcement');
      expect(r?.state).toBe('FAIL');
      expect(r?.detail).toMatch(/database\.md/);
    } finally {
      rmSync(fx, { recursive: true, force: true });
    }
  });

  it('a QUOTED historical claim does NOT fail — corrections must stay writable', () => {
    // The correction records what the old text said. Assertions are checked
    // with quoted spans stripped; forbidding the words would forbid the fix.
    const fx = makeFixture();
    try {
      const p = join(fx, '.claude/rules/database.md');
      writeFileSync(p, `${readFileSync(p, 'utf-8')}\n\nIt used to say "are blocked by a PreToolUse hook" and that was false.\n`);
      expect(checkIn(fx, 'no-prose-overclaims-enforcement')?.state).toBe('PASS');
    } finally {
      rmSync(fx, { recursive: true, force: true });
    }
  });

  it('DECLARE a namespace with no observation -> tool authority FAILS', () => {
    const fx = makeFixture();
    try {
      const p = join(fx, 'config/tool-authority.json');
      const d = JSON.parse(readFileSync(p, 'utf-8'));
      d.services[0].alternates.push({ namespace: 'mcp__never_observed__*', disposition: 'TEST', reason: 'injection' });
      writeFileSync(p, JSON.stringify(d, null, 2));
      const r = checkIn(fx, 'every-declared-namespace-observed');
      expect(r?.state).toBe('FAIL');
      expect(r?.detail).toMatch(/never_observed/);
    } finally {
      rmSync(fx, { recursive: true, force: true });
    }
  });

  it('MOVE the budget check after allocation -> ordering FAILS', () => {
    // Enforcing a budget after `git worktree add` means a refusal has already
    // allocated what it was refusing to spend.
    const fx = makeFixture();
    try {
      const p = join(fx, 'scripts/new-worktree.sh');
      const src = readFileSync(p, 'utf-8');
      const lines = src.split('\n');
      const bi = lines.findIndex((l) => !l.trimStart().startsWith('#') && l.includes('check-mutation-budget.mjs'));
      expect(bi, 'fixture must contain the budget call').toBeGreaterThan(-1);
      const moved = lines.splice(bi, 1)[0] ?? '';
      lines.push(moved);
      writeFileSync(p, lines.join('\n'));
      const r = checkIn(fx, 'mutation-budget-enforced');
      expect(r?.state).toBe('FAIL');
      expect(r?.detail).toMatch(/AFTER git worktree add/);
    } finally {
      rmSync(fx, { recursive: true, force: true });
    }
  });

  it('REMOVE the budget check entirely -> ordering FAILS', () => {
    const fx = makeFixture();
    try {
      const p = join(fx, 'scripts/new-worktree.sh');
      writeFileSync(p, readFileSync(p, 'utf-8').replace(/check-mutation-budget\.mjs/g, 'nothing.mjs'));
      expect(checkIn(fx, 'mutation-budget-enforced')?.state).toBe('FAIL');
    } finally {
      rmSync(fx, { recursive: true, force: true });
    }
  });
});

describe('runtime evidence expires when its configuration moves', () => {
  it('changing a service deny rule STALES that service observations', async () => {
    const { fingerprintFor, resolveObservation } = await import('../../../scripts/gen-tool-authority.mjs');
    const mcp = JSON.parse(readFileSync(resolve(REPO, '.mcp.json'), 'utf-8'));
    const settings = JSON.parse(readFileSync(resolve(REPO, '.claude/settings.json'), 'utf-8'));
    const obs = JSON.parse(readFileSync(resolve(REPO, 'config/control-plane-observations.json'), 'utf-8'))
      .observations.find((o: { service: string }) => o.service === 'Sentry');

    // Fresh under the config it was recorded against.
    expect(resolveObservation(obs, fingerprintFor('Sentry', { settings, mcp })).state).not.toBe('STALE');

    // Move exactly one Sentry rule; the observation must expire on its own.
    const moved = JSON.parse(JSON.stringify(settings));
    moved.permissions.deny.push('mcp__claude_ai_Sentry__update_issue');
    const after = resolveObservation(obs, fingerprintFor('Sentry', { settings: moved, mcp }));
    expect(after.state).toBe('STALE');
    expect(after.detail).toMatch(/config is now/);
  });

  it('an unrelated service is NOT staled by that change', async () => {
    // A fingerprint over the whole settings file would stale everything on every
    // edit, and people would learn to ignore STALE.
    const { fingerprintFor } = await import('../../../scripts/gen-tool-authority.mjs');
    const mcp = JSON.parse(readFileSync(resolve(REPO, '.mcp.json'), 'utf-8'));
    const settings = JSON.parse(readFileSync(resolve(REPO, '.claude/settings.json'), 'utf-8'));
    const before = fingerprintFor('Vercel', { settings, mcp });
    const moved = JSON.parse(JSON.stringify(settings));
    moved.permissions.deny.push('mcp__claude_ai_Sentry__update_issue');
    expect(fingerprintFor('Vercel', { settings: moved, mcp })).toBe(before);
  });

  it('a service governed by nothing is marked ungoverned, not silently fresh', async () => {
    const { fingerprintFor, isUngoverned } = await import('../../../scripts/gen-tool-authority.mjs');
    const mcp = JSON.parse(readFileSync(resolve(REPO, '.mcp.json'), 'utf-8'));
    const settings = JSON.parse(readFileSync(resolve(REPO, '.claude/settings.json'), 'utf-8'));
    expect(isUngoverned(fingerprintFor('GitHub', { settings, mcp }))).toBe(true);
  });
});

describe('github capability is fingerprintable — the gap that closed by measuring', () => {
  it('the same capability always produces the same digest, whatever the key order', async () => {
    // A first draft recorded the fingerprint in Python (sorted keys) and checked
    // it in JS (insertion order), so identical capability produced different
    // digests and the check failed against itself. Two implementations of one
    // fact is the defect this repo keeps finding.
    const { githubCapabilityFingerprint } = await import('../../../scripts/control-plane-verify.mjs');
    const a = githubCapabilityFingerprint({ account_id: 1, repo_id: 2, granted_scope_names: ['repo', 'gist'] });
    const b = githubCapabilityFingerprint({ granted_scope_names: ['gist', 'repo'], repo_id: 2, account_id: 1 });
    expect(a).toBe(b);
  });

  it('DROPPING a scope changes the digest — branch deletion depends on this path', async () => {
    const { githubCapabilityFingerprint } = await import('../../../scripts/control-plane-verify.mjs');
    const full = githubCapabilityFingerprint({ account_id: 1, repo_id: 2, granted_scope_names: ['repo', 'workflow'] });
    const narrowed = githubCapabilityFingerprint({ account_id: 1, repo_id: 2, granted_scope_names: ['repo'] });
    expect(narrowed).not.toBe(full);
  });

  it('a different account or repo changes the digest', async () => {
    const { githubCapabilityFingerprint } = await import('../../../scripts/control-plane-verify.mjs');
    const base = { account_id: 1, repo_id: 2, granted_scope_names: ['repo'] };
    expect(githubCapabilityFingerprint({ ...base, account_id: 9 })).not.toBe(githubCapabilityFingerprint(base));
    expect(githubCapabilityFingerprint({ ...base, repo_id: 9 })).not.toBe(githubCapabilityFingerprint(base));
  });

  it('the recorded observation carries a fingerprint and its evidence', () => {
    const obs = JSON.parse(
      readFileSync(resolve(REPO, 'config/control-plane-observations.json'), 'utf-8'),
    ).observations.find((o: { service: string; namespace: string }) => o.service === 'GitHub' && o.namespace.startsWith('gh CLI'));
    expect(obs?.capability_fingerprint, 'no fingerprint recorded').toBeTruthy();
    // Evidence, not just a hash — a digest nobody can reconstruct is not evidence.
    expect(obs?.capability_evidence?.granted_scope_names).toContain('repo');
    expect(typeof obs?.capability_evidence?.account_id).toBe('number');
  });
});

describe('exit semantics', () => {
  it('UNKNOWN outranks FAIL and never becomes PASS', async () => {
    const { summarise, PASS, FAIL, UNKNOWN } = await import('../../../scripts/control-plane-verify.mjs');
    expect(summarise([{ state: PASS }]).code).toBe(0);
    expect(summarise([{ state: PASS }, { state: FAIL }]).code).toBe(1);
    expect(summarise([{ state: PASS }, { state: UNKNOWN }]).code).toBe(2);
    // If something could not be established, "these specific things are broken"
    // would imply everything else WAS checked.
    expect(summarise([{ state: FAIL }, { state: UNKNOWN }]).code).toBe(2);
  });

  it('an acknowledged gap does not fail the run, but is never silent', () => {
    const gaps = JSON.parse(readFileSync(resolve(REPO, 'config/control-plane-gaps.json'), 'utf-8')).gaps;
    expect(gaps.length).toBeGreaterThan(0);
    for (const g of gaps) {
      // A gap without an owner and a closing condition is just an excuse.
      expect(g.id, 'gap needs an id').toBeTruthy();
      expect(g.owner, `${g.id} needs an owner`).toBeTruthy();
      expect(g.opened, `${g.id} needs a date`).toBeTruthy();
      expect(g.reason?.length ?? 0, `${g.id} needs a reason`).toBeGreaterThan(80);
      expect(g.closes_when, `${g.id} needs a closing condition`).toBeTruthy();
    }
  });
});

describe('SENTINEL: injections can never reach the live checkout', () => {
  it('the verifier reports the fixture root, not the Helm repo', () => {
    // The #1676 regression guard, at the verifier level. If this fails, STOP:
    // an injection is about to be evaluated against the real control plane.
    const r = spawnSync('node', [VERIFY, '--static', '--json'], {
      cwd: REPO,
      encoding: 'utf-8',
      env: { ...process.env, HELM_CONTROL_PLANE_ROOT: base, HELM_CP_SKIP_NESTED_TESTS: '1' },
    });
    const parsed = JSON.parse(r.stdout);
    const hookCheck = parsed.results.find((x: { id: string }) => x.id === 'hook-scripts-exist');
    expect(hookCheck).toBeTruthy();

    // Deleting a hook in the FIXTURE must change the answer. If the verifier
    // were reading the real repo, this would still pass.
    const fx = makeFixture();
    try {
      rmSync(join(fx, '.claude/hooks'), { recursive: true, force: true });
      expect(checkIn(fx, 'hook-scripts-exist')?.state).toBe('FAIL');
      // ...and the real repo is untouched by that deletion.
      expect(existsSync(resolve(REPO, '.claude/hooks/guard-canonical-write.mjs'))).toBe(true);
    } finally {
      rmSync(fx, { recursive: true, force: true });
    }
  });
});
