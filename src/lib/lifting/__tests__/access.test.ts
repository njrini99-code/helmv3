// =============================================================================
// resolveLiftingAccess — athlete-self access branch regression tests.
//
// Headline fix (fix-backlog): resolveLiftingAccess had no branch that granted
// canView to a plain player who owns a helm_lifting_athletes row for the org
// (RLS already recognizes this via helm_lifting_is_my_athlete()). Without it,
// every athlete was denied Lift Lab access end-to-end. These tests pin the
// fixed behavior: athlete-self grants canView (never canEdit) and exposes the
// resolved athleteId.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

const authUser = { id: 'user-1', email: 'athlete@example.com' };

let getUserResult: { data: { user: typeof authUser | null } };
let coachRowResult: Record<string, unknown> | null;
let assignmentRows: Array<Record<string, unknown>>;
let viewerRows: Array<{ can_edit: boolean }>;
let athleteRowResult: { id: string } | null;

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => getUserResult) },
  })),
}));

/**
 * Chainable stub matching the shape of the real Postgrest query builder well
 * enough for access.ts's usage: repeated `.eq()` calls, then either
 * `.maybeSingle()` (single-row queries) or a bare `await` on the chain itself
 * (array queries — the builder is thenable).
 */
function makeChain(opts: { single?: unknown; array?: unknown[] }) {
  const chain: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'limit', 'in']) {
    chain[method] = vi.fn(() => chain);
  }
  chain.maybeSingle = vi.fn(async () => ({ data: opts.single ?? null, error: null }));
  chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve({ data: opts.array ?? [], error: null }).then(resolve, reject);
  return chain;
}

vi.mock('@/lib/supabase/untyped', () => ({
  fromUntyped: vi.fn((_supabase: unknown, table: string) => {
    if (table === 'helm_lifting_coaches') {
      return makeChain({ single: coachRowResult });
    }
    if (table === 'helm_lifting_coach_assignments') {
      return makeChain({ array: assignmentRows });
    }
    if (table === 'helm_lifting_org_viewers') {
      return makeChain({ array: viewerRows });
    }
    if (table === 'helm_lifting_athletes') {
      return makeChain({ single: athleteRowResult });
    }
    throw new Error(`unexpected table in test: ${table}`);
  }),
}));

import { resolveLiftingAccess } from '../access';

const ORG_ID = 'org-1';

describe('resolveLiftingAccess — athlete-self branch', () => {
  beforeEach(() => {
    getUserResult = { data: { user: authUser } };
    coachRowResult = null;
    assignmentRows = [];
    viewerRows = [];
    athleteRowResult = null;
  });

  it('grants canView (never canEdit) to a plain player who owns a helm_lifting_athletes row in this org', async () => {
    athleteRowResult = { id: 'athlete-1' };

    const result = await resolveLiftingAccess(ORG_ID);

    expect(result.isCoach).toBe(false);
    expect(result.canView).toBe(true);
    expect(result.canEdit).toBe(false);
    expect(result.athleteId).toBe('athlete-1');
  });

  it('denies access when the user is neither coach, viewer, nor athlete-self (regression guard)', async () => {
    const result = await resolveLiftingAccess(ORG_ID);

    expect(result.canView).toBe(false);
    expect(result.canEdit).toBe(false);
    expect(result.athleteId).toBeNull();
  });

  it('coach access is unaffected by the athlete-self branch', async () => {
    coachRowResult = { id: 'coach-1', organization_id: ORG_ID, full_name: 'Coach Rini' };

    const result = await resolveLiftingAccess(ORG_ID);

    expect(result.isCoach).toBe(true);
    expect(result.canView).toBe(true);
    expect(result.canEdit).toBe(true);
    // No athlete row was seeded for this user in this test — must not be
    // fabricated just because the caller is a coach.
    expect(result.athleteId).toBeNull();
  });

  it('org-viewer (head-coach cross-portal) access is unaffected by the athlete-self branch', async () => {
    viewerRows = [{ can_edit: false }];

    const result = await resolveLiftingAccess(ORG_ID);

    expect(result.canView).toBe(true);
    expect(result.canEdit).toBe(false);
    expect(result.athleteId).toBeNull();
  });

  it('throws when there is no authenticated user', async () => {
    getUserResult = { data: { user: null } };
    await expect(resolveLiftingAccess(ORG_ID)).rejects.toThrow('unauthenticated');
  });
});
