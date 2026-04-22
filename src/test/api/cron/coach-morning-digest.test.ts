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
    let lifecycleFilter: string[] = [];
    const builder = {
      select: vi.fn().mockReturnThis(),
      in: vi.fn((col: string, vals: string[]) => {
        if (col === 'lifecycle_state') lifecycleFilter = vals;
        return builder;
      }),
      neq: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn((_n: number) => {
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
