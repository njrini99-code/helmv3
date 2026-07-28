/**
 * v3 LLM budget gate (W30).
 *
 * Single source of truth for "should we make the LLM call or fall back
 * to template?". Reads/upserts `golf_coachhelm_llm_budget` for the
 * (coach_id, today) row, comparing `spent_usd` to either that row's
 * `budget_usd` or the coach's own `golf_coachhelm_settings
 * .llm_budget_usd_per_day`. Both the cap and the setting are per-coach;
 * `golf_team_coachhelm_settings` is the team-level kill switch and carries
 * no budget.
 *
 * Both functions take an admin Supabase client — these run server-side
 * inside compose() and bypass RLS for the upsert.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import type { ComposeTask } from './types';
import { logServerError } from '@/lib/server-error-logger';

type Sb = SupabaseClient<Database>;

/**
 * Where the day's budget came from.
 *
 * These are kept apart because they lead an operator to different actions, and
 * collapsing them is what shipped a $0 to eight of thirteen production teams
 * with no signal anywhere. `disabled` is a decision someone made; `default` is
 * a decision nobody has made yet; `unresolved` means we could not find out.
 * Only the first is a reason to leave CoachHelm switched off.
 */
export type BudgetSource =
  /**
   * This coach's own settings row carries a budget. Named for the coach, not
   * the team, because `golf_coachhelm_settings` is UNIQUE on `coach_id` — the
   * old `team_configured` spelling is what led the resolver to read the whole
   * team's rows and take their maximum.
   */
  | 'coach_configured'
  /** No settings row, or its budget is null — nobody has configured it. */
  | 'platform_default'
  /** A coach configured 0 on purpose. Distinct from "nobody configured it". */
  | 'disabled'
  /** Coach has no team, or the settings read failed. Fails closed, loudly. */
  | 'unresolved';

/**
 * The platform's daily per-coach budget when a team has not set one.
 *
 * Measured: a CoachHelm chat turn on Sonnet 5 with tool calls costs ~$0.045,
 * so this is roughly 65 questions a day before a coach is asked to wait. It is
 * deliberately a real number rather than 0 — an unconfigured team should get a
 * working product with a ceiling, not a broken one.
 */
export const PLATFORM_DEFAULT_DAILY_BUDGET_USD = Number(
  process.env.COACHHELM_DEFAULT_DAILY_BUDGET_USD ?? 3,
);

export interface BudgetCheckResult {
  allowed: boolean;
  remaining_usd: number;
  budget_usd: number;
  spent_usd: number;
  /** Where `budget_usd` came from — see {@link BudgetSource}. */
  source: BudgetSource;
  /** When falling back, this is the human-readable reason. */
  fallback_reason?: string;
}

interface ResolvedBudget {
  budget_usd: number;
  source: BudgetSource;
}

function todayUtcDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Return whether one more call is allowed for this (coach, today),
 * given the call's estimated cost in USD.
 *
 * Lazily seeds the per-day row using the coach's team default the
 * first time they spend on a given day.
 */
export async function checkBudget(
  supabase: Sb,
  coach_id: string,
  estimated_cost_usd: number,
): Promise<BudgetCheckResult> {
  const date = todayUtcDate();

  const { data: existing } = await supabase
    .from('golf_coachhelm_llm_budget')
    .select('spent_usd, budget_usd')
    .eq('coach_id', coach_id)
    .eq('date', date)
    .maybeSingle();

  let budget_usd: number;
  let spent_usd: number;
  let source: BudgetSource;
  if (existing) {
    budget_usd = Number(existing.budget_usd);
    spent_usd = Number(existing.spent_usd);
    // The day's row already fixed a number; where it originally came from is
    // recorded on the row that seeded it, not re-derived here.
    source = 'coach_configured';
  } else {
    const resolved = await resolveDefaultBudgetForCoach(supabase, coach_id);
    budget_usd = resolved.budget_usd;
    source = resolved.source;
    spent_usd = 0;
  }

  const remaining = Math.max(0, budget_usd - spent_usd);
  const allowed = budget_usd > 0 && remaining >= estimated_cost_usd;

  return {
    allowed,
    remaining_usd: remaining,
    budget_usd,
    spent_usd,
    source,
    // Three different sentences, because they need three different responses:
    // top up tomorrow, ask an admin to switch it on, or fix the account.
    fallback_reason: allowed
      ? undefined
      : source === 'unresolved'
        ? 'budget_unresolved'
        : budget_usd === 0
          ? 'budget_disabled'
          : 'budget_exhausted',
  };
}

