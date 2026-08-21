import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  Status,
  check,
  summarizeGate,
  evaluateRequiredChecks,
  REQUIRED_CHECK_NAMES,
  resolveSha,
  isAncestor,
  resolveMainSha,
  commitsBetween,
  changedFilesBetween,
  extractPrNumber,
} from '../../../scripts/release/lib/release-common.mjs';

/**
 * spec §22's fail-closed release readiness gate
 * (docs/ai-system/GOLFHELM_SELF_HEALING_ENGINEERING_SYSTEM.md) and spec §35's
 * control-plane test list ("readiness fail-closed cases").
 *
 * `scripts/release/check-release-candidate.mjs` itself is NOT spawned
 * end-to-end here: it shells out to `npm run knowledge:check`, `node
 * scripts/repo-doctor/cli.mjs`, and `gh api` — real, slow, environment-
 * dependent subprocesses with no place in the `npm test` fast lane. What IS
 * tested here, at full fidelity, is every PURE and GIT-BASED piece of logic
 * that gate is built from: the hard-failure aggregation
 * (summarizeGate/check/Status — this is the actual "fail closed" contract:
 * ANY FAIL or BLOCKED makes the gate refuse), the required-checks
 * evaluation (including the documented 'Supabase Preview' advisory
 * exception), and SHA resolution/ancestry/commit-range extraction against a
 * REAL temporary git repository (not mocked) — because SHA handling is
 * exactly the class of bug (see release-common.mjs's own header on the
 * absolute-path trap it works around) that looks correct until it runs.
 */

// ---------------------------------------------------------------------------
// summarizeGate — the fail-closed aggregation itself.
// ---------------------------------------------------------------------------

