import { describe, it, expect } from 'vitest';
import { fixtureGraph, signal } from './fixtures';
import { NOW, U, ev, session, LIVE_RELEASE, BASE_RELEASE, h } from './fixtures-live';
import { buildIngest } from '../ingest';
import {
  buildFeed,
  currentRelease,
  feedHref,
  filterFeed,
  hourlyKeyOf,
  howItCounts,
  itemHeadline,
  feedReport,
  fixStatus,
  itemState,
  newCodes,
  ordinal,
  parseEventKey,
  parseFeedScope,
  roleSummary,
  serverCodeWords,
  trailLines,
  whereOf,
  windowStart,
  DEFAULT_FEED,
  type CountsContext,
} from '../feed';
import { EMPTY_NOTES, indexNotes, type BridgeNoteRow } from '../notes';

const graph = fixtureGraph();
graph.controls = { 'CTL-P007-015': { page: 'P007', label: 'Send', actions: ['ACT-P007-SEND-MESSAGE'], file: 'src/clubhouse/messages/Send.tsx' } };
// As the catalog writes it: the toast in quotes, then builder notes the headline must drop.
graph.ids['70603']!.catalogRow = { theySee: '"Couldn\'t send the message" + Try again, in the composer (GAP-S-31)' };

const fail = (over: Parameters<typeof ev>[0]) =>
  ev({ kind: 'action', outcome: 'failure', code: 'CH-7004', bridge_id: 70603, action_id: 'ACT-P007-SEND-MESSAGE', act: 'messages.send', control_id: 'CTL-P007-015', ...over });

const coachSess = session({ session_id: 'sess_coach001', user_id: U[0]!, role: 'coach', team_id: 'team-1' });
const playerSess = session({ session_id: 'sess_playr001', user_id: U[1]!, role: 'player', team_id: 'team-2' });
const outSess = session({ session_id: 'sess_out00001', user_id: null, role: 'signed-out', team_id: null });

function feed(notes = EMPTY_NOTES, fresh = new Set<string>()) {
  return buildFeed({
    graph,
    events: [
      fail({ session_id: 'sess_coach001', seq: 3, sent_at: '2026-11-25T12:00:00.000Z', server_code: '42501' }),
      fail({ session_id: 'sess_coach001', seq: 7, sent_at: '2026-11-25T13:00:00.000Z' }),
      fail({ session_id: 'sess_playr001', seq: 2, sent_at: '2026-11-25T12:30:00.000Z' }),
      ev({ session_id: 'sess_out00001', seq: 1, kind: 'crash', code: 'CH-9999', sent_at: '2026-11-25T11:00:00.000Z' }),
      ev({ session_id: 'sess_coach001', seq: 1, kind: 'view' }),
      fail({ session_id: 'sess_ghost0001', seq: 1, sent_at: '2026-11-25T10:00:00.000Z' }),
    ],
    sessions: [coachSess, playerSess, outSess],
    teamNames: new Map([['team-1', 'Demo University Golf']]),
    notes,
    fresh,
    release: LIVE_RELEASE,
  });
}

describe('feed scope', () => {
  it('parses window, role, device, selection and tab, falling back on junk', () => {
    expect(parseFeedScope({})).toEqual(DEFAULT_FEED);
    const s = parseFeedScope({ w: '7d', role: 'player', pf: 'ios-app', e: 'sess_coach001:7', tab: 'server', sc: 'pgrst116', page: 'P007' });
    expect(s).toMatchObject({ w: '7d', role: 'player', pf: 'ios-app', e: { sessionId: 'sess_coach001', seq: 7 }, tab: 'server', sc: 'PGRST116', page: 'P007' });
    expect(parseFeedScope({ w: '1y', role: 'admin', tab: 'x', e: 'nope' })).toEqual(DEFAULT_FEED);
    expect(parseEventKey('a:b:12345678:4')).toBeNull();
    expect(parseEventKey('sess_abc-12:4')).toEqual({ sessionId: 'sess_abc-12', seq: 4 });
  });
  it('builds links that drop defaults and keep the rest', () => {
    expect(feedHref(DEFAULT_FEED)).toBe('/admin/spaces/reliability');
    expect(feedHref({ ...DEFAULT_FEED, role: 'coach' }, { e: { sessionId: 'sess_coach001', seq: 3 }, tab: 'trail' }, 'detail')).toBe('/admin/spaces/reliability?role=coach&e=sess_coach001%3A3&tab=trail#detail');
  });
  it('starts today at 00:00 UTC', () => {
    expect(new Date(windowStart('today', NOW)).toISOString()).toBe('2026-11-25T00:00:00.000Z');
    expect(NOW - windowStart('24h', NOW)).toBe(86_400_000);
  });
});

