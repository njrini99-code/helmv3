/**
 * The budget gate's four states, kept apart.
 *
 * Before this, `resolveDefaultBudgetForCoach` returned a bare 0 for a coach
 * with no team, a failed settings read, a team nobody had configured, and a
 * team deliberately set to zero. In production that last-but-one case covered
 * EIGHT OF THIRTEEN teams: every real program would open the rebuilt CoachHelm,
 * ask one question, and be told analysis was unavailable — with nothing
 * anywhere distinguishing "not set up yet" from "switched off on purpose".
 *
 * These tests exist so that collapse cannot come back.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn().mockResolvedValue(undefined),
}));

import { checkBudget, PLATFORM_DEFAULT_DAILY_BUDGET_USD } from '@/lib/coachhelm/v3/llm/budget';
import { logServerError } from '@/lib/server-error-logger';

/**
 * Minimal Supabase stand-in: one canned reply per table. Enough to drive the
 * resolver's branches without a database, and small enough that a reader can
 * see exactly which read is being simulated.
 */
function fakeSb(opts: {
  /** Today's already-seeded budget row, if any. */
  todayRow?: { spent_usd: number; budget_usd: number } | null;
  /** The coach's team, or null for "no staff row". */
  teamId?: string | null;
  /** Settings rows for that team. */
  settings?: Array<{ llm_budget_usd_per_day: number | null }>;
  /** Force the settings read to fail. */
  settingsError?: boolean;
}) {
  const builder = (table: string) => {
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    chain.select = self;
    chain.eq = self;
    chain.limit = self;
    chain.maybeSingle = async () => {
      if (table === 'golf_coachhelm_llm_budget') return { data: opts.todayRow ?? null, error: null };
      if (table === 'golf_team_coach_staff') {
        return { data: opts.teamId ? { team_id: opts.teamId } : null, error: null };
      }
      return { data: null, error: null };
    };
    // `golf_coachhelm_settings` is read as a LIST, deliberately — see the
    // duplicate-rows note in budget.ts.
    chain.then = (resolve: (v: unknown) => unknown) =>
      resolve(
        opts.settingsError
          ? { data: null, error: { message: 'boom' } }
          : { data: opts.settings ?? [], error: null },
      );
    return chain;
  };
  return { from: (table: string) => builder(table) } as never;
}

beforeEach(() => {
  vi.mocked(logServerError).mockClear();
});

describe('checkBudget — where the number came from', () => {
  it('gives an unconfigured team the platform default, not zero', async () => {
    const result = await checkBudget(fakeSb({ teamId: 't1', settings: [] }), 'c1', 0.05);

    expect(result.source).toBe('platform_default');
    expect(result.budget_usd).toBe(PLATFORM_DEFAULT_DAILY_BUDGET_USD);
    expect(result.allowed).toBe(true);
  });

  it('treats a settings row with a null budget as unconfigured too', async () => {
    // The shape production actually had: a row exists, but the column is null.
    const result = await checkBudget(
      fakeSb({ teamId: 't1', settings: [{ llm_budget_usd_per_day: null }] }),
      'c1',
      0.05,
    );

    expect(result.source).toBe('platform_default');
    expect(result.allowed).toBe(true);
  });

  it('says so in the log when it falls back, so a missing config is findable', async () => {
    await checkBudget(fakeSb({ teamId: 't1', settings: [] }), 'c1', 0.05);

    expect(logServerError).toHaveBeenCalledWith(
      expect.stringContaining('no configured daily budget'),
      expect.objectContaining({ action: 'v3.llm.budget.platform_default' }),
      'warning',
    );
  });

  it('honours a deliberate zero, and labels it as a decision', async () => {
    const result = await checkBudget(
      fakeSb({ teamId: 't1', settings: [{ llm_budget_usd_per_day: 0 }] }),
      'c1',
      0.05,
    );

    expect(result.source).toBe('disabled');
    expect(result.allowed).toBe(false);
    expect(result.fallback_reason).toBe('budget_disabled');
  });

  it('uses a configured budget as configured', async () => {
    const result = await checkBudget(
      fakeSb({ teamId: 't1', settings: [{ llm_budget_usd_per_day: 5 }] }),
      'c1',
      0.05,
    );

    expect(result.source).toBe('team_configured');
    expect(result.budget_usd).toBe(5);
    expect(result.allowed).toBe(true);
  });

  it('takes the highest when a team carries duplicate settings rows', async () => {
    // Production had exactly this: one configured row and one null row. The
    // previous `.maybeSingle()` errored on the pair and returned $0.
    const result = await checkBudget(
      fakeSb({
        teamId: 't1',
        settings: [{ llm_budget_usd_per_day: null }, { llm_budget_usd_per_day: 5 }],
      }),
      'c1',
      0.05,
    );

    expect(result.budget_usd).toBe(5);
    expect(result.source).toBe('team_configured');
  });

  it('never guesses a budget for a coach on no team', async () => {
    const result = await checkBudget(fakeSb({ teamId: null }), 'c1', 0.05);

    expect(result.source).toBe('unresolved');
    expect(result.budget_usd).toBe(0);
    expect(result.fallback_reason).toBe('budget_unresolved');
  });

  it('never reads a failed settings read as "this team has no budget"', async () => {
    const result = await checkBudget(fakeSb({ teamId: 't1', settingsError: true }), 'c1', 0.05);

    expect(result.source).toBe('unresolved');
    expect(result.fallback_reason).toBe('budget_unresolved');
    expect(result.fallback_reason).not.toBe('budget_disabled');
  });

  it('reports exhaustion separately from every other denial', async () => {
    const result = await checkBudget(
      fakeSb({ todayRow: { spent_usd: 4.99, budget_usd: 5 } }),
      'c1',
      0.05,
    );

    expect(result.allowed).toBe(false);
    expect(result.fallback_reason).toBe('budget_exhausted');
  });
});
