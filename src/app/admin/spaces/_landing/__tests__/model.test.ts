import { describe, it, expect } from 'vitest';
import {
  WEEK_MS,
  DAY_MS,
  assembleNeeds,
  bucketWeeks,
  clubhouseToday,
  deskHeadline,
  deskQueue,
  heldCount,
  judgeCard,
  productHeadline,
  productSummary,
  pulseGridIncomplete,
  readFailed,
  readOk,
  releaseHealth,
  summarizeJobs,
  teamActivity,
  todayHeadline,
  todayReport,
  usageLine,
  type ReleaseCardLite,
  type TeamActivity,
} from '../model';

const NOW = Date.parse('2026-11-26T12:40:00Z');
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();

const card = (o: Partial<ReleaseCardLite> = {}): ReleaseCardLite => ({
  commitSha: 'a863eeb07c1234567890',
  commitMessage: 'Flags',
  createdAt: NOW - 5 * 3600_000,
  gatheringSignal: false,
  errorsBefore2h: 2,
  errorsAfter2h: 1,
  newFingerprintsSince: 0,
  resolvedAndQuietSince: 0,
  verdict: { tone: 'success', label: 'improved' },
  ...o,
});

const days = (activity: number[]) => activity.map((a) => ({ activity: a }));

describe('bucketWeeks (rolling 7-day windows ending now)', () => {
  it('puts the last 7 days in the last bucket and the 7 before it in the one before', () => {
    const out = bucketWeeks([iso(0), iso(6 * DAY_MS), iso(7 * DAY_MS), iso(7 * DAY_MS + 1)], NOW, 12);
    expect(out).toHaveLength(12);
    expect(out[11]).toBe(2);
    expect(out[10]).toBe(2);
  });
  it('drops future, too-old and unparseable timestamps', () => {
    expect(bucketWeeks([iso(-60_000), iso(12 * WEEK_MS), 'nope'], NOW, 12).reduce((a, b) => a + b, 0)).toBe(0);
    expect(bucketWeeks([iso(12 * WEEK_MS - 1)], NOW, 12)[0]).toBe(1);
  });
});

describe('teamActivity', () => {
  const quietWeek = [...new Array(16).fill(0), 1, 0, 0, 0, 0, 0, 0, ...new Array(7).fill(0)];
  it('counts teams active in the last 7 buckets and names those that went quiet this week', () => {
    const r = teamActivity([
      { teamId: 'a', name: 'Active', sport: 'golf', buckets: days([...new Array(29).fill(0), 3]) },
      { teamId: 'q', name: 'Quiet', sport: 'golf', buckets: days(quietWeek) },
      { teamId: 's', name: 'Silent', sport: 'baseball', buckets: days(new Array(30).fill(0)) },
    ]);
    expect(r).toEqual({ total: 3, activeThisWeek: 1, wentQuiet: [{ teamId: 'q', name: 'Quiet' }] });
  });
  it('a team silent for two weeks or more is not "went quiet this week"', () => {
    const old = [5, ...new Array(29).fill(0)];
    expect(teamActivity([{ teamId: 'o', name: 'Old', sport: 'golf', buckets: days(old) }]).wentQuiet).toEqual([]);
  });
  it('detects an incomplete pulse-grid run from its note', () => {
    expect(pulseGridIncomplete('base note INCOMPLETE THIS RUN — golf_rounds could not be read')).toBe(true);
    expect(pulseGridIncomplete('base note')).toBe(false);
  });
});

describe('releaseHealth', () => {
  it('is unknown without a release stamp, and has no verdict outside the 7-day ledger', () => {
    expect(releaseHealth(null, [card()]).state).toBe('unstamped');
    expect(releaseHealth('ffffff1', [card()]).state).toBe('outside-ledger');
  });
  it('matches the served stamp (short or full) and judges that card, not the newest', () => {
    const older = card({ commitSha: 'bbbbbbb000', newFingerprintsSince: 2 });
    const newer = card({ commitSha: 'ccccccc000', createdAt: NOW - 3600_000 });
    expect(releaseHealth('bbbbbbb', [newer, older]).state).toBe('new-errors');
    expect(releaseHealth('a863eeb07c1234567890abcd', [card()]).state).toBe('clean');
  });
  it('gathering signal is never clean; a worse 2-hour window is regressed', () => {
    expect(judgeCard(card({ gatheringSignal: true }))).toBe('gathering');
    expect(judgeCard(card({ verdict: { tone: 'danger', label: 'regressed' } }))).toBe('regressed');
  });
});

