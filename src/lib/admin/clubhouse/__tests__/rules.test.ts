import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  actionDegraded,
  contractDrift,
  crashLoop,
  frustration,
  newAfterRelease,
  pageWentQuiet,
  pipeSilent,
  retryStorm,
  silentActionRate,
  slowAction,
  SLOW_SAVE_LINE_MS,
  spike,
  vitalRegression,
} from '../rules';

const at = { page: 'P007', release: 'abc1234' };
const HOUR = 3_600_000;

describe('R-01 spike', () => {
  const base = { ...at, code: 'CH-7004', category: 6 };
  it('fires on a Poisson z over 4 with at least 5 events, high for categories 06/07/08', () => {
    const a = spike({ ...base, count: 20, baseline: [2, 3, 2, 3] });
    expect(a).toMatchObject({ rule: 'R-01', severity: 'high', code: 'CH-7004', page: 'P007', release: 'abc1234' });
    expect(spike({ ...base, category: 4, count: 20, baseline: [2, 3, 2, 3] })?.severity).toBe('low');
  });
  it('does not fire under 5 events or inside the noise', () => {
    expect(spike({ ...base, count: 4, baseline: [0, 0, 0, 0] })).toBeNull();
    expect(spike({ ...base, count: 12, baseline: [6, 7, 5, 6] })).toBeNull();
  });
  it('a code that was always zero can still spike', () => {
    expect(spike({ ...base, count: 5, baseline: [] })).not.toBeNull();
  });
});

describe('R-02 new after release', () => {
  const base = { ...at, code: 'CH-7004', isFailure: true, seenInEarlierReleases: false };
  it('fires for a failure code first seen in this release, 3+ people', () => {
    expect(newAfterRelease({ ...base, users: 3 })).toMatchObject({ rule: 'R-02', severity: 'high' });
  });
  it('stays quiet for 2 people, an old code, or a success', () => {
    expect(newAfterRelease({ ...base, users: 2 })).toBeNull();
    expect(newAfterRelease({ ...base, users: 9, seenInEarlierReleases: true })).toBeNull();
    expect(newAfterRelease({ ...base, users: 9, isFailure: false })).toBeNull();
  });
});

describe('R-03 action degraded', () => {
  const base = { ...at, action: 'ACT-P007-SEND-MESSAGE', baselineRate: 0.98 };
  it('fires 10 points under the baseline with 20+ tries', () => {
    expect(actionDegraded({ ...base, tries: 20, successes: 17 })).toMatchObject({ rule: 'R-03', severity: 'high', evidence: { rate: 85, baseline: 98 } });
  });
  it('needs 20 tries and a 10-point fall', () => {
    expect(actionDegraded({ ...base, tries: 19, successes: 10 })).toBeNull();
    expect(actionDegraded({ ...base, tries: 100, successes: 89 })).toBeNull();
  });
});

describe('R-04 slow action', () => {
  const base = { ...at, action: 'ACT-P007-SEND-MESSAGE' };
  it('fires at twice the baseline, or over the slow-save line', () => {
    expect(slowAction({ ...base, p95: 1600, baselineP95: 800 })?.severity).toBe('medium');
    expect(slowAction({ ...base, p95: 5200, baselineP95: 4000 })).not.toBeNull();
    expect(slowAction({ ...base, p95: 1500, baselineP95: 800 })).toBeNull();
  });
  it("uses useAction's own slow-save line", () => {
    const src = readFileSync(join(process.cwd(), 'src/clubhouse/lib/use-action.ts'), 'utf8');
    expect(src).toMatch(new RegExp(`CH_SLOW_SAVE_AFTER = ${SLOW_SAVE_LINE_MS};`));
  });
});

describe('R-05 silent action', () => {
  const base = { ...at, action: 'ACT-P007-SEND-MESSAGE' };
  it('fires over 2% silent starts', () => {
    expect(silentActionRate({ ...base, starts: 100, silent: 3 })).toMatchObject({ rule: 'R-05', severity: 'high' });
    expect(silentActionRate({ ...base, starts: 100, silent: 2 })).toBeNull();
    expect(silentActionRate({ ...base, starts: 0, silent: 0 })).toBeNull();
  });
});

