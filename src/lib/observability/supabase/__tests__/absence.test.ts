import { describe, it, expect } from 'vitest';
import {
  activityFromActiveUsers,
  activityFromSeasonWindows,
  activityFromCollectorEnablement,
  detectHealthSamplesCeased,
  detectZeroSubmitAttempts,
  detectZeroSubscriptions,
  detectCronJobAbsent,
  detectDbSpansVanished,
  absenceFindingsToSignals,
  type ActivityContext,
} from '../absence';

const NOW = new Date('2026-09-03T12:00:00.000Z');
const FIVE_MIN_MS = 5 * 60_000;

const ACTIVE: ActivityContext = { kind: 'active', evidence: '31 active users in the last 15 minutes' };
const QUIET: ActivityContext = { kind: 'quiet', evidence: 'no active users in the last 15 minutes' };
const UNKNOWN: ActivityContext = { kind: 'unknown', evidence: 'active-user source unreadable' };

// ---------------------------------------------------------------------------
// Context builders — the input that stops every detector guessing
// ---------------------------------------------------------------------------

describe('activityFromActiveUsers', () => {
  it('is active when users were measured and there were some', () => {
    expect(activityFromActiveUsers({ activeUsers: 12, measured: true }).kind).toBe('active');
  });

  it('is quiet when users were measured and there were none', () => {
    expect(activityFromActiveUsers({ activeUsers: 0, measured: true }).kind).toBe('quiet');
  });

  it('is unknown when the active-user count could not be measured — never quiet, never active', () => {
    const ctx = activityFromActiveUsers({ activeUsers: null, measured: false });
    expect(ctx.kind).toBe('unknown');
  });

  it('is unknown when measured is true but the count is null (a contradictory read)', () => {
    expect(activityFromActiveUsers({ activeUsers: null, measured: true }).kind).toBe('unknown');
  });
});

describe('activityFromSeasonWindows', () => {
  const inSeason = [{ label: 'fall', startsAt: '2026-08-15T00:00:00.000Z', endsAt: '2026-11-30T00:00:00.000Z' }];

  it('is active inside a supplied season window', () => {
    expect(activityFromSeasonWindows({ now: NOW, windows: inSeason }).kind).toBe('active');
  });

  it('is quiet outside every supplied season window', () => {
    const offSeason = [{ label: 'spring', startsAt: '2027-02-01T00:00:00.000Z', endsAt: '2027-05-31T00:00:00.000Z' }];
    expect(activityFromSeasonWindows({ now: NOW, windows: offSeason }).kind).toBe('quiet');
  });

  it('is unknown when no season calendar was supplied — the module hardcodes no sport calendar', () => {
    expect(activityFromSeasonWindows({ now: NOW, windows: [] }).kind).toBe('unknown');
  });

  it('is unknown when a window is malformed rather than silently treating it as out of season', () => {
    const bad = [{ label: 'broken', startsAt: 'not-a-date', endsAt: '2026-11-30T00:00:00.000Z' }];
    expect(activityFromSeasonWindows({ now: NOW, windows: bad }).kind).toBe('unknown');
  });
});

describe('activityFromCollectorEnablement', () => {
  it('is active when the collector is deployed and enabled', () => {
    expect(activityFromCollectorEnablement({ enabled: true }).kind).toBe('active');
  });

  it('is quiet when the collector is deliberately disabled — a disabled collector is not an outage', () => {
    expect(activityFromCollectorEnablement({ enabled: false }).kind).toBe('quiet');
  });

  it('is unknown when enablement could not be determined', () => {
    expect(activityFromCollectorEnablement({ enabled: null }).kind).toBe('unknown');
  });
});

// ---------------------------------------------------------------------------
// 1. Health samples ceased
// ---------------------------------------------------------------------------

