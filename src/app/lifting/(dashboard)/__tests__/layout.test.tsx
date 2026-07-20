// =============================================================================
// LiftingDashboardLayout — athlete-self admission regression test.
//
// Before the fix, a plain player with only a helm_lifting_athletes row (no
// helm_lifting_coaches / helm_lifting_org_viewers row) was always redirected
// to /lifting/login, so the entire /lifting/dashboard/** route tree —
// including the athlete-facing session execution page — was unreachable.
// This test proves the layout now admits them (view-only, never full edit).
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

const authUser = { id: 'user-1', email: 'athlete@example.com' };

const { redirectMock } = vi.hoisted(() => ({
  redirectMock: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));
vi.mock('next/navigation', () => ({
  redirect: redirectMock,
}));

let getUserResult: { data: { user: typeof authUser | null } };
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => getUserResult) },
  })),
}));

let coachRowResult: Record<string, unknown> | null;
let viewerRows: Array<{ id: string }>;
let athleteRows: Array<{ id: string }>;

function makeChain(opts: { single?: unknown; array?: unknown[] }) {
  const chain: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'limit', 'in']) {
    chain[method] = vi.fn(() => chain);
  }
  chain.maybeSingle = vi.fn(async () => ({ data: opts.single ?? null, error: null }));
  chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve({ data: opts.array ?? [], error: null }).then(resolve, reject);
  return chain;
}

vi.mock('@/lib/supabase/untyped', () => ({
  fromUntyped: vi.fn((_supabase: unknown, table: string) => {
    if (table === 'helm_lifting_coaches') return makeChain({ single: coachRowResult });
    if (table === 'helm_lifting_org_viewers') return makeChain({ array: viewerRows });
    if (table === 'helm_lifting_athletes') return makeChain({ array: athleteRows });
    throw new Error(`unexpected table in test: ${table}`);
  }),
}));

// LabShell is a 'use client' component with its own internal state/effects —
// stub it so this test only asserts what the SERVER layout resolves and
// passes down (coachRow / isViewOnly), not LabShell's own rendering.
vi.mock('@/components/lifting/shell/LabShell', () => ({
  LabShell: (props: Record<string, unknown>) => props,
}));

import LiftingDashboardLayout from '../layout';
import { LabShell } from '@/components/lifting/shell/LabShell';
import { SessionActivityProvider } from '@/components/providers/SessionActivityProvider';

// The layout wraps every admitted branch in SessionActivityProvider (idle
// tracking — 2026-07-20 idle-bounce fix); unwrap it to reach the LabShell.
function unwrapShell(element: { type: unknown; props: Record<string, unknown> }) {
  expect(element.type).toBe(SessionActivityProvider);
  return element.props.children as { type: unknown; props: Record<string, unknown> };
}

describe('LiftingDashboardLayout — athlete-self admission', () => {
  beforeEach(() => {
    redirectMock.mockClear();
    getUserResult = { data: { user: authUser } };
    coachRowResult = null;
    viewerRows = [];
    athleteRows = [];
  });

  it('admits a plain player (athlete-self row, no coach/viewer row) as VIEW-ONLY instead of redirecting to login', async () => {
    athleteRows = [{ id: 'athlete-1' }];

    const element = await LiftingDashboardLayout({ children: 'child-content' });

    expect(redirectMock).not.toHaveBeenCalled();
    const shell = unwrapShell(element);
    expect(shell.type).toBe(LabShell);
    expect(shell.props).toMatchObject({ coachRow: null, isViewOnly: true });
  });

  it('still redirects to login when the user has no coach, viewer, or athlete row (regression guard)', async () => {
    await expect(LiftingDashboardLayout({ children: 'child-content' })).rejects.toThrow(
      'REDIRECT:/lifting/login',
    );
  });

  it('redirects unauthenticated users to login without querying athlete rows', async () => {
    getUserResult = { data: { user: null } };

    await expect(LiftingDashboardLayout({ children: 'child-content' })).rejects.toThrow(
      'REDIRECT:/lifting/login',
    );
  });

  it('coach admission still takes priority (full shell, not view-only) over the athlete-self branch', async () => {
    coachRowResult = { id: 'coach-1', full_name: 'Coach Rini' };
    athleteRows = [{ id: 'athlete-1' }];

    const element = await LiftingDashboardLayout({ children: 'child-content' });

    const shell = unwrapShell(element);
    expect(shell.type).toBe(LabShell);
    expect(shell.props).toMatchObject({ isViewOnly: false });
    expect((shell.props as { coachRow: unknown }).coachRow).toEqual(coachRowResult);
  });
});
