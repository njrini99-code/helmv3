import { describe, expect, it } from 'vitest';
import {
  actionStats,
  bridgeFieldsOf,
  bucketQuantile,
  classifyReadError,
  codeTotals,
  categoryLookup,
  failingCodes,
  filterSessions,
  frustrationByControl,
  headlineAlerts,
  isActiveHour,
  mergeBuckets,
  neverSeen,
  pageWall,
  parseLiveScope,
  pipeStatus,
  previousRelease,
  releaseDiff,
  releaseList,
  runRules,
  sessionMinutes,
  sortSessions,
  timelineLanes,
  vitalsByPage,
  withLive,
  type PipeStatus,
} from '../live-model';
import { DEFAULT_SCOPE } from '../screens';
import { fixtureGraph } from './fixtures';
import { BASE_RELEASE, LIVE_RELEASE, NOW, U, at, badDay, ev, h, quietDay, session } from './fixtures-live';

const livePipe = (): PipeStatus =>
  pipeStatus({ flagOn: true, state: 'ok', lastEnvelopeAt: new Date(NOW - 2 * 60_000).toISOString(), now: NOW, activeHours: true });

function rulesFor(day: ReturnType<typeof badDay> | ReturnType<typeof quietDay>, pipe: PipeStatus = livePipe()) {
  return runRules({ now: NOW, release: LIVE_RELEASE, ...day, pipe, categoryOf: categoryLookup(fixtureGraph()) });
}

describe('reads that find nothing to read', () => {
  it('treats a missing table, column or function as "no signal yet", anything else as an error', () => {
    for (const code of ['42P01', 'PGRST205', '42703', 'PGRST204', 'PGRST202']) expect(classifyReadError({ code })).toBe('no-signal');
    expect(classifyReadError({ message: 'relation "public.clubhouse_sessions" does not exist' })).toBe('no-signal');
    expect(classifyReadError({ code: '57014', message: 'canceling statement due to statement timeout' })).toBe('error');
    expect(classifyReadError(null)).toBe('ok');
  });
});

describe('the live scope', () => {
  it('parses window and platform, falling back to 24h and all', () => {
    expect(parseLiveScope({ w: '7d', pf: 'ios-app' })).toEqual({ w: '7d', pf: 'ios-app' });
    expect(parseLiveScope({ w: '90d', pf: 'android' })).toEqual({ w: '24h', pf: 'all' });
  });
  it('keeps both in links, and adds nothing at the defaults', () => {
    expect(withLive('/admin/clubhouse/sessions', DEFAULT_SCOPE, { w: '24h', pf: 'all' })).toBe('/admin/clubhouse/sessions');
    expect(withLive('/admin/clubhouse/sessions', { ...DEFAULT_SCOPE, role: 'coach' }, { w: '7d', pf: 'ios-app' }, { failed: 1 })).toBe(
      '/admin/clubhouse/sessions?role=coach&w=7d&pf=ios-app&failed=1',
    );
  });
});

describe('durations', () => {
  it('merges histograms and reads a quantile as the SQL function does (upper edge)', () => {
    const merged = mergeBuckets([{ duration_buckets: at(500, 90) }, { duration_buckets: at(7500, 10) }]);
    expect(bucketQuantile(merged, 0.5)).toBe(500);
    expect(bucketQuantile(merged, 0.9)).toBe(500);
    expect(bucketQuantile(merged, 0.95)).toBe(7500);
    expect(bucketQuantile(mergeBuckets([]), 0.95)).toBeNull();
  });
});

describe('aggregations over the bad day', () => {
  const day = badDay();
  it('totals codes, busiest first, and knows a failure', () => {
    const top = codeTotals(day.dayRows).find((c) => c.code === 'CH-7004')!;
    expect(top).toMatchObject({ code: 'CH-7004', bridgeId: 70603, page: 'P007', failure: true, users: 4 });
    expect(top.count).toBe(12 + 6 + 25);
  });
  it('reads an action: tries, success rate, silent starts, p95 from outcomes only', () => {
    const send = actionStats(day.dayRows).find((a) => a.act === 'messages.send')!;
    expect(send).toMatchObject({ starts: 100, tries: 95, successes: 70, failures: 25, silent: 5, p95: 7500 });
    expect(send.rate).toBeCloseTo(70 / 95);
  });
  it('draws a tile for every page in the graph, even one that sent nothing', () => {
    const wall = pageWall(day.dayRows, fixtureGraph());
    expect(wall.map((t) => t.page)).toEqual(['P001', 'P007', 'P013', 'P017']);
    const msgs = wall.find((t) => t.page === 'P007')!;
    expect(msgs).toMatchObject({ views: 40, worstCode: 'CH-7004', coachFailures: 43 });
    expect(wall.find((t) => t.page === 'P013')).toMatchObject({ views: 0, rate: null, lastViewAt: null });
  });
  it('reads vitals p75 per page and platform, and frustration per control', () => {
    expect(vitalsByPage(day.dayRows)).toEqual([{ page: 'P007', platform: 'ios-app', samples: 20, inp: 500, lcp: 2000, cls: null }]);
    expect(frustrationByControl(day.dayRows)[0]).toMatchObject({ control: 'CTL-P007-014', code: 'CH-1951', users: 4, count: 9 });
  });
  it('lists codes that never fired', () => {
    expect(neverSeen(['CH-7004', 'CH-7005'], day.dayRows)).toEqual(['CH-7005']);
  });
});