describe('R-06 crash loop and R-07 retry storm', () => {
  const ev = (over: object) => ({ code: 'CH-13204', kind: 'crash', ...at, ...over });
  it('fires on the third crash of one code in a session', () => {
    expect(crashLoop({ sessionId: 's', events: [ev({}), ev({}), ev({ code: 'CH-1' }), ev({})] })).toMatchObject({ rule: 'R-06', code: 'CH-13204', evidence: { crashes: 3 } });
    expect(crashLoop({ sessionId: 's', events: [ev({}), ev({}), ev({ kind: 'toast' })] })).toBeNull();
  });
  it('fires on the fifth Try again on one code in a session', () => {
    const retry = (code = 'CH-7004') => ({ code, kind: 'toast', outcome: 'retry', ...at });
    expect(retryStorm({ sessionId: 's', events: [retry(), retry(), retry(), retry(), retry()] })).toMatchObject({ rule: 'R-07', severity: 'medium' });
    expect(retryStorm({ sessionId: 's', events: [retry(), retry(), retry(), retry(), retry('CH-7005')] })).toBeNull();
  });
});

describe('R-08 page went quiet and R-09 pipe silent', () => {
  const now = 1_763_000_000_000;
  it('a page with usual traffic, quiet 2 hours in active hours, fires', () => {
    expect(pageWentQuiet({ page: 'P007', usualViewsPerHour: 12, lastViewAt: now - 2 * HOUR, now, activeHours: true })).toMatchObject({ rule: 'R-08', severity: 'high' });
    expect(pageWentQuiet({ page: 'P007', usualViewsPerHour: 12, lastViewAt: now - 2 * HOUR, now, activeHours: false })).toBeNull();
    expect(pageWentQuiet({ page: 'P007', usualViewsPerHour: 0.2, lastViewAt: null, now, activeHours: true })).toBeNull();
    expect(pageWentQuiet({ page: 'P007', usualViewsPerHour: 12, lastViewAt: now - HOUR, now, activeHours: true })).toBeNull();
  });
  it('the pipe silent 15 minutes in active hours is critical, unless it was switched off', () => {
    expect(pipeSilent({ lastEnvelopeAt: now - 15 * 60_000, now, activeHours: true, switchedOff: false })).toMatchObject({ rule: 'R-09', severity: 'critical' });
    expect(pipeSilent({ lastEnvelopeAt: now - 15 * 60_000, now, activeHours: true, switchedOff: true })).toBeNull();
    expect(pipeSilent({ lastEnvelopeAt: now - 14 * 60_000, now, activeHours: true, switchedOff: false })).toBeNull();
  });
});

describe('R-10 drift, R-11 frustration, R-12 vitals', () => {
  it('any drift row is a low alert', () => {
    expect(contractDrift({ kind: 'wrong-page', code: 'CH-7004', release: 'abc1234', count: 1 })).toMatchObject({ rule: 'R-10', severity: 'low', title: 'CH-7004: wrong page (1)' });
  });
  it('frustration fires above 3 people a day', () => {
    expect(frustration({ ...at, control: 'CTL-P007-014', usersToday: 4 })).toMatchObject({ rule: 'R-11', control: 'CTL-P007-014' });
    expect(frustration({ ...at, control: 'CTL-P007-014', usersToday: 3 })).toBeNull();
  });
  it('vitals regress on iOS only, past INP 200 ms or LCP 2.5 s', () => {
    expect(vitalRegression({ ...at, platform: 'ios-app', inpP75: 240, lcpP75: 1800 })?.title).toBe('P007 on iOS: INP p75 240 ms');
    expect(vitalRegression({ ...at, platform: 'ios-safari', inpP75: null, lcpP75: 3100 })?.title).toBe('P007 on iOS: LCP p75 3.1 s');
    expect(vitalRegression({ ...at, platform: 'desktop', inpP75: 900, lcpP75: 9000 })).toBeNull();
    expect(vitalRegression({ ...at, platform: 'ios-app', inpP75: 200, lcpP75: 2500 })).toBeNull();
  });
});
