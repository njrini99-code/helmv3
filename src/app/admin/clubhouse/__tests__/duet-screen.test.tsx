/**
 * B13 Duet desk (plan §8, §9.1): builds a pack for a target, carries BR-1301..1308 and its states, keeps people
 * pseudonymous unless "Include names" is ticked (D7), and says "No signal yet" while admin_events has no Bridge
 * columns. The dossiers' "Context pack" controls (BR-0209, BR-0306, BR-0407, BR-0509) open it with their target.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import type { ReactElement } from 'react';
import type { BridgeGraph } from '@/lib/admin/clubhouse/graph';
import { BR } from '@/lib/admin/clubhouse/br-codes';
import { fixtureGraph } from '@/lib/admin/clubhouse/__tests__/fixtures';

let graph: BridgeGraph | null = null;
let eventsResult: { data: unknown; error: { code: string; message: string } | null } = {
  data: null,
  error: { code: '42703', message: 'column admin_events.bridge_id does not exist' },
};
const eqCalls: Array<[string, unknown]> = [];

vi.mock('@/lib/admin/require-super-admin', () => ({
  requireSuperAdmin: vi.fn(async () => ({ userId: 'admin-1' })),
}));
vi.mock('@/lib/admin/clubhouse/graph-server', () => ({
  loadBridgeGraph: () => graph,
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: () => ({
      select: () => ({
        eq: (col: string, value: unknown) => {
          eqCalls.push([col, value]);
          return { order: () => ({ limit: async () => eventsResult }) };
        },
      }),
    }),
  }),
}));
// The live lenses' read while the signal tables are held: the snapshot says no-signal, and the pack must too.
vi.mock('@/lib/admin/clubhouse/live', () => ({
  readLiveSnapshot: vi.fn(async () => ({ state: 'no-signal', truncated: false, errors: [], dayRows: [], baselineRows: [], failedSessions: [], failedEvents: [], alerts: [] })),
  readPeopleNames: vi.fn(async (ids: string[]) => new Map(ids.map((id) => [id, { name: 'Coach Name', email: 'coach@example.com' }]))),
  readTeamName: vi.fn(async () => 'Team Name'),
}));
// Pseudonyms are keyed (pseudonym.ts): a test key, so they print rather than read "withheld".
process.env.BRIDGE_PSEUDONYM_KEY = 'test-pseudonym-key-0123456789abcdefghij';
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/admin/clubhouse/duet',
  useSearchParams: () => new URLSearchParams(),
}));

import Duet from '../duet/page';
import DuetLoading from '../duet/loading';
import PageDossier from '../[page]/page';
import ControlDossier from '../controls/[ctl]/page';
import ActionDossier from '../actions/[act]/page';
import CodeDossier from '../codes/[bridgeId]/page';

const sp = (params: Record<string, string> = {}) => Promise.resolve(params);

async function show(element: Promise<ReactElement> | ReactElement) {
  return render(await element).container;
}

function codes(container: HTMLElement): Set<string> {
  return new Set([...container.querySelectorAll('[data-br]')].map((el) => el.getAttribute('data-br')!));
}

beforeEach(() => {
  cleanup();
  eqCalls.length = 0;
  graph = fixtureGraph();
  graph.controls = { 'CTL-P007-014': { page: 'P007', label: 'Send', actions: ['ACT-P007-SEND-MESSAGE'] } };
  eventsResult = { data: null, error: { code: '42703', message: 'column admin_events.bridge_id does not exist' } };
});

describe('B13 Duet desk', () => {
  it('with no target: the build box, the names tick, an empty queue and no signal', async () => {
    const c = await show(Duet({ searchParams: sp() }));
    const found = codes(c);
    for (const code of [BR.duet.build, BR.duet.names, BR.duet.empty, BR.duet.noSignal, BR.duet.copy]) expect(found).toContain(code);
    expect(c.textContent).toContain('What does Claude Duet need, in one paste?');
  });

  it('builds the pack for a code: row, copy, download, the pending queue controls, the paste', async () => {
    const c = await show(Duet({ searchParams: sp({ t: 'CH-7004' }) }));
    const found = codes(c);
    for (const code of [BR.duet.packRow, BR.duet.copy, BR.duet.download, BR.duet.markSent, BR.duet.verify, BR.duet.archive]) expect(found).toContain(code);
    expect(c.textContent).toContain('70603 · CH-7004');
    expect(c.textContent).toContain('bridge-pack/v1');
    expect(c.textContent).toContain('Pseudonymous ids only');
    expect(eqCalls).toEqual([['bridge_id', 70603]]);
    // The live evidence (counters, envelopes, sessions, release, rules) says No signal yet, naming the held migration.
    expect(c.textContent).toContain('No signal yet: counts by role, platform and release, first and last seen once the signal tables exist (held migration 20261124090000).');
    expect(c.textContent).toContain('Rules firing');
  });

  it('incidents read pseudonymous by default and with names (never emails) only when names are ticked', async () => {
    eventsResult = {
      data: [{ created_at: '2026-11-20T10:00:00Z', severity: 'error', title: 'Send failed', ch_code: 'CH-7004', bridge_id: 70603, release: 'abcdef123', platform: 'ios-app', session_id: 's1', fingerprint: 'fp1', user_id: 'user-uuid-1', user_email: 'coach@example.com', team_id: 'team-1' }],
      error: null,
    };
    const anon = await show(Duet({ searchParams: sp({ t: '70603' }) }));
    expect(anon.textContent).not.toContain('coach@example.com');
    expect(anon.textContent).not.toContain('user-uuid-1');
    expect(anon.textContent).toMatch(/u-[0-9a-f]{12}/);
    expect(anon.textContent).not.toContain('Coach Name');
    cleanup();
    const named = await show(Duet({ searchParams: sp({ t: '70603', names: '1' }) }));
    expect(named.textContent).toContain('Coach Name');
    expect(named.textContent).not.toContain('coach@example.com');
  });

  it('an unknown target is xx91 with what to type', async () => {
    const c = await show(Duet({ searchParams: sp({ t: 'P999' }) }));
    expect(codes(c)).toContain(BR.duet.empty);
    expect(c.textContent).toContain('Nothing to pack');
  });

  it('an unreadable graph is xx92; loading is xx90', async () => {
    graph = null;
    expect(codes(await show(Duet({ searchParams: sp() })))).toContain(BR.duet.failed);
    cleanup();
    expect(codes(await show(DuetLoading()))).toContain(BR.duet.loading);
  });
});

describe('Context pack on the dossiers opens B13 with the target', () => {
  const href = (c: HTMLElement, code: string) => c.querySelector(`[data-br="${code}"]`)?.getAttribute('href');

  it('B02, B03, B04 and B05', async () => {
    expect(href(await show(PageDossier({ params: Promise.resolve({ page: 'P007' }), searchParams: sp() })), BR.pages.pack)).toBe('/admin/clubhouse/duet?t=P007');
    cleanup();
    expect(href(await show(ControlDossier({ params: Promise.resolve({ ctl: 'CTL-P007-014' }), searchParams: sp() })), BR.controls.pack)).toBe(
      '/admin/clubhouse/duet?t=CTL-P007-014',
    );
    cleanup();
    expect(href(await show(ActionDossier({ params: Promise.resolve({ act: 'ACT-P007-SEND-MESSAGE' }), searchParams: sp() })), BR.actions.pack)).toBe(
      '/admin/clubhouse/duet?t=ACT-P007-SEND-MESSAGE',
    );
    cleanup();
    expect(href(await show(CodeDossier({ params: Promise.resolve({ bridgeId: '70603' }), searchParams: sp() })), BR.codes.pack)).toBe('/admin/clubhouse/duet?t=70603');
  });
});
