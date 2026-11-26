/** The digest's Clubhouse section (Bridge plan §10), from the seeded live store. Digest only; no push (D10). */
import { describe, it, expect } from 'vitest';
import { buildDigestEmail, type DigestData } from '@/lib/admin/digest/build-digest';
import { clubhouseDigest, clubhouseDigestLines } from '@/lib/admin/clubhouse/pulse';
import { indexNotes } from '@/lib/admin/clubhouse/notes';
import { categoryLookup, isFailureRow, pipeStatus, runRules } from '@/lib/admin/clubhouse/live-model';
import { fixtureGraph } from '@/lib/admin/clubhouse/__tests__/fixtures';
import { LIVE_RELEASE, NOW, badDay } from '@/lib/admin/clubhouse/__tests__/fixtures-live';

const data: DigestData = {
  generatedAt: '2026-11-25T12:00:00.000Z',
  errors24h: { total: 0, critical: 0, topIncidents: [], degraded: 0, quiet: 0 },
  sentry: { unresolved: 0, regressed: 0 },
  signups24h: [],
  demoRequests: { new24h: 0, pendingTotal: 0 },
  coachMail: { unread: 0, recent: [] },
  activity24h: { golfRounds: 1, baseballGames: 0, liftSessions: 0 },
  reds: [],
  shippedYesterday: [],
};

function section(pipeAgoMin: number) {
  const graph = fixtureGraph();
  const day = badDay();
  const pipe = pipeStatus({ flagOn: true, state: 'ok', lastEnvelopeAt: new Date(NOW - pipeAgoMin * 60_000).toISOString(), now: NOW, activeHours: true });
  const alerts = runRules({ now: NOW, release: LIVE_RELEASE, ...day, pipe, categoryOf: categoryLookup(graph) });
  return clubhouseDigest({ state: 'ok', graph, dayRows: day.dayRows, alerts, pipe, release: LIVE_RELEASE, driftCount: day.drift.length });
}

describe('digest: Clubhouse section', () => {
  it('lists R-01 to R-07 hits, the wall in words, top codes, the release delta and drift', () => {
    const c = section(2);
    expect(c.alerts.map((a) => a.rule)).toEqual(expect.arrayContaining(['R-01', 'R-02', 'R-03', 'R-06', 'R-07']));
    expect(c.alerts.some((a) => ['R-08', 'R-10', 'R-11', 'R-12'].includes(a.rule))).toBe(false);
    expect(c.topCodes[0]).toMatchObject({ code: 'CH-7004' });
    const { text } = buildDigestEmail({ ...data, clubhouse: c });
    expect(text).toContain('CLUBHOUSE');
    expect(text).toContain('R-02 high');
    expect(text).toContain('Top codes: CH-7004');
    expect(text).toContain('Drift: 1 kind');
  });
  it('marks every all-clear untrusted while the pipe is silent (R-09)', () => {
    const c = section(30);
    expect(c.untrusted).toBe(true);
    expect(c.alerts[0]?.rule).toBe('R-09');
  });
  it('lists each watched code with its failures in the last day', () => {
    const graph = fixtureGraph();
    const day = badDay();
    const code = day.dayRows.find(isFailureRow)!.code;
    const notes = indexNotes([{ id: 'n1', kind: 'watch', code, bridge_id: null, page_id: null, body: '', created_at: '2026-11-20T00:00:00Z', created_by: null, resolved_at: null }]);
    const c = clubhouseDigest({ state: 'ok', graph, dayRows: day.dayRows, alerts: [], pipe: pipeStatus({ flagOn: true, state: 'ok', lastEnvelopeAt: new Date(NOW - 60_000).toISOString(), now: NOW, activeHours: true }), release: LIVE_RELEASE, driftCount: 0, notes });
    expect(c.watched.map((w) => w.code)).toEqual([code]);
    expect(clubhouseDigestLines(c).join('\n')).toContain(`Watched: ${code}`);
  });
  it('says "could not check" and "no signal yet" rather than a zero', () => {
    expect(buildDigestEmail(data).text).toContain('CLUBHOUSE\n  Could not check.');
    const held = { state: 'no-signal' as const, pipe: 'pipe: no signal yet', untrusted: true, alerts: [], wall: [], topCodes: [], release: null, driftCount: 0, watched: [] };
    expect(buildDigestEmail({ ...data, clubhouse: held }).text).toContain('No signal yet');
    expect(buildDigestEmail({ ...data, clubhouse: held }).html).toContain('Clubhouse');
  });
});
