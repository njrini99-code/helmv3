/**
 * B19's three views over a seeded store: Issues (the default), Pages and Every error. Each carries its BR- code, the
 * Pages view names the pages that sent nothing, and an empty Issues view never reads as all clear for those pages.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { BR } from '@/lib/admin/clubhouse/br-codes';
import { fixtureGraph } from '@/lib/admin/clubhouse/__tests__/fixtures';
import { NOW, U, ev, h, session, LIVE_RELEASE } from '@/lib/admin/clubhouse/__tests__/fixtures-live';
import { pipeStatus, type LiveRead } from '@/lib/admin/clubhouse/live-model';
import { EMPTY_NOTES } from '@/lib/admin/clubhouse/notes';

type Mode = 'ok' | 'quiet';
let mode: Mode = 'ok';
const ok = <T,>(data: T): LiveRead<T> => ({ state: 'ok', data });

vi.mock('@/lib/admin/require-super-admin', () => ({ requireSuperAdmin: vi.fn(async () => ({ userId: 'admin-1' })) }));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn(async () => undefined) }));
vi.mock('@/lib/admin/clubhouse/graph-server', () => ({ loadBridgeGraph: () => fixtureGraph() }));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/admin/spaces/reliability',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/lib/admin/clubhouse/feed-server', () => {
  const minutesAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();
  const send = (over: Parameters<typeof ev>[0]) =>
    ev({ kind: 'action', outcome: 'failure', code: 'CH-7004', bridge_id: 70603, action_id: 'ACT-P007-SEND-MESSAGE', act: 'messages.send', ...over });
  const sessions = [
    session({ session_id: 'sess_coach001', user_id: U[0]!, role: 'coach' }),
    session({ session_id: 'sess_coach002', user_id: U[1]!, role: 'coach' }),
  ];
  const events = [send({ session_id: 'sess_coach001', seq: 1, sent_at: minutesAgo(20) }), send({ session_id: 'sess_coach002', seq: 1, sent_at: minutesAgo(10) })];
  return {
    readFailures: async () =>
      mode === 'ok'
        ? { state: 'ok', truncated: false, events, sessions, teamNames: new Map([['team-1', 'Fixture team']]), errors: [] }
        : { state: 'ok', truncated: false, events: [], sessions: [], teamNames: new Map(), errors: [] },
    readFailureCodeReleases: async () => ok([]),
    readEventByKey: async () => ok(null),
    readSessionsByIds: async () => ok(sessions),
    readTeamNames: async () => ok(new Map()),
    readErrorLogForSession: async () => ok([]),
  };
});
vi.mock('@/lib/admin/clubhouse/live', () => ({
  readPipe: async () => pipeStatus({ flagOn: true, state: 'ok', lastEnvelopeAt: new Date(NOW - 60_000).toISOString(), now: NOW, activeHours: true }),
  readNotes: async () => ok(EMPTY_NOTES),
  readSessionEvents: async () => ok([]),
  // Messages and CoachHelm report; Shell and Practice send nothing.
  readHourly: async () =>
    ok([
      h({ kind: 'view', outcome: '', page_id: 'P007', signal_count: 12, user_ids: [U[0]!, U[1]!], hoursAgo: 1, release: LIVE_RELEASE }),
      ...(mode === 'ok' ? [h({ kind: 'action', outcome: 'failure', code: 'CH-7004', page_id: 'P007', signal_count: 2, user_ids: [U[0]!, U[1]!], hoursAgo: 0 })] : []),
      h({ kind: 'view', outcome: '', page_id: 'P013', signal_count: 3, user_ids: [U[2]!], hoursAgo: 2 }),
    ]),
}));

import ReliabilitySpacePage from '../page';

async function open(sp: Record<string, string> = {}) {
  return render(await ReliabilitySpacePage({ searchParams: Promise.resolve(sp) }));
}
const has = (c: HTMLElement, code: string) => c.querySelector(`[data-br="${code}"]`) !== null;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  mode = 'ok';
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('B19 feed views', () => {
  it('opens on Issues: one row per issue with who it hit, and the view switch', async () => {
    const { container } = await open();
    expect(has(container, BR.feed.view)).toBe(true);
    const rows = container.querySelectorAll(`a[data-br="${BR.feed.issueRow}"]`);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.textContent).toContain('2 coaches');
    // A coded issue opens its failures in Every error, filtered to the code.
    expect(rows[0]!.getAttribute('href')).toContain('code=CH-7004');
    // Coverage on every view, so a quiet feed is read against how much reported.
    expect(container.textContent).toMatch(/heard from 2 of 4 pages/i);
    for (const id of U) expect(container.textContent).not.toContain(id);
  });

  it('Pages lists the pages that reported, worst first, and names the silent ones', async () => {
    const { container } = await open({ v: 'pages' });
    const rows = [...container.querySelectorAll(`a[data-br="${BR.feed.pageRow}"]`)];
    expect(rows.map((r) => r.querySelector('.bs-chip')?.textContent)).toEqual(['P007', 'P013']);
    expect(rows[0]!.textContent).toContain('2 failures');
    expect(rows[1]!.textContent).toContain('No failures');
    expect(container.textContent).toContain('2 pages not heard from');
    expect(container.querySelector('.rl-silent-names')?.textContent).toBe('Shell · Practice');
  });

  it('Every error keeps the per-failure list, and an issue link filters it to one code', async () => {
    const { container } = await open({ v: 'errors', code: 'CH-7004' });
    expect(has(container, BR.feed.row)).toBe(true);
    expect(container.textContent).toContain('CH-7004');
  });

  it('an empty feed is a zero only for the pages that reported, and says which did not', async () => {
    mode = 'quiet';
    const { container } = await open();
    expect(container.querySelectorAll(`a[data-br="${BR.feed.issueRow}"]`)).toHaveLength(0);
    expect(container.textContent).toContain('2 of 4 pages sent any signal');
    expect(container.textContent).not.toMatch(/all clear/i);
  });
});
