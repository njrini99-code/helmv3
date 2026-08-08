import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * `const teamId = input.teamId || coachTeamId` trusted whatever the client sent.
 *
 * Nothing re-checked it, so the only thing standing between a coach and a write
 * on another team was the RLS policy — and a program head staffed on both
 * Shenandoah squads satisfies `is_golf_team_coach` for either. The database
 * would have accepted a men's recurring series created while the coach was
 * toggled to the women's team. For any other coach a hand-edited request could
 * name a sibling team they do not staff, and the refusal would arrive as a
 * generic insert error rather than as an answer.
 *
 * An explicit id must not be more trusted than a cookie. The cookie already
 * goes through `validateCoachTeamAccess`; this now does too.
 */

const validateCoachTeamAccess = vi.fn(async () => true);

vi.mock('@/lib/golf/resolve-team', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/golf/resolve-team')>()),
  validateCoachTeamAccess,
}));
vi.mock('@/lib/golf/resolve-team-server', () => ({
  resolveCoachTeamIdWithCookie: vi.fn(async () => 'team-womens'),
}));
vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => {}),
  logServerException: vi.fn(async () => {}),
  logServerEvent: vi.fn(async () => {}),
}));
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}));

type Outcome = { data: unknown; error: unknown };
const outcomes = new Map<string, Outcome>();
const ok = (data: unknown): Outcome => ({ data, error: null });

/** team_id values actually written to golf_events. */
const insertedTeamIds: string[] = [];

function tableChain(table: string) {
  const settle = () => outcomes.get(table) ?? ok([]);
  const node: Record<string, unknown> = {};
  const self = () => node;
  Object.assign(node, {
    select: self,
    eq: self,
    in: self,
    order: self,
    limit: self,
    insert: (rows: unknown) => {
      if (table === 'golf_events') {
        for (const r of Array.isArray(rows) ? rows : [rows]) {
          const t = (r as { team_id?: string }).team_id;
          if (t) insertedTeamIds.push(t);
        }
      }
      const n: Record<string, unknown> = {};
      Object.assign(n, {
        select: () => n,
        single: async () => ({ data: { id: 'root-1' }, error: null }),
        then: (r: (v: Outcome) => unknown) => Promise.resolve(ok(rows)).then(r),
      });
      return n;
    },
    single: async () => settle(),
    maybeSingle: async () => settle(),
    then: (resolve: (v: Outcome) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(settle()).then(resolve, reject),
  });
  return node;
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) },
    from: (table: string) => tableChain(table),
    rpc: async () => ({ data: null, error: null }),
  }),
}));

async function createSeries(teamId?: string) {
  const mod = await import('@/app/golf/actions/recurring-events');
  return mod.createRecurringEvent({
    title: 'Qualifier',
    eventType: 'practice',
    startDate: '2026-09-01',
    // RFC-5545 subset, the shape the action actually parses.
    recurrenceRule: 'RRULE:FREQ=WEEKLY;INTERVAL=1;COUNT=2',
    teamId,
  } as never);
}

beforeEach(() => {
  validateCoachTeamAccess.mockClear();
  validateCoachTeamAccess.mockResolvedValue(true);
  outcomes.clear();
  insertedTeamIds.length = 0;
  outcomes.set('golf_coaches', ok({ id: 'coach-1', organization_id: 'org-1' }));
});

describe('createRecurringEvent — an explicit teamId is not more trusted than a cookie', () => {
  it('checks staffing before honouring a client-supplied team', async () => {
    await createSeries('team-mens');

    expect(validateCoachTeamAccess).toHaveBeenCalled();
    const [, coachId, requested] = validateCoachTeamAccess.mock.calls[0] as unknown as [
      unknown, string, string,
    ];
    expect(coachId).toBe('coach-1');
    expect(requested).toBe('team-mens');
  });

  it('refuses when the coach does not staff the requested team', async () => {
    validateCoachTeamAccess.mockResolvedValue(false);

    const result = await createSeries('team-mens');

    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toMatch(/not a coach of that team/i);
    // Nothing may be written on the way to the refusal.
    expect(insertedTeamIds).toEqual([]);
  });

  it('does not re-check when the request matches the resolved active team', async () => {
    // The cookie path already validated this one; re-checking would be a
    // pointless round trip on the common case.
    await createSeries('team-womens');

    expect(validateCoachTeamAccess).not.toHaveBeenCalled();
  });

  it('falls back to the active team when no teamId is supplied', async () => {
    await createSeries(undefined);

    expect(validateCoachTeamAccess).not.toHaveBeenCalled();
    expect(insertedTeamIds.every((t) => t === 'team-womens')).toBe(true);
  });
});
