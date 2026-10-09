import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * completeCoachOnboarding when the school ALREADY has an organization.
 *
 * The org insert hits organizations_normalized_name_uidx (23505). If that org
 * has no team of the requested gender, the coach starts that team inside the
 * existing org (a separate account on a separate team; University of
 * Lynchburg's men's program beside its women's one). If it already has one,
 * the old "already set up on Helm" answer stands.
 *
 * The rollback point matters most: a failure after REUSING an org must never
 * delete that org, because it is somebody else's live program.
 */

// ── Recording Supabase mock ──────────────────────────────────────────────────

type Result = { data: unknown; error: null | { message: string; code?: string } };
type Op = 'select' | 'insert' | 'upsert' | 'update' | 'delete';

interface Call {
  client: 'server' | 'admin';
  table: string;
  op: Op;
  payload?: unknown;
  eq: Record<string, unknown>;
  ilike: Record<string, string>;
}

/** Decides what a finished query returns, given everything it recorded. */
type Resolver = (call: Call) => Result | undefined;

const calls: Call[] = [];
let resolvers: Resolver[] = [];

function makeClient(client: 'server' | 'admin') {
  return {
    from: (table: string) => {
      const call: Call = { client, table, op: 'select', eq: {}, ilike: {} };
      const settle = (): Result => {
        calls.push(call);
        for (const r of resolvers) {
          const out = r(call);
          if (out) return out;
        }
        return { data: null, error: null };
      };
      const chain: Record<string, unknown> = {};
      const setOp = (op: Op) => (payload?: unknown) => {
        // `.select()` after a write is RETURNING; the write stays the op.
        if (op === 'select' && call.op !== 'select') return chain;
        call.op = op;
        if (payload !== undefined) call.payload = payload;
        return chain;
      };
      chain.select = vi.fn(setOp('select'));
      chain.insert = vi.fn(setOp('insert'));
      chain.upsert = vi.fn(setOp('upsert'));
      chain.update = vi.fn(setOp('update'));
      chain.delete = vi.fn(setOp('delete'));
      chain.eq = vi.fn((col: string, val: unknown) => {
        call.eq[col] = val;
        return chain;
      });
      chain.ilike = vi.fn((col: string, val: string) => {
        call.ilike[col] = val;
        return chain;
      });
      chain.limit = vi.fn(() => chain);
      chain.order = vi.fn(() => chain);
      chain.single = vi.fn(async () => settle());
      chain.maybeSingle = vi.fn(async () => settle());
      chain.then = (onFulfilled: (v: Result) => unknown, onRejected?: (e: unknown) => unknown) =>
        Promise.resolve().then(settle).then(onFulfilled, onRejected);
      return chain;
    },
  };
}

const serverClient = makeClient('server');
const adminClient = makeClient('admin');

const mockGetUser = vi.fn(async () => ({
  data: { user: { id: 'user-allen', email: 'allen@example.test', user_metadata: {} } },
  error: null,
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    ...serverClient,
    rpc: vi.fn(async () => ({ data: null, error: null })),
    auth: { getUser: mockGetUser },
  })),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => adminClient),
}));

vi.mock('@/lib/golf/coach-entry-path', () => ({
  resolveGolfCoachEntry: vi.fn(async () => ({ path: '/golf/coach', reason: 'new-program' })),
}));

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(),
  logServerException: vi.fn(),
  logServerEvent: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

import { completeCoachOnboarding } from '../onboarding';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const LYNCHBURG_ORG = '119634a3-b6db-4241-9e8a-d95b0447c4ac';
const DUP = {
  message: 'duplicate key value violates unique constraint "organizations_normalized_name_uidx"',
  code: '23505',
};

/** Baseline: a brand-new coach whose org insert collides with Lynchburg. */
function baseResolvers(opts: {
  orgInsert?: Result;
  candidates?: Array<{ id: string; name: string }>;
  teamsOfGender?: Array<{ id: string }>;
  preExistingCoach?: Record<string, unknown> | null;
  teamInsertError?: { message: string; code?: string } | null;
  staffInsertError?: { message: string } | null;
}): Resolver[] {
  return [
    (c) =>
      c.client === 'server' && c.table === 'organizations' && c.op === 'insert'
        ? opts.orgInsert ?? { data: null, error: DUP }
        : undefined,
    (c) =>
      c.client === 'admin' && c.table === 'organizations' && c.op === 'select'
        ? {
            data: opts.candidates ?? [{ id: LYNCHBURG_ORG, name: 'University of Lynchburg' }],
            error: null,
          }
        : undefined,
    (c) =>
      c.client === 'admin' && c.table === 'golf_teams' && c.op === 'select' && 'gender' in c.eq
        ? { data: opts.teamsOfGender ?? [], error: null }
        : undefined,
    (c) =>
      c.client === 'server' && c.table === 'golf_coaches' && c.op === 'select'
        ? { data: opts.preExistingCoach ?? null, error: null }
        : undefined,
    (c) =>
      c.client === 'server' && c.table === 'golf_coaches' && c.op === 'upsert'
        ? { data: { id: opts.preExistingCoach ? (opts.preExistingCoach.id as string) : 'coach-allen' }, error: null }
        : undefined,
    (c) =>
      c.client === 'server' && c.table === 'golf_teams' && c.op === 'insert'
        ? { data: null, error: opts.teamInsertError ?? null }
        : undefined,
    (c) =>
      c.client === 'admin' && c.table === 'golf_teams' && c.op === 'select' && 'join_code' in c.eq
        ? { data: { id: 'team-lynchburg-mens' }, error: null }
        : undefined,
    (c) =>
      c.client === 'admin' && c.table === 'golf_team_coach_staff' && c.op === 'insert'
        ? { data: null, error: opts.staffInsertError ?? null }
        : undefined,
  ];
}

