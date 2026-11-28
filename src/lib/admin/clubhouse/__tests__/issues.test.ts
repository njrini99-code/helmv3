import { describe, expect, it } from 'vitest';
import { fixtureGraph } from './fixtures';
import { NOW, HOUR, U, ev, h, session, LIVE_RELEASE, BASE_RELEASE } from './fixtures-live';
import { buildFeed, feedHref, feedView, filterFeed, parseFeedScope, DEFAULT_FEED } from '../feed';
import { bucketCounts, groupIssues, isRising, issuesReport, mostlyOf, sparkFrame, whoWords } from '../issues';
import { coverageOf, coverageWords, pageHealth, pagesReport, rateWords } from '../page-health';
import { EMPTY_NOTES } from '../notes';
import type { SessionEventRow, SessionRow } from '../live-model';

const graph = fixtureGraph();
graph.controls = { 'CTL-P007-015': { page: 'P007', label: 'Send', actions: ['ACT-P007-SEND-MESSAGE'], file: 'src/clubhouse/messages/Send.tsx' } };
graph.ids['70603']!.catalogRow = { theySee: '"Couldn\'t send the message" + Try again, in the composer (GAP-S-31)' };

const ago = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();
const send = (over: Partial<SessionEventRow>) =>
  ev({ kind: 'action', outcome: 'failure', code: 'CH-7004', bridge_id: 70603, action_id: 'ACT-P007-SEND-MESSAGE', act: 'messages.send', control_id: 'CTL-P007-015', ...over });

const sessions: SessionRow[] = [
  session({ session_id: 'sess_coach001', user_id: U[0]!, role: 'coach', platform: 'ios-safari', team_id: 'team-1' }),
  session({ session_id: 'sess_coach002', user_id: U[1]!, role: 'coach', platform: 'ios-safari', team_id: 'team-1' }),
  session({ session_id: 'sess_coach003', user_id: U[2]!, role: 'coach', platform: 'ios-safari', team_id: 'team-1' }),
  session({ session_id: 'sess_playr001', user_id: U[3]!, role: 'player', platform: 'ios-app', team_id: 'team-2', release: BASE_RELEASE }),
  session({ session_id: 'sess_out00001', user_id: null, role: 'signed-out', platform: 'desktop', team_id: null }),
];

function items() {
  return buildFeed({
    graph,
    events: [
      // The send that fails: three coaches on iPhone Safari, the last hour heavy.
      send({ session_id: 'sess_coach001', seq: 1, sent_at: ago(400) }),
      send({ session_id: 'sess_coach001', seq: 2, sent_at: ago(20) }),
      send({ session_id: 'sess_coach002', seq: 1, sent_at: ago(15) }),
      send({ session_id: 'sess_coach003', seq: 1, sent_at: ago(10) }),
      send({ session_id: 'sess_coach003', seq: 2, sent_at: ago(5) }),
      // One player crash with no code, on another page.
      ev({ session_id: 'sess_playr001', seq: 4, kind: 'crash', page_id: 'P013', sent_at: ago(90) }),
      // A signed-out failure of the same send.
      send({ session_id: 'sess_out00001', seq: 1, sent_at: ago(200) }),
      // Not a failure: dropped.
      ev({ session_id: 'sess_coach001', seq: 3, kind: 'view', sent_at: ago(3) }),
    ],
    sessions,
    teamNames: new Map([
      ['team-1', 'Demo University Golf'],
      ['team-2', 'Harbor College Golf'],
    ]),
    notes: EMPTY_NOTES,
    fresh: new Set(['CH-7004']),
    release: LIVE_RELEASE,
  });
}

describe('sparkFrame and bucketCounts', () => {
  it('today runs in hours from 00:00 UTC to the hour holding now', () => {
    const f = sparkFrame('today', NOW);
    expect(f).toMatchObject({ start: Date.parse('2026-11-25T00:00:00.000Z'), size: HOUR, n: 16, unit: 'hour' });
  });
  it('24 hours is 24 hourly buckets ending with the current hour; 7 days is 7 days ending today', () => {
    expect(sparkFrame('24h', NOW)).toMatchObject({ start: Date.parse('2026-11-24T16:00:00.000Z'), n: 24 });
    expect(sparkFrame('7d', NOW)).toMatchObject({ start: Date.parse('2026-11-19T00:00:00.000Z'), n: 7, unit: 'day' });
  });
  it('puts each time in its bucket, clamps the edges and skips what it cannot read', () => {
    const f = sparkFrame('24h', NOW);
    const counts = bucketCounts([ago(5), ago(65), '2026-11-01T00:00:00.000Z', 'not a date'], f);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(3);
    expect(counts[23]).toBe(1);
    expect(counts[22]).toBe(1);
    expect(counts[0]).toBe(1);
  });
  it('weighs a time by its count when asked', () => {
    expect(bucketCounts([ago(5)], sparkFrame('today', NOW), () => 4).at(-1)).toBe(4);
  });
});

