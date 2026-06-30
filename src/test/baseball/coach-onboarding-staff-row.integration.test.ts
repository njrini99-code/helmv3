// =============================================================================
// Integration test: coach onboarding provisions the head-coach staff row.
//
// Regression for the [critical] auth-onboarding defect: completeCoachOnboarding
// used to insert organizations + baseball_coaches + baseball_teams but NEVER a
// baseball_team_coach_staff row. Because the entire capability stack +
// active-team resolution read ONLY from baseball_team_coach_staff, a freshly
// onboarded head coach landed with NULL team context and ZERO capabilities:
//   - getActiveBaseballContext() returned null (0 staff memberships)
//   - every requireBaseballCapability() / withBaseballAction() gate failed
//
// This test wires the REAL onboarding action against an in-memory DB shared
// between the admin (write) client and the request-scoped (read) client, then
// asserts the end-to-end invariants:
//   1. onboarding writes exactly one PRIMARY head-coach staff row
//   2. getActiveBaseballContext() is NON-NULL immediately after onboarding
//      and resolves the coach role + coach id from that staff row
//   3. resolveBaseballCapabilities() grants full authority (head/primary coach)
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- In-memory DB shared between the admin + request-scoped clients ----------

interface Row {
  [key: string]: unknown;
}

const db: Record<string, Row[]> = {
  users: [],
  organizations: [],
  baseball_coaches: [],
  baseball_teams: [],
  baseball_team_coach_staff: [],
  baseball_players: [],
  baseball_team_members: [],
};

const authUser = { id: 'user-coach-1', email: 'coach@example.com' };

function resetDb() {
  for (const key of Object.keys(db)) db[key] = [];
}

/** Strict-safe table accessor (avoids noUncheckedIndexedAccess `undefined`). */
function rows(name: string): Row[] {
  return db[name] ?? [];
}
/** Strict-safe first-row accessor. */
function firstRow(name: string): Row {
  const row = rows(name)[0];
  if (!row) throw new Error(`expected at least one row in ${name}`);
  return row;
}

let idSeq = 0;
function nextId(prefix: string) {
  idSeq += 1;
  return `${prefix}-${idSeq}`;
}

// A minimal chainable query builder over the in-memory tables that supports the
// subset of the PostgREST surface the action + active-context use:
//   .insert(row).select(cols).single()
//   .insert(row)            (no select — staff row write)
//   .upsert(row, opts)
//   .select(cols).eq(c,v)[.eq(c,v)][.order()][.limit()].maybeSingle()/.single()
function makeBuilder(table: string) {
  const filters: Array<[string, unknown]> = [];
  let pendingInsert: Row | null = null;

  const builder: Record<string, unknown> = {
    insert(row: Row) {
      const withId = { id: row.id ?? nextId(table), created_at: new Date().toISOString(), ...row };
      db[table] = db[table] ?? [];
      db[table].push(withId);
      pendingInsert = withId;
      // Resolve as a thenable when not chained into .select()
      return builder;
    },
    upsert(row: Row, opts?: { onConflict?: string; ignoreDuplicates?: boolean }) {
      db[table] = db[table] ?? [];
      const conflictCols = (opts?.onConflict ?? 'id').split(',').map((c) => c.trim());
      const existing = db[table].find((r) => conflictCols.every((c) => r[c] === row[c]));
      if (existing) {
        if (!opts?.ignoreDuplicates) Object.assign(existing, row);
        pendingInsert = existing;
      } else {
        const withId = { id: row.id ?? nextId(table), created_at: new Date().toISOString(), ...row };
        db[table].push(withId);
        pendingInsert = withId;
      }
      return builder;
    },
    select() {
      return builder;
    },
    eq(col: string, val: unknown) {
      filters.push([col, val]);
      return builder;
    },
    order() {
      return builder;
    },
    limit() {
      return builder;
    },
    async maybeSingle() {
      if (pendingInsert) return { data: pendingInsert, error: null };
      const found = (db[table] ?? []).find((r) => filters.every(([c, v]) => r[c] === v));
      return { data: found ?? null, error: null };
    },
    async single() {
      if (pendingInsert) return { data: pendingInsert, error: null };
      const found = (db[table] ?? []).find((r) => filters.every(([c, v]) => r[c] === v));
      return { data: found ?? null, error: found ? null : { message: 'no rows' } };
    },
    // Array read for active-context's .select().eq().order() (no single())
    then(resolve: (v: { data: Row[]; error: null }) => void) {
      const rows = (db[table] ?? []).filter((r) => filters.every(([c, v]) => r[c] === v));
      resolve({ data: rows, error: null });
    },
  };

  return builder;
}

