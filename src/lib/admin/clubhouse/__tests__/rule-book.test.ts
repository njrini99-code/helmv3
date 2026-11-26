/**
 * The counting-rules page (B20) writes rules.ts's inline thresholds in words (RULE_LINES). Each test probes the rule
 * function at that boundary, so the words fail here the day a rule changes.
 */
import { describe, it, expect } from 'vitest';
import { CONTEXT_KINDS, EDGE_CASES, NEVER_ERROR_OUTCOMES, RULE_LINES as L, ruleBook } from '../rule-book';
import { actionDegraded, crashLoop, frustration, newAfterRelease, pageWentQuiet, pipeSilent, retryStorm, silentActionRate, spike } from '../rules';

const now = Date.parse('2026-01-01T15:00:00Z');
const e = (kind: string, outcome?: string) => ({ code: 'x', page: 'P001', release: 'r', kind, outcome });

describe('rule boundaries match rules.ts', () => {
  it('R-01 needs the minimum events', () => {
    const s = (count: number) => spike({ code: 'x', page: 'P', release: 'r', category: 6, count, baseline: [0, 0, 0, 0] });
    expect(s(L.spikeMinEvents - 1)).toBeNull();
    expect(s(L.spikeMinEvents)).not.toBeNull();
  });
  it('R-02 needs the people', () => {
    const n = (users: number) => newAfterRelease({ code: 'x', page: 'P', release: 'r', isFailure: true, seenInEarlierReleases: false, users });
    expect(n(L.newAfterReleasePeople - 1)).toBeNull();
    expect(n(L.newAfterReleasePeople)).not.toBeNull();
  });
  it('R-03 needs the tries and the points', () => {
    expect(actionDegraded({ action: 'a', page: 'P', release: 'r', tries: L.degradedMinTries - 1, successes: 0, baselineRate: 1 })).toBeNull();
    expect(actionDegraded({ action: 'a', page: 'P', release: 'r', tries: 100, successes: 100 - L.degradedPoints + 1, baselineRate: 1 })).toBeNull();
    expect(actionDegraded({ action: 'a', page: 'P', release: 'r', tries: 100, successes: 100 - L.degradedPoints, baselineRate: 1 })).not.toBeNull();
  });
  it('R-05 fires over the percent', () => {
    expect(silentActionRate({ action: 'a', page: 'P', release: 'r', starts: 100, silent: L.silentPct })).toBeNull();
    expect(silentActionRate({ action: 'a', page: 'P', release: 'r', starts: 100, silent: L.silentPct + 1 })).not.toBeNull();
  });
  it('R-06 and R-07 count per session', () => {
    expect(crashLoop({ sessionId: 's', events: Array.from({ length: L.crashLoopCrashes - 1 }, () => e('crash')) })).toBeNull();
    expect(crashLoop({ sessionId: 's', events: Array.from({ length: L.crashLoopCrashes }, () => e('crash')) })).not.toBeNull();
    expect(retryStorm({ sessionId: 's', events: Array.from({ length: L.retryStormRetries - 1 }, () => e('action', 'retry')) })).toBeNull();
    expect(retryStorm({ sessionId: 's', events: Array.from({ length: L.retryStormRetries }, () => e('action', 'retry')) })).not.toBeNull();
  });
  it('R-08 and R-09 wait their time', () => {
    const q = (h: number) => pageWentQuiet({ page: 'P', usualViewsPerHour: 5, lastViewAt: now - h * 3_600_000, now, activeHours: true });
    expect(q(L.quietHours - 0.1)).toBeNull();
    expect(q(L.quietHours)).not.toBeNull();
    const p = (m: number) => pipeSilent({ lastEnvelopeAt: now - m * 60_000, now, activeHours: true, switchedOff: false });
    expect(p(L.pipeSilentMinutes - 1)).toBeNull();
    expect(p(L.pipeSilentMinutes)).not.toBeNull();
  });
  it('R-11 needs more than the people line', () => {
    expect(frustration({ control: 'c', page: 'P', release: 'r', usersToday: L.frustrationPeopleOver })).toBeNull();
    expect(frustration({ control: 'c', page: 'P', release: 'r', usersToday: L.frustrationPeopleOver + 1 })).not.toBeNull();
  });
});

describe('ruleBook', () => {
  it('lists R-01 to R-12 with severities read from the rules', () => {
    const book = ruleBook();
    expect(book.map((r) => r.id)).toEqual(['R-01', 'R-02', 'R-03', 'R-04', 'R-05', 'R-06', 'R-07', 'R-08', 'R-09', 'R-10', 'R-11', 'R-12']);
    const sev = Object.fromEntries(book.map((r) => [r.id, r.severity]));
    expect(sev['R-01']).toBe('high for categories 6, 7, 8, else low');
    expect(sev['R-09']).toBe('critical');
    expect(sev['R-10']).toBe('low');
    expect(sev['R-04']).toBe('medium');
    expect(book.find((r) => r.id === 'R-04')!.when).toContain('5 s');
    expect(book.find((r) => r.id === 'R-12')!.when).toContain('200 ms');
  });
  it('kinds and outcomes come from signal.ts; edge cases carry the ingest limits', () => {
    expect(NEVER_ERROR_OUTCOMES).toEqual(['offline', 'busy', 'stopped-waiting', 'retry', 'cancelled']);
    expect(CONTEXT_KINDS).toEqual(['state', 'toast', 'view', 'vital', 'frustration', 'tap']);
    const text = EDGE_CASES.map((c) => c.decided).join(' ');
    expect(text).toContain('At most 5 become error-log rows');
    expect(text).toContain('More than 24 hours behind or 5 minutes ahead');
    expect(text).toContain('categories 6–8');
  });
});

describe('where each rule shows', () => {
  it('a Pulse link opens Pulse at /admin/pulse, never /admin (which now redirects to Today)', () => {
    const pulse = ruleBook().filter((r) => r.where?.startsWith('Pulse'));
    expect(pulse.length).toBeGreaterThan(0);
    for (const r of pulse) expect(r.href, r.id).toBe('/admin/pulse');
    expect(ruleBook().some((r) => r.href === '/admin')).toBe(false);
  });
});
