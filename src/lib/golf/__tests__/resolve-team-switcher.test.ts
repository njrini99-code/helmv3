/**
 * Tests for the team-switcher additions to resolve-team.ts.
 *
 * Focus:
 *   - the HEAD-COACH gate (getCoachTeamSwitchContext.canSwitch): switching is
 *     a program-head capability — staffed on >1 team AND role 'head_coach'
 *     on at least one staff row. Assistants and single-team head coaches
 *     (e.g. a women's head coach in a two-team program) never switch.
 *   - the cookie-validation fallback contract — an invalid / tampered cookie
 *     is rejected; the fallback prefers the coach's own staffed team, then
 *     the deterministic org-based resolver.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  getCoachTeams,
  getCoachTeamSwitchContext,
  validateCoachTeamAccess,
  resolveCoachActiveTeamId,
} from '../resolve-team';

// ---------------------------------------------------------------------------
// Minimal SupabaseClient mock factory
// ---------------------------------------------------------------------------

function makeSingleResponse<T>(row: T | null) {
  return {
    data: row,
    error: null,
  };
}

/**
 * Build a minimal mock of the Supabase client.
 *
 * `responses` maps table name → response object returned when awaiting the
 * builder directly (i.e. for list queries like `.select('...').eq(...)`).
 * `singleResponses` maps table name → response for `.maybeSingle()` queries.
 */
function makeSupabaseClient(
  responses: Record<string, unknown>,
  singleResponses?: Record<string, unknown>,
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client: any = {
    from: (table: string) => {
      const listResp = responses[table] ?? { data: [], error: null };
      const singleResp = singleResponses?.[table] ?? { data: null, error: null };
      const builder: Record<string, unknown> = {};
      const chain = () => builder;
      builder['select'] = vi.fn(chain);
      builder['eq'] = vi.fn(chain);
      builder['in'] = vi.fn(chain);
      builder['order'] = vi.fn(chain);
      builder['maybeSingle'] = vi.fn(() => Promise.resolve(singleResp));
      // Allow awaiting the builder directly (resolves to the list response).
      Object.defineProperty(builder, 'then', {
        get() {
          return (resolve: (v: unknown) => void) => resolve(listResp);
        },
      });
      return builder;
    },
  };
  return client;
}

const MENS = { id: 'team-m', name: "Men's Golf", gender: 'mens' };
const WOMENS = { id: 'team-w', name: "Women's Golf", gender: 'womens' };

// ---------------------------------------------------------------------------
// getCoachTeamSwitchContext — the HEAD-COACH gate
// ---------------------------------------------------------------------------

