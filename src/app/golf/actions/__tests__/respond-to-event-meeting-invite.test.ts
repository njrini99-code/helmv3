import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * respondToEvent: a meeting takes replies only from the players invited to it
 * (their own attendance row). Otherwise a self-RSVP
 * (golf_event_attendance_insert_self) would put a player on a 1:1 they were
 * never invited to, and that row is what makes the meeting visible to them.
 * The refusal reads "Event not found" so it does not confirm the meeting
 * exists. Team-wide events still take a self-RSVP.
 */

const { logServerError, updateRSVP } = vi.hoisted(() => ({
  logServerError: vi.fn(async (..._args: unknown[]) => {}),
  updateRSVP: vi.fn(async (..._args: unknown[]) => {}),
}));

vi.mock('@/lib/server-error-logger', () => ({
  logServerError,
  logServerException: vi.fn(async () => {}),
  logServerEvent: vi.fn(async () => {}),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), updateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));
vi.mock('@/lib/calendar/rsvp', () => {
  class RSVPLockedError extends Error {}
  class RSVPDeadlinePassedError extends RSVPLockedError {}
  return { updateRSVP, RSVPLockedError, RSVPDeadlinePassedError };
});

type Outcome = { data: unknown; error: unknown };
const outcomes = new Map<string, Outcome>();
const ok = (data: unknown): Outcome => ({ data, error: null });

function tableChain(table: string) {
  const settle = () => outcomes.get(table) ?? ok(null);
  const node: Record<string, unknown> = {};
  const self = () => node;
  Object.assign(node, {
    select: self, eq: self, in: self, order: self, limit: self,
    single: async () => settle(),
    maybeSingle: async () => settle(),
    then: (resolve: (v: Outcome) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(settle()).then(resolve, reject),
  });
  return node;
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) },
    from: (table: string) => tableChain(table),
  }),
}));

async function rsvp() {
  const { respondToEvent } = await import('@/app/golf/actions/calendar-events');
  return respondToEvent('e1', 'accepted');
}

beforeEach(() => {
  logServerError.mockClear();
  updateRSVP.mockClear();
  outcomes.clear();
  outcomes.set('golf_players', ok({ id: 'p1' }));
  outcomes.set('golf_events', ok({ id: 'e1', team_id: 't1', event_type: 'meeting', description: null }));
  outcomes.set('golf_team_members', ok({ id: 'm1' }));
  outcomes.set('golf_event_attendance', ok([]));
});

describe('respondToEvent: a meeting takes replies only from its invitees', () => {
  it('refuses a meeting the player is not invited to, without confirming it exists', async () => {
    const result = await rsvp();
    expect(result).toEqual({ success: false, error: 'Event not found' });
    expect(updateRSVP).not.toHaveBeenCalled();
  });

  it('records the reply of an invited player', async () => {
    outcomes.set('golf_event_attendance', ok([{ event_id: 'e1', player_id: 'p1' }]));
    expect((await rsvp()).success).toBe(true);
    expect(updateRSVP).toHaveBeenCalledWith('e1', 'p1', 'accepted', expect.anything());
  });

  it('refuses with a retry when the invite read fails', async () => {
    outcomes.set('golf_event_attendance', { data: null, error: { message: 'timeout', code: '57014' } });
    const result = await rsvp();
    expect(result.success).toBe(false);
    expect(result.success === false && result.error).toMatch(/Couldn't check your RSVP/);
    expect(updateRSVP).not.toHaveBeenCalled();
  });

  it('still takes a self-RSVP to a team-wide event', async () => {
    outcomes.set('golf_events', ok({ id: 'e1', team_id: 't1', event_type: 'practice', description: null }));
    expect((await rsvp()).success).toBe(true);
    expect(updateRSVP).toHaveBeenCalled();
  });
});