describe('isRising', () => {
  it('needs four buckets and three recent failures at twice the rate of the rest', () => {
    expect(isRising([0, 0, 5])).toBe(false);
    expect(isRising([1, 0, 0, 3])).toBe(true);
    expect(isRising([2, 2, 2, 2])).toBe(false);
    expect(isRising([0, 0, 0, 2])).toBe(false);
    expect(isRising([3, 3, 3, 3, 3, 3, 3, 3])).toBe(false);
    expect(isRising([1, 1, 1, 1, 1, 1, 4, 4])).toBe(true);
  });
});

describe('groupIssues', () => {
  const issues = groupIssues(items(), { w: 'today', now: NOW });

  it('groups by code, most people first, and keeps an uncoded crash as its own issue', () => {
    expect(issues.map((i) => i.code)).toEqual(['CH-7004', null]);
    const [send] = issues;
    expect(send).toMatchObject({ count: 6, people: 4, coaches: 3, players: 0, signedOut: 1, unknownRole: 0, pages: 1, pageName: 'Messages', state: 'new' });
    expect(send!.firstAt).toBe(ago(400));
    expect(send!.lastAt).toBe(ago(5));
    expect(send!.headline).toBe('Couldn’t send the message');
    expect(send!.quoted).toBe(true);
  });
  it('draws the sparkline in the window\'s buckets and calls the late surge rising', () => {
    const [send] = issues;
    expect(send!.spark).toHaveLength(16);
    expect(send!.spark.reduce((a, b) => a + b, 0)).toBe(6);
    expect(send!.spark.at(-1)).toBe(4);
    expect(send!.rising).toBe(true);
  });
  it('says where it concentrates only where the window has more than one value', () => {
    const [send] = issues;
    expect(send!.mostly.map((m) => m.text)).toEqual(['mostly on iPhone Safari (5 of 6)', 'only at Demo University Golf', 'only on release b2c3d4e']);
  });
  it('a crash with no code is named by its kind and the page it happened on', () => {
    const crash = issues[1]!;
    expect(crash.key).toMatch(/^x:crash\|P013\|/);
    expect(crash).toMatchObject({ count: 1, people: 1, players: 1, pageName: 'CoachHelm', mostly: [], rising: false });
  });
  it('an empty feed has no issues', () => {
    expect(groupIssues([], { w: '7d', now: NOW })).toEqual([]);
  });
});

describe('mostlyOf', () => {
  it('says nothing about fewer than three failures', () => {
    const all = items();
    expect(mostlyOf(all.slice(0, 2), all)).toEqual([]);
  });
  it('skips a dimension whose value is unknown for most of the issue', () => {
    const all = items().map((i) => ({ ...i, teamName: null }));
    expect(mostlyOf(all, all).some((m) => m.dim === 'team')).toBe(false);
  });
});

describe('whoWords and issuesReport', () => {
  it('names who it reached and leaves out the zeros', () => {
    expect(whoWords({ coaches: 3, players: 0, signedOut: 1, unknownRole: 0 })).toBe('3 coaches and 1 signed out');
    expect(whoWords({ coaches: 1, players: 1, signedOut: 0, unknownRole: 2 })).toBe('1 coach, 1 player and 2 with the role unknown');
    expect(whoWords({ coaches: 0, players: 0, signedOut: 0, unknownRole: 0 })).toBe('no one we can name');
  });
  it('writes the issues for a paste, with no user or team ids', () => {
    const report = issuesReport(groupIssues(items(), { w: 'today', now: NOW }), { windowLabel: 'Today', pipeLabel: 'pipe: live' });
    expect(report).toContain('**Couldn’t send the message** (CH-7004): 6 failures, 4 people (3 coaches and 1 signed out) on Messages; new in this release, rising, mostly on iPhone Safari (5 of 6)');
    expect(report).toContain('**A section crashed, with no code**: 1 failure, 1 person (1 player) on CoachHelm');
    for (const id of U) expect(report).not.toContain(id);
    expect(report).not.toContain('team-1');
  });
});

