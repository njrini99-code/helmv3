// Weekly control-plane report (A6): the pure decision functions behind
// .github/workflows/control-plane-weekly.yml's four hard checks and one soft
// listing. These are tested directly, with no network and no real gh/
// gitleaks binary, so the pass/fail logic is provably correct independent of
// whatever this repo's live GitHub state happens to be on any given day.
import { describe, it, expect } from 'vitest';
import {
  repoSlug,
  evaluateDependabot,
  evaluateStaleNoPrBranches,
  summarizeGitleaksFindings,
} from '../control-plane-weekly-report.mjs';

describe('repoSlug', () => {
  it('prefers GITHUB_REPOSITORY when set (the value Actions provides)', () => {
    expect(repoSlug({ GITHUB_REPOSITORY: 'njrini99-code/helmv3' })).toBe('njrini99-code/helmv3');
  });
});

describe('evaluateDependabot', () => {
  const alert = (state, severity, number) => ({ state, security_advisory: { severity }, number });

  it('counts only OPEN high/critical alerts', () => {
    const alerts = [alert('open', 'high', 1), alert('open', 'medium', 2), alert('fixed', 'critical', 3), alert('open', 'critical', 4)];
    const r = evaluateDependabot(alerts, 5);
    expect(r.count).toBe(2);
    expect(r.alerts.map((a) => a.number)).toEqual([1, 4]);
  });
  it('ok is true when count is at or under the ceiling', () => {
    expect(evaluateDependabot([alert('open', 'high', 1)], 1).ok).toBe(true);
  });
  it('ok is false when count exceeds the ceiling', () => {
    expect(evaluateDependabot([alert('open', 'high', 1), alert('open', 'high', 2)], 1).ok).toBe(false);
  });
  it('treats a missing/empty alert list as zero, always ok', () => {
    expect(evaluateDependabot([], 0).ok).toBe(true);
    expect(evaluateDependabot(undefined, 0).ok).toBe(true);
  });
  it('reads severity from the top-level field when security_advisory is absent (defensive)', () => {
    const r = evaluateDependabot([{ state: 'open', severity: 'critical', number: 9 }], 0);
    expect(r.count).toBe(1);
  });
});

describe('evaluateStaleNoPrBranches', () => {
  const now = new Date('2026-09-05T00:00:00Z');
  it('flags a branch with no PR whose tip is older than the cutoff', () => {
    const branches = [{ name: 'old-no-pr', committedDate: '2026-07-01T00:00:00Z' }];
    const r = evaluateStaleNoPrBranches(branches, new Set(), { now, staleDays: 30 });
    expect(r).toHaveLength(1);
    expect(r[0].name).toBe('old-no-pr');
  });
  it('does not flag a branch that has (or ever had) a PR', () => {
    const branches = [{ name: 'has-pr', committedDate: '2026-07-01T00:00:00Z' }];
    const r = evaluateStaleNoPrBranches(branches, new Set(['has-pr']), { now, staleDays: 30 });
    expect(r).toHaveLength(0);
  });
  it('does not flag a branch newer than the cutoff, even with no PR', () => {
    const branches = [{ name: 'fresh-no-pr', committedDate: '2026-09-01T00:00:00Z' }];
    const r = evaluateStaleNoPrBranches(branches, new Set(), { now, staleDays: 30 });
    expect(r).toHaveLength(0);
  });
  it('skips a branch with no resolvable commit date rather than guessing', () => {
    const branches = [{ name: 'unknown-date', committedDate: null }];
    const r = evaluateStaleNoPrBranches(branches, new Set(), { now, staleDays: 30 });
    expect(r).toHaveLength(0);
  });
});

describe('summarizeGitleaksFindings', () => {
  it('counts findings by rule and distinct files, carrying no secret material', () => {
    const findings = [
      { RuleID: 'r1', File: 'a.ts', Secret: 'should-never-appear-in-output' },
      { RuleID: 'r1', File: 'a.ts', Secret: 'should-never-appear-in-output' },
      { RuleID: 'r2', File: 'b.ts', Secret: 'also-never' },
    ];
    const s = summarizeGitleaksFindings(findings);
    expect(s.count).toBe(3);
    expect(s.distinctFiles).toBe(2);
    expect(s.byRule).toEqual({ r1: 2, r2: 1 });
    expect(JSON.stringify(s)).not.toContain('never-appear');
    expect(JSON.stringify(s)).not.toContain('also-never');
  });
  it('handles an empty/undefined findings list', () => {
    expect(summarizeGitleaksFindings([])).toEqual({ count: 0, distinctFiles: 0, byRule: {} });
    expect(summarizeGitleaksFindings(undefined)).toEqual({ count: 0, distinctFiles: 0, byRule: {} });
  });
});
