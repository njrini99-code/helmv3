/**
 * `resolveGolfCoachEntry` — who is allowed to see NEW-PROGRAM onboarding.
 *
 * The stakes are not cosmetic. `/golf/coach` creates an `organizations` row, a
 * `golf_teams` row, and overwrites `golf_coaches.organization_id` — which is
 * the entire link between a person and their program. Send an assistant coach
 * there and finishing the form detaches them from the program that invited them
 * and stands up a phantom duplicate of it. Reported by UNCW (2026-08-18) and,
 * after a warning paragraph was added, by Shenandoah (2026-08-19).
 *
 * The test that carries this file is `approved assistant`. Before this change
 * `approvePendingAssistantCoach` inserted the staff row and left
 * `onboarding_completed = false`, so every caller that keyed on that flag sent a
 * JUST-APPROVED assistant into the wizard. Approval actively made things worse,
 * and nothing anywhere failed. That case must never key on the flag again.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const state = {
  coach: null as Record<string, unknown> | null,
  coachError: null as { message: string } | null,
  staffRow: null as { id: string } | null,
  staffError: null as { message: string } | null,
  /** Tables the resolver actually queried, in order. */
  queried: [] as string[],
};

function table(name: string) {
  state.queried.push(name);
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  for (const m of ['select', 'eq', 'limit']) chain[m] = vi.fn(self);
  chain.maybeSingle = vi.fn(async () =>
    name === 'golf_coaches'
      ? { data: state.coach, error: state.coachError }
      : { data: state.staffRow, error: state.staffError },
  );
  return chain;
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({ from: vi.fn((name: string) => table(name)) })),
}));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn(async () => {}) }));

const { resolveGolfCoachEntry } = await import('../coach-entry-path');

beforeEach(() => {
  state.coach = null;
  state.coachError = null;
  state.staffRow = null;
  state.staffError = null;
  state.queried = [];
});

describe('resolveGolfCoachEntry — who may see new-program onboarding', () => {
  it('sends a brand-new coach with NO profile to the wizard', async () => {
    // The only legitimate entrant. `completeCoachOnboarding` is the sole writer
    // of golf_coaches for a head coach, so no row means nobody has set them up.
    expect(await resolveGolfCoachEntry('user-1')).toEqual({
      path: '/golf/coach',
      reason: 'no-coach-profile',
    });
    // Cheap: it must not probe the staff table when there is no coach at all.
    expect(state.queried).toEqual(['golf_coaches']);
  });

  it('sends a PENDING assistant to the waiting page, never the wizard', async () => {
    state.coach = { id: 'c1', organization_id: 'org-1', onboarding_completed: false };
    state.staffRow = null;
    expect(await resolveGolfCoachEntry('user-1')).toEqual({
      path: '/golf/coach/pending',
      reason: 'pending-assistant',
    });
  });

  it('sends an APPROVED assistant to the dashboard even with a stale flag', async () => {
    // THE REGRESSION THIS FILE EXISTS FOR.
    //
    // Approval inserted the staff row and never touched onboarding_completed,
    // so this exact row shape — approved, flag still false — was routed to
    // '/golf/coach' by five separate call sites. The staff row is checked
    // BEFORE the flag precisely so a stale flag cannot strand somebody who
    // demonstrably has access: `is_golf_team_coach` is an EXISTS() over this
    // same table and reads nothing else.
    state.coach = { id: 'c1', organization_id: 'org-1', onboarding_completed: false };
    state.staffRow = { id: 'staff-1' };
    expect(await resolveGolfCoachEntry('user-1')).toEqual({
      path: '/golf/dashboard',
      reason: 'staffed',
    });
  });

  it('sends a fully onboarded head coach to the dashboard', async () => {
    state.coach = { id: 'c1', organization_id: 'org-1', onboarding_completed: true };
    state.staffRow = { id: 'staff-1' };
    expect((await resolveGolfCoachEntry('user-1')).path).toBe('/golf/dashboard');
  });

  it('sends a DECLINED assistant back to the wizard — they have no program', async () => {
    // declinePendingAssistantCoach detaches rather than deletes, so they hold a
    // coach row with organization_id null. The wizard is genuinely right here.
    state.coach = { id: 'c1', organization_id: null, onboarding_completed: false };
    expect(await resolveGolfCoachEntry('user-1')).toEqual({
      path: '/golf/coach',
      reason: 'unattached',
    });
    expect(state.queried).toEqual(['golf_coaches']);
  });

  it('leaves a head coach whose team creation half-failed on the dashboard', async () => {
    // Program + marked onboarded + no staff row. This is the ONE case where
    // onboarding_completed carries information the staff row cannot — but the
    // answer is still not the wizard.
    state.coach = { id: 'c1', organization_id: 'org-1', onboarding_completed: true };
    state.staffRow = null;
    // NOT '/golf/coach'. `completeCoachOnboarding` upserts the COACH but
    // plainly `.insert()`s the organization and the team, so re-running the
    // wizard mints a duplicate program rather than finishing this one. The
    // dashboard is where these accounts already go in production, so routing
    // keeps its promise of only ever changing an ASSISTANT's destination.
    expect(await resolveGolfCoachEntry('user-1')).toEqual({
      path: '/golf/dashboard',
      reason: 'incomplete-head-coach',
    });
  });
});

describe('resolveGolfCoachEntry — failures never route into the wizard', () => {
  it('routes a failed COACH read to the waiting page, not new-program onboarding', async () => {
    // A failed read is indistinguishable from "no coach row", and guessing
    // '/golf/coach' would offer program creation to someone who may already
    // have one. The waiting page self-clears once the row is readable.
    state.coachError = { message: 'connection reset' };
    expect(await resolveGolfCoachEntry('user-1')).toEqual({
      path: '/golf/coach/pending',
      reason: 'lookup-failed',
    });
  });

  it('routes a failed STAFF read to the waiting page', async () => {
    state.coach = { id: 'c1', organization_id: 'org-1', onboarding_completed: false };
    state.staffError = { message: 'timeout' };
    expect(await resolveGolfCoachEntry('user-1')).toEqual({
      path: '/golf/coach/pending',
      reason: 'lookup-failed',
    });
  });

  it('never throws — a missing service-role key still yields a path', async () => {
    const { createAdminClient } = await import('@/lib/supabase/admin');
    vi.mocked(createAdminClient).mockImplementationOnce(() => {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY is missing for admin client.');
    });
    const entry = await resolveGolfCoachEntry('user-1');
    expect(entry).toEqual({ path: '/golf/coach/pending', reason: 'lookup-failed' });
  });
});