describe('summarizeJobs / heldCount / clubhouseToday', () => {
  it('splits job states and keeps unreadable apart from never-ran', () => {
    const s = summarizeJobs(
      [{ status: 'ok' }, { status: 'failed' }, { status: 'overdue' }, { status: 'never-ran', unreadable: true }, { status: 'never-ran' }],
      [{ status: 'pass' }, { status: 'fail' }],
    );
    expect(s).toMatchObject({ total: 5, ok: 1, failed: 1, overdue: 1, unreadable: 1, neverRan: 1, integrityFailed: 1, integrityTotal: 2 });
  });
  it('counts only HOLD rows', () => {
    expect(heldCount([{ status: 'HOLD' }, { status: 'OBSOLETE' }, { status: 'APPLIED' }, { status: 'HOLD' }])).toBe(2);
  });
  it('counts failure causes and distinct people; an untrusted pipe is flagged', () => {
    const rows = [
      { kind: 'action', outcome: 'failure', code: 'CH-1', signal_count: 3, user_ids: ['u1', 'u2'] },
      { kind: 'crash', outcome: null, code: 'CH-2', signal_count: 1, user_ids: ['u2'] },
      { kind: 'view', outcome: 'success', code: 'CH-3', signal_count: 9, user_ids: ['u3'] },
    ];
    expect(clubhouseToday(rows, { untrusted: false, label: 'pipe: live' })).toEqual({ causes: 2, failures: 4, people: 2, trusted: true, pipeLabel: 'pipe: live' });
    expect(clubhouseToday([], { untrusted: true, label: 'pipe: switched off' }).trusted).toBe(false);
  });
});

describe('assembleNeeds', () => {
  const teams: TeamActivity = { total: 4, activeThisWeek: 1, wentQuiet: [{ teamId: 't', name: 'Hampden' }] };
  it('keeps non-zero rows, names a single quiet team, and sums discrete items', () => {
    const n = assembleNeeds({
      jobs: readOk(summarizeJobs([{ status: 'failed' }, { status: 'overdue' }], [{ status: 'fail' }])),
      held: readOk(3),
      teams: readOk(teams),
      release: readOk(releaseHealth('a863eeb', [card()])),
      clubhouse: readOk(clubhouseToday([], { untrusted: false, label: 'pipe: live' })),
    });
    expect(n.rows.map((r) => [r.key, r.count])).toEqual([
      ['jobs-failing', 2],
      ['jobs-overdue', 1],
      ['held', 3],
      ['quiet-teams', 1],
    ]);
    expect(n.rows.find((r) => r.key === 'quiet-teams')?.title).toBe('Hampden went quiet this week');
    expect(n).toMatchObject({ total: 7, unread: 0 });
  });
  it('a failed read is a row with no count, never a dropped row or a zero; a silent pipe zero is unknown', () => {
    const n = assembleNeeds({
      jobs: readFailed('boom'),
      held: readFailed('enoent'),
      teams: readFailed('x'),
      release: readFailed('x'),
      clubhouse: readOk(clubhouseToday([], { untrusted: true, label: 'pipe: switched off' })),
    });
    expect(n.rows.every((r) => r.count === null)).toBe(true);
    expect(n.rows.map((r) => r.key)).toEqual(['jobs-failing', 'held', 'quiet-teams', 'release-errors', 'clubhouse']);
    expect(n).toMatchObject({ total: 0, unread: 5 });
  });
});