describe('detectHealthSamplesCeased', () => {
  const base = { expectedIntervalMs: FIVE_MIN_MS, now: NOW, readable: true };

  it('is present when a sample arrived within the expected interval', () => {
    const f = detectHealthSamplesCeased({
      ...base,
      lastSampleAt: new Date(NOW.getTime() - FIVE_MIN_MS).toISOString(),
      context: ACTIVE,
    });
    expect(f.verdict).toBe('present');
  });

  it('is absent when samples stopped well past the interval and the collector is enabled', () => {
    const f = detectHealthSamplesCeased({
      ...base,
      lastSampleAt: new Date(NOW.getTime() - FIVE_MIN_MS * 10).toISOString(),
      context: ACTIVE,
    });
    expect(f.verdict).toBe('absent');
    expect(f.detector).toBe('health_samples_ceased');
  });

  it('is expected_silence — not absent — when the collector is deliberately disabled', () => {
    const f = detectHealthSamplesCeased({
      ...base,
      lastSampleAt: new Date(NOW.getTime() - FIVE_MIN_MS * 10).toISOString(),
      context: QUIET,
    });
    expect(f.verdict).toBe('expected_silence');
  });

  it('is unknown when the activity context itself is unknown', () => {
    const f = detectHealthSamplesCeased({
      ...base,
      lastSampleAt: new Date(NOW.getTime() - FIVE_MIN_MS * 10).toISOString(),
      context: UNKNOWN,
    });
    expect(f.verdict).toBe('unknown');
    expect(f.verdict).not.toBe('absent');
  });

  it('is unknown — never absent — when the source could not be read at all', () => {
    const f = detectHealthSamplesCeased({ ...base, readable: false, lastSampleAt: null, context: ACTIVE });
    expect(f.verdict).toBe('unknown');
  });

  it('is unknown when the source has never sampled: a signal that never started did not stop', () => {
    const f = detectHealthSamplesCeased({ ...base, lastSampleAt: null, context: ACTIVE });
    expect(f.verdict).toBe('unknown');
  });

  it('does not fire on a single late sample — one missed tick is jitter, not absence', () => {
    const f = detectHealthSamplesCeased({
      ...base,
      lastSampleAt: new Date(NOW.getTime() - FIVE_MIN_MS * 2).toISOString(),
      context: ACTIVE,
    });
    expect(f.verdict).toBe('present');
  });

  it('is unknown when the last sample is in the future (a clock problem, not an outage)', () => {
    const f = detectHealthSamplesCeased({
      ...base,
      lastSampleAt: new Date(NOW.getTime() + FIVE_MIN_MS).toISOString(),
      context: ACTIVE,
    });
    expect(f.verdict).toBe('unknown');
  });
});

// ---------------------------------------------------------------------------
// 2. Zero submit attempts in season
// ---------------------------------------------------------------------------

describe('detectZeroSubmitAttempts', () => {
  it('is present when attempts were observed', () => {
    const f = detectZeroSubmitAttempts({ attemptCount: 4, windowMinutes: 60, context: ACTIVE });
    expect(f.verdict).toBe('present');
  });

  it('is absent when zero attempts occurred over a long window while the product is in season and used', () => {
    const f = detectZeroSubmitAttempts({ attemptCount: 0, windowMinutes: 240, context: ACTIVE });
    expect(f.verdict).toBe('absent');
  });

  it('is expected_silence out of season — an off-season zero is not an outage', () => {
    const f = detectZeroSubmitAttempts({ attemptCount: 0, windowMinutes: 240, context: QUIET });
    expect(f.verdict).toBe('expected_silence');
  });

  it('is unknown when the season/active-user context is unavailable', () => {
    const f = detectZeroSubmitAttempts({ attemptCount: 0, windowMinutes: 240, context: UNKNOWN });
    expect(f.verdict).toBe('unknown');
  });

  it('is unknown when the observation window is too short to mean anything', () => {
    // Zero round submits in five minutes is normal at 3am and normal at noon.
    const f = detectZeroSubmitAttempts({ attemptCount: 0, windowMinutes: 5, context: ACTIVE });
    expect(f.verdict).toBe('unknown');
  });

  it('is unknown when the attempt count itself could not be read', () => {
    const f = detectZeroSubmitAttempts({ attemptCount: null, windowMinutes: 240, context: ACTIVE });
    expect(f.verdict).toBe('unknown');
  });
});

// ---------------------------------------------------------------------------
// 3. Subscriptions at zero
// ---------------------------------------------------------------------------

describe('detectZeroSubscriptions', () => {
  it('is present when channels are subscribed', () => {
    expect(detectZeroSubscriptions({ subscriptionCount: 7, context: ACTIVE }).verdict).toBe('present');
  });

  it('is absent when nobody is subscribed while users are active', () => {
    expect(detectZeroSubscriptions({ subscriptionCount: 0, context: ACTIVE }).verdict).toBe('absent');
  });

  it('is expected_silence when zero subscriptions coincides with zero active users', () => {
    expect(detectZeroSubscriptions({ subscriptionCount: 0, context: QUIET }).verdict).toBe('expected_silence');
  });

  it('is unknown when active-user context is unavailable', () => {
    expect(detectZeroSubscriptions({ subscriptionCount: 0, context: UNKNOWN }).verdict).toBe('unknown');
  });

  it('is unknown when the subscription count could not be read', () => {
    expect(detectZeroSubscriptions({ subscriptionCount: null, context: ACTIVE }).verdict).toBe('unknown');
  });
});

// ---------------------------------------------------------------------------
// 4. Cron job absent
// ---------------------------------------------------------------------------