const ALLEN = {
  orgName: 'University of Lynchburg',
  fullName: 'Allen Smith',
  title: 'Head Coach',
  gender: 'mens' as const,
  division: 'D1',
  conference: 'Somewhere Else',
  city: 'Elsewhere',
  state: 'CA',
};

const find = (pred: (c: Call) => boolean) => calls.filter(pred);
const orgDeletes = () => find((c) => c.table === 'organizations' && c.op === 'delete');
const orgInserts = () => find((c) => c.table === 'organizations' && c.op === 'insert');

beforeEach(() => {
  calls.length = 0;
  resolvers = [];
});

// ── (a) existing org, no team of that gender ─────────────────────────────────

describe('completeCoachOnboarding — school already exists, no team of that gender', () => {
  it('creates the team inside the existing org and makes the coach its head coach', async () => {
    resolvers = baseResolvers({});

    const result = await completeCoachOnboarding(ALLEN);

    expect(result.success).toBe(true);
    expect((result as { data?: { organizationId: string } }).data?.organizationId).toBe(LYNCHBURG_ORG);

    // The only organizations insert is the one that collided: no second org.
    expect(orgInserts()).toHaveLength(1);
    // The org is not edited either: its division/conference/location stay.
    expect(find((c) => c.table === 'organizations' && (c.op === 'update' || c.op === 'upsert'))).toEqual([]);

    const coach = find((c) => c.table === 'golf_coaches' && c.op === 'upsert')[0];
    expect((coach?.payload as Record<string, unknown>).organization_id).toBe(LYNCHBURG_ORG);

    const team = find((c) => c.table === 'golf_teams' && c.op === 'insert')[0];
    const teamRow = team?.payload as Record<string, unknown>;
    expect(teamRow.organization_id).toBe(LYNCHBURG_ORG);
    expect(teamRow.gender).toBe('mens');
    expect(teamRow.created_by).toBe('coach-allen');
    expect(typeof teamRow.join_code).toBe('string');
    expect(teamRow.name).toBe('University of Lynchburg Golf');

    const staff = find((c) => c.table === 'golf_team_coach_staff' && c.op === 'insert')[0];
    expect(staff?.client).toBe('admin');
    expect(staff?.payload).toEqual({
      team_id: 'team-lynchburg-mens',
      coach_id: 'coach-allen',
      role: 'head_coach',
      is_primary: true,
    });

    expect(orgDeletes()).toEqual([]);
  });

  it('checks for a team of the REQUESTED gender in THAT org', async () => {
    resolvers = baseResolvers({});

    await completeCoachOnboarding(ALLEN);

    const genderCheck = find(
      (c) => c.client === 'admin' && c.table === 'golf_teams' && c.op === 'select' && 'gender' in c.eq,
    )[0];
    expect(genderCheck?.eq).toEqual({ organization_id: LYNCHBURG_ORG, gender: 'mens' });
  });

  it('matches the index key exactly: case and edge spaces only, never a near name', async () => {
    resolvers = baseResolvers({
      candidates: [
        { id: 'org-hospital', name: 'University of Lynchburg Hospital' },
        { id: LYNCHBURG_ORG, name: 'university of lynchburg ' },
      ],
    });

    const result = await completeCoachOnboarding({ ...ALLEN, orgName: '  UNIVERSITY OF LYNCHBURG ' });

    expect(result.success).toBe(true);
    expect((result as { data?: { organizationId: string } }).data?.organizationId).toBe(LYNCHBURG_ORG);
    // The default team name comes from the stored org name, edge spaces dropped.
    const team = find((c) => c.table === 'golf_teams' && c.op === 'insert')[0];
    expect((team?.payload as Record<string, unknown>).name).toBe('university of lynchburg Golf');
    const lookup = find((c) => c.client === 'admin' && c.table === 'organizations' && c.op === 'select')[0];
    expect(lookup?.ilike.name).toBe('%UNIVERSITY OF LYNCHBURG%');
  });

  it('escapes LIKE wildcards in the typed name', async () => {
    resolvers = baseResolvers({ candidates: [] });

    await completeCoachOnboarding({ ...ALLEN, orgName: 'St_Mary%s' });

    const lookup = find((c) => c.client === 'admin' && c.table === 'organizations' && c.op === 'select')[0];
    expect(lookup?.ilike.name).toBe('%St\\_Mary\\%s%');
  });

  it('keeps the old answer when no candidate matches the index key exactly', async () => {
    resolvers = baseResolvers({ candidates: [{ id: 'org-hospital', name: 'University of Lynchburg Hospital' }] });

    const result = await completeCoachOnboarding(ALLEN);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/already set up on Helm/i);
    expect(find((c) => c.table === 'golf_coaches' && c.op === 'upsert')).toEqual([]);
  });
});

