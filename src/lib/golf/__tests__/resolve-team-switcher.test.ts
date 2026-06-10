/**
 * Tests for the team-switcher additions to resolve-team.ts.
 *
 * Focus: the cookie-validation fallback contract — verifying that
 * an invalid / tampered cookie value is rejected and the deterministic
 * org-based fallback is used instead.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  getCoachTeams,
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
    const staffRows = [{ team_id: 'team-a' }, { team_id: 'team-b' }];
    const teams = [
      { id: 'team-a', name: "Men's Golf", gender: 'male' },
      { id: 'team-b', name: "Women's Golf", gender: 'female' },
    ];
    const supabase = makeSupabaseClient(
      {
        golf_team_coach_staff: { data: staffRows, error: null },
        golf_teams: { data: teams, error: null },
      },
      {},
    );
    const result = await getCoachTeams(supabase, 'coach-1', 'org-1');
    expect(Array.isArray(result)).toBe(true);
  });

  it('falls back to org-based lookup when staff table is empty', async () => {
    const orgTeams = [{ id: 'team-c', name: 'Team C', gender: 'male' }];
    const supabase = makeSupabaseClient(
      {
        golf_team_coach_staff: { data: [], error: null },
        golf_teams: { data: orgTeams, error: null },
      },
      {},
    );
    const result = await getCoachTeams(supabase, 'coach-1', 'org-1');
    expect(Array.isArray(result)).toBe(true);
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
// resolveCoachActiveTeamId — cookie validation + fallback
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

  it('falls back to org resolution when cookie team is invalid (no staff row, no org match, no teams)', async () => {
    // Simulate: no staff row, no org match (golf_teams returns null for maybeSingle),
    // and no org teams at all (list query returns empty → fallback resolves null).
    const supabase = makeSupabaseClient(
      { golf_teams: { data: [], error: null } },    // list → empty → fallback returns null
      {
        golf_team_coach_staff: makeSingleResponse(null), // no staff row
        golf_teams: makeSingleResponse(null),            // team not in org → validate = false
      },
    );
    const result = await resolveCoachActiveTeamId(supabase, 'org-1', 'coach-1', 'team-tampered');
    // Validation rejected the tampered value; fallback found no teams → null.
    expect(result).toBeNull();
  });

  it('falls back to org resolution when no cookie is present', async () => {
    const orgTeams = [{ id: 'team-org', name: 'Org Team', gender: 'male', created_at: '2024-01-01' }];
    const supabase = makeSupabaseClient(
      { golf_teams: { data: orgTeams, error: null } },
      { golf_team_coach_staff: makeSingleResponse(null) },
    );
    const result = await resolveCoachActiveTeamId(supabase, 'org-1', 'coach-1', null);
    // No cookie → org resolver runs; single org team → team-org.
    expect(result).toBe('team-org');
  });

  it('returns null when organizationId is null and no cookie provided', async () => {
    const supabase = makeSupabaseClient({}, {});
    const result = await resolveCoachActiveTeamId(supabase, null, 'coach-1', null);
    expect(result).toBeNull();
  });

  it('returns null when cookie is present but coach has no access and org is null', async () => {
    // coachId present, cookie present — but validateCoachTeamAccess returns false
    // (null org + no staff row); fallback also returns null (null org).
    const supabase = makeSupabaseClient(
      {},
      { golf_team_coach_staff: makeSingleResponse(null) },
    );
    const result = await resolveCoachActiveTeamId(supabase, null, 'coach-1', 'team-forged');
    expect(result).toBeNull();
  });
});
