/**
 * The counting rules in words (B20 "How errors are counted"; plan
 * docs/superpowers/specs/helm-bridge/2026-11-26-bridge-spaces-build.md). Pure.
 *
 * Numbers come from the constants ingest.ts, rules.ts and signal.ts export. The thresholds rules.ts keeps inline (5
 * events, 3 people, 20 tries…) are written here once, and `__tests__/rule-book.test.ts` probes each rule function at
 * that boundary, so the page's words fail a test the day a rule changes. Each rule's severity is read by firing the
 * rule itself, never typed.
 */
import { CLOCK_FUTURE_MS, CLOCK_PAST_MS, DURATION_EDGES_MS, MAX_ADMIN_ROWS_PER_BATCH } from './ingest';
import {
  HIGH_SPIKE_CATEGORIES,
  INP_LINE_MS,
  LCP_LINE_MS,
  SLOW_SAVE_LINE_MS,
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
  spike,
  vitalRegression,
  type AlertSeverity,
  type RuleId,
} from './rules';
import { SIGNAL_KINDS, SIGNAL_OUTCOMES } from './signal';
import { CATEGORY_NAMES, clubhouseHref } from './screens';

/** The boundaries rules.ts keeps inline. The tests hold every one to its rule function. */
export const RULE_LINES = {
  spikeMinEvents: 5,
  spikeZ: 4,
  spikeWeeks: 4,
  newAfterReleasePeople: 3,
  degradedPoints: 10,
  degradedMinTries: 20,
  silentPct: 2,
  crashLoopCrashes: 3,
  retryStormRetries: 5,
  quietHours: 2,
  pipeSilentMinutes: 15,
  frustrationPeopleOver: 3,
} as const;

const secs = (ms: number) => (ms >= 1000 ? `${ms / 1000} s` : `${ms} ms`);
const hours = (ms: number) => ms / 3_600_000;
const minutes = (ms: number) => ms / 60_000;

/** What counts as an error, what is counted but never an error, and what is context. */
export const ERROR_KINDS = { kind: 'crash', outcome: 'failure' } as const;
export const NEVER_ERROR_OUTCOMES: readonly string[] = SIGNAL_OUTCOMES.filter((o) => o !== 'failure' && o !== 'success' && o !== 'start');
export const CONTEXT_KINDS: readonly string[] = SIGNAL_KINDS.filter((k) => k !== 'crash' && k !== 'action');

/** The hourly key, in the order ingest.ts addHourly joins it, with a plain word and an example for each part. */
export const HOURLY_KEY: ReadonlyArray<{ part: string; says: string }> = [
  { part: 'hour', says: 'the UTC hour' },
  { part: 'code', says: 'CH code, or "unknown"' },
  { part: 'kind', says: 'action, crash, view…' },
  { part: 'outcome', says: 'failure, success…' },
  { part: 'act', says: 'the action or button' },
  { part: 'page', says: 'P007' },
  { part: 'role', says: 'coach, player, signed out' },
  { part: 'platform', says: 'iOS app, Safari, desktop' },
  { part: 'release', says: 'the commit' },
];

export interface EdgeCase {
  case: string;
  decided: string;
}

const highNames = [...HIGH_SPIKE_CATEGORIES].sort((a, b) => a - b);

export const EDGE_CASES: readonly EdgeCase[] = [
  { case: 'A coach retries and it fails again', decided: 'Two errors for one person. The person counts once; the feed shows "2nd today".' },
  { case: 'The app also sent it to the error log', decided: 'Matched by session and sequence and stamped onto that row. One row, not two.' },
  {
    case: 'A batch holds many failures',
    decided: `At most ${MAX_ADMIN_ROWS_PER_BATCH} become error-log rows per batch; every one is still counted in the hourly totals and kept in the session timeline.`,
  },
  {
    case: "The phone's clock is wrong",
    decided: `More than ${hours(CLOCK_PAST_MS)} hours behind or ${minutes(CLOCK_FUTURE_MS)} minutes ahead, and the server's time is used instead.`,
  },
  {
    case: 'A spike on a write vs a read',
    decided: `Spikes in ${highNames.map((c) => CATEGORY_NAMES[c]?.toLowerCase() ?? String(c)).join(', ')} codes (categories ${highNames[0]}–${highNames[highNames.length - 1]}) are high; anything else is low.`,
  },
  { case: 'Someone signed out hits it', decided: 'Counted under signed-out, apart from coaches and players, with no person attached.' },
  { case: 'A code the Bridge map does not know', decided: 'Still counted, under "unknown", and logged as drift (R-10) so the map can catch up.' },
  { case: 'A code is marked expected', decided: 'Still counted and listed. Only the spike (R-01) and new-after-release (R-02) rules skip it.' },
  {
    case: 'The switch is off, or no signal for 15 min',
    decided: 'Nothing on the Bridge may say "all clear"; the pipe shows off or silent instead (R-09).',
  },
  {
    case: 'How long something took',
    decided: `Durations go into ${DURATION_EDGES_MS.length} buckets up to ${secs(DURATION_EDGES_MS[DURATION_EDGES_MS.length - 1]!)}; a p75 or p95 reads the upper edge of its bucket, so it can read a little high.`,
  },
];

export interface RuleRow {
  id: RuleId;
  name: string;
  when: string;
  severity: string;
  /** Where its alerts show, when a view lists them. */
  href: string | null;
  where: string | null;
}