describe('buildFeed', () => {
  it('keeps failures only, newest first, with the toast, page, button and team; never a name', () => {
    const items = feed();
    expect(items.map((i) => i.key)).toEqual(['sess_coach001:7', 'sess_playr001:2', 'sess_coach001:3', 'sess_out00001:1', 'sess_ghost0001:1']);
    const top = items[0]!;
    expect(itemHeadline(top!)).toBe('Couldn’t send the message');
    expect(top).toMatchObject({ pageName: 'Messages', controlLabel: 'Send', actionLabel: 'Send a message', role: 'coach', teamName: 'Demo University Golf', catalogCode: 'CH-7004' });
    expect(items.find((i) => i.sessionId === 'sess_playr001')!.teamName).toBeNull();
  });
  it('numbers each person’s hits of a code oldest first; signed out counts per session', () => {
    const items = feed();
    expect(items.find((i) => i.key === 'sess_coach001:3')!.nth).toBe(1);
    expect(items.find((i) => i.key === 'sess_coach001:7')!.nth).toBe(2);
    expect(items.find((i) => i.key === 'sess_playr001:2')!.nth).toBe(1);
    expect(ordinal(1)).toBe('1st');
    expect(ordinal(2)).toBe('2nd');
    expect(ordinal(3)).toBe('3rd');
    expect(ordinal(11)).toBe('11th');
    expect(ordinal(22)).toBe('22nd');
  });
  it('does not guess the role of a failure whose session row is missing', () => {
    const items = feed();
    expect(items.find((i) => i.sessionId === 'sess_ghost0001')!.role).toBeNull();
    const s = roleSummary(items);
    expect(s.coach).toMatchObject({ errors: 2, people: 1, top: { text: 'Couldn’t send the message', count: 2 } });
    expect(s.player).toMatchObject({ errors: 1, people: 1 });
    expect(s.signedOut).toBe(1);
    expect(s.unknownRole).toBe(1);
  });
  it('filters by role, device, page and server code', () => {
    const items = feed();
    expect(filterFeed(items, { role: 'player', pf: 'all', page: null, sc: null })).toHaveLength(1);
    expect(filterFeed(items, { role: 'all', pf: 'all', page: null, sc: '42501' }).map((i) => i.key)).toEqual(['sess_coach001:3']);
    expect(filterFeed(items, { role: 'all', pf: 'desktop', page: null, sc: null })).toHaveLength(0);
  });
});

describe('state', () => {
  const note = (kind: string, code: string): BridgeNoteRow => ({ id: kind + code, kind, code, bridge_id: null, page_id: null, body: 'Normal for new coaches', created_at: '2026-11-20T00:00:00Z', created_by: null, resolved_at: null });
  it('Expected beats Watching beats New, and New needs this release', () => {
    const notes = indexNotes([note('expected', 'CH-7004'), note('watch', 'CH-7004'), note('watch', 'CH-1903')]);
    const fresh = new Set(['CH-7004', 'CH-1903', 'CH-8000']);
    expect(itemState('CH-7004', notes, fresh, LIVE_RELEASE, LIVE_RELEASE)).toBe('expected');
    expect(itemState('CH-1903', notes, fresh, LIVE_RELEASE, LIVE_RELEASE)).toBe('watching');
    expect(itemState('CH-8000', notes, fresh, LIVE_RELEASE, LIVE_RELEASE)).toBe('new');
    expect(itemState('CH-8000', notes, fresh, BASE_RELEASE, LIVE_RELEASE)).toBeNull();
    expect(itemState(null, notes, fresh, LIVE_RELEASE, LIVE_RELEASE)).toBeNull();
  });
  it('a code is new only when no other release had it; unknown never is', () => {
    const rows = [
      { code: 'CH-7004', release: LIVE_RELEASE },
      { code: 'CH-1903', release: LIVE_RELEASE },
      { code: 'CH-1903', release: BASE_RELEASE },
      { code: 'unknown', release: LIVE_RELEASE },
    ];
    expect([...newCodes(rows, LIVE_RELEASE)]).toEqual(['CH-7004']);
    expect(newCodes(rows, null).size).toBe(0);
  });
  it('this release is the stamped one, else the newest session’s', () => {
    expect(currentRelease('abc1234', [])).toBe('abc1234');
    expect(currentRelease('main', [{ release: 'old', last_at: '2026-01-01' }, { release: 'new', last_at: '2026-02-01' }, { release: 'other', last_at: '2026-03-01' }])).toBe('new');
    expect(currentRelease('main', [])).toBeNull();
  });
});

