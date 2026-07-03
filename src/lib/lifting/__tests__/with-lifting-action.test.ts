// =============================================================================
// withLiftingAction — athlete-self gate, end-to-end wiring.
//
// Proves the fix in resolveLiftingAccess actually reaches server actions
// wrapped with withLiftingAction: a plain player (athlete-self, no coach/
// viewer row) can now run requireEdit:false actions (e.g. submitReadyToGo,
// getPlayerSorenessToday) but is still correctly Forbidden from
// requireEdit:true actions. The underlying tables are mocked (not
// resolveLiftingAccess itself) so this exercises the real wiring.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

const authUser = { id: 'user-1', email: 'athlete@example.com' };

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: authUser } })) },
  })),
}));

let coachRowResult: Record<string, unknown> | null;
let viewerRows: Array<{ can_edit: boolean }>;
let athleteRowResult: { id: string } | null;

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
    if (table === 'helm_lifting_coaches') return makeChain({ single: coachRowResult, array: coachRowResult ? [coachRowResult] : [] });
    if (table === 'helm_lifting_coach_assignments') return makeChain({ array: [] });
    if (table === 'helm_lifting_org_viewers') return makeChain({ array: viewerRows });
    if (table === 'helm_lifting_athletes') return makeChain({ single: athleteRowResult });
    throw new Error(`unexpected table in test: ${table}`);
  }),
}));

vi.mock('@/lib/server-error-logger', () => ({
  logServerException: vi.fn(async () => undefined),
}));

vi.mock('@sentry/nextjs', () => ({
  withScope: (fn: (scope: unknown) => unknown) =>
    fn({ setTag: vi.fn(), setUser: vi.fn(), addBreadcrumb: vi.fn() }),
}));

import { withLiftingAction } from '../with-lifting-action';

const ORG_ID = 'org-1';

function makeAction(requireEdit: boolean) {
  return withLiftingAction(
    'testLiftingAction',
    {
      featureArea: 'lifting-test',
      requireEdit,
      orgFrom: () => ORG_ID,
    },
    async (ctx) => ({ ran: true, athleteId: ctx.access.athleteId, canEdit: ctx.access.canEdit }),
  );
}

describe('withLiftingAction — athlete-self gate wiring', () => {
  beforeEach(() => {
    coachRowResult = null;
    viewerRows = [];
    athleteRowResult = null;
  });

  it('ALLOWS an athlete-self caller through a requireEdit:false action (e.g. submitReadyToGo)', async () => {
    athleteRowResult = { id: 'athlete-1' };
    const action = makeAction(false);

    await expect(action()).resolves.toEqual({
      ran: true,
      athleteId: 'athlete-1',
      canEdit: false,
    });
  });

  it('DENIES an athlete-self caller from a requireEdit:true action (never grants canEdit)', async () => {
    athleteRowResult = { id: 'athlete-1' };
    const action = makeAction(true);

    await expect(action()).rejects.toMatchObject({
      name: 'LiftingForbiddenError',
      status: 403,
    });
  });

  it('DENIES a caller with no coach/viewer/athlete row from any action (regression guard)', async () => {
    const action = makeAction(false);

    await expect(action()).rejects.toMatchObject({
      name: 'LiftingForbiddenError',
      status: 403,
    });
  });

  it('ALLOWS a coach through both requireEdit:false and requireEdit:true actions', async () => {
    coachRowResult = { id: 'coach-1', organization_id: ORG_ID, full_name: 'Coach Rini' };

    await expect(makeAction(false)()).resolves.toMatchObject({ ran: true, canEdit: true });
    await expect(makeAction(true)()).resolves.toMatchObject({ ran: true, canEdit: true });
  });
});
