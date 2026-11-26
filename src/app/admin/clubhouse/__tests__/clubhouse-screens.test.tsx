/**
 * B02-B05 and B12 (plan §8): every screen renders from the graph alone, carries its BR- codes as `data-br` (owner
 * decision D4), and shows its four states: loading (xx90), empty (xx91), failed (xx92), no signal yet (xx93).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import type { ReactElement } from 'react';
import type { BridgeGraph } from '@/lib/admin/clubhouse/graph';
import { BR } from '@/lib/admin/clubhouse/br-codes';
import { fixtureGraph } from '@/lib/admin/clubhouse/__tests__/fixtures';

let graph: BridgeGraph | null = null;

vi.mock('@/lib/admin/require-super-admin', () => ({
  requireSuperAdmin: vi.fn(async () => ({ userId: 'admin-1' })),
}));
vi.mock('@/lib/admin/clubhouse/graph-server', () => ({
  loadBridgeGraph: () => graph,
}));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  },
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/admin/clubhouse',
  useSearchParams: () => new URLSearchParams(),
}));

import PagesIndex from '../page';
import PageDossier from '../[page]/page';
import ControlsIndex from '../controls/page';
import ControlDossier from '../controls/[ctl]/page';
import ActionsIndex from '../actions/page';
import ActionDossier from '../actions/[act]/page';
import CodesIndex from '../codes/page';
import CodeDossier from '../codes/[bridgeId]/page';
import Readiness from '../readiness/page';
import PagesLoading from '../loading';
import ControlsLoading from '../controls/loading';
import ActionsLoading from '../actions/loading';
import CodesLoading from '../codes/loading';
import ReadinessLoading from '../readiness/loading';

function richGraph(): BridgeGraph {
  const g = fixtureGraph();
  g.pages.P007 = {
    ...g.pages.P007!,
    roles: ['coach', 'player'],
    routes: ['/golf/dashboard/messages'],
    gates: { design: 'approved', implementation: 'in_progress', contract: 'complete', bridge: 'reserved', data: 'existing', verification: 'partial', docs: 'current' },
    docs: { CONTRACT: 'docs/clubhouse/pages/P007-messages/CONTRACT.md', CHANGELOG: 'docs/clubhouse/pages/P007-messages/CHANGELOG.md' },
    catalog: 'docs/clubhouse/catalog/messages.md',
    held: [{ plan: 'docs/clubhouse/held/features/conversation-files.md', status: 'HELD', migration: null }],
    screens: [{ route: '/golf/dashboard/messages', audience: 'shared', name: 'Messages' }],
  };
  g.actions['ACT-P007-SEND-MESSAGE']!.component = 'src/clubhouse/screens/messages/Composer.tsx#Composer';
  g.controls = {
    'CTL-P007-014': { page: 'P007', label: 'Send', role: 'both', viewport: 'both', actions: ['ACT-P007-SEND-MESSAGE'], verdict: 'works', board: 'Messages · composer', file: 'src/clubhouse/screens/messages/Composer.tsx:120' },
  };
  g.findings = {
    'F-0001': { page: 'P007', screen: 'Thread', severity: 'S1', dimension: 'correctness', standard: 'CO-01', title: 'Sends twice', repro: ['Tap send twice'], fix: 'Debounce', files: ['src/a.tsx:1'], tier: 'W', audit: '2026-11-13', status: 'open' },
  };
  g.numberChecks = { P007: [{ shown: '"3 unread"', expected: '3', verdict: 'Right', query: 'select 1', audit: '2026-11-13' }] };
  return g;
}

const sp = (params: Record<string, string> = {}) => Promise.resolve(params);

async function show(element: Promise<ReactElement> | ReactElement) {
  return render(await element).container;
}

function codes(container: HTMLElement): Set<string> {
  return new Set([...container.querySelectorAll('[data-br]')].map((el) => el.getAttribute('data-br')!));
}

function expectCodes(container: HTMLElement, expected: string[]) {
  const found = codes(container);
  for (const code of expected) expect(found, `missing ${code}`).toContain(code);
}

beforeEach(() => {
  cleanup();
  graph = richGraph();
});

describe('B02 Pages', () => {
  it('the index lists every page with its row, sort, copy, scope bar and no-signal codes', async () => {
    const c = await show(PagesIndex({ searchParams: sp() }));
    expectCodes(c, [BR.pages.row, BR.pages.sort, BR.pages.copy, BR.pages.noSignal, BR.shell.scopeBar]);
    expect(c.textContent).toContain('P007');
    expect(c.textContent).toContain('No signal yet');
  });

  it('the index is empty, with a reason, when no page serves the scoped role', async () => {
    graph!.pages = { P007: { ...graph!.pages.P007!, roles: ['coach'], screens: [] } };
    const c = await show(PagesIndex({ searchParams: sp({ role: 'signed-out' }) }));
    expectCodes(c, [BR.pages.empty]);
  });

  it('the dossier overview carries the view rail, Force this state, pack and copy', async () => {
    const c = await show(PageDossier({ params: Promise.resolve({ page: 'P007' }), searchParams: sp() }));
    expectCodes(c, [BR.pages.viewRail, BR.pages.forceState, BR.pages.pack, BR.pages.copy, BR.pages.noSignal]);
    const force = c.querySelector(`[data-br="${BR.pages.forceState}"]`)!;
    // Vitest is not production, where the preview app is served: a real link (D6).
    expect(force.getAttribute('href')).toBe('/clubhouse-preview/messages');
  });

  it('the States view draws the matrix: cells, category labels and the Show filter', async () => {
    const c = await show(PageDossier({ params: Promise.resolve({ page: 'p007' }), searchParams: sp({ view: 'states' }) }));
    expectCodes(c, [BR.pages.matrixCell, BR.pages.categoryLabel, BR.pages.show]);
    const cell = c.querySelector(`[data-br="${BR.pages.matrixCell}"][href^="/admin/clubhouse/codes/70603"]`);
    expect(cell?.getAttribute('aria-label')).toContain('Sending a message throws');
  });

  it('the Contract view links the documents; Controls says none are numbered', async () => {
    const contract = await show(PageDossier({ params: Promise.resolve({ page: 'P007' }), searchParams: sp({ view: 'contract' }) }));
    expectCodes(contract, [BR.pages.docLink]);
    cleanup();
    graph!.controls = {};
    const controls = await show(PageDossier({ params: Promise.resolve({ page: 'P007' }), searchParams: sp({ view: 'controls' }) }));
    expectCodes(controls, [BR.pages.empty]);
    expect(controls.textContent).toContain('No controls numbered yet');
  });

  it('an unknown page is a 404', async () => {
    await expect(PageDossier({ params: Promise.resolve({ page: 'P999' }), searchParams: sp() })).rejects.toThrow('NEXT_NOT_FOUND');
  });
});

describe('B03 Controls', () => {
  it('says "No controls numbered yet" while the ledger is empty', async () => {
    graph!.controls = {};
    const c = await show(ControlsIndex({ searchParams: sp() }));
    expectCodes(c, [BR.controls.empty, BR.controls.copy]);
    expect(c.textContent).toContain('No controls numbered yet');
  });

  it('lists numbered controls with their filters, action chips and no-signal columns', async () => {
    const c = await show(ControlsIndex({ searchParams: sp() }));
    expectCodes(c, [BR.controls.row, BR.controls.filter, BR.controls.actionChip, BR.controls.noSignal]);
  });

  it('the dossier links the code, the board note and the pack', async () => {
    const c = await show(ControlDossier({ params: Promise.resolve({ ctl: 'CTL-P007-014' }), searchParams: sp() }));
    expectCodes(c, [BR.controls.codeLink, BR.controls.boardNote, BR.controls.pack, BR.controls.copy, BR.controls.noSignal]);
    expect(c.querySelector(`[data-br="${BR.controls.codeLink}"]`)?.getAttribute('href')).toMatch(/Composer\.tsx#L120$/);
  });
});

describe('B04 Actions', () => {
  it('lists actions with sort, outcome chips, copy and no-signal codes', async () => {
    const c = await show(ActionsIndex({ searchParams: sp() }));
    expectCodes(c, [BR.actions.row, BR.actions.sort, BR.actions.funnelSegment, BR.actions.copy, BR.actions.noSignal]);
  });

  it('is empty, with a reason, for a page with no actions', async () => {
    const c = await show(ActionsIndex({ searchParams: sp({ page: 'P001' }) }));
    expectCodes(c, [BR.actions.empty]);
  });

  it('the dossier shows outcomes, wiring, failure reasons, sessions and the pack', async () => {
    const c = await show(ActionDossier({ params: Promise.resolve({ act: 'ACT-P007-SEND-MESSAGE' }), searchParams: sp() }));
    expectCodes(c, [
      BR.actions.funnelSegment,
      BR.actions.wiringLink,
      BR.actions.failureReason,
      BR.actions.sessions,
      BR.actions.pack,
      BR.actions.copy,
      BR.actions.noSignal,
    ]);
  });
});

describe('B05 Codes', () => {
  it('the explorer has rows, search, filters, copy and no-signal codes', async () => {
    const c = await show(CodesIndex({ searchParams: sp() }));
    expectCodes(c, [BR.codes.row, BR.codes.search, BR.codes.filters, BR.codes.copy, BR.codes.noSignal]);
  });

  it('a search with no match is empty, with what to try', async () => {
    const c = await show(CodesIndex({ searchParams: sp({ q: 'zzz-nothing' }) }));
    expectCodes(c, [BR.codes.empty]);
  });

  it('the dossier carries Force this state, Mark expected, Watch, pack and copy', async () => {
    const c = await show(CodeDossier({ params: Promise.resolve({ bridgeId: '70603' }), searchParams: sp() }));
    expectCodes(c, [BR.codes.forceState, BR.codes.markExpected, BR.codes.watch, BR.codes.pack, BR.codes.copy, BR.codes.noSignal]);
    expect(c.textContent).toContain('ACT-P007-SEND-MESSAGE');
  });

  it('a CH code redirects to its Bridge ID, keeping the scope', async () => {
    await expect(
      CodeDossier({ params: Promise.resolve({ bridgeId: 'CH-7004' }), searchParams: sp({ role: 'coach' }) }),
    ).rejects.toThrow('NEXT_REDIRECT /admin/clubhouse/codes/70603?role=coach');
  });

  it('a retired ID names its successor; an unknown one is a 404', async () => {
    const c = await show(CodeDossier({ params: Promise.resolve({ bridgeId: '70602' }), searchParams: sp() }));
    expect(c.textContent).toContain('Retired on 2026-11-01');
    expect(c.querySelector('a[href="/admin/clubhouse/codes/70603"]')).not.toBeNull();
    await expect(CodeDossier({ params: Promise.resolve({ bridgeId: '1' }), searchParams: sp() })).rejects.toThrow('NEXT_NOT_FOUND');
  });
});

describe('B12 Readiness', () => {
  it('the grid has page rows, gate cells, held plans, migrations, the view rail and copy', async () => {
    const c = await show(Readiness({ searchParams: sp() }));
    expectCodes(c, [
      BR.readiness.pageRow,
      BR.readiness.gateCell,
      BR.readiness.heldPlan,
      BR.readiness.migration,
      BR.readiness.viewRail,
      BR.readiness.copy,
      BR.readiness.noSignal,
    ]);
  });

  it('the Findings view opens each finding and offers its pack', async () => {
    const c = await show(Readiness({ searchParams: sp({ view: 'findings' }) }));
    expectCodes(c, [BR.readiness.findingRow, BR.readiness.findingPack]);
    expect(c.querySelector(`a[data-br="${BR.readiness.findingPack}"]`)?.getAttribute('href')).toMatch(/^\/admin\/clubhouse\/duet\?t=F-\d{4}$/);
    expect(c.textContent).toContain('Tap send twice');
  });

  it('the Number truth view lists each check; an empty scope says so', async () => {
    const numbers = await show(Readiness({ searchParams: sp({ view: 'numbers' }) }));
    expectCodes(numbers, [BR.readiness.numberCheck]);
    cleanup();
    const empty = await show(Readiness({ searchParams: sp({ view: 'findings', page: 'P001' }) }));
    expectCodes(empty, [BR.readiness.empty]);
  });
});

describe('the four states every screen shares', () => {
  it('xx92: each screen says the contract could not be read, with Try again', async () => {
    graph = null;
    const screens: Array<[Promise<ReactElement>, string]> = [
      [PagesIndex({ searchParams: sp() }), BR.pages.failed],
      [PageDossier({ params: Promise.resolve({ page: 'P007' }), searchParams: sp() }), BR.pages.failed],
      [ControlsIndex({ searchParams: sp() }), BR.controls.failed],
      [ActionsIndex({ searchParams: sp() }), BR.actions.failed],
      [CodesIndex({ searchParams: sp() }), BR.codes.failed],
      [Readiness({ searchParams: sp() }), BR.readiness.failed],
    ];
    for (const [element, code] of screens) {
      const c = await show(element);
      expectCodes(c, [code]);
      expect(c.textContent).toContain('Try again');
      cleanup();
    }
  });

  it('xx90: each screen has a loading shape', () => {
    const loaders: Array<[() => ReactElement, string]> = [
      [PagesLoading, BR.pages.loading],
      [ControlsLoading, BR.controls.loading],
      [ActionsLoading, BR.actions.loading],
      [CodesLoading, BR.codes.loading],
      [ReadinessLoading, BR.readiness.loading],
    ];
    for (const [Loader, code] of loaders) {
      const { container } = render(<Loader />);
      expectCodes(container, [code]);
      cleanup();
    }
  });
});
