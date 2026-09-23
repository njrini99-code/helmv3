// Protected-prefix branch retention (A6): control-plane-verify.mjs FAILs
// when a release/ios/android/capacitor branch (the prefixes that actually
// gate .circleci/config.yml's ios/android compile jobs by branch name — see
// PROTECTED_CI_PREFIXES's own comment for the grep that verified this and
// the reasoning for excluding `hotfix/*`, which the check was originally
// specced to include but which gates nothing in either CI system) sits
// stale with no record in config/branch-retention.json's
// `ci_prefix_branch_reviews` array. Pure classifier, no network.
import { describe, it, expect } from 'vitest';
import { classifyProtectedPrefixBranches, PROTECTED_CI_PREFIXES, PASS, FAIL } from '../control-plane-verify.mjs';

const NOW = new Date('2026-09-05T00:00:00Z');
const OLD = '2026-01-01T00:00:00Z'; // well past any staleDays threshold
const RECENT = '2026-09-01T00:00:00Z'; // within 14 days of NOW

describe('PROTECTED_CI_PREFIXES', () => {
  it('does not include hotfix/ — verified against live CI config to gate nothing', () => {
    expect(PROTECTED_CI_PREFIXES).not.toContain('hotfix/');
  });
  it('includes the four prefixes CircleCI\'s ios/android filters actually use', () => {
    expect(PROTECTED_CI_PREFIXES.sort()).toEqual(['android/', 'capacitor/', 'ios/', 'release/'].sort());
  });
});

describe('classifyProtectedPrefixBranches', () => {
  it('PASSes when there are no protected-prefix branches at all', () => {
    const r = classifyProtectedPrefixBranches([{ name: 'agent/some-task', committedDate: OLD }], [], { now: NOW });
    expect(r.state).toBe(PASS);
  });

  it('PASSes when a protected-prefix branch is recent (under the staleDays threshold)', () => {
    const r = classifyProtectedPrefixBranches([{ name: 'release/1.0', committedDate: RECENT }], [], { now: NOW, staleDays: 14 });
    expect(r.state).toBe(PASS);
  });

  it('FAILs when a protected-prefix branch is stale and unrecorded', () => {
    const r = classifyProtectedPrefixBranches([{ name: 'release/1.0', committedDate: OLD }], [], { now: NOW, staleDays: 14 });
    expect(r.state).toBe(FAIL);
    expect(r.detail).toContain('release/1.0');
  });

  it('PASSes when the stale branch has a matching record in ci_prefix_branch_reviews', () => {
    const r = classifyProtectedPrefixBranches(
      [{ name: 'release/1.0', committedDate: OLD }],
      [{ name: 'release/1.0', reason: 'carried over at the 2026-09-05 reset; owner to review', reviewed: '2026-09-05' }],
      { now: NOW, staleDays: 14 },
    );
    expect(r.state).toBe(PASS);
  });

  it('checks every configured prefix (ios/, android/, capacitor/), not only release/', () => {
    const branches = [
      { name: 'ios/experiment', committedDate: OLD },
      { name: 'android/experiment', committedDate: OLD },
      { name: 'capacitor/experiment', committedDate: OLD },
    ];
    const r = classifyProtectedPrefixBranches(branches, [], { now: NOW, staleDays: 14 });
    expect(r.state).toBe(FAIL);
    expect(r.detail).toContain('ios/experiment');
    expect(r.detail).toContain('android/experiment');
    expect(r.detail).toContain('capacitor/experiment');
  });

  it('does not flag a branch with no resolvable commit date rather than guessing it is stale', () => {
    const r = classifyProtectedPrefixBranches([{ name: 'release/unknown-date', committedDate: null }], [], { now: NOW, staleDays: 14 });
    expect(r.state).toBe(PASS);
  });

  it('a record for one branch does not clear a DIFFERENT stale branch', () => {
    const r = classifyProtectedPrefixBranches(
      [{ name: 'release/1.0', committedDate: OLD }, { name: 'release/2.0', committedDate: OLD }],
      [{ name: 'release/1.0', reason: 'x', reviewed: '2026-09-05' }],
      { now: NOW, staleDays: 14 },
    );
    expect(r.state).toBe(FAIL);
    expect(r.detail).toContain('1 protected-prefix branch');
    expect(r.detail).toContain('release/2.0');
  });
});