describe('where and trail', () => {
  it('names the page, control, action, files, tables and docs, and says when the link is missing', () => {
    const item = feed()[0]!;
    const w = whereOf(item, graph);
    expect(w).toMatchObject({ pageName: 'Messages', tables: ['golf_messages'], gap: null });
    expect(w.control?.label).toBe('Send');
    expect(w.files).toContain('src/clubhouse/messages/Send.tsx');
    const unlinked = whereOf({ ...item, control: 'CTL-P007-099' }, graph);
    expect(unlinked.gap).toContain('not in the Bridge map');
    graph.controls['CTL-P007-016'] = { page: 'P007', label: 'Other', actions: [] };
    expect(whereOf({ ...item, control: 'CTL-P007-016' }, graph).gap).toContain('is not linked to ACT-P007-SEND-MESSAGE');
  });
  it('reads the session as steps, with switch times only when sent', () => {
    const events = [
      ev({ session_id: 's1abcdefg', seq: 1, kind: 'view', page_id: 'P007', duration_ms: null }),
      ev({ session_id: 's1abcdefg', seq: 2, kind: 'view', page_id: 'P007', duration_ms: 1400 }),
      ev({ session_id: 's1abcdefg', seq: 3, kind: 'tap', control_id: 'CTL-P007-015' }),
      fail({ session_id: 's1abcdefg', seq: 4, duration_ms: 1800, server_code: '42501' }),
      ev({ session_id: 's1abcdefg', seq: 5, kind: 'action', outcome: 'success', action_id: 'ACT-P007-SEND-MESSAGE', duration_ms: 600 }),
    ];
    const lines = trailLines(events, graph, { sessionId: 's1abcdefg', seq: 4 }, 'coach');
    expect(lines.map((l) => l.text)).toEqual(['Opened Messages', 'Opened Messages', 'Pressed Send (CTL-P007-015)', 'Failed: CH-7004 · Row rule refused (42501)', 'Done: Send a message']);
    expect(lines.map((l) => l.detail)).toEqual([null, 'switch 1.4 s', null, 'after 1.8 s', 'after 600 ms']);
    expect(lines[2]!.tone).toBe('coach');
    expect(lines[3]).toMatchObject({ tone: 'bad', current: true });
  });
});

describe('how it counts', () => {
  it('derives the same hourly key ingest writes', () => {
    const s = signal({ control: 'CTL-P007-015', act: 'messages.send', serverCode: '42501', at: NOW - 60_000, release: LIVE_RELEASE });
    const plan = buildIngest({ signals: [s], context: [], ended: false, graph, userId: U[0]!, now: NOW });
    const sess = plan.sessions[0]!;
    const e = sess.events[0]!;
    const row = sess.hourly[0]!;
    const key = hourlyKeyOf({ ...e, sent_at: e.at }, { role: sess.session.role, platform: sess.session.platform, release: sess.session.release });
    expect(key).toEqual({ hour: row.hour, code: row.code, kind: row.kind, outcome: row.outcome, act: row.act, page_id: row.page_id, role: row.role, platform: row.platform, release: row.release });
  });
  it('an unknown code keys as "unknown", as ingest does', () => {
    const s = signal({ code: 'CH-9999', at: NOW - 60_000 });
    const plan = buildIngest({ signals: [s], context: [], ended: false, graph, userId: null, now: NOW });
    const sess = plan.sessions[0]!;
    const e = sess.events[0]!;
    expect(hourlyKeyOf({ ...e, sent_at: e.at }, sess.session).code).toBe(sess.hourly[0]!.code);
    expect(sess.hourly[0]!.code).toBe('unknown');
  });
  const ctx = (over: Partial<CountsContext> = {}): CountsContext => ({
    window: 'today',
    release: LIVE_RELEASE,
    code: { count: 3, people: 2, sessions: 2 },
    expected: null,
    watched: false,
    isNew: false,
    errorLog: { state: 'ok', rows: [] },
    r02People: 3,
    ...over,
  });
  it('writes five sentences from the event, and never claims what it did not read', () => {
    const item = feed().find((i) => i.key === 'sess_coach001:7')!;
    const key = hourlyKeyOf(fail({ sent_at: '2026-11-25T13:00:00.000Z' }), coachSess);
    const out = howItCounts(item, key, ctx());
    expect(out).toHaveLength(5);
    expect(out[0]).toContain('outcome failure');
    expect(out[1]).toContain('under CH-7004 on Messages (P007), for a coach on iOS app');
    expect(out[1]).toContain('13:00 UTC hour');
    expect(out[2]).toContain('2nd time today');
    expect(out[4]).toContain('no row for this session and code');
    expect(howItCounts(item, key, ctx({ errorLog: { state: 'ok', rows: [{ id: '1', fingerprint: 'f', ch_code: 'CH-7004' }] } }))[4]).toContain('holds a row');
    expect(howItCounts(item, key, ctx({ errorLog: { state: 'error' } }))[4]).toContain('could not be read');
  });
  it('says R-02 raises a new code only past its people line', () => {
    const item = feed()[0]!;
    const key = hourlyKeyOf(fail({}), coachSess);
    expect(howItCounts(item, key, ctx({ isNew: true }))[3]).toContain('once 3 or more people');
    expect(howItCounts(item, key, ctx({ isNew: true, code: { count: 4, people: 3, sessions: 3 } }))[3]).toContain('so the new-after-release rule (R-02) raises it');
    const exp: BridgeNoteRow = { id: 'x', kind: 'expected', code: 'CH-7004', bridge_id: 70603, page_id: 'P007', body: 'New coaches see it', created_at: '', created_by: null, resolved_at: null };
    expect(howItCounts(item, key, ctx({ expected: exp }))[3]).toContain('marked expected ("New coaches see it")');
  });
  it('signed out is counted apart with no person', () => {
    const item = feed().find((i) => i.role === 'signed-out')!;
    const out = howItCounts(item, hourlyKeyOf(ev({ kind: 'crash', code: 'CH-9999' }), outSess), ctx());
    expect(out[0]).toContain('crashed');
    expect(out[1]).toContain('"unknown"');
    expect(out[2]).toContain('signed-out, with no person attached');
  });
});