describe('todayHeadline', () => {
  const needs = { rows: [], total: 0, unread: 0 };
  const reading = { ok: 8, total: 8 };
  it('thin usage when under a third of teams were active or nobody logged a round', () => {
    expect(usageLine({ total: 27, activeThisWeek: 6, wentQuiet: [] }, [4, 0]).second).toBe('Usage is thin.');
    expect(usageLine({ total: 3, activeThisWeek: 3, wentQuiet: [] }, [4, 0]).second).toBe('Usage is thin.');
    expect(usageLine({ total: 3, activeThisWeek: 3, wentQuiet: [] }, [10, 4]).second).toBe('Usage is falling.');
    expect(usageLine({ total: 3, activeThisWeek: 2, wentQuiet: [] }, [3, 4])).toEqual({ second: 'Teams are using it.', tone: 'good' });
    expect(usageLine({ total: 3, activeThisWeek: 0, wentQuiet: [] }, null).second).toBe('Nobody used it this week.');
  });
  it('writes the lede from the data', () => {
    const h = todayHeadline({
      teams: readOk({ total: 27, activeThisWeek: 6, wentQuiet: [] }),
      rounds: readOk([4, 0]),
      release: readOk(releaseHealth('a863eeb', [card()])),
      needs: { rows: [], total: 23, unread: 0 },
      reading,
    });
    expect(h.title).toBe('Helm is up.');
    expect(h.second).toBe('Usage is thin.');
    expect(h.lede).toBe(
      '6 of 27 teams used Helm in the last 7 days, and nobody logged a round. The live release a863eeb is clean: no new error fingerprints since it went out. 23 things are waiting on you.',
    );
  });
  it('says the release left errors, and never claims usage when every input failed', () => {
    expect(todayHeadline({ teams: readOk({ total: 2, activeThisWeek: 2, wentQuiet: [] }), rounds: readOk([1, 1]), release: readOk(releaseHealth('a863eeb', [card({ newFingerprintsSince: 1 })])), needs, reading }).title).toBe('The release left errors.');
    const blind = todayHeadline({ teams: readFailed('x'), rounds: readFailed('x'), release: readFailed('x'), needs: { rows: [], total: 0, unread: 3 }, reading: { ok: 2, total: 8 } });
    expect(blind.title).toBe('Bridge can’t see much.');
    expect(blind.lede).toContain('Team activity could not be read.');
    expect(blind.lede).toContain('What is waiting on you could not be fully read.');
  });
  it('the copy report carries counts, not team names', () => {
    const text = todayReport({
      now: NOW,
      headline: { title: 'Helm is up.', second: 'Usage is thin.', secondTone: 'watch', lede: 'x' },
      tiles: [{ label: 'Teams active', value: null, sub: 's' }],
      needs: { rows: [{ key: 'quiet-teams', count: 1, title: 'Hampden went quiet this week', href: '/', tone: 'watch' }], total: 1, unread: 0 },
      rounds: [1, 2],
    });
    expect(text).not.toContain('Hampden');
    expect(text).toContain('Teams active: not measured yet');
  });
});

describe('product, desk', () => {
  const f = (o: Partial<Parameters<typeof productSummary>[0][number]>) => ({
    key: 'k',
    label: 'L',
    app: 'golfhelm' as const,
    tier: 'high' as const,
    uniqueUsers30d: 0,
    uniqueUsers7d: 0,
    usedToday: false,
    quietDays: 30,
    ...o,
  });
  it('health unread is null, never zero', () => {
    const s = productSummary([f({ uniqueUsers30d: 2, uniqueUsers7d: 1, usedToday: true }), f({ key: 'b' })], null);
    expect(s).toEqual({ total: 2, usedToday: 1, used7d: 1, used30d: 1, red: null, amber: null });
    expect(productHeadline(s).second).toBe('Health could not be read.');
    expect(productHeadline(productSummary([f({})], new Map([['k', 'red']]))).tone).toBe('bad');
  });
  it('desk queue lists urgent reports first, then HOLD rows only', () => {
    const q = deskQueue(
      [
        { migration: 'a.sql', status: 'HOLD', why: '**Draft.** not `reviewed`', decided: '' },
        { migration: 'b.sql', status: 'APPLIED', why: '', decided: '' },
      ],
      [
        { number: 1, displayTitle: 'Low', priority: 'normal', kind: 'bug', created_at: '2026-11-20T00:00:00Z' },
        { number: 2, displayTitle: 'Hot', priority: 'urgent', kind: 'bug', created_at: '2026-11-01T00:00:00Z' },
      ],
    );
    expect(q.map((r) => r.key)).toEqual(['ben-leah:2', 'ben-leah:1', 'held:a.sql']);
    expect(q[2]!.why).toBe('Draft. not reviewed');
  });
  it('desk headline says "at least" when a source is unread', () => {
    expect(deskHeadline(23, null).title).toBe('At least 23 decisions are waiting.');
    expect(deskHeadline(0, 0).title).toBe('Nothing is waiting on you.');
    expect(deskHeadline(null, null).tone).toBe('bad');
  });
});
