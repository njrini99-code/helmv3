/**
 * Sentry coverage-gaps pass (2026-09-03) — regression tests for
 * `updateGolfEventImpl`/`deleteGolfEventImpl`'s outer catch blocks.
 *
 * Both were previously silent for a genuinely unexpected exception: the
 * `updateGolfEvent` outer catch only distinguished a `z.ZodError` and fell
 * through to a bare `{ success: false, error: 'An unexpected error
 * occurred' }` with no Bridge/Sentry signal; `deleteGolfEvent`'s outer catch
 * had no error binding at all (`catch { ... }`). A real bug on the
 * calendar-save/delete critical path was therefore invisible beyond the
 * generic message a coach saw in the UI.
 *
 * `resolveCoachTeamIdWithCookie` is mocked to throw so a NON-Zod, NON-DB-
 * error-shaped exception reaches the outer catch in both functions.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase, type FakeSupabase } from '@/test/fixtures/fake-supabase';

let fake: FakeSupabase;

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => fake),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => fake),
}));

vi.mock('next/server', () => ({
  after: vi.fn((cb: () => Promise<void> | void) => {
    void cb();
  }),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  updateTag: vi.fn(),
}));

const logServerErrorMock = vi.fn(async (..._args: unknown[]) => {});
const logServerExceptionMock = vi.fn(async (..._args: unknown[]) => {});
vi.mock('@/lib/server-error-logger', () => ({
  logServerError: (...args: unknown[]) => logServerErrorMock(...args),
  logServerException: (...args: unknown[]) => logServerExceptionMock(...args),
  logServerEvent: vi.fn(async () => {}),
}));

vi.mock('@/lib/coachhelm/v2/post-round-trigger', () => ({
  postRoundTrigger: vi.fn(async () => {}),
}));

vi.mock('@/lib/cache/golf-stats-calculator', () => ({
  invalidateOnRoundComplete: vi.fn(async () => {}),
}));

vi.mock('@/lib/admin-logger', () => ({
  logRoundSubmitted: vi.fn(async () => {}),
}));

vi.mock('@/lib/notifications', () => ({
  notifyQualifierCreated: vi.fn(async () => {}),
}));

vi.mock('@/lib/notifications/email', () => ({
  sendEmailNotification: vi.fn(async () => ({ success: true })),
}));

vi.mock('@/lib/notifications/push', () => ({
  sendBulkPushNotification: vi.fn(async () => {}),
}));

// The one piece of business logic these tests deliberately break: both
// updateGolfEventImpl and deleteGolfEventImpl call this before anything
// else that could throw a typed/handled error, so mocking it to reject
// exercises the outer catch's UNEXPECTED-error branch specifically.
const resolveCoachTeamIdWithCookie = vi.fn(async (..._args: unknown[]) => {
  throw new Error('unexpected: cookie store unavailable');
});
vi.mock('@/lib/golf/resolve-team-server', () => ({
  resolveCoachTeamIdWithCookie: (...args: unknown[]) => resolveCoachTeamIdWithCookie(...args),
}));

import { updateGolfEvent, deleteGolfEvent } from '../golf';

function seedCoach() {
  fake = createFakeSupabase({
    user: { id: 'u-coach' },
    tables: {
      golf_coaches: [{ id: 'coach-1', user_id: 'u-coach', organization_id: 'org-1' }],
      golf_events: [{ id: 'event-1', team_id: 'team-1', title: 'Practice', status: 'scheduled' }],
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  seedCoach();
});

describe('updateGolfEvent — unexpected exception telemetry', () => {
  it('reports failure and calls logServerException (not silently swallowed)', async () => {
    const result = await updateGolfEvent('event-1', { title: 'New title' });

    expect(result.success).toBe(false);
    expect(result.error).toBe('An unexpected error occurred');
    expect(logServerExceptionMock).toHaveBeenCalledTimes(1);
    const [err, context, severity] = logServerExceptionMock.mock.calls[0]!;
    expect((err as Error).message).toContain('cookie store unavailable');
    expect(context).toMatchObject({ action: 'golf.updateGolfEvent.unexpected', featureArea: 'calendar' });
    expect(severity).toBe('error');
  });
});

describe('deleteGolfEvent — unexpected exception telemetry', () => {
  it('reports failure and calls logServerException (previously a fully bare catch)', async () => {
    const result = await deleteGolfEvent('event-1');

    expect(result.success).toBe(false);
    expect(result.error).toBe('An unexpected error occurred');
    expect(logServerExceptionMock).toHaveBeenCalledTimes(1);
    const [err, context, severity] = logServerExceptionMock.mock.calls[0]!;
    expect((err as Error).message).toContain('cookie store unavailable');
    expect(context).toMatchObject({ action: 'golf.deleteGolfEvent.unexpected', featureArea: 'calendar' });
    expect(severity).toBe('error');
  });
});