describe('getCoachTeamSwitchContext (head-coach gate)', () => {
  it('PROGRAM HEAD: head_coach on 2 staffed teams → canSwitch true', async () => {
    const supabase = makeSupabaseClient({
      golf_team_coach_staff: {
        data: [
          { team_id: 'team-m', role: 'head_coach' },
          { team_id: 'team-w', role: 'head_coach' },
        ],
        error: null,
      },
      golf_teams: { data: [MENS, WOMENS], error: null },
    });
    const ctx = await getCoachTeamSwitchContext(supabase, 'coach-1', 'org-1');
    expect(ctx.isHeadCoach).toBe(true);
    expect(ctx.canSwitch).toBe(true);
    expect(ctx.teams).toHaveLength(2);
  });

  it('PROGRAM HEAD variant: head_coach on one row + assistant on the other → still canSwitch', async () => {
    const supabase = makeSupabaseClient({
      golf_team_coach_staff: {
        data: [
          { team_id: 'team-m', role: 'head_coach' },
          { team_id: 'team-w', role: 'assistant_coach' },
        ],
        error: null,
      },
      golf_teams: { data: [MENS, WOMENS], error: null },
    });
    const ctx = await getCoachTeamSwitchContext(supabase, 'coach-1', 'org-1');
    expect(ctx.canSwitch).toBe(true);
  });

  it('MULTI-TEAM ASSISTANT: 2 staffed teams but no head_coach role → canSwitch false', async () => {
    const supabase = makeSupabaseClient({
      golf_team_coach_staff: {
        data: [
          { team_id: 'team-m', role: 'assistant_coach' },
          { team_id: 'team-w', role: 'assistant_coach' },
        ],
        error: null,
      },
      golf_teams: { data: [MENS, WOMENS], error: null },
    });
    const ctx = await getCoachTeamSwitchContext(supabase, 'coach-1', 'org-1');
    expect(ctx.isHeadCoach).toBe(false);
    expect(ctx.canSwitch).toBe(false);
    // The assistant still SEES their teams (full access) — just no toggle.
    expect(ctx.teams).toHaveLength(2);
  });

  it("SINGLE-TEAM HEAD COACH (women's head coach of the same program): no toggle", async () => {
    const supabase = makeSupabaseClient({
      golf_team_coach_staff: {
        data: [{ team_id: 'team-w', role: 'head_coach' }],
        error: null,
      },
      golf_teams: { data: [WOMENS], error: null },
    });
    const ctx = await getCoachTeamSwitchContext(supabase, 'coach-w', 'org-1');
    expect(ctx.isHeadCoach).toBe(true);
    expect(ctx.canSwitch).toBe(false); // one team → standard single-team viewing
    expect(ctx.teams).toEqual([WOMENS]);
  });

  it('NO STAFF ROWS: org fallback teams are display-only — never switchable', async () => {
    const supabase = makeSupabaseClient({
      golf_team_coach_staff: { data: [], error: null },
      golf_teams: { data: [MENS, WOMENS], error: null },
    });
    const ctx = await getCoachTeamSwitchContext(supabase, 'coach-1', 'org-1');
    expect(ctx.isHeadCoach).toBe(false);
    expect(ctx.canSwitch).toBe(false);
    expect(ctx.teams).toHaveLength(2);
  });

  it('returns empty/false when coachId is falsy', async () => {
    const supabase = makeSupabaseClient({}, {});
    expect(await getCoachTeamSwitchContext(supabase, null, 'org-1')).toEqual({
      teams: [],
      isHeadCoach: false,
      canSwitch: false,
    });
  });
});

// ---------------------------------------------------------------------------
// getCoachTeams
// ---------------------------------------------------------------------------

describe('getCoachTeams', () => {
  it('returns empty array when coachId is falsy', async () => {
    const supabase = makeSupabaseClient({}, {});
    expect(await getCoachTeams(supabase, null, null)).toEqual([]);
    expect(await getCoachTeams(supabase, undefined, undefined)).toEqual([]);
  });

  it('uses golf_team_coach_staff rows when present', async () => {
    const staffRows = [
      { team_id: 'team-m', role: 'head_coach' },
      { team_id: 'team-w', role: 'head_coach' },
    ];
    const supabase = makeSupabaseClient(
      {
        golf_team_coach_staff: { data: staffRows, error: null },
        golf_teams: { data: [MENS, WOMENS], error: null },
      },
      {},
    );
    const result = await getCoachTeams(supabase, 'coach-1', 'org-1');
    expect(result).toEqual([MENS, WOMENS]);
  });

  it('falls back to org-based lookup when staff table is empty', async () => {
    const orgTeams = [{ id: 'team-c', name: 'Team C', gender: 'mens' }];
    const supabase = makeSupabaseClient(
      {
        golf_team_coach_staff: { data: [], error: null },
        golf_teams: { data: orgTeams, error: null },
      },
      {},
    );
    const result = await getCoachTeams(supabase, 'coach-1', 'org-1');
    expect(result).toEqual(orgTeams);
  });
});

// ---------------------------------------------------------------------------
// validateCoachTeamAccess
// ---------------------------------------------------------------------------

