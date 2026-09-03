/**
 * Deliverable 6 (Sentry max-observability, Phase C) — helm.workflow.* via
 * recordWorkflow, sport/action dimensions ONLY. Mirrors
 * with-golf-action.test.ts's and with-baseball-action-observability.test.ts's
 * own "helm.workflow.* metric" describe blocks.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  recordWorkflow: vi.fn(),
}));
vi.mock('@/lib/observability/metrics', () => ({ recordWorkflow: mocks.recordWorkflow }));

const authUser = { id: 'user-1', email: 'coach@example.com' };

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: authUser } })) },
  })),
}));

let coachRowResult: Record<string, unknown> | null = { id: 'coach-1', organization_id: 'org-1' };

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
    if (table === 'helm_lifting_org_viewers') return makeChain({ array: [] });
    if (table === 'helm_lifting_athletes') return makeChain({ single: null });
    throw new Error(`unexpected table in test: ${table}`);
  }),
}));

vi.mock('@/lib/server-error-logger', () => ({
  logServerEvent: vi.fn(async () => undefined),
  logServerException: vi.fn(async () => undefined),
}));

vi.mock('@sentry/nextjs', () => ({
  withScope: (fn: (scope: unknown) => unknown) =>
    fn({ setTag: vi.fn(), setUser: vi.fn(), addBreadcrumb: vi.fn() }),
}));

import { withLiftingAction } from '../with-lifting-action';

const ORG_ID = 'org-1';

beforeEach(() => {
  vi.clearAllMocks();
  coachRowResult = { id: 'coach-1', organization_id: ORG_ID };
});

describe('withLiftingAction — helm.workflow.* metric', () => {
  it('records outcome:"success" with sport/action dimensions when fn resolves', async () => {
    const action = withLiftingAction(
      'testLiftingAction',
      { featureArea: 'lifting-test', orgFrom: () => ORG_ID },
      async () => ({ ran: true }),
    );

    await action();

    expect(mocks.recordWorkflow).toHaveBeenCalledTimes(1);
    expect(mocks.recordWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'testLiftingAction',
        outcome: 'success',
        sport: 'lifting',
        durationMs: expect.any(Number),
      }),
    );
  });

  it('records outcome:"failure" for an unexpected throw inside the action body', async () => {
    const action = withLiftingAction(
      'testLiftingAction',
      { featureArea: 'lifting-test', orgFrom: () => ORG_ID },
      async () => {
        throw new Error('write failed');
      },
    );

    await expect(action()).rejects.toMatchObject({ name: 'LiftingActionError' });

    expect(mocks.recordWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'testLiftingAction', outcome: 'failure' }),
    );
  });

  it('records the specific expected-error class name (not a flat "failure") for a forbidden edit gate', async () => {
    const action = withLiftingAction(
      'testLiftingAction',
      { featureArea: 'lifting-test', requireEdit: true, orgFrom: () => ORG_ID },
      async () => ({ ran: true }),
    );
    // A coach IS granted edit access in this scaffold, so force the forbidden
    // path by clearing every access row (no coach/viewer/athlete match).
    coachRowResult = null;

    await expect(action()).rejects.toMatchObject({ name: 'LiftingForbiddenError' });

    expect(mocks.recordWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'LiftingForbiddenError' }),
    );
  });

  it('never carries an orgId dimension — sport/action only', async () => {
    const action = withLiftingAction(
      'testLiftingAction',
      { featureArea: 'lifting-test', orgFrom: () => ORG_ID },
      async () => ({ ran: true }),
    );

    await action();

    const call = mocks.recordWorkflow.mock.calls[0]![0] as Record<string, unknown>;
    expect(call).not.toHaveProperty('orgId');
    expect(call).not.toHaveProperty('teamId');
  });
});
