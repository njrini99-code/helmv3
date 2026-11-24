/**
 * The Bridge's detection rules, R-01 to R-12 (plan §5). Each is a pure function over numbers the hourly counters,
 * the session store and the drift table already hold; each returns one alert or null. An alert always names what
 * it is about (the code, page, release, action or control), so it opens a dossier, and carries the numbers that made
 * it fire.
 *
 * They feed Pulse, the digest and the rail badges. Nothing here reads the database or the clock.
 */

export type RuleId = 'R-01' | 'R-02' | 'R-03' | 'R-04' | 'R-05' | 'R-06' | 'R-07' | 'R-08' | 'R-09' | 'R-10' | 'R-11' | 'R-12';
export type AlertSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface BridgeAlert {
  rule: RuleId;
  severity: AlertSeverity;
  title: string;
  code?: string;
  page?: string;
  release?: string;
  action?: string;
  control?: string;
  /** The numbers behind the alert, as the dossier shows them. */
  evidence: Record<string, number | string>;
}

const pct = (x: number) => Math.round(x * 1000) / 10;

/** Categories whose spikes are high: 06 server/system error, 07 network/offline, 08 permission. */
export const HIGH_SPIKE_CATEGORIES = new Set([6, 7, 8]);
/** The baseline never counts as below a quarter event an hour, so a code that was always zero can still spike. */
export const SPIKE_BASELINE_FLOOR = 0.25;

/** R-01 Spike: this hour beats the same hour of the week over the previous 4 weeks by a Poisson z-score over 4, with at least 5 events. */
export function spike(i: { code: string; page: string; release: string; category: number; count: number; baseline: number[] }): BridgeAlert | null {
  if (i.count < 5) return null;
  const mean = i.baseline.length ? i.baseline.reduce((a, b) => a + b, 0) / i.baseline.length : 0;
  const lambda = Math.max(mean, SPIKE_BASELINE_FLOOR);
  const z = (i.count - lambda) / Math.sqrt(lambda);
  if (z <= 4) return null;
  return {
    rule: 'R-01',
    severity: HIGH_SPIKE_CATEGORIES.has(i.category) ? 'high' : 'low',
    title: `${i.code} spiked: ${i.count} this hour against about ${Math.round(mean * 10) / 10} usual`,
    code: i.code,
    page: i.page,
    release: i.release,
    evidence: { count: i.count, baseline: Math.round(mean * 100) / 100, z: Math.round(z * 10) / 10 },
  };
}

/** R-02 New after release: a failure code fires in a release for the first time, for at least 3 people. */
export function newAfterRelease(i: { code: string; page: string; release: string; isFailure: boolean; seenInEarlierReleases: boolean; users: number }): BridgeAlert | null {
  if (!i.isFailure || i.seenInEarlierReleases || i.users < 3) return null;
  return {
    rule: 'R-02',
    severity: 'high',
    title: `${i.code} is new in ${i.release}: ${i.users} people hit it`,
    code: i.code,
    page: i.page,
    release: i.release,
    evidence: { users: i.users },
  };
}

/** R-03 Action degraded: success falls 10 points under its 7-day baseline, over at least 20 tries. */
export function actionDegraded(i: { action: string; page: string; release: string; tries: number; successes: number; baselineRate: number }): BridgeAlert | null {
  if (i.tries < 20) return null;
  const rate = i.successes / i.tries;
  if (pct(i.baselineRate) - pct(rate) < 10) return null;
  return {
    rule: 'R-03',
    severity: 'high',
    title: `${i.action} succeeds ${pct(rate)}% of the time, down from ${pct(i.baselineRate)}%`,
    action: i.action,
    page: i.page,
    release: i.release,
    evidence: { tries: i.tries, successes: i.successes, rate: pct(rate), baseline: pct(i.baselineRate) },
  };
}

/** The slow-save line: useAction shows "Still saving…" after this long (CH_SLOW_SAVE_AFTER in src/clubhouse/lib/use-action.ts). */
export const SLOW_SAVE_LINE_MS = 5000;

/** R-04 Slow action: p95 is twice its baseline, or over the slow-save line. */
export function slowAction(i: { action: string; page: string; release: string; p95: number; baselineP95: number; slowLineMs?: number }): BridgeAlert | null {
  const line = i.slowLineMs ?? SLOW_SAVE_LINE_MS;
  const doubled = i.baselineP95 > 0 && i.p95 >= 2 * i.baselineP95;
  if (!doubled && i.p95 <= line) return null;
  return {
    rule: 'R-04',
    severity: 'medium',
    title: `${i.action} is slow: p95 ${Math.round(i.p95)} ms`,
    action: i.action,
    page: i.page,
    release: i.release,
    evidence: { p95: Math.round(i.p95), baselineP95: Math.round(i.baselineP95), slowLine: line },
  };
}

/** R-05 Silent action: more than 2% of starts never got an outcome. */
export function silentActionRate(i: { action: string; page: string; release: string; starts: number; silent: number }): BridgeAlert | null {
  if (i.starts === 0 || i.silent / i.starts <= 0.02) return null;
  return {
    rule: 'R-05',
    severity: 'high',
    title: `${i.action}: ${i.silent} of ${i.starts} starts never finished`,
    action: i.action,
    page: i.page,
    release: i.release,
    evidence: { starts: i.starts, silent: i.silent, rate: pct(i.silent / i.starts) },
  };
}

interface SessionEvent {
  code: string;
  page: string;
  release: string;
  kind: string;
  outcome?: string;
}

