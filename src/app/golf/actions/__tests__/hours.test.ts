import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const TEAM = '00000000-0000-4000-8000-000000000001';
const EVENT = '00000000-0000-4000-8000-0000000000e1';

/**
 * A stand-in for the two hours tables as RLS answers the caller: a write the policies keep returns no row, a missing table
 * (the held migration) answers 42P01, a database failure answers its error. It records what each write sent. No network.
 */
const state = vi.hoisted(() => ({
  user: { id: 'coach-1' } as { id: string } | null,
  allowed: true,
  error: null as { message: string; code?: string } | null,
  writes: [] as Array<{ table: string; op: string; row?: Record<string, unknown>; onConflict?: string; filters: Array<[string, unknown]> }>,
}));
const revalidate = vi.hoisted(() => vi.fn());
vi.mock('next/cache', () => ({ revalidatePath: revalidate }));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn(), logServerEvent: vi.fn(), logServerException: vi.fn() }));
vi.mock('@/lib/admin/observed-action', () => ({ withAdminObserved: (_n: string, _o: unknown, fn: unknown) => fn }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: (table: string) => {
      const w: (typeof state.writes)[number] = { table, op: '', filters: [] };
      const done = () => (state.error ? { data: null, error: state.error } : { data: state.allowed ? { ok: true } : null, error: null });
      const q = {
        upsert: (row: Record<string, unknown>, o: { onConflict: string }) => {
          Object.assign(w, { op: 'upsert', row, onConflict: o.onConflict });
          state.writes.push(w);
          return q;
        },
        delete: () => {
          w.op = 'delete';
          state.writes.push(w);
          return q;
        },
        eq: (c: string, v: unknown) => {
          w.filters.push([c, v]);
          return w.op === 'delete' && w.filters.length === 2 ? Promise.resolve({ error: state.error }) : q;
        },
        select: () => q,
        maybeSingle: async () => done(),
      };
      return q;
    },
  }),
}));

const { saveHoursAdjustment, saveHoursSettings } = await import('../hours');
const { DEFAULT_HOURS_SETTINGS } = await import('@/clubhouse/screens/calendar/hours/rules');

beforeEach(() => {
  state.user = { id: 'coach-1' };
  state.allowed = true;
  state.error = null;
  state.writes = [];
  revalidate.mockReset();
});

