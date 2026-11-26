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
// The queue's reads: open notes (bridge_notes) and the hourly counters that decide fixed or regressed.
const live = vi.hoisted(() => ({
  notes: { state: 'ok', data: { expected: new Map(), watched: new Map(), packs: [] as unknown[] } } as { state: string; data: { expected: Map<string, unknown>; watched: Map<string, unknown>; packs: unknown[] }; error?: string },
  verdict: { state: 'ok', data: { status: 'waiting', release: null, firing: 0 } } as { state: string; data: { status: string; release: string | null; firing: number }; error?: string },
}));

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
  readNotes: vi.fn(async () => live.notes),
  readPackVerdict: vi.fn(async () => live.verdict),
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
  live.notes = { state: 'ok', data: { expected: new Map(), watched: new Map(), packs: [] } };
  live.verdict = { state: 'ok', data: { status: 'waiting', release: null, firing: 0 } };
});

const packNote = (body: string, created_at = '2026-11-20T10:30:00.000Z') => ({
  id: '00000000-0000-4000-8000-000000000001',
  kind: 'pack',
  code: 'CH-7004',
  bridge_id: 70603,
  page_id: 'P007',
  body,
  created_at,
  created_by: 'admin-1',
  resolved_at: null,
});


describe('B13 Duet desk', () => {
  it('with no target: the build box, the names tick and an empty queue', async () => {
    const c = await show(Duet({ searchParams: sp() }));
    const found = codes(c);
    for (const code of [BR.duet.build, BR.duet.names, BR.duet.empty, BR.duet.copy]) expect(found).toContain(code);
    expect(c.textContent).toContain('What does Claude Duet need, in one paste?');
  });

  it('builds the pack for a code: row, copy, download, Mark sent, the paste', async () => {
    const c = await show(Duet({ searchParams: sp({ t: 'CH-7004' }) }));
    const found = codes(c);
    for (const code of [BR.duet.packRow, BR.duet.copy, BR.duet.download, BR.duet.markSent]) expect(found).toContain(code);
    // Not sent yet: nothing to verify or archive.
    expect(found).not.toContain(BR.duet.archive);
    expect(c.textContent).toContain('new · not sent');
    expect(c.querySelector(`button[data-br="${BR.duet.markSent}"]`)?.hasAttribute('disabled')).toBe(false);
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

  it('a sent pack is on the queue: waiting until the next release, then fixed or regressed, with Verify and Archive', async () => {
    live.notes = { state: 'ok', data: { expected: new Map(), watched: new Map(), packs: [packNote('70603')] } };
    let c = await show(Duet({ searchParams: sp() }));
    expect(c.textContent).toContain('sent · waiting for a release');
    expect(c.querySelector(`button[data-br="${BR.duet.verify}"]`)?.hasAttribute('disabled')).toBe(true);
    expect(codes(c)).toContain(BR.duet.archive);
    cleanup();

    // The release that decides it is named, and Verify opens B10 there.
    live.verdict = { state: 'ok', data: { status: 'fixed', release: 'bbbbbbb2', firing: 0 } };
    c = await show(Duet({ searchParams: sp() }));
    expect(c.textContent).toContain('fixed in the next release');
    expect(c.querySelector(`a[data-br="${BR.duet.verify}"]`)?.getAttribute('href')).toBe('/admin/clubhouse/releases/bbbbbbb2');
    cleanup();

    live.verdict = { state: 'ok', data: { status: 'regressed', release: 'bbbbbbb2', firing: 3 } };
    c = await show(Duet({ searchParams: sp({ t: '70603' }) }));
    expect(c.textContent).toContain('still firing in the next release');
    // The preview of a queued pack shows its status, Verify and Archive instead of Mark sent.
    expect(c.textContent).not.toContain('new · not sent');
    expect(codes(c)).not.toContain(BR.duet.markSent);
  });

  it("a person's pack is never kept on the queue (D7)", async () => {
    const c = await show(Duet({ searchParams: sp({ t: 'user:11111111-2222-4333-8444-555555555555' }) }));
    const sent = c.querySelector(`button[data-br="${BR.duet.markSent}"]`);
    expect(sent?.hasAttribute('disabled')).toBe(true);
    expect(sent?.getAttribute('title')).toContain('D7');
  });

  it("counters that can't be read say so, and the pack can't be decided", async () => {
    live.notes = { state: 'ok', data: { expected: new Map(), watched: new Map(), packs: [packNote('70603')] } };
    live.verdict = { state: 'error', data: { status: 'undecided', release: null, firing: 0 }, error: 'boom' };
    const c = await show(Duet({ searchParams: sp() }));
    expect(c.textContent).toContain("can't decide yet");
    expect(codes(c)).toContain(BR.duet.failed);
  });

  it('an unreadable queue says so', async () => {
    live.notes = { state: 'error', data: { expected: new Map(), watched: new Map(), packs: [] }, error: 'boom' };
    const c = await show(Duet({ searchParams: sp({ t: '70603' }) }));
    expect(codes(c)).toContain(BR.duet.failed);
    expect(c.querySelector(`button[data-br="${BR.duet.markSent}"]`)?.hasAttribute('disabled')).toBe(true);
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

  it("B04's failure reasons open Incidents narrowed to their code (BR-0405); a success outcome is not one", async () => {
    const c = await show(ActionDossier({ params: Promise.resolve({ act: 'ACT-P007-SEND-MESSAGE' }), searchParams: sp() }));
    const reasons = [...c.querySelectorAll(`a[data-br="${BR.actions.failureReason}"]`)].map((a) => a.getAttribute('href'));
    expect(reasons).toEqual(['/admin/errors?ch=CH-7004&kind=all']);
  });
});

describe('B05 Mark expected and Watch', () => {
  const dossier = () => show(CodeDossier({ params: Promise.resolve({ bridgeId: '70603' }), searchParams: sp() }));

  it('not marked: Mark expected… opens a reason form; Watch starts a watch', async () => {
    const c = await dossier();
    expect(c.querySelector(`summary[data-br="${BR.codes.markExpected}"]`)?.textContent).toBe('Mark expected…');
    expect(c.querySelector('textarea[name="reason"]')?.hasAttribute('required')).toBe(true);
    const watch = c.querySelector(`button[data-br="${BR.codes.watch}"]`);
    expect(watch?.textContent).toContain('Watch');
    expect(watch?.getAttribute('aria-pressed')).toBe('false');
  });

  it('marked and watched: the reason, who and when, Unmark, and Watching · stop', async () => {
    const mark = { ...packNote(''), id: 'e1', kind: 'expected', body: 'Coaches without a roster see this on purpose.' };
    const watching = { ...packNote(''), id: 'w1', kind: 'watch' };
    live.notes = { state: 'ok', data: { expected: new Map([['CH-7004', mark]]), watched: new Map([['CH-7004', watching]]), packs: [] } };
    const c = await dossier();
    expect(c.textContent).toContain('Coaches without a roster see this on purpose.');
    expect(c.textContent).toContain('Marked expected by Coach Name');
    expect(c.querySelector(`button[data-br="${BR.codes.markExpected}"]`)?.textContent).toBe('Unmark expected');
    expect(c.querySelector(`button[data-br="${BR.codes.watch}"]`)?.getAttribute('aria-pressed')).toBe('true');
    expect(c.textContent).toContain('marked expected');
  });

  it('unreadable notes keep both controls, disabled, saying why', async () => {
    live.notes = { state: 'error', data: { expected: new Map(), watched: new Map(), packs: [] }, error: 'boom' };
    const c = await dossier();
    for (const code of [BR.codes.markExpected, BR.codes.watch]) expect(c.querySelector(`button[data-br="${code}"]`)?.hasAttribute('disabled'), code).toBe(true);
  });
});