function mostRepeated(events: SessionEvent[], keep: (e: SessionEvent) => boolean): { event: SessionEvent; count: number } | null {
  const counts = new Map<string, { event: SessionEvent; count: number }>();
  for (const e of events) {
    if (!keep(e)) continue;
    const c = counts.get(e.code);
    if (c) c.count += 1;
    else counts.set(e.code, { event: e, count: 1 });
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.event.code.localeCompare(b.event.code))[0] ?? null;
}

/** R-06 Crash loop: the same crash code three times in one session. */
export function crashLoop(i: { sessionId: string; events: SessionEvent[] }): BridgeAlert | null {
  const top = mostRepeated(i.events, (e) => e.kind === 'crash');
  if (!top || top.count < 3) return null;
  return {
    rule: 'R-06',
    severity: 'high',
    title: `${top.event.code} crashed ${top.count} times in one session`,
    code: top.event.code,
    page: top.event.page,
    release: top.event.release,
    evidence: { sessionId: i.sessionId, crashes: top.count },
  };
}

/** R-07 Retry storm: one session presses Try again five times on one code. */
export function retryStorm(i: { sessionId: string; events: SessionEvent[] }): BridgeAlert | null {
  const top = mostRepeated(i.events, (e) => e.outcome === 'retry');
  if (!top || top.count < 5) return null;
  return {
    rule: 'R-07',
    severity: 'medium',
    title: `Try again pressed ${top.count} times on ${top.event.code} in one session`,
    code: top.event.code,
    page: top.event.page,
    release: top.event.release,
    evidence: { sessionId: i.sessionId, retries: top.count },
  };
}

const HOUR = 3_600_000;

/** R-08 Page went quiet: a page with usual traffic sends no views for 2 hours inside its usual active hours. */
export function pageWentQuiet(i: { page: string; usualViewsPerHour: number; lastViewAt: number | null; now: number; activeHours: boolean }): BridgeAlert | null {
  if (!i.activeHours || i.usualViewsPerHour < 1) return null;
  const quietFor = i.lastViewAt === null ? Infinity : i.now - i.lastViewAt;
  if (quietFor < 2 * HOUR) return null;
  return {
    rule: 'R-08',
    severity: 'high',
    title: `${i.page} sent no views for ${Number.isFinite(quietFor) ? `${Math.floor(quietFor / HOUR)} hours` : 'as long as the store goes back'}; its instrument may be broken`,
    page: i.page,
    evidence: { usualViewsPerHour: i.usualViewsPerHour, quietMinutes: Number.isFinite(quietFor) ? Math.floor(quietFor / 60_000) : 'never' },
  };
}

/** R-09 Pipe silent: no envelopes at all for 15 minutes in active hours. While it holds, every "all clear" is untrusted. */
export function pipeSilent(i: { lastEnvelopeAt: number | null; now: number; activeHours: boolean; switchedOff: boolean }): BridgeAlert | null {
  // A pipe switched off by the kill switch is reported as off (B11), not as silent.
  if (!i.activeHours || i.switchedOff) return null;
  const quietFor = i.lastEnvelopeAt === null ? Infinity : i.now - i.lastEnvelopeAt;
  if (quietFor < 15 * 60_000) return null;
  return {
    rule: 'R-09',
    severity: 'critical',
    title: 'No signals have arrived for 15 minutes; every all-clear is untrusted until they do',
    evidence: { quietMinutes: Number.isFinite(quietFor) ? Math.floor(quietFor / 60_000) : 'never' },
  };
}

/** R-10 Contract drift: any drift row (plan §4.3). Low, and on B11 only. */
export function contractDrift(i: { kind: string; code: string; release: string; count: number }): BridgeAlert | null {
  if (i.count < 1) return null;
  return {
    rule: 'R-10',
    severity: 'low',
    title: `${i.code}: ${i.kind.replace(/-/g, ' ')} (${i.count})`,
    code: i.code,
    release: i.release,
    evidence: { kind: i.kind, count: i.count },
  };
}

/** R-11 Frustration: rage or dead clicks on one control from more than 3 people in a day. */
export function frustration(i: { control: string; page: string; release: string; usersToday: number }): BridgeAlert | null {
  if (i.usersToday <= 3) return null;
  return {
    rule: 'R-11',
    severity: 'medium',
    title: `${i.usersToday} people rage- or dead-clicked ${i.control} today`,
    control: i.control,
    page: i.page,
    release: i.release,
    evidence: { usersToday: i.usersToday },
  };
}

/** Web Vitals "good" lines: INP 200 ms, LCP 2.5 s. */
export const INP_LINE_MS = 200;
export const LCP_LINE_MS = 2500;

/** R-12 Vital regression: on iOS, a page's INP p75 rises past 200 ms or its LCP p75 past 2.5 s. */
export function vitalRegression(i: { page: string; release: string; platform: string; inpP75: number | null; lcpP75: number | null }): BridgeAlert | null {
  if (i.platform !== 'ios-app' && i.platform !== 'ios-safari') return null;
  const parts: string[] = [];
  if (i.inpP75 !== null && i.inpP75 > INP_LINE_MS) parts.push(`INP p75 ${Math.round(i.inpP75)} ms`);
  if (i.lcpP75 !== null && i.lcpP75 > LCP_LINE_MS) parts.push(`LCP p75 ${(i.lcpP75 / 1000).toFixed(1)} s`);
  if (!parts.length) return null;
  return {
    rule: 'R-12',
    severity: 'medium',
    title: `${i.page} on iOS: ${parts.join(', ')}`,
    page: i.page,
    release: i.release,
    evidence: { platform: i.platform, inpP75: i.inpP75 ?? 'none', lcpP75: i.lcpP75 ?? 'none' },
  };
}