describe('saveHoursSettings (F-03)', () => {
  it('60980 writes one row a team, Custom limits kept only for Custom, and refreshes the page', async () => {
    const r = await saveHoursSettings({
      teamId: TEAM,
      settings: { ...DEFAULT_HOURS_SETTINGS, spring: { from: '2027-02-01', to: '2027-05-20' } },
      untimedHours: 2.333,
    });
    expect(r).toEqual({ success: true });
    const w = state.writes[0]!;
    expect([w.table, w.op, w.onConflict]).toEqual(['golf_team_hours_settings', 'upsert', 'team_id']);
    expect(w.row).toMatchObject({
      team_id: TEAM,
      division: 'd1',
      autonomy: false,
      week_starts_on: 1,
      spring_from: '2027-02-01',
      spring_to: '2027-05-20',
      custom_day_hours: null,
      custom_week_hours: null,
      custom_days_off: 1,
      untimed_hours: 2.33,
      updated_by: 'coach-1',
    });
    expect(revalidate).toHaveBeenCalledWith('/golf/dashboard/calendar/hours');
  });

  it('CH-6180 refuses what the table would, before any write: overlapping seasons, a day over 24 hours', async () => {
    const overlap = await saveHoursSettings({
      teamId: TEAM,
      settings: { ...DEFAULT_HOURS_SETTINGS, fall: { from: '2026-08-20', to: '2026-11-30' }, spring: { from: '2026-11-01', to: '2027-05-20' } },
      untimedHours: null,
    });
    expect(overlap).toMatchObject({ success: false, code: 'CH-6180', error: 'The fall and spring seasons overlap. A day can be in one of them.' });
    const day = await saveHoursSettings({
      teamId: TEAM,
      settings: { ...DEFAULT_HOURS_SETTINGS, division: 'custom', custom: { day: 25, week: null, daysOff: 1 } },
      untimedHours: null,
    });
    expect(day).toMatchObject({ success: false, code: 'CH-6180' });
    expect(state.writes).toEqual([]);
  });

  it('CH-6080 a write RLS keeps (not a coach of the team) is refused in words; a missing table answers unavailable', async () => {
    state.allowed = false;
    expect(await saveHoursSettings({ teamId: TEAM, settings: DEFAULT_HOURS_SETTINGS, untimedHours: null })).toEqual({
      success: false,
      code: 'CH-6080',
      error: 'Only a coach of the team can change its limits.',
      unavailable: undefined,
    });
    state.error = { message: 'relation "golf_team_hours_settings" does not exist', code: '42P01' };
    expect(await saveHoursSettings({ teamId: TEAM, settings: DEFAULT_HOURS_SETTINGS, untimedHours: null })).toMatchObject({
      success: false,
      code: 'CH-6080',
      unavailable: true,
    });
    state.user = null;
    expect(await saveHoursSettings({ teamId: TEAM, settings: DEFAULT_HOURS_SETTINGS, untimedHours: null })).toMatchObject({ success: false, code: 'CH-6080' });
    expect(revalidate).not.toHaveBeenCalled();
  });

  it('refuses an address that is not a team id without asking the database', async () => {
    expect(await saveHoursSettings({ teamId: 'not-a-team', settings: DEFAULT_HOURS_SETTINGS, untimedHours: null })).toMatchObject({
      success: false,
      code: 'CH-6080',
    });
    expect(state.writes).toEqual([]);
  });
});

describe('saveHoursAdjustment (F-03)', () => {
  it('60981 upserts one change an event: not countable with its note, or a figure in hours to the hundredth', async () => {
    expect(await saveHoursAdjustment({ teamId: TEAM, eventId: EVENT, adjustment: { counted: false, hours: 2, note: '  Academic meeting ' } })).toEqual({
      success: true,
    });
    expect(state.writes[0]).toMatchObject({
      table: 'golf_hours_adjustments',
      op: 'upsert',
      onConflict: 'event_id',
      row: { team_id: TEAM, event_id: EVENT, counted: false, hours: null, note: 'Academic meeting', created_by: 'coach-1' },
    });
    await saveHoursAdjustment({ teamId: TEAM, eventId: EVENT, adjustment: { counted: true, hours: 3.456, note: '' } });
    expect(state.writes[1]!.row).toMatchObject({ counted: true, hours: 3.46, note: null });
  });

  it('takes a change off with a delete scoped to the team and the event', async () => {
    expect(await saveHoursAdjustment({ teamId: TEAM, eventId: EVENT, adjustment: null })).toEqual({ success: true });
    expect(state.writes[0]).toMatchObject({
      table: 'golf_hours_adjustments',
      op: 'delete',
      filters: [
        ['team_id', TEAM],
        ['event_id', EVENT],
      ],
    });
  });

  it('CH-6181 CH-6081 refuses hours over 24 before writing, and a write RLS keeps in words', async () => {
    expect(await saveHoursAdjustment({ teamId: TEAM, eventId: EVENT, adjustment: { counted: true, hours: 25, note: null } })).toMatchObject({
      success: false,
      code: 'CH-6181',
    });
    expect(state.writes).toEqual([]);
    state.allowed = false;
    expect(await saveHoursAdjustment({ teamId: TEAM, eventId: EVENT, adjustment: { counted: false, hours: null, note: null } })).toMatchObject({
      success: false,
      code: 'CH-6081',
      error: 'Only a coach of the team can change how an event counts.',
    });
  });
});