describe('summarizeGate — fail-closed aggregation', () => {
  it('is ok with zero FAIL/BLOCKED checks, even with warnings present', () => {
    const checks = [check('a', Status.PASS, 'fine'), check('b', Status.WARN, 'notable but not blocking')];
    const result = summarizeGate(checks);
    expect(result.ok).toBe(true);
    expect(result.hardFailureCount).toBe(0);
    expect(result.warnCount).toBe(1);
  });

  it('counts each FAIL and each BLOCKED as one hard failure', () => {
    const checks = [
      check('a', Status.FAIL, 'bad'),
      check('b', Status.BLOCKED, 'crashed'),
      check('c', Status.PASS, 'ok'),
      check('d', Status.WARN, 'meh'),
    ];
    const result = summarizeGate(checks);
    expect(result.ok).toBe(false);
    expect(result.hardFailureCount).toBe(2);
    expect(result.warnCount).toBe(1);
  });

  it('a single hard failure is enough to refuse — the gate does not average', () => {
    const nineGood = Array.from({ length: 9 }, (_, i) => check(`c${i}`, Status.PASS, 'ok'));
    const result = summarizeGate([...nineGood, check('the-one', Status.FAIL, 'blocks everything')]);
    expect(result.ok).toBe(false);
    expect(result.hardFailureCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// evaluateRequiredChecks — the exact 6 named checks from
// .github/branch-protection.md, plus the documented 'Supabase Preview'
// advisory exception.
// ---------------------------------------------------------------------------

describe('evaluateRequiredChecks', () => {
  function green(name: string) {
    return { name, status: 'completed', conclusion: 'success' };
  }

  it('all 6 required checks green -> allRequiredGreen true, nothing missing or not-green', () => {
    const runs = REQUIRED_CHECK_NAMES.map(green);
    const result = evaluateRequiredChecks(runs);
    expect(result.allRequiredGreen).toBe(true);
    expect(result.missing).toEqual([]);
    expect(result.notGreen).toEqual([]);
  });

  it('a required check that never posted is reported as missing, not silently passed', () => {
    const runs = REQUIRED_CHECK_NAMES.slice(1).map(green); // drop 'Smoke checks'
    const result = evaluateRequiredChecks(runs);
    expect(result.allRequiredGreen).toBe(false);
    expect(result.missing).toEqual(['Smoke checks']);
  });

  it('a required check with a non-success conclusion is reported as not-green', () => {
    const runs = REQUIRED_CHECK_NAMES.map((name, i) => ({
      name,
      status: 'completed',
      conclusion: i === 0 ? 'failure' : 'success',
    }));
    const result = evaluateRequiredChecks(runs);
    expect(result.allRequiredGreen).toBe(false);
    expect(result.notGreen).toEqual([{ name: REQUIRED_CHECK_NAMES[0], status: 'completed', conclusion: 'failure' }]);
  });

  it('a required check still in progress (not completed) is reported as not-green', () => {
    const runs = REQUIRED_CHECK_NAMES.map((name, i) =>
      i === 0 ? { name, status: 'in_progress', conclusion: null } : green(name),
    );
    const result = evaluateRequiredChecks(runs);
    expect(result.allRequiredGreen).toBe(false);
    expect(result.notGreen[0].name).toBe(REQUIRED_CHECK_NAMES[0]);
  });

  it('a red "Supabase Preview" run is excluded from otherRed (documented advisory exception)', () => {
    const runs = [...REQUIRED_CHECK_NAMES.map(green), { name: 'Supabase Preview', status: 'completed', conclusion: 'failure' }];
    const result = evaluateRequiredChecks(runs);
    expect(result.allRequiredGreen).toBe(true);
    expect(result.otherRed).toEqual([]);
  });

  it('a red check that is NOT required and NOT the advisory exception surfaces in otherRed', () => {
    const runs = [...REQUIRED_CHECK_NAMES.map(green), { name: 'Some Other Advisory Check', status: 'completed', conclusion: 'failure' }];
    const result = evaluateRequiredChecks(runs);
    expect(result.allRequiredGreen).toBe(true); // does not block the gate by itself
    expect(result.otherRed).toHaveLength(1);
    expect(result.otherRed[0].name).toBe('Some Other Advisory Check');
  });

  it('neutral and skipped conclusions on non-required checks are not treated as red', () => {
    const runs = [
      ...REQUIRED_CHECK_NAMES.map(green),
      { name: 'Neutral Check', status: 'completed', conclusion: 'neutral' },
      { name: 'Skipped Check', status: 'completed', conclusion: 'skipped' },
    ];
    const result = evaluateRequiredChecks(runs);
    expect(result.otherRed).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// SHA resolution, ancestry, and commit-range extraction against a REAL git
// repo — the readiness gate's "candidate-sha-resolvable" and
// "candidate-sha-on-main-lineage" checks are only as good as these.
// ---------------------------------------------------------------------------

function makeGitFixture() {
  const dir = mkdtempSync(join(tmpdir(), 'release-check-git-'));
  const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf-8' });
  git('init', '--quiet', '-b', 'main');
  git('config', 'user.email', 'test@test.local');
  git('config', 'user.name', 'Test');

  writeFileSync(join(dir, 'file1.txt'), 'one\n');
  git('add', 'file1.txt');
  git('commit', '-q', '-m', 'init (#1)');
  const prodSha = git('rev-parse', 'HEAD').trim();

  writeFileSync(join(dir, 'file2.txt'), 'two\n');
  mkdirSync(join(dir, 'src/app/golf/actions'), { recursive: true });
  writeFileSync(join(dir, 'src/app/golf/actions/access-code.ts'), 'export {};\n');
  git('add', 'file2.txt', 'src/app/golf/actions/access-code.ts');
  git('commit', '-q', '-m', 'feat: add feature (#42)');
  const mainSha = git('rev-parse', 'HEAD').trim();

  git('checkout', '-q', '-b', 'divergent', prodSha);
  writeFileSync(join(dir, 'diverge.txt'), 'div\n');
  git('add', 'diverge.txt');
  git('commit', '-q', '-m', 'not on main');
  const divergentSha = git('rev-parse', 'HEAD').trim();
  git('checkout', '-q', 'main');

  return { dir, prodSha, mainSha, divergentSha };
}

describe('SHA resolution and lineage — real git repo, no mocks', () => {
  let fixture: ReturnType<typeof makeGitFixture>;

  afterEach(() => {
    if (fixture) rmSync(fixture.dir, { recursive: true, force: true });
  });

  it('resolveSha resolves a real ref and returns null for a bogus one (fail-closed, never a guessed SHA)', () => {
    fixture = makeGitFixture();
    expect(resolveSha(fixture.dir, 'HEAD')).toBe(fixture.mainSha);
    expect(resolveSha(fixture.dir, 'not-a-real-ref-xyz')).toBeNull();
  });

  it('resolveMainSha resolves the local main branch tip when there is no remote', () => {
    fixture = makeGitFixture();
    const result = resolveMainSha(fixture.dir);
    expect(result.sha).toBe(fixture.mainSha);
    expect(result.ref).toBe('main');
  });

  it('isAncestor is true for a SHA that IS on main lineage', () => {
    fixture = makeGitFixture();
    expect(isAncestor(fixture.dir, fixture.prodSha, 'main')).toBe(true);
  });

  it('isAncestor is false for a SHA on a divergent branch — this is the FAIL case the readiness gate relies on', () => {
    fixture = makeGitFixture();
    expect(isAncestor(fixture.dir, fixture.divergentSha, 'main')).toBe(false);
  });

  it('commitsBetween lists exactly the commits in range and extracts each PR number from its squash-merge subject', () => {
    fixture = makeGitFixture();
    const commits = commitsBetween(fixture.dir, fixture.prodSha, fixture.mainSha);
    expect(commits).toHaveLength(1);
    expect(commits[0].hash).toBe(fixture.mainSha);
    expect(commits[0].prNumber).toBe(42);
  });

  it('changedFilesBetween returns repo-relative paths (matching what mapChangedFilesToFeatures expects — no absolute-path stripping needed for this caller)', () => {
    fixture = makeGitFixture();
    const files = changedFilesBetween(fixture.dir, fixture.prodSha, fixture.mainSha);
    expect(files.sort()).toEqual(['file2.txt', 'src/app/golf/actions/access-code.ts']);
  });

  it('an empty range (prod == candidate) returns no commits and no changed files, not an error', () => {
    fixture = makeGitFixture();
    expect(commitsBetween(fixture.dir, fixture.mainSha, fixture.mainSha)).toEqual([]);
    expect(changedFilesBetween(fixture.dir, fixture.mainSha, fixture.mainSha)).toEqual([]);
  });
});

describe('extractPrNumber', () => {
  it.each([
    ['fix(x): thing (#123)', 123],
    ['feat: add feature (#42)', 42],
    ['fix(x): thing', null],
    ['fix(x): mentions #99 mid-sentence, not at the end', null],
  ])('%s -> %s', (subject, expected) => {
    expect(extractPrNumber(subject)).toBe(expected);
  });
});