describe('releases', () => {
  const rows = [
    h({ hoursAgo: 30, release: BASE_RELEASE, code: 'CH-7004', outcome: 'failure', signal_count: 2 }),
    h({ hoursAgo: 30, release: BASE_RELEASE, code: 'CH-1903', outcome: 'failure', signal_count: 4 }),
    h({ hoursAgo: 30, release: BASE_RELEASE, code: 'CH-0601', kind: 'crash', outcome: '', signal_count: 9 }),
    h({ hoursAgo: 2, code: 'CH-7004', outcome: 'failure', signal_count: 9 }),
    h({ hoursAgo: 2, code: 'CH-1903', outcome: 'failure', signal_count: 4 }),
    h({ hoursAgo: 2, code: 'CH-8001', outcome: 'failure', signal_count: 1, user_ids: U.slice(0, 3) }),
  ];
  it('lists releases newest first and finds the one before', () => {
    const list = releaseList(rows);
    expect(list.map((r) => r.release)).toEqual([LIVE_RELEASE, BASE_RELEASE]);
    expect(previousRelease(list, LIVE_RELEASE)).toBe(BASE_RELEASE);
    expect(previousRelease(list, BASE_RELEASE)).toBeNull();
  });
  it('names codes new, rising and gone against the base over the same hours', () => {
    const diff = releaseDiff(rows, LIVE_RELEASE, BASE_RELEASE);
    expect(diff.hours).toBe(1);
    expect(diff.codes.map((c) => [c.code, c.kind])).toEqual([
      ['CH-8001', 'new'],
      ['CH-7004', 'rising'],
      ['CH-0601', 'gone'],
    ]);
  });
});

describe('sessions', () => {
  it('puts sessions with a failure first, and filters them', () => {
    const rows = [session({ session_id: 'sess_ok000001', last_at: '2026-11-25T15:00:00Z' }), session({ session_id: 'sess_bad00001', failure_count: 2, last_at: '2026-11-25T10:00:00Z', platform: 'desktop' })];
    expect(sortSessions(rows).map((s) => s.session_id)).toEqual(['sess_bad00001', 'sess_ok000001']);
    const f = { failed: false, role: null, platform: 'desktop', page: null, release: null, user: null };
    expect(filterSessions(rows, f).map((s) => s.session_id)).toEqual(['sess_bad00001']);
    expect(filterSessions(rows, { ...f, platform: null, only: new Set(['sess_ok000001']) }).map((s) => s.session_id)).toEqual(['sess_ok000001']);
    expect(filterSessions(rows, { ...f, platform: null, only: null })).toHaveLength(2);
    expect(sessionMinutes(session({}))).toBe(20);
  });
  it('lays a timeline out one lane per page, in the order the person reached it', () => {
    const lanes = timelineLanes([ev({ seq: 3, page_id: 'P007' }), ev({ seq: 1, page_id: 'P002' }), ev({ seq: 2, page_id: 'P007', kind: 'action', outcome: 'failure', code: 'CH-7004' })]);
    expect(lanes.map((l) => [l.page, l.events.map((e) => e.seq)])).toEqual([['P002', [1]], ['P007', [2, 3]]]);
    expect(failingCodes(lanes.flatMap((l) => l.events))).toEqual([{ code: 'CH-7004', page: 'P007', count: 1, sessions: 1 }]);
  });
});

describe('the pipe (R-09)', () => {
  it('is live, silent, switched off or not there yet, and never claims a green it cannot see', () => {
    expect(livePipe()).toMatchObject({ tone: 'live', untrusted: false });
    const silent = pipeStatus({ flagOn: true, state: 'ok', lastEnvelopeAt: new Date(NOW - 20 * 60_000).toISOString(), now: NOW, activeHours: true });
    expect(silent).toMatchObject({ tone: 'silent', untrusted: true });
    expect(silent.alert?.rule).toBe('R-09');
    expect(pipeStatus({ flagOn: false, state: 'ok', lastEnvelopeAt: null, now: NOW, activeHours: true })).toMatchObject({ tone: 'off', label: 'pipe: switched off' });
    expect(pipeStatus({ flagOn: true, state: 'no-signal', lastEnvelopeAt: null, now: NOW, activeHours: true })).toMatchObject({ tone: 'no-signal', label: 'pipe: no signal yet' });
    expect(pipeStatus({ flagOn: true, state: 'error', lastEnvelopeAt: null, now: NOW, activeHours: true }).tone).toBe('unknown');
  });
  it('counts an hour as active from its own history, else 12:00 to 03:59 UTC', () => {
    expect(isActiveHour(Date.parse('2026-11-25T08:00:00Z'), 5)).toBe(true);
    expect(isActiveHour(Date.parse('2026-11-25T08:00:00Z'), 0)).toBe(false);
    expect(isActiveHour(Date.parse('2026-11-25T02:00:00Z'), null)).toBe(true);
  });
});

