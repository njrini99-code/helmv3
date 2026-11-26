/**
 * B11 Drift (plan §8): renders from the graph, carries BR-1101..1104 and its states, and says "No signal yet" for the
 * runtime lists while clubhouse_drift is missing (held migration), never zero.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import type { ReactElement } from 'react';
import type { BridgeGraph } from '@/lib/admin/clubhouse/graph';
import { BR } from '@/lib/admin/clubhouse/br-codes';
import { fixtureGraph } from '@/lib/admin/clubhouse/__tests__/fixtures';

let graph: BridgeGraph | null = null;
let driftResult: { data: unknown; error: { code: string; message: string } | null } = {
  data: null,
  error: { code: '42P01', message: 'relation "public.clubhouse_drift" does not exist' },
};

vi.mock('@/lib/admin/require-super-admin', () => ({
  requireSuperAdmin: vi.fn(async () => ({ userId: 'admin-1' })),
}));
vi.mock('@/lib/admin/clubhouse/graph-server', () => ({
  loadBridgeGraph: () => graph,
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: () => ({
      select: () => ({ order: () => ({ limit: async () => driftResult }) }),
    }),
  }),
}));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/admin/clubhouse/drift',
  useSearchParams: () => new URLSearchParams(),
}));

import Drift from '../drift/page';
import DriftLoading from '../drift/loading';

const sp = (params: Record<string, string> = {}) => Promise.resolve(params);

async function show(element: Promise<ReactElement> | ReactElement) {
  return render(await element).container;
}

function codes(container: HTMLElement): Set<string> {
  return new Set([...container.querySelectorAll('[data-br]')].map((el) => el.getAttribute('data-br')!));
}

beforeEach(() => {
  cleanup();
  graph = fixtureGraph();
  graph.codeIndex = { 'CH-9999': ['src/clubhouse/screens/x.tsx'] };
  driftResult = { data: null, error: { code: '42P01', message: 'relation "public.clubhouse_drift" does not exist' } };
});

describe('B11 Drift', () => {
  it('lists the build drift with its tabs, rows, export and pipe panel', async () => {
    const c = await show(Drift({ searchParams: sp() }));
    const found = codes(c);
    for (const code of [BR.drift.listTab, BR.drift.row, BR.drift.export, BR.drift.pipePanel, BR.drift.noSignal]) expect(found).toContain(code);
    expect(c.textContent).toContain('CH-9999');
    expect(c.textContent).toContain('Are the docs still the truth?');
    // The pipe panel is the Pipe dot's anchor (BR-0106): closed by default, open with ?pipe=1.
    const panel = c.querySelector(`[data-br="${BR.drift.pipePanel}"]`);
    expect(panel?.id).toBe('pipe');
    expect(panel?.hasAttribute('open')).toBe(false);
    cleanup();
    const opened = await show(Drift({ searchParams: sp({ pipe: '1' }) }));
    expect(opened.querySelector('#pipe')?.hasAttribute('open')).toBe(true);
  });

  it('a runtime list says No signal yet while the table is missing, not zero', async () => {
    const c = await show(Drift({ searchParams: sp({ list: 'unknown-fired' }) }));
    expect(c.textContent).toContain('No signal yet');
    expect(codes(c)).not.toContain(BR.drift.empty);
  });

  it('a build list at zero is empty with its reason and the check that holds it', async () => {
    const c = await show(Drift({ searchParams: sp({ list: 'where' }) }));
    expect(codes(c)).toContain(BR.drift.empty);
    expect(c.textContent).toContain('Held at zero by clubhouse:check');
  });

  it('runtime rows count once the table exists', async () => {
    driftResult = {
      data: [{ kind: 'unknown-code', code: 'CH-4242', release: 'abcdef1', drift_count: 2, first_seen: '2026-11-20T10:00:00Z', last_seen: '2026-11-21T10:00:00Z' }],
      error: null,
    };
    const c = await show(Drift({ searchParams: sp({ list: 'unknown-fired' }) }));
    expect(c.textContent).toContain('CH-4242');
  });

  it('a failed read is xx92 with Try again', async () => {
    driftResult = { data: null, error: { code: '57014', message: 'statement timeout' } };
    const c = await show(Drift({ searchParams: sp({ list: 'reserved-fired' }) }));
    expect(codes(c)).toContain(BR.drift.failed);
    expect(c.textContent).toContain('Try again');
  });

  it('an unreadable graph is xx92; loading is xx90', async () => {
    graph = null;
    expect(codes(await show(Drift({ searchParams: sp() })))).toContain(BR.drift.failed);
    cleanup();
    expect(codes(await show(DriftLoading()))).toContain(BR.drift.loading);
  });
});
