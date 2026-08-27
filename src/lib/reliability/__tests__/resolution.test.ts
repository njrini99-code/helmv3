import { describe, it, expect } from 'vitest';
import {
  DEFAULT_QUIET_HOURS,
  planResolutions,
  shipStatus,
  type ExistingResolution,
  type OpenFault,
} from '../resolution';

const NOW = new Date('2026-08-27T12:00:00.000Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

function fault(over: Partial<OpenFault> = {}): OpenFault {
  return { fingerprint: 'fp1', lastSeenAt: hoursAgo(48), occurrences: 3, ...over };
}

function resolution(over: Partial<ExistingResolution> = {}): ExistingResolution {
  return {
    fingerprint: 'fp1',
    resolvedAt: hoursAgo(36),
    resolutionSource: 'auto',
    lastSeenAtResolution: hoursAgo(48),
    reopenedAt: null,
    ...over,
  };
}

describe('auto-resolve — silence alone is never enough', () => {
  it('archives a fault that went quiet and was followed by a deploy', () => {
    const plan = planResolutions({
      openFaults: [fault({ lastSeenAt: hoursAgo(48) })],
      resolutions: [],
      productionDeployedAt: hoursAgo(30),
      productionSha: 'abc1234',
      now: NOW,
    });
    expect(plan.autoResolve).toHaveLength(1);
    expect(plan.autoResolve[0]!.fingerprint).toBe('fp1');
    expect(plan.autoResolve[0]!.reason).toContain('production deployed');
  });

  it('does NOT archive a fault that is merely quiet with no deploy after it', () => {
    // The core rule. A nightly cron is silent 23 hours a day; a seasonal
    // feature is silent for months. Without a deploy there is no evidence a
    // fix happened, and archiving would hide a live fault.
    const plan = planResolutions({
      openFaults: [fault({ lastSeenAt: hoursAgo(48) })],
      resolutions: [],
      productionDeployedAt: hoursAgo(72), // BEFORE the last occurrence
      productionSha: 'abc1234',
      now: NOW,
    });
    expect(plan.autoResolve).toEqual([]);
  });

  it('does NOT archive a fault seen more recently than the quiet window', () => {
    const plan = planResolutions({
      openFaults: [fault({ lastSeenAt: hoursAgo(2) })],
      resolutions: [],
      productionDeployedAt: hoursAgo(1),
      productionSha: 'abc1234',
      now: NOW,
    });
    expect(plan.autoResolve).toEqual([]);
  });

  it('respects the quiet-window boundary exactly', () => {
    const justInside = planResolutions({
      openFaults: [fault({ lastSeenAt: hoursAgo(DEFAULT_QUIET_HOURS - 1) })],
      resolutions: [], productionDeployedAt: hoursAgo(0.5), productionSha: 'a', now: NOW,
    });
    const justOutside = planResolutions({
      openFaults: [fault({ lastSeenAt: hoursAgo(DEFAULT_QUIET_HOURS + 1) })],
      resolutions: [], productionDeployedAt: hoursAgo(0.5), productionSha: 'a', now: NOW,
    });
    expect(justInside.autoResolve).toEqual([]);
    expect(justOutside.autoResolve).toHaveLength(1);
  });

  it('archives NOTHING when the deploy time is unknown, and SAYS why', () => {
    // Unknown must not read as "no deploy" — that would archive live faults on
    // a false premise. And an empty list with no reason reads as "nothing
    // qualified", which is a different claim.
    const plan = planResolutions({
      openFaults: [fault({ lastSeenAt: hoursAgo(200) })],
      resolutions: [],
      productionDeployedAt: null,
      productionSha: null,
      now: NOW,
    });
    expect(plan.autoResolve).toEqual([]);
    expect(plan.autoResolveBlockedReason).toMatch(/no production deploy timestamp/i);
  });

  it('reports no blocked-reason when deploy data WAS available', () => {
    const plan = planResolutions({
      openFaults: [], resolutions: [], productionDeployedAt: hoursAgo(1),
      productionSha: 'a', now: NOW,
    });
    expect(plan.autoResolveBlockedReason).toBeNull();
  });
});

describe('reopen — an archived fault that comes back is a regression', () => {
  it('reopens when a NEW occurrence post-dates what the resolver knew', () => {
    const plan = planResolutions({
      openFaults: [fault({ lastSeenAt: hoursAgo(2) })],
      resolutions: [resolution({ lastSeenAtResolution: hoursAgo(48), resolvedAt: hoursAgo(36) })],
      productionDeployedAt: hoursAgo(30),
      productionSha: 'abc1234',
      now: NOW,
    });
    expect(plan.reopen).toHaveLength(1);
    expect(plan.reopen[0]!.reason).toContain('recurred');
  });

  it('does NOT reopen for an occurrence the resolver already knew about', () => {
    // The reason the baseline is `lastSeenAtResolution` and not `resolvedAt`:
    // a fault that fired once more between the fix landing and the cron
    // noticing was already accounted for. Comparing against resolvedAt would
    // reopen it and cry wolf on every fix.
    const plan = planResolutions({
      openFaults: [fault({ lastSeenAt: hoursAgo(40) })],
      resolutions: [resolution({ lastSeenAtResolution: hoursAgo(40), resolvedAt: hoursAgo(36) })],
      productionDeployedAt: hoursAgo(30),
      productionSha: 'abc1234',
      now: NOW,
    });
    expect(plan.reopen).toEqual([]);
  });

  it('does not re-reopen a fault already flagged as regressed', () => {
    // Otherwise a fault firing every 3 hours would raise a fresh regression
    // every tick.
    const plan = planResolutions({
      openFaults: [fault({ lastSeenAt: hoursAgo(1) })],
      resolutions: [resolution({ reopenedAt: hoursAgo(5) })],
      productionDeployedAt: hoursAgo(30),
      productionSha: 'abc1234',
      now: NOW,
    });
    expect(plan.reopen).toEqual([]);
  });

  it('reopens a MANUALLY resolved fault too, and names the source', () => {
    // A human asserting "fixed" does not make a recurrence less of a
    // regression — it makes it more interesting.
    const plan = planResolutions({
      openFaults: [fault({ lastSeenAt: hoursAgo(1) })],
      resolutions: [resolution({ resolutionSource: 'manual', lastSeenAtResolution: hoursAgo(48) })],
      productionDeployedAt: hoursAgo(30),
      productionSha: 'abc1234',
      now: NOW,
    });
    expect(plan.reopen).toHaveLength(1);
    expect(plan.reopen[0]!.reason).toContain('manual');
  });

  it('never archives an already-resolved fault a second time', () => {
    const plan = planResolutions({
      openFaults: [fault({ lastSeenAt: hoursAgo(200) })],
      resolutions: [resolution({ lastSeenAtResolution: hoursAgo(200) })],
      productionDeployedAt: hoursAgo(1),
      productionSha: 'abc1234',
      now: NOW,
    });
    expect(plan.autoResolve).toEqual([]);
    expect(plan.reopen).toEqual([]);
  });

  it('reopen wins over archive in the same pass', () => {
    // A fault that recurred and then went quiet again must still surface the
    // regression; archiving it in the same tick would erase the signal.
    const plan = planResolutions({
      openFaults: [fault({ lastSeenAt: hoursAgo(30) })],
      resolutions: [resolution({ lastSeenAtResolution: hoursAgo(72), resolvedAt: hoursAgo(60) })],
      productionDeployedAt: hoursAgo(1),
      productionSha: 'abc1234',
      now: NOW,
    });
    expect(plan.reopen).toHaveLength(1);
    expect(plan.autoResolve).toEqual([]);
  });
});

describe('shipStatus — three outcomes, never two', () => {
  it('is shipped on an exact SHA match', () => {
    expect(shipStatus({
      fixedInSha: 'abc1234def', resolvedAt: hoursAgo(10),
      productionSha: 'abc1234def', productionDeployedAt: hoursAgo(20),
    })).toBe('shipped');
  });

  it('matches an abbreviated SHA against a full one', () => {
    expect(shipStatus({
      fixedInSha: 'abc1234', resolvedAt: hoursAgo(10),
      productionSha: 'abc1234def5678', productionDeployedAt: hoursAgo(20),
    })).toBe('shipped');
  });

  it('falls back to time when the SHAs differ', () => {
    expect(shipStatus({
      fixedInSha: 'aaaaaaa', resolvedAt: hoursAgo(10),
      productionSha: 'bbbbbbb', productionDeployedAt: hoursAgo(2),
    })).toBe('shipped');
  });

  it('is pending when production last deployed BEFORE the fix', () => {
    expect(shipStatus({
      fixedInSha: 'aaaaaaa', resolvedAt: hoursAgo(2),
      productionSha: 'bbbbbbb', productionDeployedAt: hoursAgo(10),
    })).toBe('pending');
  });

  it('is UNKNOWN — not pending — when production state is unreadable', () => {
    // The distinction that matters: telling an operator their fix has not
    // shipped, when the truth is we could not find out, is a false statement
    // about their work.
    expect(shipStatus({
      fixedInSha: 'aaaaaaa', resolvedAt: hoursAgo(2),
      productionSha: null, productionDeployedAt: null,
    })).toBe('unknown');
  });

  it('still answers when there is no fix SHA at all', () => {
    // A fault resolved with no code change (config fix, upstream outage) has
    // no SHA, and that must not force 'unknown'.
    expect(shipStatus({
      fixedInSha: null, resolvedAt: hoursAgo(10),
      productionSha: 'abc', productionDeployedAt: hoursAgo(2),
    })).toBe('shipped');
  });
});