describe('the rules runner over the seeded store', () => {
  it('fires each of R-01 to R-12 on the bad day (R-09 through a silent pipe)', () => {
    const fired = new Set(rulesFor(badDay()).map((a) => a.rule));
    for (const r of ['R-01', 'R-02', 'R-03', 'R-04', 'R-05', 'R-06', 'R-07', 'R-08', 'R-10', 'R-11', 'R-12']) expect(fired, r).toContain(r);
    const silent = pipeStatus({ flagOn: true, state: 'ok', lastEnvelopeAt: new Date(NOW - 30 * 60_000).toISOString(), now: NOW, activeHours: true });
    const withSilent = rulesFor(badDay(), silent);
    expect(withSilent[0]?.rule).toBe('R-09');
    // R-08 waits on a live pipe: a silent pipe would make every page look quiet.
    expect(withSilent.some((a) => a.rule === 'R-08')).toBe(false);
  });
  it('names what each alert is about, so it opens a dossier', () => {
    const alerts = rulesFor(badDay());
    expect(alerts.find((a) => a.rule === 'R-01')).toMatchObject({ code: 'CH-7004', page: 'P007', severity: 'high' });
    expect(alerts.find((a) => a.rule === 'R-02')).toMatchObject({ code: 'CH-7004', release: LIVE_RELEASE });
    expect(alerts.find((a) => a.rule === 'R-08')).toMatchObject({ page: 'P011' });
    expect(alerts.find((a) => a.rule === 'R-11')).toMatchObject({ control: 'CTL-P007-014' });
    expect(headlineAlerts(alerts).some((a) => a.rule === 'R-10')).toBe(false);
  });
  it('fires nothing on the quiet day', () => {
    expect(rulesFor(quietDay())).toEqual([]);
  });
});

describe('B06: the Bridge fields of an incident row', () => {
  it('prefers the columns once the migration is applied', () => {
    expect(bridgeFieldsOf({ ch_code: 'CH-7004', bridge_id: 70603, page_id: 'P007', session_id: 'sess_12345678', metadata: {} })).toMatchObject({
      code: 'CH-7004',
      bridgeId: 70603,
      page: 'P007',
      sessionId: 'sess_12345678',
    });
  });
  it('reads metadata.bridge while it is held (the route at the top level, the server emitters one level down)', () => {
    expect(bridgeFieldsOf({ metadata: { bridge: { code: 'CH-7004', bridgeId: 70603, page: 'P007', actionId: 'ACT-P007-SEND-MESSAGE', sessionId: 'sess_12345678', platform: 'ios-app' } } })).toMatchObject({
      code: 'CH-7004',
      action: 'ACT-P007-SEND-MESSAGE',
      platform: 'ios-app',
    });
    expect(bridgeFieldsOf({ metadata: { metadata: { bridge: { origin: 'E9', serverCode: '42501' } } } })).toMatchObject({ origin: 'E9', serverCode: '42501' });
    expect(bridgeFieldsOf({ metadata: { ui: 'clubhouse' } })).toBeNull();
  });
});

describe('actionStats silent starts (only success, failure or cancelled end a start)', () => {
  it('an offline tap does not hide a start that never finished', () => {
    const rows = [
      h({ act: 'messages.send', outcome: 'start', code: '', signal_count: 20 }),
      h({ act: 'messages.send', outcome: 'success', code: 'CH-1702', signal_count: 19 }),
      h({ act: 'messages.send', outcome: 'offline', code: 'CH-1903', signal_count: 1 }),
    ];
    expect(actionStats(rows)[0]).toMatchObject({ starts: 20, successes: 19, silent: 1 });
  });

  it('a stopped wait is not a try and does not count twice with the success that follows it', () => {
    const rows = [
      h({ act: 'messages.send', outcome: 'start', code: '', signal_count: 5 }),
      h({ act: 'messages.send', outcome: 'stopped-waiting', code: 'CH-1991', signal_count: 1 }),
      h({ act: 'messages.send', outcome: 'success', code: 'CH-1702', signal_count: 5 }),
    ];
    expect(actionStats(rows)[0]).toMatchObject({ starts: 5, tries: 5, silent: 0, rate: 1 });
  });
});

