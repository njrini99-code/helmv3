import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Hoisted mocks ───────────────────────────────────────────────────────────

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/email/resend-client', () => ({
  sendCoachDigest: vi.fn(),
}));

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn().mockResolvedValue(undefined),
  logServerException: vi.fn().mockResolvedValue(undefined),
}));

import { GET } from '@/app/api/cron/coach-morning-digest/route';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendCoachDigest } from '@/lib/email/resend-client';
import { V3_ENGINE_FILTER } from '@/lib/coachhelm/v3/insight-visibility';

const createAdminMock = vi.mocked(createAdminClient);
const sendMock = vi.mocked(sendCoachDigest);

// ── Supabase mock builder ───────────────────────────────────────────────────
//
// The cron route issues the following queries (in order):
//  1. golf_team_coach_staff          — full eligibility scan (select only)
//  2. golf_team_coach_staff          — coach-scoped team_id list (.eq)
//  3. golf_team_members              — members of those teams
//  4. golf_coach_insights            — top / celebration / watch (×3)
//
// The helper below returns a client where each table's builder resolves to a
// pre-supplied data array.

interface MockConfig {
  staffFull: unknown[];
  staffFullError?: string | null;
  teamsByCoach: Record<string, Array<{ team_id: string }>>;
  membersByTeamKey: Record<string, Array<{ player_id: string }>>; // key = sorted team ids joined with ','
  insightsByLifecycle: Record<string, unknown[]>; // key = sorted lifecycle states
}

function buildSupabase(cfg: MockConfig) {
  function thenableResult(data: unknown[], error: { message: string; code: string } | null) {
    return { data, error };
  }

  function makeStaffBuilder() {
    // Chains: .select(...)[.eq('coach_id', id)]
    let coachIdFilter: string | null = null;
    const thenImpl = (
      onFulfilled?: ((value: unknown) => unknown) | null,
    ) => {
      const resolvedValue = coachIdFilter
        ? thenableResult(cfg.teamsByCoach[coachIdFilter] ?? [], null)
        : thenableResult(
            cfg.staffFull,
            cfg.staffFullError
              ? { message: cfg.staffFullError, code: 'XX' }
              : null,
          );
      const p = Promise.resolve(resolvedValue);
      return onFulfilled ? p.then(onFulfilled) : p;
    };
    const builder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn((col: string, val: string) => {
        if (col === 'coach_id') coachIdFilter = val;
        return builder;
      }),
      then: thenImpl,
    };
    return builder;
  }

  function makeMembersBuilder() {
    let teamIds: string[] = [];
    const thenImpl = (
      onFulfilled?: ((value: unknown) => unknown) | null,
    ) => {
      const key = [...teamIds].sort().join(',');
      const rows = cfg.membersByTeamKey[key] ?? [];
      const p = Promise.resolve(thenableResult(rows, null));
      return onFulfilled ? p.then(onFulfilled) : p;
    };
    const builder = {
      select: vi.fn().mockReturnThis(),
      in: vi.fn((col: string, vals: string[]) => {
        if (col === 'team_id') teamIds = vals;
        return builder;
      }),
      eq: vi.fn().mockReturnThis(),
      then: thenImpl,
    };
    return builder;
  }

  function makeInsightsBuilder() {
    // The cron now routes through `applyInsightVisibility`, which chains
    //   .or(V3_ENGINE_FILTER).in('lifecycle_state', VISIBLE).neq('status','dismissed')
    // BEFORE the per-slot .in('lifecycle_state', lifecycles). We track BOTH the
    // engine .or() and the slot-specific (last) lifecycle .in() so the test data
    // is keyed off the slot list, and so we can assert the v3 filter was applied.
    let lifecycleFilter: string[] = [];
    let orCalled = false;
    const builder = {
      select: vi.fn().mockReturnThis(),
      or: vi.fn((_expr: string) => {
        orCalled = true;
        return builder;
      }),
      in: vi.fn((col: string, vals: string[]) => {
        // The LAST lifecycle .in wins — that's the per-slot narrowing list
        // (VISIBLE_LIFECYCLE_STATES superset applied first, slot list second).
        if (col === 'lifecycle_state') lifecycleFilter = vals;
        return builder;
      }),
      neq: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn((_n: number) => {
        // Guard the audit fix: the v3 engine filter MUST have been applied.
        if (!orCalled) {
          throw new Error('digest insight query missing v3 engine .or() filter');
        }
        const key = [...lifecycleFilter].sort().join(',');
        const rows = cfg.insightsByLifecycle[key] ?? [];
        return Promise.resolve(thenableResult(rows, null));
      }),
    };
    return builder;
  }

  return {
    from: vi.fn((table: string) => {
      if (table === 'golf_team_coach_staff') return makeStaffBuilder();
      if (table === 'golf_team_members') return makeMembersBuilder();
      if (table === 'golf_coach_insights') return makeInsightsBuilder();
      throw new Error(`Unexpected table: ${table}`);
    }),
  } as unknown as ReturnType<typeof createAdminClient>;
}

