// =============================================================================
// src/app/baseball/actions/__tests__/travel.test.ts
//
// New coverage for src/app/baseball/actions/travel.ts — previously ZERO test
// coverage (docs/operations/BASEBALLHELM_FEATURE_READINESS_MATRIX.md:73).
//
// Pins the identity-space distinction between the two "created_by" fields the
// file writes, which are deliberately NOT the same value:
//   - createItinerary writes ctx.activeCoachId  (baseball_coaches.id)
//   - addExpense      writes ctx.user.id        (auth user id)
// USER_ID and ACTIVE_COACH_ID below are deliberately different fixture
// strings so an insert() assertion can tell the two apart — a mocking
// mistake that collapsed them to the same value would silently defeat the
// whole point of this file.
//
// Also covers the two-layer team-capability guard on createItinerary and
// addExpense: withBaseballAction's own pre-check only ever validates
// capability against ctx.activeTeamId (the coach's OWN active team), never
// against a caller-supplied teamId argument. Both actions carry an explicit
// `if (teamId !== ctx.activeTeamId) { await requireBaseballCapability(teamId, ...) }`
// re-check in the body for exactly this reason — a coach who is capable on
// their own team must not be able to write into an arbitrary OTHER team just
// by passing its id as an argument. updateItinerary/deleteItinerary/
// deleteExpense have no such argument at all (they resolve the team from the
// EXISTING row), so they get a lighter not-found + capability-denial pass.
//
// Follows the repo's established withBaseballAction test idiom: mock
// '@/lib/baseball/active-context' + createFakeSupabase, seed a real
// baseball_team_coach_staff-shaped row so requireBaseballCapability's actual
// resolution logic runs (not stubbed), and assert on the exact user-facing
// {success,error} envelope mapTravelActionError produces — not end-to-end DB
// behavior. See lifting-v11-rls-denial.test.ts / dev-plans-coach-gating.test.ts
// for the pattern this mirrors.
// =============================================================================

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeSupabase, type FakeSupabase } from '@/test/fixtures/fake-supabase';
import type { ActiveBaseballContext } from '@/lib/baseball/active-context-shared';

const USER_ID = 'auth-user-1';
const ACTIVE_COACH_ID = 'coach-record-1'; // deliberately distinct from USER_ID

const TEAM_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_TEAM_ID = '22222222-2222-4222-8222-222222222222';
const ITINERARY_ID = '33333333-3333-4333-8333-333333333333';
const OTHER_TEAM_ITINERARY_ID = '44444444-4444-4444-8444-444444444444';
const EXPENSE_ID = '55555555-5555-4555-8555-555555555555';
const UNKNOWN_EXPENSE_ID = '66666666-6666-4666-8666-666666666666';

let fake: FakeSupabase;
let activeContext: ActiveBaseballContext;

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => fake),
}));

vi.mock('@/lib/baseball/active-context', () => ({
  getActiveBaseballContext: vi.fn(async () => activeContext),
}));

vi.mock('@/lib/demo/baseball-config.server', () => ({
  isCurrentSessionBaseballDemo: vi.fn(async () => false),
  isBaseballDemoCoachEmail: vi.fn(() => false),
}));

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => undefined),
  logServerException: vi.fn(async () => undefined),
  logServerEvent: vi.fn(async () => undefined),
}));