// ── (b) existing org that already has a team of that gender ──────────────────

describe('completeCoachOnboarding — school already has a team of that gender', () => {
  it('returns the old "already set up" error and redirect, and creates nothing', async () => {
    resolvers = baseResolvers({ teamsOfGender: [{ id: 'team-lynchburg-womens' }] });

    const result = await completeCoachOnboarding({ ...ALLEN, gender: 'womens' });

    // Stable fragments, not the whole sentence (see program-onboarding.test.ts:
    // pinning whole prose is how a copy fix turns main red).
    expect(result.success).toBe(false);
    expect((result as { redirectTo?: string }).redirectTo).toBe('/golf/signup');
    expect(result.error).toMatch(/^University of Lynchburg is already set up on Helm/);
    expect(result.error).toMatch(/team code/i);
    expect(find((c) => c.table === 'golf_coaches' && c.op === 'upsert')).toEqual([]);
    expect(find((c) => c.table === 'golf_teams' && c.op === 'insert')).toEqual([]);
    expect(find((c) => c.table === 'golf_team_coach_staff')).toEqual([]);
    expect(orgDeletes()).toEqual([]);
  });

  it('fails closed to the old error when the gender check cannot be read', async () => {
    resolvers = [
      (c) =>
        c.client === 'admin' && c.table === 'golf_teams' && 'gender' in c.eq
          ? { data: null, error: { message: 'connection reset' } }
          : undefined,
      ...baseResolvers({}),
    ];

    const result = await completeCoachOnboarding(ALLEN);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/already set up on Helm/i);
    expect(find((c) => c.table === 'golf_coaches' && c.op === 'upsert')).toEqual([]);
  });
});

// ── (c) failure after reusing the org ────────────────────────────────────────

describe('completeCoachOnboarding — rollback never deletes a reused org', () => {
  it('team insert fails: the new coach row is removed, the existing org is NOT deleted', async () => {
    resolvers = baseResolvers({ teamInsertError: { message: 'insert failed' } });

    const result = await completeCoachOnboarding(ALLEN);

    expect(result.success).toBe(false);
    expect(orgDeletes()).toEqual([]);
    const coachDeletes = find((c) => c.table === 'golf_coaches' && c.op === 'delete');
    expect(coachDeletes.map((c) => c.eq.id)).toEqual(['coach-allen']);
  });

  it('staff insert fails: the new team and coach go, the existing org is NOT deleted', async () => {
    resolvers = baseResolvers({ staffInsertError: { message: 'insert failed' } });

    const result = await completeCoachOnboarding(ALLEN);

    expect(result.success).toBe(false);
    expect(orgDeletes()).toEqual([]);
    expect(find((c) => c.table === 'golf_teams' && c.op === 'delete').map((c) => c.eq.id)).toEqual([
      'team-lynchburg-mens',
    ]);
  });

  it('a pre-existing coach row is put back, not left pointing at the reused org', async () => {
    resolvers = baseResolvers({
      preExistingCoach: { id: 'coach-declined', organization_id: null, onboarding_completed: false },
      teamInsertError: { message: 'insert failed' },
    });

    const result = await completeCoachOnboarding(ALLEN);

    expect(result.success).toBe(false);
    expect(orgDeletes()).toEqual([]);
    // Never delete a profile this call did not create...
    expect(find((c) => c.table === 'golf_coaches' && c.op === 'delete')).toEqual([]);
    // ...but undo the re-point the upsert made.
    const restore = find((c) => c.table === 'golf_coaches' && c.op === 'update');
    expect(restore).toHaveLength(1);
    expect(restore[0]?.eq).toEqual({ id: 'coach-declined' });
    expect(restore[0]?.payload).toEqual({ organization_id: null, onboarding_completed: false });
  });

  it('control: a failure on an org THIS call created still deletes that org', async () => {
    resolvers = baseResolvers({
      orgInsert: { data: { id: 'org-new' }, error: null },
      teamInsertError: { message: 'insert failed' },
    });

    const result = await completeCoachOnboarding({ ...ALLEN, orgName: 'Brand New College' });

    expect(result.success).toBe(false);
    expect(orgDeletes().map((c) => c.eq.id)).toEqual(['org-new']);
    // A created org never triggers the existing-org lookup.
    expect(find((c) => c.client === 'admin' && c.table === 'organizations')).toEqual([]);
  });
});