describe('pageHealth and coverage', () => {
  const rows = [
    h({ kind: 'view', outcome: '', page_id: 'P007', signal_count: 20, user_ids: [U[0]!, U[1]!], hoursAgo: 2 }),
    h({ kind: 'action', outcome: 'failure', code: 'CH-7004', page_id: 'P007', signal_count: 5, user_ids: [U[0]!], hoursAgo: 0 }),
    h({ kind: 'tap', outcome: '', page_id: 'P007', signal_count: 9, user_ids: [U[2]!], hoursAgo: 1 }),
    h({ kind: 'view', outcome: '', page_id: 'P013', signal_count: 4, user_ids: [U[3]!], hoursAgo: 3 }),
    h({ kind: 'crash', outcome: '', code: '', page_id: 'P017', signal_count: 1, user_ids: [U[3]!], hoursAgo: 1 }),
  ];
  const health = pageHealth(rows, graph, { w: 'today', now: NOW });

  it('reads each page from the hourly store: views, people, failures and the rate per view', () => {
    const p7 = health.find((p) => p.page === 'P007')!;
    expect(p7).toMatchObject({ views: 20, people: 3, failures: 5, failPeople: 1, rate: 0.25, topCode: 'CH-7004', kinds: ['view', 'tap', 'action'] });
    expect(p7.spark.at(-1)).toBe(5);
  });
  it('a page with failures and no views has no rate, never a made-up 0%', () => {
    expect(health.find((p) => p.page === 'P017')).toMatchObject({ failures: 1, views: 0, rate: null, kinds: ['crash'] });
  });
  it('puts the worst heard-from page first and the silent ones last', () => {
    expect(health.map((p) => p.page)).toEqual(['P007', 'P017', 'P013', 'P001']);
    expect(health.at(-1)).toMatchObject({ page: 'P001', lastAt: null, views: 0, kinds: [] });
  });
  it('counts how much of Clubhouse reported, and names the pages that did not', () => {
    const c = coverageOf(health, graph);
    expect(c).toMatchObject({ heard: 3, total: 4, silent: ['Shell'] });
    // Messages' one screen is heard; CoachHelm's coach rows fit both its screens, so neither is credited.
    expect(c).toMatchObject({ screensHeard: 1, screensTotal: 3, untold: ['CoachHelm'] });
    expect(coverageWords(c)).toBe('Heard from 3 of 4 pages and 1 of 3 screens');
    expect(coverageWords({ heard: 4, total: 4 })).toBe('Heard from all 4 pages');
    expect(coverageWords({ heard: 4, total: 4, screensHeard: 9, screensTotal: 9 })).toBe('Heard from all 4 pages and all 9 screens');
  });
  it('words a rate without inventing a zero', () => {
    expect(rateWords(null)).toBe('no views');
    expect(rateWords(0)).toBe('0%');
    expect(rateWords(0.004)).toBe('<1%');
    expect(rateWords(0.25)).toBe('25%');
  });
  it('copies the Pages view as names and counts, never a person, and names the pages that stayed silent', () => {
    const report = pagesReport(health, { windowLabel: 'Today', pipeLabel: 'Signals arriving' });
    expect(report.split('\n')[2]).toBe('Heard from 3 of 4 pages · Signals arriving');
    const withScreens = pagesReport(health, { windowLabel: 'Today', pipeLabel: 'Signals arriving', coverage: coverageOf(health, graph) });
    expect(withScreens.split('\n')[2]).toBe('Heard from 3 of 4 pages and 1 of 3 screens · Signals arriving');
    expect(withScreens).toContain('- **CoachHelm**: 4 views, no failures; screen not known yet');
    expect(withScreens).toContain('Screens not heard from (2 of 3):\n- **CoachHelm**: CoachHelm home, Ask');
    expect(withScreens).toContain('CoachHelm sent signals that do not say which screen');
    expect(report).toContain('- **Messages**: 20 views, 5 failures, 1 person hit (25% of views); most often CH-7004');
    expect(report).toContain('- **CoachHelm**: 4 views, no failures');
    expect(report).toContain('Not heard from (1): Shell.');
    for (const id of U) expect(report).not.toContain(id);
  });
});

describe('the feed scope: views and one issue', () => {
  it('an older link parses exactly as it did, and opens the view its URL implies', () => {
    expect(parseFeedScope({})).toEqual(DEFAULT_FEED);
    expect(feedView(parseFeedScope({}))).toBe('issues');
    expect(feedView(parseFeedScope({ e: 'sess_coach001:2' }))).toBe('errors');
    expect(feedView(parseFeedScope({ sc: '42501' }))).toBe('errors');
    expect(feedView(parseFeedScope({ code: 'CH-7004' }))).toBe('errors');
    expect(feedView(parseFeedScope({ v: 'pages' }))).toBe('pages');
    expect(parseFeedScope({ v: 'nonsense', code: 'bad code!' })).toEqual(DEFAULT_FEED);
  });
  it('writes the view into a link only when the rest of the link would choose another', () => {
    const s = parseFeedScope({});
    expect(feedHref(s, { v: 'issues' })).toBe('/admin/spaces/reliability');
    expect(feedHref(s, { v: 'errors' })).toBe('/admin/spaces/reliability?v=errors');
    expect(feedHref(s, { code: 'CH-7004' })).toBe('/admin/spaces/reliability?code=CH-7004');
    expect(feedHref(s, { code: 'CH-7004', v: 'issues' })).toBe('/admin/spaces/reliability?code=CH-7004&v=issues');
    expect(feedHref(parseFeedScope({ v: 'pages', w: '7d' }), { w: '24h' })).toBe('/admin/spaces/reliability?w=24h&v=pages');
  });
  it('filters to one issue by its catalog code', () => {
    const all = items();
    expect(filterFeed(all, { ...DEFAULT_FEED, code: 'CH-7004' })).toHaveLength(6);
    expect(filterFeed(all, { ...DEFAULT_FEED, code: 'CH-0000' })).toHaveLength(0);
  });
});
