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
  /**
   * The settings rows the fake holds, keyed by coach. `golf_coachhelm_settings`
   * is UNIQUE on `coach_id`, so the resolver must select by coach_id and get at
   * most one row — this fake enforces that by recording the eq() filters and
   * refusing to answer a by-team read.
   */
  settingsByCoach?: Record<string, { llm_budget_usd_per_day: number | null }>;
  /** Force the settings read to fail. */
  settingsError?: boolean;
}) {
  const builder = (table: string) => {
    const filters: Record<string, unknown> = {};
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    chain.select = self;
    chain.eq = (col: string, val: unknown) => {
      filters[col] = val;
      return chain;
    };
    chain.limit = self;
    chain.maybeSingle = async () => {
      if (table === 'golf_coachhelm_llm_budget') return { data: opts.todayRow ?? null, error: null };
      if (table === 'golf_team_coach_staff') {
        return { data: opts.teamId ? { team_id: opts.teamId } : null, error: null };
      }
      if (table === 'golf_coachhelm_settings') {
        if (opts.settingsError) return { data: null, error: { message: 'boom' } };
        // The unique index is on coach_id. A read filtered by anything else
        // is the bug this suite guards against, so make it loud rather than
        // quietly returning a plausible row.
        if (!('coach_id' in filters)) {
          throw new Error(
            `golf_coachhelm_settings must be read by coach_id (got ${JSON.stringify(filters)})`,
          );
        }
        const row = opts.settingsByCoach?.[String(filters.coach_id)];
        return { data: row ?? null, error: null };
      }
      return { data: null, error: null };
    };
    return chain;
  };
  return { from: (table: string) => builder(table) } as never;
}

beforeEach(() => {
  vi.mocked(logServerError).mockClear();
});

describe('checkBudget — where the number came from', () => {
  it('gives an unconfigured coach the platform default, not zero', async () => {
    const result = await checkBudget(fakeSb({ teamId: 't1', settingsByCoach: {} }), 'c1', 0.05);

    expect(result.source).toBe('platform_default');
    expect(result.budget_usd).toBe(PLATFORM_DEFAULT_DAILY_BUDGET_USD);
    expect(result.allowed).toBe(true);
  });

  it('treats a settings row with a null budget as unconfigured too', async () => {
    // The shape production actually had: a row exists, but the column is null.
    const result = await checkBudget(
      fakeSb({ teamId: 't1', settingsByCoach: { c1: { llm_budget_usd_per_day: null } } }),
      'c1',
      0.05,
    );

    expect(result.source).toBe('platform_default');
    expect(result.allowed).toBe(true);
  });

  it('says so in the log when it falls back, so a missing config is findable', async () => {
    await checkBudget(fakeSb({ teamId: 't1', settingsByCoach: {} }), 'c1', 0.05);

    expect(logServerError).toHaveBeenCalledWith(
      expect.stringContaining('no configured daily budget'),
      expect.objectContaining({ action: 'v3.llm.budget.platform_default' }),
      'warning',
    );
  });

  it('honours a deliberate zero, and labels it as a decision', async () => {
    const result = await checkBudget(
      fakeSb({ teamId: 't1', settingsByCoach: { c1: { llm_budget_usd_per_day: 0 } } }),
      'c1',
      0.05,
    );

    expect(result.source).toBe('disabled');
    expect(result.allowed).toBe(false);
    expect(result.fallback_reason).toBe('budget_disabled');
  });

  it('uses a configured budget as configured', async () => {
    const result = await checkBudget(
      fakeSb({ teamId: 't1', settingsByCoach: { c1: { llm_budget_usd_per_day: 5 } } }),
      'c1',
      0.05,
    );

    expect(result.source).toBe('coach_configured');
    expect(result.budget_usd).toBe(5);
    expect(result.allowed).toBe(true);
  });

  /*
   * `golf_coachhelm_settings` is UNIQUE on coach_id and its team_id is
   * nullable — it is a per-coach table. Production team
   * 6ecdd1a6-63fe-4beb-b094-00118f334163 carries two rows because it has TWO
   * COACHES (one budget null, one $5.00), not because anything is duplicated.
   * The resolver used to read every row on the team and take Math.max, which
   * logged a `duplicate_settings` warning on every single resolution for that
   * team, leaked one coach's budget to the other, and made a deliberate
   * per-coach 0 unenforceable whenever a teammate had a positive budget.
   */
  describe('a two-coach team is not duplicate data', () => {
    const twoCoachTeam = {
      teamId: 't1',
      settingsByCoach: {
        c1: { llm_budget_usd_per_day: null },
        c2: { llm_budget_usd_per_day: 5 },
      },
    };

    it('does not inherit a teammate\u2019s budget for a coach who set none', async () => {
      const result = await checkBudget(fakeSb(twoCoachTeam), 'c1', 0.05);

      expect(result.budget_usd).toBe(PLATFORM_DEFAULT_DAILY_BUDGET_USD);
      expect(result.source).toBe('platform_default');
    });

    it('gives the coach who did set one exactly their own number', async () => {
      const result = await checkBudget(fakeSb(twoCoachTeam), 'c2', 0.05);

      expect(result.budget_usd).toBe(5);
      expect(result.source).toBe('coach_configured');
    });

    it('never warns about duplicate settings rows', async () => {
      await checkBudget(fakeSb(twoCoachTeam), 'c1', 0.05);
      await checkBudget(fakeSb(twoCoachTeam), 'c2', 0.05);

      expect(logServerError).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ action: 'v3.llm.budget.duplicate_settings' }),
        expect.anything(),
      );
    });

    it('keeps a deliberate per-coach zero enforceable next to a funded teammate', async () => {
      const result = await checkBudget(
        fakeSb({
          teamId: 't1',
          settingsByCoach: {
            c1: { llm_budget_usd_per_day: 0 },
            c2: { llm_budget_usd_per_day: 5 },
          },
        }),
        'c1',
        0.05,
      );

      expect(result.source).toBe('disabled');
      expect(result.allowed).toBe(false);
    });
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
