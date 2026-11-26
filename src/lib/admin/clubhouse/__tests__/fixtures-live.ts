/**
 * A seeded live store for the live lenses' tests (plan §12, PR 3: "seeded-fixture tests per rule and per screen").
 * Two days: a bad one that fires every rule, and a quiet one that fires none. Times are fixed; nothing reads the clock.
 */
import { DURATION_EDGES_MS } from '../ingest';
import type { DriftRow, HourlyRow, SessionEventRow, SessionRow } from '../live-model';

export const NOW = Date.parse('2026-11-25T15:30:00.000Z');
export const HOUR = 3_600_000;
const hourIso = (offsetHours: number) => new Date(Math.floor(NOW / HOUR) * HOUR - offsetHours * HOUR).toISOString();

export const LIVE_RELEASE = 'b2c3d4e5f6a7';
export const BASE_RELEASE = 'a1b2c3d4e5f6';

/** Users, pseudonymous. */
export const U = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333', '44444444-4444-4444-8444-444444444444'];

/** A histogram with `n` samples in the bucket whose upper edge is `edgeMs`. */
export function at(edgeMs: number, n: number): number[] {
  const out = DURATION_EDGES_MS.map(() => 0);
  out[DURATION_EDGES_MS.indexOf(edgeMs as (typeof DURATION_EDGES_MS)[number])] = n;
  return out;
}

export function h(over: Partial<HourlyRow> & { hoursAgo?: number }): HourlyRow {
  const { hoursAgo = 0, ...rest } = over;
  const bucket = hourIso(hoursAgo);
  return {
    bucket_hour: bucket,
    code: 'CH-7101',
    kind: 'action',
    outcome: 'success',
    act: '',
    role: 'coach',
    platform: 'ios-app',
    release: LIVE_RELEASE,
    bridge_id: null,
    page_id: 'P007',
    signal_count: 1,
    user_ids: [U[0]!],
    duration_buckets: [],
    last_at: new Date(Date.parse(bucket) + 20 * 60_000).toISOString(),
    ...rest,
  };
}

export function ev(over: Partial<SessionEventRow>): SessionEventRow {
  return {
    session_id: 'sess_aaaaaaaa',
    seq: 0,
    sent_at: new Date(NOW - 30 * 60_000).toISOString(),
    kind: 'view',
    outcome: null,
    code: null,
    bridge_id: null,
    page_id: 'P007',
    act: null,
    action_id: null,
    control_id: null,
    duration_ms: null,
    server_code: null,
    message: null,
    trail: null,
    drift: [],
    ...over,
  };
}

export function session(over: Partial<SessionRow>): SessionRow {
  return {
    session_id: 'sess_aaaaaaaa',
    user_id: U[0]!,
    role: 'coach',
    team_id: 'team-1',
    platform: 'ios-app',
    release: LIVE_RELEASE,
    started_at: new Date(NOW - 40 * 60_000).toISOString(),
    last_at: new Date(NOW - 20 * 60_000).toISOString(),
    ended_at: null,
    pages: ['P002', 'P007'],
    signal_count: 30,
    failure_count: 0,
    replay_id: null,
    ...over,
  };
}

const SEND = 'messages.send';

