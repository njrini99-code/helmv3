/**
 * Tests for GET /api/cron/v3/weekly-coach-email — the coach opt-out gate.
 *
 * CONFIRMED P1 (production-readiness mission, 2026-07-09): this cron sent
 * with ZERO opt-out gate while its own footer claims "Manage email
 * preferences from your CoachHelm settings." There is no dedicated
 * `email_weekly_recap` preference column, so the fix gates the send on the
 * CLOSEST existing coach preference — `golf_coach_philosophy
 * .email_digest_enabled` — the same column /api/cron/coach-morning-digest
 * already honors for its coach digest email. These tests lock that gate in.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Hoisted mocks ───────────────────────────────────────────────────────────

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/coachhelm/v3/recap/builder', () => ({
  buildWeeklyRecap: vi.fn(),
}));

vi.mock('@/lib/coachhelm/v3/recap/template', () => ({
  buildWeeklyRecapHtml: vi.fn(() => ({
    subject: 'Weekly recap',
    html: '<p>recap</p>',
    text: 'recap',
  })),
}));

vi.mock('@/lib/coachhelm/v3/foundation/email', () => ({
  sendEmail: vi.fn(),
}));

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn().mockResolvedValue(undefined),
}));

import { GET } from '@/app/api/cron/v3/weekly-coach-email/route';
import { createAdminClient } from '@/lib/supabase/admin';
import { buildWeeklyRecap } from '@/lib/coachhelm/v3/recap/builder';
import { sendEmail } from '@/lib/coachhelm/v3/foundation/email';

const createAdminMock = vi.mocked(createAdminClient);
const buildRecapMock = vi.mocked(buildWeeklyRecap);
const sendEmailMock = vi.mocked(sendEmail);

// ── Supabase mock builder ───────────────────────────────────────────────────
//
// The route issues (per team): golf_teams (once) → golf_team_coach_staff
// (primary coach) → golf_coach_philosophy (opt-out gate) → golf_coaches
// (user_id) → users (email).

interface MockConfig {
  teamIds: string[];
  primaryCoachByTeam: Record<string, string | undefined>;
  philosophyByCoach: Record<string, { email_digest_enabled: boolean } | undefined>;
  userIdByCoach: Record<string, string | undefined>;
  emailByUser: Record<string, string | undefined>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyBuilder = any;

function buildSupabase(cfg: MockConfig) {
  return {
    from: vi.fn((table: string): AnyBuilder => {
      if (table === 'golf_teams') {
        // Mirrors the .range() idiom in dashboard-data.test.ts:68 — the route
        // now paginates via fetchAllRowsResult, which awaits
        // .select().order().range(from, to) directly rather than the
        // builder itself. .range() is the terminal call and resolves
        // { data, error } (sliced, so pagination truncation is exercised
        // for real if a test ever exceeds one page).
        const builder: AnyBuilder = {
          select: vi.fn(() => builder),
          order: vi.fn(() => builder),
          range: vi.fn((from: number, to: number) =>
            Promise.resolve({
              data: cfg.teamIds.slice(from, to + 1).map((id) => ({ id })),
              error: null,
            }),
          ),
        };
        return builder;
      }
      if (table === 'golf_team_coach_staff') {
        let teamIdFilter: string | null = null;
        const builder: AnyBuilder = {
          select: vi.fn(() => builder),
          eq: vi.fn((col: string, val: string) => {
            if (col === 'team_id') teamIdFilter = val;
            return builder;
          }),
          limit: vi.fn(() => builder),
          maybeSingle: vi.fn(() => {
            const coachId = teamIdFilter ? cfg.primaryCoachByTeam[teamIdFilter] : undefined;
            return Promise.resolve({ data: coachId ? { coach_id: coachId } : null, error: null });
          }),
        };
        return builder;
      }
      if (table === 'golf_coach_philosophy') {
        let coachIdFilter: string | null = null;
        const builder: AnyBuilder = {
          select: vi.fn(() => builder),
          eq: vi.fn((col: string, val: string) => {
            if (col === 'coach_id') coachIdFilter = val;
            return builder;
          }),
          maybeSingle: vi.fn(() => {
            const row = coachIdFilter ? cfg.philosophyByCoach[coachIdFilter] : undefined;
            return Promise.resolve({ data: row ?? null, error: null });
          }),
        };
        return builder;
      }
      if (table === 'golf_coaches') {
        let idFilter: string | null = null;
        const builder: AnyBuilder = {
          select: vi.fn(() => builder),
          eq: vi.fn((col: string, val: string) => {
            if (col === 'id') idFilter = val;
            return builder;
          }),
          maybeSingle: vi.fn(() => {
            const userId = idFilter ? cfg.userIdByCoach[idFilter] : undefined;
            return Promise.resolve({ data: userId ? { user_id: userId } : null, error: null });
          }),
        };
        return builder;
      }
      if (table === 'users') {
        let idFilter: string | null = null;
        const builder: AnyBuilder = {
          select: vi.fn(() => builder),
          eq: vi.fn((col: string, val: string) => {
            if (col === 'id') idFilter = val;
            return builder;
          }),
          maybeSingle: vi.fn(() => {
            const email = idFilter ? cfg.emailByUser[idFilter] : undefined;
            return Promise.resolve({ data: email ? { email } : null, error: null });
          }),
        };
        return builder;
      }
      throw new Error(`Unexpected table: ${table}`);
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

function makeRequest(): import('next/server').NextRequest {
  return new Request('http://x/api/cron/v3/weekly-coach-email', {
    headers: { authorization: 'Bearer cs' },
  }) as unknown as import('next/server').NextRequest;
}

describe('GET /api/cron/v3/weekly-coach-email — opt-out gate', () => {
  beforeEach(() => {
    createAdminMock.mockReset();
    buildRecapMock.mockReset();
    sendEmailMock.mockReset();
    buildRecapMock.mockResolvedValue({
      team_id: 't1',
      team_name: 'Team 1',
      coach_first_name: 'Coach',
      week_start_iso: '2026-07-02T00:00:00.000Z',
      week_end_iso: '2026-07-09T00:00:00.000Z',
      totals: { rounds_played: 3, insights_surfaced: 2, goals_active: 1, avg_score_to_par: 1.2 },
      active_players: [],
      top_patterns: [],
    });
    sendEmailMock.mockResolvedValue({ delivered: true });
    process.env.CRON_SECRET = 'cs';
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  it('does NOT send and does not even build the recap when the coach has opted out (email_digest_enabled=false)', async () => {
    createAdminMock.mockReturnValue(
      buildSupabase({
        teamIds: ['t1'],
        primaryCoachByTeam: { t1: 'c1' },
        philosophyByCoach: { c1: { email_digest_enabled: false } },
        userIdByCoach: { c1: 'u1' },
        emailByUser: { u1: 'c1@example.com' },
      }),
    );

    const res = await GET(makeRequest());
    const body = (await res.json()) as {
      teams_considered: number;
      sent: number;
      skipped_opted_out: number;
    };

    expect(body.teams_considered).toBe(1);
    expect(body.sent).toBe(0);
    expect(body.skipped_opted_out).toBe(1);
    expect(buildRecapMock).not.toHaveBeenCalled();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('sends when the philosophy row is missing (default opted-in, mirrors coach-morning-digest)', async () => {
    createAdminMock.mockReturnValue(
      buildSupabase({
        teamIds: ['t1'],
        primaryCoachByTeam: { t1: 'c1' },
        philosophyByCoach: {},
        userIdByCoach: { c1: 'u1' },
        emailByUser: { u1: 'c1@example.com' },
      }),
    );

    const res = await GET(makeRequest());
    const body = (await res.json()) as { sent: number; skipped_opted_out: number };

    expect(body.sent).toBe(1);
    expect(body.skipped_opted_out).toBe(0);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(sendEmailMock.mock.calls[0]?.[0]?.to).toBe('c1@example.com');
    // Idempotency: weekly-coach-email:<coachId>:<isoWeekStartKey>, so a
    // retry within the same ISO week dedupes via Resend's Idempotency-Key
    // instead of re-emailing the coach.
    expect(sendEmailMock.mock.calls[0]?.[0]?.idempotencyKey).toMatch(
      /^weekly-coach-email:c1:\d{4}-\d{2}-\d{2}$/,
    );
  });

  it('sends when the philosophy row explicitly opts in (email_digest_enabled=true)', async () => {
    createAdminMock.mockReturnValue(
      buildSupabase({
        teamIds: ['t1'],
        primaryCoachByTeam: { t1: 'c1' },
        philosophyByCoach: { c1: { email_digest_enabled: true } },
        userIdByCoach: { c1: 'u1' },
        emailByUser: { u1: 'c1@example.com' },
      }),
    );

    const res = await GET(makeRequest());
    const body = (await res.json()) as { sent: number };
    expect(body.sent).toBe(1);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
  });

  it('opted-out and opted-in coaches on different teams are handled independently', async () => {
    createAdminMock.mockReturnValue(
      buildSupabase({
        teamIds: ['t1', 't2'],
        primaryCoachByTeam: { t1: 'c1', t2: 'c2' },
        philosophyByCoach: { c1: { email_digest_enabled: false }, c2: { email_digest_enabled: true } },
        userIdByCoach: { c1: 'u1', c2: 'u2' },
        emailByUser: { u1: 'c1@example.com', u2: 'c2@example.com' },
      }),
    );

    const res = await GET(makeRequest());
    const body = (await res.json()) as { sent: number; skipped_opted_out: number };

    expect(body.sent).toBe(1);
    expect(body.skipped_opted_out).toBe(1);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(sendEmailMock.mock.calls[0]?.[0]?.to).toBe('c2@example.com');
    // The opted-out coach (c1) never reaches sendEmail at all, so the only
    // call's idempotencyKey must key off the opted-in coach (c2).
    expect(sendEmailMock.mock.calls[0]?.[0]?.idempotencyKey).toMatch(
      /^weekly-coach-email:c2:\d{4}-\d{2}-\d{2}$/,
    );
  });
});