/**
 * Record actual spend on (coach, today). Upserts the row, incrementing
 * spent_usd and the task_class_usage subtotal atomically. Safe to call
 * even on calls that returned errors mid-flight — caller is expected
 * to only call this on completed billable calls.
 */
export async function recordSpend(
  supabase: Sb,
  args: {
    coach_id: string;
    task: ComposeTask;
    cost_usd: number;
  },
): Promise<void> {
  const date = todayUtcDate();
  const { budget_usd } = await resolveDefaultBudgetForCoach(supabase, args.coach_id);

  // Fetch current to compute new task_class_usage breakdown.
  const { data: cur } = await supabase
    .from('golf_coachhelm_llm_budget')
    .select('spent_usd, task_class_usage, budget_usd')
    .eq('coach_id', args.coach_id)
    .eq('date', date)
    .maybeSingle();

  const usage = (cur?.task_class_usage as Record<string, number> | null) ?? {};
  usage[args.task] = (Number(usage[args.task] ?? 0)) + args.cost_usd;

  const { error } = await supabase.from('golf_coachhelm_llm_budget').upsert(
    {
      coach_id: args.coach_id,
      date,
      spent_usd: Number(cur?.spent_usd ?? 0) + args.cost_usd,
      // budget_usd is NOT NULL with no default. Even on a conflicting upsert,
      // Postgres validates the candidate INSERT tuple's NOT NULL columns
      // BEFORE `ON CONFLICT DO UPDATE` fires — so omitting it (undefined)
      // threw `null value in column "budget_usd" violates not-null
      // constraint`. Always send a value: preserve the existing row's budget,
      // or seed the team default for a brand-new (coach, day) row.
      budget_usd: cur?.budget_usd != null ? Number(cur.budget_usd) : budget_usd,
      task_class_usage: usage,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'coach_id,date' },
  );
  if (error) {
    // Intentionally fail-open: a failed spend-record silently disables
    // *this* coach's daily cost cap (checkBudget will under-count spend
    // until the next successful write), but blocking chat on a telemetry
    // write would be a worse failure than an uncapped day of usage. Log
    // loudly instead so the miss shows up in the admin dashboard/Sentry.
    await logServerError(`recordSpend upsert failed: ${error.message}`, {
      action: 'v3.llm.recordSpend',
      errorCode: error.code,
      extra: { coach_id: args.coach_id, date, cost_usd: args.cost_usd },
    });
  }
}

/**
 * Resolve the coach's team's daily LLM budget, and say where it came from.
 *
 * The old version returned a bare 0 for four different situations — no team,
 * failed read, no settings row, and a deliberate zero — which meant an
 * unconfigured team was indistinguishable from a switched-off one. In
 * production that was eight of thirteen teams: every coach on them would open
 * CoachHelm, ask a question, and be told analysis was unavailable, with
 * nothing anywhere saying the cause was a missing config row.
 *
 * So an unconfigured team now gets {@link PLATFORM_DEFAULT_DAILY_BUDGET_USD}
 * and a log line, and only the two states we genuinely cannot serve — a
 * deliberate zero and a failed lookup — return 0.
 */