/** The bad day: every rule R-01 to R-12 has something to fire on (R-09 is tested through the pipe). */
export function badDay() {
  const hourRows = [h({ code: 'CH-7004', outcome: 'failure', bridge_id: 70603, signal_count: 12, user_ids: U })];
  const dayRows: HourlyRow[] = [
    ...hourRows,
    // R-02: CH-7004 is new in the live release, for 4 people.
    h({ hoursAgo: 3, code: 'CH-7004', outcome: 'failure', bridge_id: 70603, signal_count: 6, user_ids: U }),
    // R-03, R-04, R-05: send degrades, slows and goes silent.
    h({ hoursAgo: 2, code: 'ACT', act: SEND, outcome: 'start', signal_count: 100, user_ids: U }),
    h({ hoursAgo: 2, code: 'CH-7101', act: SEND, outcome: 'success', signal_count: 70, duration_buckets: at(7500, 70) }),
    h({ hoursAgo: 2, code: 'CH-7004', act: SEND, outcome: 'failure', signal_count: 25, duration_buckets: at(7500, 25) }),
    // R-11: four people rage-click one control.
    h({ hoursAgo: 4, kind: 'frustration', code: 'CH-1951', outcome: '', act: 'CTL-P007-014', signal_count: 9, user_ids: U }),
    // R-12: INP p75 500 ms on the iOS app.
    h({ hoursAgo: 5, kind: 'vital', code: 'CH-1954', outcome: '', act: 'INP', signal_count: 10, duration_buckets: at(500, 10) }),
    h({ hoursAgo: 5, kind: 'vital', code: 'CH-1954', outcome: '', act: 'LCP', signal_count: 10, duration_buckets: at(2000, 10) }),
    h({ hoursAgo: 1, kind: 'view', code: '70101', outcome: '', page_id: 'P007', signal_count: 40 }),
  ];
  const baselineRows: HourlyRow[] = [
    h({ hoursAgo: 48, release: BASE_RELEASE, code: 'CH-7101', act: SEND, outcome: 'success', signal_count: 190, duration_buckets: at(1000, 190) }),
    h({ hoursAgo: 48, release: BASE_RELEASE, code: 'CH-7004', act: SEND, outcome: 'success', signal_count: 0 }),
    h({ hoursAgo: 48, release: BASE_RELEASE, code: 'CH-9999', act: SEND, outcome: 'failure', signal_count: 10, duration_buckets: at(1000, 10) }),
    // R-08: Rounds usually gets 2 views an hour; it sent none today.
    h({ hoursAgo: 60, release: BASE_RELEASE, kind: 'view', code: '110101', outcome: '', page_id: 'P011', signal_count: 7 * 24 * 2 }),
    h({ hoursAgo: 60, release: BASE_RELEASE, kind: 'view', code: '70101', outcome: '', page_id: 'P007', signal_count: 7 * 24 * 2 }),
  ];
  const events: SessionEventRow[] = [
    // R-06: three crashes of one code in one session.
    ...[1, 2, 3].map((seq) => ev({ session_id: 'sess_crash001', seq, kind: 'crash', code: 'CH-0601', page_id: 'P011' })),
    // R-07: five Try again presses on one code.
    ...[1, 2, 3, 4, 5].map((seq) => ev({ session_id: 'sess_retry001', seq, kind: 'toast', outcome: 'retry', code: 'CH-7004' })),
  ];
  const drift: DriftRow[] = [
    { kind: 'unknown-code', code: 'CH-9999', release: LIVE_RELEASE, drift_count: 3, first_seen: hourIso(5), last_seen: hourIso(1) },
  ];
  return { hourRows, dayRows, baselineRows, sameHourRows: [] as HourlyRow[], events, drift };
}

/** The quiet day: traffic as usual, and nothing for a rule to fire on. */
export function quietDay() {
  const hourRows = [h({ code: 'CH-7101', act: SEND, outcome: 'success', signal_count: 3, duration_buckets: at(500, 3) })];
  const dayRows: HourlyRow[] = [
    ...hourRows,
    h({ hoursAgo: 2, code: 'ACT', act: SEND, outcome: 'start', signal_count: 100 }),
    h({ hoursAgo: 2, code: 'CH-7101', act: SEND, outcome: 'success', signal_count: 99, duration_buckets: at(500, 99) }),
    h({ hoursAgo: 2, code: 'CH-7004', act: SEND, outcome: 'failure', release: BASE_RELEASE, signal_count: 1, duration_buckets: at(500, 1) }),
    h({ hoursAgo: 0, kind: 'view', code: '70101', outcome: '', page_id: 'P007', signal_count: 5 }),
    h({ hoursAgo: 5, kind: 'vital', code: 'CH-1954', outcome: '', act: 'INP', signal_count: 10, duration_buckets: at(100, 10) }),
  ];
  const baselineRows: HourlyRow[] = [
    h({ hoursAgo: 48, release: BASE_RELEASE, code: 'CH-7101', act: SEND, outcome: 'success', signal_count: 198, duration_buckets: at(500, 198) }),
    h({ hoursAgo: 48, release: BASE_RELEASE, code: 'CH-7004', act: SEND, outcome: 'failure', signal_count: 2, duration_buckets: at(500, 2) }),
    h({ hoursAgo: 60, release: BASE_RELEASE, kind: 'view', code: '70101', outcome: '', page_id: 'P007', signal_count: 300 }),
  ];
  return { hourRows, dayRows, baselineRows, sameHourRows: [h({ hoursAgo: 7 * 24, code: 'CH-7101', act: SEND, signal_count: 3 })], events: [] as SessionEventRow[], drift: [] as DriftRow[] };
}
