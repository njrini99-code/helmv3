/**
 * The live lenses (PR 3: B01, B06 additions, B07, B08, B09, B10) render from the seeded store, carry their BR- codes,
 * and show "No signal yet" (BR-xx93) while the migration is held, never an error page.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import type { ReactElement } from 'react';
import { BR } from '@/lib/admin/clubhouse/br-codes';
import { fixtureGraph } from '@/lib/admin/clubhouse/__tests__/fixtures';
import { NOW, badDay, ev, session, LIVE_RELEASE, BASE_RELEASE, h } from '@/lib/admin/clubhouse/__tests__/fixtures-live';
import { categoryLookup, pipeStatus, runRules, type LiveRead } from '@/lib/admin/clubhouse/live-model';
import { pulseModel } from '@/lib/admin/clubhouse/pulse';
import { DEFAULT_SCOPE } from '@/lib/admin/clubhouse/screens';

type Mode = 'ok' | 'no-signal';
let mode: Mode = 'ok';
const livePipe = pipeStatus({ flagOn: true, state: 'ok', lastEnvelopeAt: new Date(NOW - 60_000).toISOString(), now: NOW, activeHours: true });
const read = <T,>(data: T, empty: T): LiveRead<T> => (mode === 'ok' ? { state: 'ok', data } : { state: 'no-signal', data: empty });

vi.mock('@/lib/admin/require-super-admin', () => ({ requireSuperAdmin: vi.fn(async () => ({ userId: 'admin-1' })) }));
vi.mock('@/lib/admin/clubhouse/graph-server', () => ({ loadBridgeGraph: () => fixtureGraph() }));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/admin/clubhouse/sessions',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/lib/admin/clubhouse/live', () => {
  const failed = session({ session_id: 'sess_fail0001', failure_count: 2 });
  const rows = [
    ...badDay().dayRows,
    h({ hoursAgo: 30, release: BASE_RELEASE, code: 'CH-1903', outcome: 'failure', signal_count: 4 }),
  ];
  return {
    readPipe: async () => (mode === 'ok' ? livePipe : pipeStatus({ flagOn: true, state: 'no-signal', lastEnvelopeAt: null, now: NOW, activeHours: true })),
    readSessions: async () => read([failed, session({ session_id: 'sess_okay0001' })], []),
    readSession: async () => read(failed, null),
    readSessionEvents: async () => read([ev({ session_id: 'sess_fail0001', seq: 1 }), ev({ session_id: 'sess_fail0001', seq: 2, kind: 'action', outcome: 'failure', code: 'CH-7004', server_code: '42501' })], []),
    readHourly: async () => read(rows, []),
    readDrift: async () => read([], []),
    readPeopleNames: async () => new Map([[failed.user_id, { name: 'Test Coach', email: null }]]),
    readTeamName: async () => 'Fixture team',
    readAdminBridgeRows: async () => read([], []),
    readSessionIdsForAction: async () => read(['sess_fail0001'], []),
  };
});

import SessionsIndex from '../sessions/page';
import SessionPage from '../sessions/[id]/page';
import ReleasesIndex from '../releases/page';
import ReleasePage from '../releases/[sha]/page';
import Experience from '../experience/page';
import PersonPage from '../people/[userId]/page';
import TeamPage from '../teams/[teamId]/page';
import { PulseBody } from '../_components/PulseBody';
import { TruthLine } from '../_components/frame';
import { ClubhouseBridgeFields } from '../../errors/_components/ClubhouseBridgePanel';

const USER = '11111111-1111-4111-8111-111111111111';
const TEAM = '66666666-7777-4888-9999-000000000000';

async function renderPage(el: Promise<ReactElement>) {
  return render(await el);
}
const has = (c: HTMLElement, code: string) => c.querySelector(`[data-br="${code}"]`) !== null;

beforeEach(() => {
  cleanup();
  mode = 'ok';
});

describe('live screens over the seeded store', () => {
  it('B07 lists sessions, failures first, as short ids, and opens a timeline with the name read live', async () => {
    const { container } = await renderPage(SessionsIndex({ searchParams: Promise.resolve({}) }));
    expect(has(container, BR.sessions.row)).toBe(true);
    expect(container.textContent).not.toContain('Test Coach');
    cleanup();
    // B04's "Sessions" (BR-0406): ?act= keeps the sessions whose kept events ran the action, and says so.
    const byAct = await renderPage(SessionsIndex({ searchParams: Promise.resolve({ act: 'act-p007-send-message' }) }));
    const rowLinks = [...byAct.container.querySelectorAll(`a[data-br="${BR.sessions.row}"]`)].map((a) => a.getAttribute('href'));
    expect(rowLinks.length).toBeGreaterThan(0);
    expect(rowLinks.every((h) => h?.startsWith('/admin/clubhouse/sessions/sess_fail0001'))).toBe(true);
    expect(byAct.container.textContent).toContain('Only sessions with a failure keep their events');
    expect(byAct.container.textContent).toContain('×');
    cleanup();
    const one = await renderPage(SessionPage({ params: Promise.resolve({ id: 'sess_fail0001' }), searchParams: Promise.resolve({}) }));
    for (const code of [BR.sessions.mark, BR.sessions.reproduce, BR.sessions.person, BR.sessions.idChip]) expect(has(one.container, code), code).toBe(true);
    expect(one.container.textContent).toContain('Test Coach');
  });
  it('B10 lists releases and diffs one against its base', async () => {
    const { container } = await renderPage(ReleasesIndex({ searchParams: Promise.resolve({}) }));
    expect(has(container, BR.releases.row)).toBe(true);
    cleanup();
    const one = await renderPage(ReleasePage({ params: Promise.resolve({ sha: LIVE_RELEASE }), searchParams: Promise.resolve({}) }));
    for (const code of [BR.releases.deltaRow, BR.releases.compareWith, BR.releases.pr, BR.releases.pack]) expect(has(one.container, code), code).toBe(true);
    // The regression pack is a link to the Duet desk now, not a pending control.
    expect(one.container.querySelector(`a[data-br="${BR.releases.pack}"]`)?.getAttribute('href')).toBe(`/admin/clubhouse/duet?t=${encodeURIComponent(`rel:${LIVE_RELEASE.toLowerCase()}`)}`);
  });
  it('B09 shows vitals as field data, and frustration per control', async () => {
    const { container } = await renderPage(Experience({ searchParams: Promise.resolve({}) }));
    expect(has(container, BR.experience.pageRow)).toBe(true);
    expect(container.textContent).toContain('Field data, from real users.');
    cleanup();
    const f = await renderPage(Experience({ searchParams: Promise.resolve({ view: 'frustration' }) }));
    expect(has(f.container, BR.experience.controlRow)).toBe(true);
  });
  it('B08 opens a person and a team', async () => {
    const p = await renderPage(PersonPage({ params: Promise.resolve({ userId: USER }), searchParams: Promise.resolve({}) }));
    for (const code of [BR.people.sessionRow, BR.people.codeRow, BR.people.account, BR.people.viewAs, BR.people.pack]) expect(has(p.container, code), code).toBe(true);
    expect(p.container.querySelector(`a[data-br="${BR.people.pack}"]`)?.getAttribute('href')).toBe(`/admin/clubhouse/duet?t=${encodeURIComponent(`user:${USER.toLowerCase()}`)}`);
    cleanup();
    const t = await renderPage(TeamPage({ params: Promise.resolve({ teamId: TEAM }), searchParams: Promise.resolve({}) }));
    expect(has(t.container, BR.people.sessionRow)).toBe(true);
    expect(t.container.querySelector(`a[data-br="${BR.people.pack}"]`)?.getAttribute('href')).toBe(`/admin/clubhouse/duet?t=${encodeURIComponent(`team:${TEAM.toLowerCase()}`)}`);
  });
  it('B01 Pulse names each rule hit, the page wall, slipping actions and the release', () => {
    const graph = fixtureGraph();
    const day = badDay();
    const alerts = runRules({ now: NOW, release: LIVE_RELEASE, ...day, pipe: livePipe, categoryOf: categoryLookup(graph) });
    const model = pulseModel({ graph, rows: day.dayRows, dayRows: day.dayRows, alerts, pipe: livePipe, release: LIVE_RELEASE });
    const { container } = render(<PulseBody model={model} graph={graph} scope={DEFAULT_SCOPE} live={{ w: '24h', pf: 'all' }} incidents={[]} />);
    for (const code of [BR.pulse.alertRow, BR.pulse.pageTile, BR.pulse.risingRow, BR.pulse.actionRow, BR.pulse.releaseCard]) expect(has(container, code), code).toBe(true);
  });
  it('the Pipe dot (BR-0106) in the truth line opens B11 at the pipe panel; every lens links its pipe there', () => {
    const graph = fixtureGraph();
    const pulse = render(<TruthLine graph={graph} scope={DEFAULT_SCOPE} noSignalCode={BR.pulse.noSignal} live={{ pipe: livePipe, scope: { w: '24h', pf: 'all' }, pipeCode: BR.pulse.pipeDot }} />);
    expect(pulse.container.querySelector(`a[data-br="${BR.pulse.pipeDot}"]`)?.getAttribute('href')).toBe('/admin/clubhouse/drift?pipe=1#pipe');
    cleanup();
    const quiet = pipeStatus({ flagOn: true, state: 'no-signal', lastEnvelopeAt: null, now: NOW, activeHours: true });
    const other = render(<TruthLine graph={graph} scope={DEFAULT_SCOPE} noSignalCode={BR.sessions.noSignal} live={{ pipe: quiet, scope: { w: '24h', pf: 'all' } }} />);
    const link = other.container.querySelector('a[href="/admin/clubhouse/drift?pipe=1#pipe"]');
    expect(link?.querySelector(`[data-br="${BR.sessions.noSignal}"]`)).not.toBeNull();
  });
  it('B06 shows an incident row\'s Clubhouse fields and links its session', () => {
    const { container } = render(
      <ClubhouseBridgeFields rows={[{ code: 'CH-7004', bridgeId: 70603, page: 'P007', action: 'ACT-P007-SEND-MESSAGE', control: null, release: LIVE_RELEASE, platform: 'ios-app', sessionId: 'sess_12345678', serverCode: '42501', origin: null }]} />,
    );
    expect(has(container, BR.incidents.idChip)).toBe(true);
    expect(has(container, BR.incidents.sessionLink)).toBe(true);
    expect(render(<ClubhouseBridgeFields rows={[]} />).container.innerHTML).toBe('');
  });
});

describe('while the migration is held', () => {
  it('every live screen says "No signal yet" (BR-xx93), never an error', async () => {
    mode = 'no-signal';
    const cases: Array<[Promise<ReactElement>, string]> = [
      [SessionsIndex({ searchParams: Promise.resolve({}) }), BR.sessions.noSignal],
      [SessionPage({ params: Promise.resolve({ id: 'sess_fail0001' }), searchParams: Promise.resolve({}) }), BR.sessions.noSignal],
      [ReleasesIndex({ searchParams: Promise.resolve({}) }), BR.releases.noSignal],
      [ReleasePage({ params: Promise.resolve({ sha: LIVE_RELEASE }), searchParams: Promise.resolve({}) }), BR.releases.noSignal],
      [Experience({ searchParams: Promise.resolve({}) }), BR.experience.noSignal],
      [PersonPage({ params: Promise.resolve({ userId: USER }), searchParams: Promise.resolve({}) }), BR.people.noSignal],
      [TeamPage({ params: Promise.resolve({ teamId: TEAM }), searchParams: Promise.resolve({}) }), BR.people.noSignal],
    ];
    for (const [el, code] of cases) {
      const { container } = await renderPage(el);
      expect(has(container, code), code).toBe(true);
      expect(container.textContent).toContain('No signal yet');
      cleanup();
    }
  });
});