// ── Factory helpers ─────────────────────────────────────────────────────────

function coachStaffRow(
  coachId: string,
  coachEmail: string | null,
  teamId: string,
  philosophyEnabled: boolean | null = true,
) {
  return {
    coach: {
      id: coachId,
      full_name: `Full Name ${coachId}`,
      email: coachEmail,
      philosophy: philosophyEnabled === null ? null : { email_digest_enabled: philosophyEnabled },
    },
    team: { id: teamId, name: `Team ${teamId}` },
  };
}

function insightRow(
  id: string,
  playerId: string,
  opts: {
    title?: string;
    content?: string;
    strokesImpact?: number;
    confidence?: number;
    firstName?: string;
    lastName?: string;
    lifecycle?: string;
  } = {},
) {
  return {
    id,
    player_id: playerId,
    title: opts.title ?? `Insight ${id}`,
    content: opts.content ?? 'Some content',
    evidence: {
      strokes_impact: opts.strokesImpact ?? 1.2,
      confidence: opts.confidence ?? 0.8,
      metric: 'putt_make_pct',
    },
    lifecycle_state: opts.lifecycle ?? 'matured',
    player: {
      first_name: opts.firstName ?? 'First',
      last_name: opts.lastName ?? 'Last',
    },
  };
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('GET /api/cron/coach-morning-digest', () => {
  beforeEach(() => {
    createAdminMock.mockReset();
    sendMock.mockReset();
    sendMock.mockResolvedValue({ sent: true, skipped: false, messageId: 'msg_1' });
    process.env.CRON_SECRET = 'cs';
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  it('rejects when authorization header is missing', async () => {
    const res = await GET(
      new Request('http://x/api/cron/coach-morning-digest') as unknown as import('next/server').NextRequest,
    );
    expect(res.status).toBe(401);
    expect(createAdminMock).not.toHaveBeenCalled();
  });

  it('rejects when the bearer token is wrong', async () => {
    const res = await GET(
      new Request('http://x/api/cron/coach-morning-digest', {
        headers: { authorization: 'Bearer wrong' },
      }) as unknown as import('next/server').NextRequest,
    );
    expect(res.status).toBe(401);
  });

  it('returns zero-work summary when no staff rows exist', async () => {
    createAdminMock.mockReturnValueOnce(
      buildSupabase({
        staffFull: [],
        teamsByCoach: {},
        membersByTeamKey: {},
        insightsByLifecycle: {},
      }),
    );

    const res = await GET(
      new Request('http://x/api/cron/coach-morning-digest', {
        headers: { authorization: 'Bearer cs' },
      }) as unknown as import('next/server').NextRequest,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      success: boolean;
      coaches_eligible: number;
      sent: number;
      skipped: number;
      failed: number;
    };
    expect(body.success).toBe(true);
    expect(body.coaches_eligible).toBe(0);
    expect(body.sent).toBe(0);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('skips coaches with email_digest_enabled=false', async () => {
    createAdminMock.mockReturnValueOnce(
      buildSupabase({
        staffFull: [coachStaffRow('c1', 'c1@example.com', 't1', false)],
        teamsByCoach: {},
        membersByTeamKey: {},
        insightsByLifecycle: {},
      }),
    );

    const res = await GET(
      new Request('http://x/api/cron/coach-morning-digest', {
        headers: { authorization: 'Bearer cs' },
      }) as unknown as import('next/server').NextRequest,
    );

    const body = (await res.json()) as {
      coaches_eligible: number;
      sent: number;
    };
    expect(body.coaches_eligible).toBe(0);
    expect(body.sent).toBe(0);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('treats missing philosophy as opted-in (default true)', async () => {
    createAdminMock.mockReturnValueOnce(
      buildSupabase({
        staffFull: [coachStaffRow('c1', 'c1@example.com', 't1', null)],
        teamsByCoach: { c1: [{ team_id: 't1' }] },
        membersByTeamKey: { t1: [{ player_id: 'p1' }] },
        insightsByLifecycle: {
          'addressed,matured': [insightRow('i1', 'p1')],
          resolved: [],
          detected: [],
        },
      }),
    );

    await GET(
      new Request('http://x/api/cron/coach-morning-digest', {
        headers: { authorization: 'Bearer cs' },
      }) as unknown as import('next/server').NextRequest,
    );

    expect(sendMock).toHaveBeenCalledTimes(1);
    const callArg = sendMock.mock.calls[0]?.[0];
    expect(callArg?.to).toBe('c1@example.com');
  });

  it('skips coaches with an empty top-insights set (no spam)', async () => {
    createAdminMock.mockReturnValueOnce(
      buildSupabase({
        staffFull: [coachStaffRow('c1', 'c1@example.com', 't1')],
        teamsByCoach: { c1: [{ team_id: 't1' }] },
        membersByTeamKey: { t1: [{ player_id: 'p1' }] },
        insightsByLifecycle: {
          'addressed,matured': [], // <- empty
          resolved: [insightRow('i-celeb', 'p1')],
          detected: [insightRow('i-watch', 'p1')],
        },
      }),
    );

    const res = await GET(
      new Request('http://x/api/cron/coach-morning-digest', {
        headers: { authorization: 'Bearer cs' },
      }) as unknown as import('next/server').NextRequest,
    );

    const body = (await res.json()) as {
      coaches_eligible: number;
      sent: number;
      skipped: number;
    };
    expect(body.coaches_eligible).toBe(1);
    expect(body.sent).toBe(0);
    expect(body.skipped).toBeGreaterThanOrEqual(1);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('sends a digest and returns the correct summary shape for an eligible coach', async () => {
    createAdminMock.mockReturnValueOnce(
      buildSupabase({
        staffFull: [coachStaffRow('c1', 'c1@example.com', 't1', true)],
        teamsByCoach: { c1: [{ team_id: 't1' }] },
        membersByTeamKey: { t1: [{ player_id: 'p1' }, { player_id: 'p2' }] },
        insightsByLifecycle: {
          'addressed,matured': [
            insightRow('i1', 'p1', { strokesImpact: 2.0, confidence: 0.9 }),
            insightRow('i2', 'p2', { strokesImpact: 0.8, confidence: 0.6 }),
          ],
          resolved: [insightRow('iR', 'p1', { lifecycle: 'resolved' })],
          detected: [insightRow('iD', 'p2', { lifecycle: 'detected' })],
        },
      }),
    );

    const res = await GET(
      new Request('http://x/api/cron/coach-morning-digest', {
        headers: { authorization: 'Bearer cs' },
      }) as unknown as import('next/server').NextRequest,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      success: boolean;
      coaches_eligible: number;
      sent: number;
      skipped: number;
      failed: number;
      reasons: Record<string, number>;
    };
    expect(body.success).toBe(true);
    expect(body.coaches_eligible).toBe(1);
    expect(body.sent).toBe(1);
    expect(body.failed).toBe(0);
    expect(typeof body.reasons).toBe('object');

    expect(sendMock).toHaveBeenCalledTimes(1);
    const arg = sendMock.mock.calls[0]?.[0];
    expect(arg?.to).toBe('c1@example.com');
    expect(arg?.subject).toBe('3 things to know about your team this morning');
    expect(arg?.coachId).toBe('c1');
    expect(arg?.html).toContain('Good morning');
    expect(arg?.text.length ?? 0).toBeGreaterThan(0);
  });

  it('applies the shared v3 product-visibility filter to the insight query (DEL-1)', async () => {
    // Capture the `.or()` expression passed to the insight query so we can prove
    // the digest now scopes to the v3 engine (the audit P1 fix) using the shared
    // constant — not a hand-rolled string.
    const orExprs: string[] = [];

    function buildCapturingClient(): ReturnType<typeof createAdminClient> {
      const makeStaff = () => {
        let coachIdFilter: string | null = null;
        const b = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn((col: string, val: string) => {
            if (col === 'coach_id') coachIdFilter = val;
            return b;
          }),
          then: (onF?: ((v: unknown) => unknown) | null) => {
            const data = coachIdFilter
              ? [{ team_id: 't1' }]
              : [coachStaffRow('c1', 'c1@example.com', 't1', true)];
            const p = Promise.resolve({ data, error: null });
            return onF ? p.then(onF) : p;
          },
        };
        return b;
      };
      const makeMembers = () => {
        const b = {
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          then: (onF?: ((v: unknown) => unknown) | null) => {
            const p = Promise.resolve({ data: [{ player_id: 'p1' }], error: null });
            return onF ? p.then(onF) : p;
          },
        };
        return b;
      };
      const makeInsights = () => {
        let lifecycle: string[] = [];
        const b = {
          select: vi.fn().mockReturnThis(),
          or: vi.fn((expr: string) => {
            orExprs.push(expr);
            return b;
          }),
          in: vi.fn((col: string, vals: string[]) => {
            if (col === 'lifecycle_state') lifecycle = vals;
            return b;
          }),
          neq: vi.fn().mockReturnThis(),
          not: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn(() => {
            const key = [...lifecycle].sort().join(',');
            const rows =
              key === 'addressed,matured' ? [insightRow('i1', 'p1')] : [];
            return Promise.resolve({ data: rows, error: null });
          }),
        };
        return b;
      };
      return {
        from: vi.fn((table: string) => {
          if (table === 'golf_team_coach_staff') return makeStaff();
          if (table === 'golf_team_members') return makeMembers();
          if (table === 'golf_coach_insights') return makeInsights();
          throw new Error(`Unexpected table: ${table}`);
        }),
      } as unknown as ReturnType<typeof createAdminClient>;
    }

    createAdminMock.mockReturnValueOnce(buildCapturingClient());

    await GET(
      new Request('http://x/api/cron/coach-morning-digest', {
        headers: { authorization: 'Bearer cs' },
      }) as unknown as import('next/server').NextRequest,
    );

    // 3 slots (top / celebration / watch) → 3 insight queries, each scoped to v3.
    expect(orExprs.length).toBeGreaterThanOrEqual(1);
    for (const expr of orExprs) {
      expect(expr).toBe(V3_ENGINE_FILTER);
    }
  });

  it('counts a failure when sendCoachDigest throws', async () => {
    createAdminMock.mockReturnValueOnce(
      buildSupabase({
        staffFull: [coachStaffRow('c1', 'c1@example.com', 't1')],
        teamsByCoach: { c1: [{ team_id: 't1' }] },
        membersByTeamKey: { t1: [{ player_id: 'p1' }] },
        insightsByLifecycle: {
          'addressed,matured': [insightRow('i1', 'p1')],
          resolved: [],
          detected: [],
        },
      }),
    );
    sendMock.mockRejectedValueOnce(new Error('smtp down'));

    const res = await GET(
      new Request('http://x/api/cron/coach-morning-digest', {
        headers: { authorization: 'Bearer cs' },
      }) as unknown as import('next/server').NextRequest,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { sent: number; failed: number };
    expect(body.sent).toBe(0);
    expect(body.failed).toBe(1);
  });

  it('returns 500 when the eligibility scan errors', async () => {
    createAdminMock.mockReturnValueOnce(
      buildSupabase({
        staffFull: [],
        staffFullError: 'db down',
        teamsByCoach: {},
        membersByTeamKey: {},
        insightsByLifecycle: {},
      }),
    );

    const res = await GET(
      new Request('http://x/api/cron/coach-morning-digest', {
        headers: { authorization: 'Bearer cs' },
      }) as unknown as import('next/server').NextRequest,
    );
    expect(res.status).toBe(500);
  });
});