vi.mock('@sentry/nextjs', () => ({
  withScope: (fn: (scope: unknown) => unknown) =>
    fn({ setTag: vi.fn(), setUser: vi.fn(), addBreadcrumb: vi.fn() }),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import {
  createItinerary,
  updateItinerary,
  deleteItinerary,
  addExpense,
  deleteExpense,
} from '@/app/baseball/actions/travel';

const PERMISSION_ERROR = 'You do not have permission to manage travel';

/** A baseball_team_coach_staff row granting (or withholding) can_manage_settings. */
function staffRow(teamId: string, canManageSettings: boolean) {
  return {
    id: `staff-${teamId}`,
    team_id: teamId,
    coach_id: ACTIVE_COACH_ID,
    is_primary: false,
    is_head_coach: false,
    status: 'active',
    can_manage_settings: canManageSettings,
  };
}

function resetContext(overrides: Partial<ActiveBaseballContext> = {}): void {
  activeContext = {
    userId: USER_ID,
    activeTeamId: TEAM_ID,
    activeRole: 'coach',
    activeCoachId: ACTIVE_COACH_ID,
    activePlayerId: null,
    fellBackFromStale: false,
    ...overrides,
  };
}

beforeEach(() => {
  resetContext();
  fake = createFakeSupabase({
    user: { id: USER_ID },
    tables: {
      baseball_coaches: [{ id: ACTIVE_COACH_ID, user_id: USER_ID }],
      baseball_team_coach_staff: [staffRow(TEAM_ID, true)],
      baseball_travel_itineraries: [],
      baseball_travel_expenses: [],
    },
  });
});

async function rowsForTeam(table: string, teamId: string): Promise<Array<Record<string, unknown>>> {
  const { data } = await fake.from(table).select('*').eq('team_id', teamId);
  return (data ?? []) as Array<Record<string, unknown>>;
}

describe('createItinerary — coach-id vs user-id identity resolution', () => {
  it('writes created_by as the active coach id, not the auth user id', async () => {
    const result = await createItinerary(TEAM_ID, { event_name: 'Regional Tournament' });
    expect(result.success).toBe(true);

    const rows = await rowsForTeam('baseball_travel_itineraries', TEAM_ID);
    expect(rows).toHaveLength(1);
    const created = rows[0];
    if (!created) throw new Error('expected a seeded itinerary row');
    expect(created.created_by).toBe(ACTIVE_COACH_ID);
    expect(created.created_by).not.toBe(USER_ID);
  });

  it('rejects with "Coach profile not found." when no active coach id is resolved', async () => {
    resetContext({ activeCoachId: null });

    const result = await createItinerary(TEAM_ID, { event_name: 'Regional Tournament' });

    expect(result).toEqual({ success: false, error: 'Coach profile not found.' });
    expect(await rowsForTeam('baseball_travel_itineraries', TEAM_ID)).toHaveLength(0);
  });

  it('rejects when the caller lacks can_manage_settings on their own active team', async () => {
    fake = createFakeSupabase({
      user: { id: USER_ID },
      tables: {
        baseball_coaches: [{ id: ACTIVE_COACH_ID, user_id: USER_ID }],
        baseball_team_coach_staff: [staffRow(TEAM_ID, false)],
        baseball_travel_itineraries: [],
      },
    });

    const result = await createItinerary(TEAM_ID, { event_name: 'Regional Tournament' });

    expect(result).toEqual({ success: false, error: PERMISSION_ERROR });
  });

  it('rejects a forged teamId targeting a team the caller has no capability on, even though their own active team grants it', async () => {
    // ctx.activeTeamId (TEAM_ID) grants can_manage_settings, so withBaseballAction's
    // own pre-check passes. OTHER_TEAM_ID has no staff row at all — the explicit
    // `if (teamId !== ctx.activeTeamId)` re-check inside createItinerary's body is
    // what must block this, not the wrapper (which never sees the argument).
    const result = await createItinerary(OTHER_TEAM_ID, { event_name: 'Regional Tournament' });

    expect(result).toEqual({ success: false, error: PERMISSION_ERROR });
    expect(await rowsForTeam('baseball_travel_itineraries', OTHER_TEAM_ID)).toHaveLength(0);
  });

  it('degrades an invalid payload to the generic action-error message, not the raw zod message', async () => {
    // createItinerary's own try/catch has a `z.ZodError` special case, but
    // createItineraryAction's schema.parse() runs INSIDE the
    // withBaseballAction-wrapped body. with-baseball-action.ts's own
    // catch-all does not whitelist ZodError, so it sanitizes the thrown
    // ZodError into a BaseballActionError before createItinerary's outer
    // catch ever sees it — the ZodError branch there is presently
    // unreachable for this action. This test pins the ACTUAL behavior.
    const result = await createItinerary(TEAM_ID, { event_name: '' });

    expect(result).toEqual({
      success: false,
      error: 'Could not complete the travel action. Please try again.',
    });
  });
});

describe('addExpense — created_by identity is the auth user id, not the coach id', () => {
  beforeEach(async () => {
    await fake.from('baseball_travel_itineraries').insert({
      id: ITINERARY_ID,
      team_id: TEAM_ID,
      event_name: 'Regional Tournament',
      created_by: ACTIVE_COACH_ID,
    });
  });

  it('writes created_by as the auth user id, not the active coach id', async () => {
    const result = await addExpense(ITINERARY_ID, TEAM_ID, {
      category: 'transport',
      amount: 42.5,
    });
    expect(result.success).toBe(true);

    const { data } = await fake
      .from('baseball_travel_expenses')
      .select('*')
      .eq('itinerary_id', ITINERARY_ID);
    const rows = (data ?? []) as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
    const created = rows[0];
    if (!created) throw new Error('expected a seeded expense row');
    expect(created.created_by).toBe(USER_ID);
    expect(created.created_by).not.toBe(ACTIVE_COACH_ID);
  });

  it('rejects "Itinerary not found." when the itinerary belongs to a different team than the explicit teamId argument', async () => {
    await fake.from('baseball_travel_itineraries').insert({
      id: OTHER_TEAM_ITINERARY_ID,
      team_id: OTHER_TEAM_ID,
      event_name: 'Away Trip',
      created_by: ACTIVE_COACH_ID,
    });

    const result = await addExpense(OTHER_TEAM_ITINERARY_ID, TEAM_ID, {
      category: 'lodging',
      amount: 100,
    });

    expect(result).toEqual({ success: false, error: 'Itinerary not found.' });
  });

  it('rejects a forged teamId targeting a team the caller has no capability on', async () => {
    const result = await addExpense(ITINERARY_ID, OTHER_TEAM_ID, {
      category: 'meals',
      amount: 20,
    });

    expect(result).toEqual({ success: false, error: PERMISSION_ERROR });
  });

  it('rejects when the caller lacks can_manage_settings on their own active team', async () => {
    fake = createFakeSupabase({
      user: { id: USER_ID },
      tables: {
        baseball_coaches: [{ id: ACTIVE_COACH_ID, user_id: USER_ID }],
        baseball_team_coach_staff: [staffRow(TEAM_ID, false)],
        baseball_travel_itineraries: [
          { id: ITINERARY_ID, team_id: TEAM_ID, event_name: 'Regional Tournament', created_by: ACTIVE_COACH_ID },
        ],
        baseball_travel_expenses: [],
      },
    });

    const result = await addExpense(ITINERARY_ID, TEAM_ID, { category: 'other', amount: 5 });

    expect(result).toEqual({ success: false, error: PERMISSION_ERROR });
  });
});

describe('updateItinerary / deleteItinerary — capability resolved from the EXISTING row, not caller input', () => {
  beforeEach(async () => {
    await fake.from('baseball_travel_itineraries').insert({
      id: ITINERARY_ID,
      team_id: TEAM_ID,
      event_name: 'Regional Tournament',
      created_by: ACTIVE_COACH_ID,
    });
  });

  it('updateItinerary rejects "Itinerary not found." for an unknown id', async () => {
    const result = await updateItinerary(OTHER_TEAM_ITINERARY_ID, { event_name: 'New Name' });

    expect(result).toEqual({ success: false, error: 'Itinerary not found.' });
  });

  it("updateItinerary rejects when staff lacks can_manage_settings on the itinerary's real team", async () => {
    fake = createFakeSupabase({
      user: { id: USER_ID },
      tables: {
        baseball_coaches: [{ id: ACTIVE_COACH_ID, user_id: USER_ID }],
        baseball_team_coach_staff: [staffRow(TEAM_ID, false)],
        baseball_travel_itineraries: [
          { id: ITINERARY_ID, team_id: TEAM_ID, event_name: 'Regional Tournament', created_by: ACTIVE_COACH_ID },
        ],
      },
    });

    const result = await updateItinerary(ITINERARY_ID, { event_name: 'New Name' });

    expect(result).toEqual({ success: false, error: PERMISSION_ERROR });
  });

  it('updateItinerary succeeds for a capable coach and persists the new fields', async () => {
    const result = await updateItinerary(ITINERARY_ID, {
      event_name: 'Renamed Trip',
      location: 'Omaha, NE',
    });
    expect(result.success).toBe(true);

    const { data } = await fake
      .from('baseball_travel_itineraries')
      .select('*')
      .eq('id', ITINERARY_ID)
      .single();
    const row = data as Record<string, unknown> | null;
    if (!row) throw new Error('expected the itinerary row to still exist');
    expect(row.event_name).toBe('Renamed Trip');
    expect(row.location).toBe('Omaha, NE');
  });

  it('deleteItinerary rejects "Itinerary not found."', async () => {
    const result = await deleteItinerary(OTHER_TEAM_ITINERARY_ID);

    expect(result).toEqual({ success: false, error: 'Itinerary not found.' });
  });

  it('deleteItinerary rejects when staff lacks capability, and leaves the row untouched', async () => {
    fake = createFakeSupabase({
      user: { id: USER_ID },
      tables: {
        baseball_coaches: [{ id: ACTIVE_COACH_ID, user_id: USER_ID }],
        baseball_team_coach_staff: [staffRow(TEAM_ID, false)],
        baseball_travel_itineraries: [
          { id: ITINERARY_ID, team_id: TEAM_ID, event_name: 'Regional Tournament', created_by: ACTIVE_COACH_ID },
        ],
      },
    });

    const result = await deleteItinerary(ITINERARY_ID);

    expect(result).toEqual({ success: false, error: PERMISSION_ERROR });

    const { data } = await fake
      .from('baseball_travel_itineraries')
      .select('*')
      .eq('id', ITINERARY_ID)
      .single();
    expect(data).not.toBeNull();
  });

  it('deleteItinerary removes both the itinerary and its expenses on success', async () => {
    await fake.from('baseball_travel_expenses').insert({
      id: EXPENSE_ID,
      itinerary_id: ITINERARY_ID,
      team_id: TEAM_ID,
      category: 'transport',
      amount: 30,
      paid_by: 'team',
      created_by: USER_ID,
    });

    const result = await deleteItinerary(ITINERARY_ID);

    expect(result).toEqual({ success: true });

    const { data: itineraries } = await fake.from('baseball_travel_itineraries').select('*');
    const { data: expenses } = await fake.from('baseball_travel_expenses').select('*');
    expect((itineraries ?? []) as unknown[]).toHaveLength(0);
    expect((expenses ?? []) as unknown[]).toHaveLength(0);
  });
});

describe('deleteExpense', () => {
  beforeEach(async () => {
    await fake.from('baseball_travel_itineraries').insert({
      id: ITINERARY_ID,
      team_id: TEAM_ID,
      event_name: 'Regional Tournament',
      created_by: ACTIVE_COACH_ID,
    });
    await fake.from('baseball_travel_expenses').insert({
      id: EXPENSE_ID,
      itinerary_id: ITINERARY_ID,
      team_id: TEAM_ID,
      category: 'transport',
      amount: 30,
      paid_by: 'team',
      created_by: USER_ID,
    });
  });

  it('rejects "Expense not found." for an unknown id', async () => {
    const result = await deleteExpense(UNKNOWN_EXPENSE_ID);

    expect(result).toEqual({ success: false, error: 'Expense not found.' });
  });

  it('rejects when staff lacks capability, and leaves the row untouched', async () => {
    fake = createFakeSupabase({
      user: { id: USER_ID },
      tables: {
        baseball_coaches: [{ id: ACTIVE_COACH_ID, user_id: USER_ID }],
        baseball_team_coach_staff: [staffRow(TEAM_ID, false)],
        baseball_travel_expenses: [
          {
            id: EXPENSE_ID,
            itinerary_id: ITINERARY_ID,
            team_id: TEAM_ID,
            category: 'transport',
            amount: 30,
            paid_by: 'team',
            created_by: USER_ID,
          },
        ],
      },
    });

    const result = await deleteExpense(EXPENSE_ID);

    expect(result).toEqual({ success: false, error: PERMISSION_ERROR });

    const { data } = await fake
      .from('baseball_travel_expenses')
      .select('*')
      .eq('id', EXPENSE_ID)
      .single();
    expect(data).not.toBeNull();
  });

  it('removes the expense on success', async () => {
    const result = await deleteExpense(EXPENSE_ID);

    expect(result).toEqual({ success: true });

    const { data } = await fake.from('baseball_travel_expenses').select('*');
    expect((data ?? []) as unknown[]).toHaveLength(0);
  });
});