describe('server codes', () => {
  it('in plain words, or the code itself', () => {
    expect(serverCodeWords('42501')).toMatchObject({ words: 'Row rule refused', known: true });
    expect(serverCodeWords('57014').words).toBe('Query timed out');
    expect(serverCodeWords('23505').words).toBe('Already exists');
    expect(serverCodeWords('P0001').words).toBe('Database rule said no');
    expect(serverCodeWords('PGRST116').words).toBe('Not exactly one row');
    expect(serverCodeWords('23P01')).toMatchObject({ words: 'Overlaps another', known: true });
    expect(serverCodeWords('ZZ999')).toMatchObject({ words: 'Server code ZZ999', known: false });
    expect(serverCodeWords(null).known).toBe(false);
  });
});

void h;

describe('fixStatus (from the 8-day hourly history, never a stored flag)', () => {
  const rows = [
    { code: 'CH-7004', release: 'old1', at: '2026-11-20T10:00:00.000Z' },
    { code: 'CH-7004', release: 'old2', at: '2026-11-22T09:00:00.000Z' },
    { code: 'CH-1201', release: 'live', at: '2026-11-26T08:00:00.000Z' },
  ];
  it('says unknown when the history, the code or the live release is missing', () => {
    expect(fixStatus(null, 'CH-7004', 'live').state).toBe('unknown');
    expect(fixStatus(rows, null, 'live').state).toBe('unknown');
    expect(fixStatus(rows, 'CH-7004', null).state).toBe('unknown');
  });
  it('a code only in the live release is new there', () => {
    expect(fixStatus(rows, 'CH-1201', 'live')).toMatchObject({ state: 'new-in-live', tone: 'bad' });
  });
  it('a code in the live release and earlier ones is still failing', () => {
    expect(fixStatus([...rows, { code: 'CH-7004', release: 'live', at: '2026-11-26T09:00:00.000Z' }], 'CH-7004', 'live')).toMatchObject({ state: 'still-failing', tone: 'bad' });
  });
  it('a code absent from the live release points to fixed, and says it needs real use to be sure', () => {
    const f = fixStatus(rows, 'CH-7004', 'live');
    expect(f).toMatchObject({ state: 'not-seen-in-live', tone: 'good' });
    expect(f.words).toContain('last failed in old2 (2026-11-22)');
    expect(f.words).toContain('only once the live release has had real use');
  });
  it('no rows for the code is no history, not fixed', () => {
    expect(fixStatus(rows, 'CH-9999', 'live').state).toBe('no-history');
  });
});

describe('feedReport', () => {
  it('names the likely cause from fixed words, never the raw message', () => {
    const items = feed().map((i, n) => (n === 0 ? { ...i, serverCode: null, message: 'Load failed for user 3f9a…' } : i));
    const text = feedReport(items, roleSummary(items), '24h', 'pipe: live');
    expect(text).toContain('| Likely cause |');
    expect(text).toContain('Connection dropped');
    expect(text).not.toContain('3f9a');
  });
});
