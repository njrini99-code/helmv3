// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import {
  resolveCoachTeamId,
  resolveCoachActiveTeamId,
  validateCoachTeamAccess,
  getCoachTeams,
} from '@/lib/baseball/resolve-team';

function makeSupabaseClient(
  responses: Record<string, unknown>,
  singleResponses?: Record<string, unknown>,
) {
  const client = {
    from: (table: string) => {
      const listResp = responses[table] ?? { data: [], error: null };
      const singleResp = singleResponses?.[table] ?? { data: null, error: null };
      const builder: Record<string, unknown> = {};
      const chain = () => builder;
      builder.select = vi.fn(chain);
      builder.eq = vi.fn(chain);
      builder.in = vi.fn(chain);
      builder.order = vi.fn(chain);
      builder.limit = vi.fn(chain);
      builder.maybeSingle = vi.fn(() => Promise.resolve(singleResp));
      builder.single = vi.fn(() => Promise.resolve(singleResp));
      Object.defineProperty(builder, 'then', {
        get() {
          return (resolve: (v: unknown) => void) => resolve(listResp);
        },
      });
      return builder;
    },
  };
  return client as never;
}

describe('resolveCoachTeamId', () => {
  it('returns null for orgs with zero teams', async () => {
    const supabase = makeSupabaseClient({
      baseball_teams: { data: [], error: null },
    });
    expect(await resolveCoachTeamId(supabase, 'org-1')).toBeNull();
  });

  it('returns the sole team for single-team orgs', async () => {
    const supabase = makeSupabaseClient({
      baseball_teams: { data: [{ id: 'team-a', created_at: '2026-01-01' }], error: null },
    });
    expect(await resolveCoachTeamId(supabase, 'org-1')).toBe('team-a');
  });

  it('ranks multiple teams by active member count', async () => {
    const supabase = makeSupabaseClient({
      baseball_teams: {
        data: [
          { id: 'team-quiet', created_at: '2026-01-01', default_team_id: null },
          { id: 'team-busy', created_at: '2026-01-02', default_team_id: null },
        ],
        error: null,
      },
      baseball_team_members: {
        data: [
          { team_id: 'team-busy' },
          { team_id: 'team-busy' },
          { team_id: 'team-quiet' },
        ],
        error: null,
      },
    });
    expect(await resolveCoachTeamId(supabase, 'org-1')).toBe('team-busy');
  });

  it('prefers the program default team when configured', async () => {
    const supabase = makeSupabaseClient({
      baseball_teams: {
        data: [
          { id: 'team-a', created_at: '2026-01-01', default_team_id: 'team-b' },
          { id: 'team-b', created_at: '2026-01-02', default_team_id: 'team-b' },
        ],
        error: null,
      },
    });
    expect(await resolveCoachTeamId(supabase, 'org-1')).toBe('team-b');
  });
});

describe('resolveCoachActiveTeamId', () => {
  it('honors a validated active-team cookie', async () => {
    const supabase = makeSupabaseClient(
      {},
      { baseball_team_coach_staff: { data: { id: 'staff-1' }, error: null } },
    );
    const id = await resolveCoachActiveTeamId(supabase, 'org-1', 'coach-1', 'team-cookie');
    expect(id).toBe('team-cookie');
  });

  it('falls back to staffed team when cookie is invalid', async () => {
    const supabase = makeSupabaseClient(
      {
        baseball_team_coach_staff: {
          data: [{ team_id: 'team-staff', is_primary: true, created_at: '2026-01-01' }],
          error: null,
        },
      },
      { baseball_team_coach_staff: { data: null, error: null } },
    );
    const id = await resolveCoachActiveTeamId(supabase, 'org-1', 'coach-1', 'team-forged');
    expect(id).toBe('team-staff');
  });
});

describe('getCoachTeams', () => {
  it('returns staffed teams for multi-team coaches', async () => {
    const supabase = makeSupabaseClient({
      baseball_team_coach_staff: {
        data: [{ team_id: 't1' }, { team_id: 't2' }],
        error: null,
      },
      baseball_teams: {
        data: [
          { id: 't1', name: 'Varsity', team_type: 'college' },
          { id: 't2', name: 'JV', team_type: 'college' },
        ],
        error: null,
      },
    });
    const teams = await getCoachTeams(supabase, 'coach-1', 'org-1');
    expect(teams).toHaveLength(2);
  });
});

describe('validateCoachTeamAccess', () => {
  it('allows staff on the target team', async () => {
    const supabase = makeSupabaseClient(
      {},
      { baseball_team_coach_staff: { data: { id: 's1' }, error: null } },
    );
    expect(await validateCoachTeamAccess(supabase, 'coach-1', 'team-1', 'org-1')).toBe(true);
  });
});
