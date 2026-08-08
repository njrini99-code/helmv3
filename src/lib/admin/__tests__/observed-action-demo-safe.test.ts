import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * The shared-demo write guard, at the wrapper.
 *
 * Every prospect entering the public golf demo signs into the SAME Supabase
 * account, so an unguarded mutation is visible to — and wrecks the tour for —
 * every other concurrent visitor, and edits the owner's own team (the demo
 * coach and the owner share one organization and one team).
 *
 * What these pin, in order of what would actually hurt:
 *   1. a demoSafe action is REFUSED for the demo account, and the impl never
 *      runs — a guard that throws after the write is no guard;
 *   2. a real coach is UNAFFECTED, including when the session cannot be
 *      resolved at all, because falsely telling a paying customer they are in
 *      a read-only demo is its own outage;
 *   3. reads (no demoSafe) still work for the demo account — guarding one
 *      would break the tour itself;
 *   4. the refusal is not reported as an error, or a busy demo night buries
 *      Sentry in expected control flow.
 */

const getUser = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser } })),
}));

const logServerException = vi.fn();
vi.mock('@/lib/server-error-logger', () => ({
  logServerException: (...a: unknown[]) => logServerException(...a),
  logServerError: vi.fn(),
  logServerEvent: vi.fn(),
}));

vi.mock('@/lib/admin/emit-throttle', () => ({
  shouldEmit: () => true,
  drainCollapsedCount: () => 0,
}));

const observeActionSoftFailure = vi.fn();
vi.mock('@/lib/admin/observe-action-result', () => ({
  extractActionSoftFailure: () => null,
  observeActionSoftFailure: (...a: unknown[]) => observeActionSoftFailure(...a),
}));

const DEMO_EMAIL = 'demo@golfhelmdemo.com';

import { withAdminObserved } from '../observed-action';
import { isGolfDemoReadOnlyError } from '@/lib/demo/golf-read-only';

function asUser(email: string | null) {
  getUser.mockResolvedValue({ data: { user: email ? { id: 'u1', email } : null } });
}

describe('withAdminObserved demoSafe', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DEMO_COACH_EMAIL = DEMO_EMAIL;
  });

  it('refuses a mutating action for the shared demo account', async () => {
    asUser(DEMO_EMAIL);
    const impl = vi.fn(async () => 'wrote');
    const action = withAdminObserved('deleteGolfEvent', { sport: 'golf', demoSafe: true }, impl);

    await expect(action()).rejects.toSatisfy(isGolfDemoReadOnlyError);
  });

  it('does not run the implementation at all when it refuses', async () => {
    // The whole point: blocking AFTER the write has already landed would leave
    // the next visitor looking at the damage.
    asUser(DEMO_EMAIL);
    const impl = vi.fn(async () => 'wrote');
    const action = withAdminObserved('deleteGolfEvent', { sport: 'golf', demoSafe: true }, impl);

    await action().catch(() => {});

    expect(impl).not.toHaveBeenCalled();
  });

  it('lets a real coach through untouched', async () => {
    asUser('coach@guilford.edu');
    const impl = vi.fn(async () => 'wrote');
    const action = withAdminObserved('deleteGolfEvent', { sport: 'golf', demoSafe: true }, impl);

    await expect(action()).resolves.toBe('wrote');
    expect(impl).toHaveBeenCalledTimes(1);
  });

  it('lets a real coach through even when the session cannot be resolved', async () => {
    // The guard module fails CLOSED by design. Routing through
    // resolveObservedUser() — which swallows and yields null — is what stops a
    // transient GoTrue blip from telling a paying customer they are in a
    // read-only demo and refusing to save their work.
    getUser.mockRejectedValue(new Error('GoTrue unreachable'));
    const impl = vi.fn(async () => 'wrote');
    const action = withAdminObserved('deleteGolfEvent', { sport: 'golf', demoSafe: true }, impl);

    await expect(action()).resolves.toBe('wrote');
  });

  it('leaves reads alone for the demo account', async () => {
    asUser(DEMO_EMAIL);
    const impl = vi.fn(async () => ['event']);
    const action = withAdminObserved('getGolfEvents', { sport: 'golf' }, impl);

    await expect(action()).resolves.toEqual(['event']);
    expect(impl).toHaveBeenCalledTimes(1);
  });

  it('does not report the refusal as an error', async () => {
    asUser(DEMO_EMAIL);
    const action = withAdminObserved(
      'deleteGolfEvent',
      { sport: 'golf', demoSafe: true },
      async () => 'wrote',
    );

    await action().catch(() => {});

    expect(logServerException).not.toHaveBeenCalled();
    expect(observeActionSoftFailure).not.toHaveBeenCalled();
  });

  it('still reports a genuine failure inside a demoSafe action', async () => {
    // Silencing the guard must not silence real defects in the same actions.
    asUser('coach@guilford.edu');
    const action = withAdminObserved(
      'deleteGolfEvent',
      { sport: 'golf', demoSafe: true },
      async () => { throw new Error('database exploded'); },
    );

    await action().catch(() => {});

    expect(logServerException).toHaveBeenCalled();
  });

  it('is inert when no demo account is configured', async () => {
    delete process.env.DEMO_COACH_EMAIL;
    asUser('someone@example.com');
    const impl = vi.fn(async () => 'wrote');
    const action = withAdminObserved('deleteGolfEvent', { sport: 'golf', demoSafe: true }, impl);

    await expect(action()).resolves.toBe('wrote');
  });
});
