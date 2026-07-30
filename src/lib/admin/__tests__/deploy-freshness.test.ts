import { describe, it, expect } from 'vitest';
import {
  classifyDeployFreshness,
  STALE_AFTER_COMMITS,
  STALE_AFTER_HOURS,
} from '@/lib/admin/deploy-freshness';

const NOW = new Date('2026-07-30T12:45:00Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

describe('classifyDeployFreshness', () => {
  describe('never reports "up to date" for a check it could not perform', () => {
    it('no deployed sha is unknown, not current', () => {
      const f = classifyDeployFreshness({ deployedSha: undefined, behindBy: 0, deployedAt: null, now: NOW });
      expect(f.state).toBe('unknown');
      expect(f.red).toBeNull();
      expect(f.summary).toContain('could not be determined');
    });

    it('an unreachable GitHub (behindBy null) is unknown, not current', () => {
      const f = classifyDeployFreshness({ deployedSha: 'abc1234', behindBy: null, deployedAt: hoursAgo(1), now: NOW });
      expect(f.state).toBe('unknown');
      expect(f.summary).not.toContain('level with main');
    });
  });

  it('level with main is current and never red', () => {
    const f = classifyDeployFreshness({ deployedSha: 'abc1234def', behindBy: 0, deployedAt: hoursAgo(2), now: NOW });
    expect(f.state).toBe('current');
    expect(f.red).toBeNull();
    expect(f.summary).toContain('abc1234');
    expect(f.summary).toContain('level with main');
  });

  /**
   * The anti-wolf-crying rule. A repo that promotes production deliberately is
   * almost always a commit or two behind; if that alone went red, the briefing
   * would be red every morning and stop being read.
   */
  it('slightly behind is reported as fact but does NOT go red', () => {
    const f = classifyDeployFreshness({ deployedSha: 'abc1234def', behindBy: 3, deployedAt: hoursAgo(2), now: NOW });
    expect(f.state).toBe('behind');
    expect(f.red).toBeNull();
    expect(f.summary).toContain('3 commits behind main');
    expect(f.summary).toContain('2 hours ago');
  });

  describe('escalates to stale on either threshold alone', () => {
    it('old enough, even with few commits', () => {
      const f = classifyDeployFreshness({
        deployedSha: 'abc1234def',
        behindBy: 1,
        deployedAt: hoursAgo(STALE_AFTER_HOURS),
        now: NOW,
      });
      expect(f.state).toBe('stale');
      expect(f.red).toContain('1 commit behind main');
    });

    it('enough commits, even when recent', () => {
      const f = classifyDeployFreshness({
        deployedSha: 'abc1234def',
        behindBy: STALE_AFTER_COMMITS,
        deployedAt: hoursAgo(1),
        now: NOW,
      });
      expect(f.state).toBe('stale');
      expect(f.red).not.toBeNull();
    });

    it('a red names the consequence, not just the number', () => {
      const f = classifyDeployFreshness({
        deployedSha: 'abc1234def',
        behindBy: 20,
        deployedAt: hoursAgo(40),
        now: NOW,
      });
      expect(f.red).toContain('a merged fix may not be live yet');
    });
  });

  /**
   * The case this module was written for. On 2026-07-30 production was serving a
   * build from 2026-07-29T18:30Z, eleven commits behind main. Three of the four
   * open "production bug" issues were already fixed in that gap.
   *
   * Note it is 18 hours old — under STALE_AFTER_HOURS. Only the commit-count
   * threshold catches it, which is precisely why both thresholds exist.
   */
  it('regression: the 2026-07-30 blind spot would have gone red', () => {
    const f = classifyDeployFreshness({
      deployedSha: '4jb6dcp7a0000000',
      behindBy: 11,
      deployedAt: '2026-07-29T18:30:52Z',
      now: NOW,
    });
    expect(f.state).toBe('stale');
    expect(f.red).toContain('11 commits behind main');
    expect(Math.round(f.ageHours ?? 0)).toBe(18);
    // The hours test alone must not be what catches this.
    expect(f.ageHours).toBeLessThan(STALE_AFTER_HOURS);
  });

  it('singularises so it never reads "1 commits"', () => {
    const f = classifyDeployFreshness({ deployedSha: 'abc1234def', behindBy: 1, deployedAt: hoursAgo(30), now: NOW });
    expect(f.red).toContain('1 commit behind');
    expect(f.red).not.toContain('1 commits');
  });

  it('a missing deploy date still classifies on commit count alone', () => {
    const f = classifyDeployFreshness({ deployedSha: 'abc1234def', behindBy: 12, deployedAt: null, now: NOW });
    expect(f.state).toBe('stale');
    expect(f.ageHours).toBeNull();
    // No date means no age phrase — not "deployed NaN hours ago".
    expect(f.summary).not.toContain('NaN');
    expect(f.summary).not.toContain('ago');
  });
});