describe('detectCronJobAbsent', () => {
  it('is present when the expected job is registered', () => {
    const f = detectCronJobAbsent({
      expectedJobName: 'db-health-sampler',
      registeredJobNames: ['db-health-sampler', 'prune'],
      catalogReadable: true,
      context: ACTIVE,
    });
    expect(f.verdict).toBe('present');
  });

  it('is absent when the job is missing from a readable catalog and is meant to be enabled', () => {
    const f = detectCronJobAbsent({
      expectedJobName: 'db-health-sampler',
      registeredJobNames: ['prune'],
      catalogReadable: true,
      context: ACTIVE,
    });
    expect(f.verdict).toBe('absent');
  });

  it('is unknown when the job catalog could not be read — an unreadable catalog is not an empty one', () => {
    const f = detectCronJobAbsent({
      expectedJobName: 'db-health-sampler',
      registeredJobNames: [],
      catalogReadable: false,
      context: ACTIVE,
    });
    expect(f.verdict).toBe('unknown');
  });

  it('is expected_silence when the job is deliberately not enabled (a HELD migration, say)', () => {
    const f = detectCronJobAbsent({
      expectedJobName: 'db-health-sampler',
      registeredJobNames: [],
      catalogReadable: true,
      context: QUIET,
    });
    expect(f.verdict).toBe('expected_silence');
  });

  it('is unknown when enablement is undetermined', () => {
    const f = detectCronJobAbsent({
      expectedJobName: 'db-health-sampler',
      registeredJobNames: [],
      catalogReadable: true,
      context: UNKNOWN,
    });
    expect(f.verdict).toBe('unknown');
  });
});

// ---------------------------------------------------------------------------
// 5. DB spans vanished after a release
// ---------------------------------------------------------------------------

describe('detectDbSpansVanished', () => {
  it('is present when spans continue after the release', () => {
    const f = detectDbSpansVanished({ spansBefore: 940, spansAfter: 880, windowMinutes: 120, context: ACTIVE });
    expect(f.verdict).toBe('present');
  });

  it('is absent when a healthy pre-release span rate drops to zero with traffic still flowing', () => {
    const f = detectDbSpansVanished({ spansBefore: 940, spansAfter: 0, windowMinutes: 120, context: ACTIVE });
    expect(f.verdict).toBe('absent');
  });

  it('is unknown when there was no pre-release baseline — zero after zero proves nothing', () => {
    const f = detectDbSpansVanished({ spansBefore: 0, spansAfter: 0, windowMinutes: 120, context: ACTIVE });
    expect(f.verdict).toBe('unknown');
  });

  it('is expected_silence when the post-release window is genuinely quiet', () => {
    const f = detectDbSpansVanished({ spansBefore: 940, spansAfter: 0, windowMinutes: 120, context: QUIET });
    expect(f.verdict).toBe('expected_silence');
  });

  it('is unknown when the activity context is unavailable', () => {
    const f = detectDbSpansVanished({ spansBefore: 940, spansAfter: 0, windowMinutes: 120, context: UNKNOWN });
    expect(f.verdict).toBe('unknown');
  });

  it('is unknown when the post-release window is too short to conclude anything', () => {
    const f = detectDbSpansVanished({ spansBefore: 940, spansAfter: 0, windowMinutes: 3, context: ACTIVE });
    expect(f.verdict).toBe('unknown');
  });

  it('is unknown when either count could not be read', () => {
    expect(detectDbSpansVanished({ spansBefore: null, spansAfter: 0, windowMinutes: 120, context: ACTIVE }).verdict).toBe(
      'unknown',
    );
    expect(detectDbSpansVanished({ spansBefore: 940, spansAfter: null, windowMinutes: 120, context: ACTIVE }).verdict).toBe(
      'unknown',
    );
  });
});

// ---------------------------------------------------------------------------
// Composition into the state model
// ---------------------------------------------------------------------------

describe('absenceFindingsToSignals', () => {
  it('maps absent -> critical, unknown -> unknown, expected_silence and present -> ok', () => {
    const signals = absenceFindingsToSignals([
      { detector: 'a', verdict: 'absent', reason: 'r1' },
      { detector: 'b', verdict: 'unknown', reason: 'r2' },
      { detector: 'c', verdict: 'expected_silence', reason: 'r3' },
      { detector: 'd', verdict: 'present', reason: 'r4' },
    ]);

    expect(signals.map((s) => s.level)).toEqual(['critical', 'unknown', 'ok', 'ok']);
    expect(signals.map((s) => s.id)).toEqual(['absence.a', 'absence.b', 'absence.c', 'absence.d']);
  });

  it('never turns an unknown verdict into an ok signal', () => {
    const signals = absenceFindingsToSignals([{ detector: 'x', verdict: 'unknown', reason: 'no context' }]);
    expect(signals[0]?.level).not.toBe('ok');
  });
});

describe('purity', () => {
  it('detectors do not mutate their inputs', () => {
    const input = { attemptCount: 0, windowMinutes: 240, context: ACTIVE };
    const snapshot = JSON.stringify(input);
    detectZeroSubmitAttempts(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});
