import { describe, it, expect } from 'vitest';
import {
  planReopens,
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

describe('planReopens — an archived fault that comes back is a regression', () => {
  it('reopens when a NEW occurrence post-dates what the resolver knew', () => {
    const reopen = planReopens({
      openFaults: [fault({ lastSeenAt: hoursAgo(2) })],
      resolutions: [resolution({ lastSeenAtResolution: hoursAgo(48), resolvedAt: hoursAgo(36) })],
    });
    expect(reopen).toHaveLength(1);
    expect(reopen[0]!.fingerprint).toBe('fp1');
    expect(reopen[0]!.reason).toContain('recurred');
  });

  it('does NOT reopen for an occurrence the resolver already knew about', () => {
    // The reason the baseline is `lastSeenAtResolution` and not `resolvedAt`:
    // a fault that fired once more between the fix landing and the cron
    // noticing was already accounted for. Comparing against resolvedAt would
    // reopen it and cry wolf on every fix.
    const reopen = planReopens({
      openFaults: [fault({ lastSeenAt: hoursAgo(40) })],
      resolutions: [resolution({ lastSeenAtResolution: hoursAgo(40), resolvedAt: hoursAgo(36) })],
    });
    expect(reopen).toEqual([]);
  });

  it('does not re-reopen a fault already flagged as regressed', () => {
    // Otherwise a fault firing every 3 hours would raise a fresh regression
    // every tick.
    const reopen = planReopens({
      openFaults: [fault({ lastSeenAt: hoursAgo(1) })],
      resolutions: [resolution({ reopenedAt: hoursAgo(5) })],
    });
    expect(reopen).toEqual([]);
  });

  it('reopens a MANUALLY resolved fault too, and names the source', () => {
    // A human asserting "fixed" does not make a recurrence less of a
    // regression — it makes it more interesting.
    const reopen = planReopens({
      openFaults: [fault({ lastSeenAt: hoursAgo(1) })],
      resolutions: [resolution({ resolutionSource: 'manual', lastSeenAtResolution: hoursAgo(48) })],
    });
    expect(reopen).toHaveLength(1);
    expect(reopen[0]!.reason).toContain('manual');
  });

  it('ignores a fault that was never claimed fixed', () => {
    // Nothing to regress FROM. Whether this fault should now be archived is
    // autoResolveFixedIncidents' decision, not this module's — see the module
    // doc for the operator-gated exclusion that makes that separation matter.
    const reopen = planReopens({
      openFaults: [fault({ fingerprint: 'never-resolved', lastSeenAt: hoursAgo(1) })],
      resolutions: [],
    });
    expect(reopen).toEqual([]);
  });

  it('falls back to resolvedAt when the resolution predates last_seen_at_resolution', () => {
    // Rows written before that column existed carry null. They must still be
    // able to regress, just against the weaker baseline.
    const reopen = planReopens({
      openFaults: [fault({ lastSeenAt: hoursAgo(1) })],
      resolutions: [resolution({ lastSeenAtResolution: null, resolvedAt: hoursAgo(10) })],
    });
    expect(reopen).toHaveLength(1);
  });

  it('matches each fault to its OWN resolution, not merely to any', () => {
    const reopen = planReopens({
      openFaults: [
        fault({ fingerprint: 'fp-quiet', lastSeenAt: hoursAgo(80) }),
        fault({ fingerprint: 'fp-back', lastSeenAt: hoursAgo(1) }),
      ],
      resolutions: [
        resolution({ fingerprint: 'fp-quiet', lastSeenAtResolution: hoursAgo(80) }),
        resolution({ fingerprint: 'fp-back', lastSeenAtResolution: hoursAgo(90) }),
      ],
    });
    expect(reopen).toHaveLength(1);
    expect(reopen[0]!.fingerprint).toBe('fp-back');
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
    // no SHA, and that must not force 'unknown'. Rule B resolutions record
    // exactly this shape: quiet for 14 days, no deploy evidence claimed.
    expect(shipStatus({
      fixedInSha: null, resolvedAt: hoursAgo(10),
      productionSha: 'abc', productionDeployedAt: hoursAgo(2),
    })).toBe('shipped');
  });
});