async function resolveDefaultBudgetForCoach(
  supabase: Sb,
  coach_id: string,
): Promise<ResolvedBudget> {
  // coach -> team via golf_team_coach_staff (per coachhelm-v3 schema notes)
  const { data: staff } = await supabase
    .from('golf_team_coach_staff')
    .select('team_id')
    .eq('coach_id', coach_id)
    .limit(1)
    .maybeSingle();
  if (!staff) {
    // A coach on no team is an account-shaped problem, not a billing one.
    // Guessing a budget here would spend money on an unattributable request.
    await logServerError(
      `budget: coach_id=${coach_id} has no team staff row; cannot resolve a budget`,
      { action: 'v3.llm.budget.no_team' },
      'warning',
    );
    return { budget_usd: 0, source: 'unresolved' };
  }

  // Read THIS coach's own settings row.
  //
  // The previous version read every settings row on the coach's team
  // (`.eq('team_id', ...)`) and took `Math.max` of them, on the belief that a
  // team could carry duplicate rows. It cannot: `golf_coachhelm_settings` is
  // UNIQUE on `coach_id` (golf_coachhelm_settings_coach_id_key) with a
  // nullable `team_id`, i.e. it is a PER-COACH table — as the schema notes
  // describe it, next to `golf_team_coachhelm_settings`, which is the
  // team-level kill switch and has no budget column at all. Two rows for one
  // team means two coaches, each with exactly one row.
  //
  // Reading by team therefore broke three things at once:
  //   1. It logged `v3.llm.budget.duplicate_settings` on every budget
  //      resolution for any team with two or more coaches — a warning about
  //      corruption that does not exist and cannot be repaired.
  //   2. `Math.max` leaked one coach's configured budget to a teammate who
  //      had deliberately left theirs unset, so a coach's ceiling moved when
  //      a colleague edited an unrelated setting.
  //   3. `Math.max` made a deliberate per-coach 0 unenforceable: switching
  //      one coach off did nothing while any teammate had a positive budget.
  //
  // Enforcement was always per-coach — `golf_coachhelm_llm_budget` is keyed
  // (coach_id, date), and PLATFORM_DEFAULT_DAILY_BUDGET_USD is documented as
  // a per-coach ceiling — so reading per-coach is what the rest of the gate
  // already assumed.
  const { data: settings, error: settingsError } = await supabase
    .from('golf_coachhelm_settings')
    .select('llm_budget_usd_per_day')
    .eq('coach_id', coach_id)
    .maybeSingle();

  if (settingsError) {
    // A failed read is NOT "this coach has no budget". Fail closed on spend —
    // that part is correct — but say so, rather than letting it look like a
    // deliberate zero.
    await logServerError(
      `budget: settings lookup failed for coach_id=${coach_id} — ${settingsError.message}`,
      { action: 'v3.llm.budget.settings' },
      'warning',
    );
    return { budget_usd: 0, source: 'unresolved' };
  }

  const raw = settings?.llm_budget_usd_per_day;
  const budget_usd = raw === null || raw === undefined ? NaN : Number(raw);

  if (!Number.isFinite(budget_usd)) {
    // No row, or a row whose budget column is null. Nobody has set a budget
    // for this coach. That is not a decision to switch CoachHelm off — it is
    // the absence of a decision, and the product should work with a ceiling
    // until someone makes one.
    await logServerError(
      `budget: coach_id=${coach_id} has no configured daily budget; using the platform default of $${PLATFORM_DEFAULT_DAILY_BUDGET_USD}`,
      { action: 'v3.llm.budget.platform_default' },
      'warning',
    );
    return { budget_usd: PLATFORM_DEFAULT_DAILY_BUDGET_USD, source: 'platform_default' };
  }

  // An explicit 0 IS a decision — honour it, and label it as one so nobody
  // later mistakes it for a coach who was never set up.
  return { budget_usd, source: budget_usd === 0 ? 'disabled' : 'coach_configured' };
}