function makeClient() {
  return {
    auth: { getUser: vi.fn(async () => ({ data: { user: authUser } })) },
    from: (table: string) => makeBuilder(table),
  };
}

// Admin (service-role) client — onboarding writes through this.
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => makeClient()),
}));

// Request-scoped client — active-context + capabilities read through this.
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => makeClient()),
}));

// fromUntyped just unwraps client.from(table) — point it at the same builder so
// the onboarding staff insert + active-context reads hit the in-memory tables.
vi.mock('@/lib/supabase/untyped', () => ({
  fromUntyped: (client: { from: (t: string) => unknown }, table: string) => client.from(table),
}));

// next/cache + next/headers are no-ops in this test.
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ get: vi.fn(() => undefined), set: vi.fn() })),
  headers: vi.fn(async () => ({ get: vi.fn(() => null) })),
}));

// Silence loggers (would otherwise hit DB).
vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => undefined),
  logServerException: vi.fn(async () => undefined),
}));

import { completeCoachOnboarding } from '@/app/baseball/actions/onboarding';
import { getActiveBaseballContext } from '@/lib/baseball/active-context';
import { resolveBaseballCapabilities } from '@/lib/baseball/capabilities';

beforeEach(() => {
  resetDb();
  idSeq = 0;
  vi.clearAllMocks();
});

describe('coach onboarding provisions the head-coach staff row', () => {
  async function onboard() {
    return completeCoachOnboarding(
      {
        coachType: 'college',
        schoolName: 'Test University',
        division: 'D1',
        city: 'Austin',
        state: 'TX',
        fullName: 'Head Coach',
        title: 'Head Coach',
      },
      authUser as unknown as Parameters<typeof completeCoachOnboarding>[1],
    );
  }

  it('writes exactly one PRIMARY head-coach staff row bound to the new team', async () => {
    const result = await onboard();
    expect(result.success).toBe(true);

    const staff = rows('baseball_team_coach_staff');
    expect(staff).toHaveLength(1);

    const staffRow = firstRow('baseball_team_coach_staff');
    const team = firstRow('baseball_teams');
    const coach = firstRow('baseball_coaches');
    expect(staffRow.team_id).toBe(team.id);
    expect(staffRow.coach_id).toBe(coach.id);
    expect(staffRow.is_primary).toBe(true);
    expect(staffRow.is_head_coach).toBe(true);
    expect(staffRow.status).toBe('active');
    expect(staffRow.can_manage_roster).toBe(true);
    expect(staffRow.can_manage_settings).toBe(true);
  });

  it('makes getActiveBaseballContext() NON-NULL immediately after onboarding', async () => {
    await onboard();

    const ctx = await getActiveBaseballContext();
    expect(ctx).not.toBeNull();
    expect(ctx?.activeRole).toBe('coach');
    expect(ctx?.activeTeamId).toBe(firstRow('baseball_teams').id);
    expect(ctx?.activeCoachId).toBe(firstRow('baseball_coaches').id);
  });

  it('grants full capability authority to the freshly-onboarded head coach', async () => {
    await onboard();

    const teamId = firstRow('baseball_teams').id as string;
    const caps = await resolveBaseballCapabilities(teamId);
    expect(caps.can_manage_roster).toBe(true);
    expect(caps.can_manage_settings).toBe(true);
    expect(caps.can_manage_practice).toBe(true);
    expect(caps.is_head_coach).toBe(true);
  });
});
