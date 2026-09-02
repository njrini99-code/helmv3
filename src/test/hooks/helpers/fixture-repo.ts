// Shared fixture-repo builder for the GolfHelm Engineering OS control-plane
// tests (guard-feature-context, session-attribution, stop-gate).
//
// Per the P0 audit's test plan: a temp directory (never the real repo — this
// repo's own shipping.md guards against writing outside scratch/project dirs
// apply to test fixtures too), seeded with a minimal memory/registry.yml (2
// fake features, real glob syntax) so tests don't depend on the real
// 19-feature registry's specific ids, which will drift.
//
// `.claude/hooks` is SYMLINKED (not copied) into the fixture from the real
// repo, so tests always exercise the actual hook code with no copy-drift
// risk, while `CLAUDE_PROJECT_DIR` points at the fixture for all DATA reads
// (session-state, registry.yml) — feature-map.mjs's relative import of
// scripts/knowledge/lib/registry.mjs resolves against the hook file's real
// (symlink-followed) path, landing back in the real repo, which is correct:
// that module has no repo-specific data baked in.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

export const REPO_ROOT = resolve(__dirname, '../../../..');

export const FIXTURE_REGISTRY_YML = `version: 1

features:
  feature_a:
    name: Feature A
    status: active
    owner: test
    criticality: high
    docs:
      feature: memory/features/feature-a.md
    code:
      actions:
        - src/app/golf/actions/feature-a-*.ts
    review:
      required_docs: []
      required_checks: []

  feature_b:
    name: Feature B
    status: active
    owner: test
    criticality: medium
    docs:
      feature: memory/features/feature-b.md
    code:
      actions:
        - src/app/golf/actions/feature-b-*.ts
    review:
      required_docs: []
      required_checks: []
`;

export interface FixtureRepo {
  dir: string;
  cleanup: () => void;
  git: (...args: string[]) => string;
  commitAll: (message: string) => void;
}

/** Build a fresh temp git repo with the fixture registry, the two feature
 * docs it points at, and .claude/hooks symlinked from the real repo. */
export function createFixtureRepo(): FixtureRepo {
  const dir = mkdtempSync(join(tmpdir(), 'golfhelm-os-test-'));

  const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' });

  git('init', '-q');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'Test');
  // A default branch name avoids environment-dependent `git init` warnings
  // (some environments default to `master`, some to `main`) affecting
  // anything downstream that reads branch state.
  try {
    git('checkout', '-q', '-b', 'main');
  } catch {
    // Already on a branch named main in some git versions' default init.
  }

  mkdirSync(join(dir, 'memory/features'), { recursive: true });
  writeFileSync(join(dir, 'memory/registry.yml'), FIXTURE_REGISTRY_YML);
  writeFileSync(join(dir, 'memory/features/feature-a.md'), '# Feature A\n\nFixture doc.\n');
  writeFileSync(join(dir, 'memory/features/feature-b.md'), '# Feature B\n\nFixture doc.\n');

  mkdirSync(join(dir, 'src/app/golf/actions'), { recursive: true });
  writeFileSync(join(dir, 'src/app/golf/actions/feature-a-one.ts'), 'export const one = 1;\n');
  writeFileSync(join(dir, 'src/app/golf/actions/feature-b-one.ts'), 'export const one = 1;\n');
  // Pre-committed so later tests can MODIFY it (git diff needs a prior
  // committed version to show a delta against — a brand-new untracked file
  // shows nothing via plain `git diff`). Filename deliberately contains a
  // `[id]`-style dynamic route segment, real in this repo's route tree, to
  // regression-test stop-verify.sh's array-based (not unquoted-string)
  // handling of touched-file paths in the 'use server' detector.
  writeFileSync(join(dir, 'src/app/golf/actions/feature-a-[id].ts'), 'export const byId = 1;\n');

  mkdirSync(join(dir, '.claude'), { recursive: true });
  symlinkSync(join(REPO_ROOT, '.claude/hooks'), join(dir, '.claude/hooks'));
  writeFileSync(join(dir, '.gitignore'), '.claude/session-state/\n');

  git('add', '-A');
  git('commit', '-q', '-m', 'fixture init');

  return {
    dir,
    git,
    commitAll(message: string) {
      git('add', '-A');
      git('commit', '-q', '-m', message);
    },
    cleanup() {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

/**
 * `spawnSync`, not `execFileSync` — deliberately. `execFileSync` only
 * returns stdout, and only on a NON-ZERO exit does it attach stderr (to the
 * thrown error). `stop-verify.sh` always exits 0 (block/allow/advisory are
 * all distinguished by stdout/stderr CONTENT, not exit code) — so
 * `execFileSync` can never see its stderr on the success path. `spawnSync`
 * returns both streams unconditionally, which is what every assertion here
 * that checks an advisory message actually needs.
 */
export function runHook(fixture: FixtureRepo, hookRelPath: string, stdinPayload: unknown): { code: number; stdout: string; stderr: string } {
  const result = spawnSync('node', [join(fixture.dir, '.claude/hooks', hookRelPath)], {
    input: JSON.stringify(stdinPayload),
    cwd: fixture.dir,
    env: { ...process.env, CLAUDE_PROJECT_DIR: fixture.dir },
    encoding: 'utf8',
  });
  return { code: result.status ?? 1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

export function runStopVerify(fixture: FixtureRepo, sessionId: string): { code: number; stdout: string; stderr: string } {
  const result = spawnSync('bash', [join(fixture.dir, '.claude/hooks/stop-verify.sh')], {
    input: JSON.stringify({ session_id: sessionId }),
    cwd: fixture.dir,
    env: { ...process.env, CLAUDE_PROJECT_DIR: fixture.dir },
    encoding: 'utf8',
  });
  return { code: result.status ?? 1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}