describe('validateCoachTeamAccess', () => {
  it('returns true when staff row exists', async () => {
    const supabase = makeSupabaseClient(
      {},
      { golf_team_coach_staff: makeSingleResponse({ id: 'staff-1' }) },
    );
    const result = await validateCoachTeamAccess(supabase, 'coach-1', 'team-1', 'org-1');
    expect(result).toBe(true);
  });

  it('returns true via org fallback when staff row is absent but team belongs to org', async () => {
    const supabase = makeSupabaseClient(
      {},
      {
        golf_team_coach_staff: makeSingleResponse(null),  // no staff row
        golf_teams: makeSingleResponse({ id: 'team-1' }), // team belongs to org
      },
    );
    const result = await validateCoachTeamAccess(supabase, 'coach-1', 'team-1', 'org-1');
    expect(result).toBe(true);
  });

  it('returns false when neither staff row nor org match exists', async () => {
    const supabase = makeSupabaseClient(
      {},
      {
        golf_team_coach_staff: makeSingleResponse(null),
        golf_teams: makeSingleResponse(null),
      },
    );
    const result = await validateCoachTeamAccess(supabase, 'coach-1', 'team-X', null);
    expect(result).toBe(false);
  });

  it('returns false when organizationId is null and no staff row', async () => {
    const supabase = makeSupabaseClient(
      {},
      { golf_team_coach_staff: makeSingleResponse(null) },
    );
    const result = await validateCoachTeamAccess(supabase, 'coach-1', 'team-X', null);
    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// resolveCoachActiveTeamId — cookie validation + staff-first fallback
// ---------------------------------------------------------------------------

describe('resolveCoachActiveTeamId', () => {
  it('uses the cookie value when the coach has access to it via staff row', async () => {
    // Staff row exists → validate returns true → cookie team is returned.
    const supabase = makeSupabaseClient(
      {},
      { golf_team_coach_staff: makeSingleResponse({ id: 'staff-1' }) },
    );
    const result = await resolveCoachActiveTeamId(supabase, 'org-1', 'coach-1', 'team-cookie');
    expect(result).toBe('team-cookie');
  });

  it('falls back when cookie team is invalid (no staff row, no org match, no teams)', async () => {
    // Simulate: no staff row, no org match (golf_teams returns null for maybeSingle),
    // no staff rows for the fallback, and no org teams at all.
    const supabase = makeSupabaseClient(
      {
        golf_team_coach_staff: { data: [], error: null }, // staff fallback → none
        golf_teams: { data: [], error: null },            // org list → empty → null
      },
      {
        golf_team_coach_staff: makeSingleResponse(null), // no staff row
        golf_teams: makeSingleResponse(null),            // team not in org → validate = false
      },
    );
    const result = await resolveCoachActiveTeamId(supabase, 'org-1', 'coach-1', 'team-tampered');
    // Validation rejected the tampered value; fallback found no teams → null.
    expect(result).toBeNull();
  });

  it("no cookie → falls back to the coach's own staffed team (is_primary first)", async () => {
    // The women's head coach scenario: her org has two teams, but she staffs
    // only the women's team — she must land on HER team, not the org pick.
    const supabase = makeSupabaseClient(
      {
        golf_team_coach_staff: {
          data: [{ team_id: 'team-w', is_primary: true }],
          error: null,
        },
        // Org list intentionally contains a bigger men's team — must NOT win.
        golf_teams: { data: [MENS, WOMENS], error: null },
      },
      { golf_team_coach_staff: makeSingleResponse(null) },
    );
    const result = await resolveCoachActiveTeamId(supabase, 'org-1', 'coach-w', null);
    expect(result).toBe('team-w');
  });

  it('falls back to org resolution when no cookie and no staff rows', async () => {
    const orgTeams = [{ id: 'team-org', name: 'Org Team', gender: 'mens', created_at: '2024-01-01' }];
    const supabase = makeSupabaseClient(
      {
        golf_team_coach_staff: { data: [], error: null },
        golf_teams: { data: orgTeams, error: null },
      },
      { golf_team_coach_staff: makeSingleResponse(null) },
    );
    const result = await resolveCoachActiveTeamId(supabase, 'org-1', 'coach-1', null);
    // No cookie, no staff rows → org resolver runs; single org team → team-org.
    expect(result).toBe('team-org');
  });

  it('returns null when organizationId is null, no staff rows, and no cookie provided', async () => {
    const supabase = makeSupabaseClient({}, {});
    const result = await resolveCoachActiveTeamId(supabase, null, 'coach-1', null);
    expect(result).toBeNull();
  });

  it('returns null when cookie is present but coach has no access and org is null', async () => {
    // coachId present, cookie present — but validateCoachTeamAccess returns false
    // (null org + no staff row); fallback also returns null (no staff, null org).
    const supabase = makeSupabaseClient(
      {},
      { golf_team_coach_staff: makeSingleResponse(null) },
    );
    const result = await resolveCoachActiveTeamId(supabase, null, 'coach-1', 'team-forged');
    expect(result).toBeNull();
  });
});