const sev = (a: { severity: AlertSeverity } | null): AlertSeverity => {
  if (!a) throw new Error('rule-book: a probe input did not fire its rule');
  return a.severity;
};

const L = RULE_LINES;
// Pulse moved from /admin when Today became the front door (2026-11-26).
const PULSE = '/admin/pulse';
export const SPEED_HREF = '/admin/spaces/reliability/speed';

/** R-01 to R-12 in words. Severities come from firing each rule. */
export function ruleBook(): RuleRow[] {
  const now = Date.parse('2026-01-01T15:00:00Z');
  const spikeHigh = sev(spike({ code: 'x', page: 'P001', release: 'r', category: highNames[0]!, count: 50, baseline: [0, 0, 0, 0] }));
  const spikeLow = sev(spike({ code: 'x', page: 'P001', release: 'r', category: 1, count: 50, baseline: [0, 0, 0, 0] }));
  const ev = (kind: string, outcome?: string) => ({ code: 'x', page: 'P001', release: 'r', kind, outcome });
  return [
    {
      id: 'R-01',
      name: 'Spike',
      when: `Poisson z over ${L.spikeZ} against the same hour of the last ${L.spikeWeeks} weeks, ${L.spikeMinEvents}+ events`,
      severity: spikeHigh === spikeLow ? spikeHigh : `${spikeHigh} for categories ${highNames.join(', ')}, else ${spikeLow}`,
      href: PULSE,
      where: 'Pulse · rising',
    },
    {
      id: 'R-02',
      name: 'New after release',
      when: `a failure code fires in a release for the first time, for ${L.newAfterReleasePeople} or more people`,
      severity: sev(newAfterRelease({ code: 'x', page: 'P001', release: 'r', isFailure: true, seenInEarlierReleases: false, users: 99 })),
      href: PULSE,
      where: 'Pulse · rising',
    },
    {
      id: 'R-03',
      name: 'Action slipping',
      when: `success ${L.degradedPoints} points under its 7-day usual, over ${L.degradedMinTries}+ tries`,
      severity: sev(actionDegraded({ action: 'a', page: 'P001', release: 'r', tries: 100, successes: 0, baselineRate: 1 })),
      href: PULSE,
      where: 'Pulse · actions',
    },
    {
      id: 'R-04',
      name: 'Slow action',
      when: `p95 twice its usual, or past the slow-save line (${secs(SLOW_SAVE_LINE_MS)})`,
      severity: sev(slowAction({ action: 'a', page: 'P001', release: 'r', p95: SLOW_SAVE_LINE_MS * 2, baselineP95: 0 })),
      href: SPEED_HREF,
      where: 'Speed · save time',
    },
    {
      id: 'R-05',
      name: 'Silent action',
      when: `over ${L.silentPct}% of starts never finish`,
      severity: sev(silentActionRate({ action: 'a', page: 'P001', release: 'r', starts: 100, silent: 50 })),
      href: PULSE,
      where: 'Pulse · actions',
    },
    {
      id: 'R-06',
      name: 'Crash loop',
      when: `one crash code ${L.crashLoopCrashes} times in one session`,
      severity: sev(crashLoop({ sessionId: 's', events: [ev('crash'), ev('crash'), ev('crash'), ev('crash')] })),
      href: PULSE,
      where: 'Pulse',
    },
    {
      id: 'R-07',
      name: 'Retry storm',
      when: `Try again ${L.retryStormRetries} times on one code in a session`,
      severity: sev(retryStorm({ sessionId: 's', events: Array.from({ length: 6 }, () => ev('action', 'retry')) })),
      href: null,
      where: null,
    },
    {
      id: 'R-08',
      name: 'Page went quiet',
      when: `no views for ${L.quietHours} hours in its usual hours`,
      severity: sev(pageWentQuiet({ page: 'P001', usualViewsPerHour: 10, lastViewAt: null, now, activeHours: true })),
      href: PULSE,
      where: 'Pulse',
    },
    {
      id: 'R-09',
      name: 'Pipe silent',
      when: `no signals for ${L.pipeSilentMinutes} minutes in active hours; every all-clear is untrusted`,
      severity: sev(pipeSilent({ lastEnvelopeAt: null, now, activeHours: true, switchedOff: false })),
      href: clubhouseHref.pipe(),
      where: 'Drift · pipe',
    },
    {
      id: 'R-10',
      name: 'Drift',
      when: 'a code, control or action the Bridge map does not know',
      severity: sev(contractDrift({ kind: 'unknown-code', code: 'x', release: 'r', count: 1 })),
      href: clubhouseHref.drift(),
      where: 'Drift',
    },
    {
      id: 'R-11',
      name: 'Frustration',
      when: `rage or dead taps on one button, more than ${L.frustrationPeopleOver} people a day`,
      severity: sev(frustration({ control: 'CTL-P001-001', page: 'P001', release: 'r', usersToday: 99 })),
      href: '/admin/clubhouse/experience?view=frustration',
      where: 'Experience · frustration',
    },
    {
      id: 'R-12',
      name: 'Slow page',
      when: `on iPhone, tap response (INP p75) over ${secs(INP_LINE_MS)} or load (LCP p75) over ${secs(LCP_LINE_MS)}`,
      severity: sev(vitalRegression({ page: 'P001', release: 'r', platform: 'ios-app', inpP75: INP_LINE_MS * 2, lcpP75: null })),
      href: SPEED_HREF,
      where: 'Speed · every page',
    },
  ];
}
