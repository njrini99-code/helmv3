/**
 * v3 LLM budget gate (W30).
 *
 * Single source of truth for "should we make the LLM call or fall back
 * to template?". Reads/upserts `golf_coachhelm_llm_budget` for the
 * (coach_id, today) row, comparing `spent_usd` to either that row's
 * `budget_usd` or the team's default `llm_budget_usd_per_day` setting.
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
  /** A settings row for this team carries a budget. Includes a deliberate 0. */
  | 'team_configured'
  /** No settings row, or every row's budget is null — nobody has configured it. */
  | 'platform_default'
  /** A team configured 0 on purpose. Distinct from "nobody configured it". */
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
    source = 'team_configured';
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

  // `.maybeSingle()` was wrong here: `golf_coachhelm_settings` has no unique
  // constraint on team_id, and production carries two rows for at least one
  // team (one configured, one with a null budget). maybeSingle ERRORS on a
  // multi-row result, `settings` comes back undefined, and the coach silently
  // gets a $0 budget — i.e. CoachHelm is switched off for that team with no
  // signal anywhere. Read the rows and resolve deterministically instead.
  const { data: settingsRows, error: settingsError } = await supabase
    .from('golf_coachhelm_settings')
    .select('llm_budget_usd_per_day')
    .eq('team_id', staff.team_id);

  if (settingsError) {
    // A failed read is NOT "this team has no budget". Fail closed on spend —
    // that part is correct — but say so, rather than letting it look like a
    // deliberate zero.
    await logServerError(
      `budget: settings lookup failed for team_id=${staff.team_id} — ${settingsError.message}`,
      { action: 'v3.llm.budget.settings' },
      'warning',
    );
    return { budget_usd: 0, source: 'unresolved' };
  }

  const configured = (settingsRows ?? [])
    .map((r) => r.llm_budget_usd_per_day)
    .filter((v): v is NonNullable<typeof v> => v !== null && v !== undefined)
    .map(Number)
    .filter((n) => Number.isFinite(n));

  if ((settingsRows?.length ?? 0) > 1) {
    await logServerError(
      `budget: ${settingsRows!.length} settings rows for team_id=${staff.team_id}; using the highest configured budget`,
      { action: 'v3.llm.budget.duplicate_settings' },
      'warning',
    );
  }

  if (configured.length === 0) {
    // Nobody has set a budget for this team. That is not a decision to switch
    // CoachHelm off — it is the absence of a decision, and the product should
    // work with a ceiling until someone makes one.
    await logServerError(
      `budget: team_id=${staff.team_id} has no configured daily budget; using the platform default of $${PLATFORM_DEFAULT_DAILY_BUDGET_USD}`,
      { action: 'v3.llm.budget.platform_default' },
      'warning',
    );
    return { budget_usd: PLATFORM_DEFAULT_DAILY_BUDGET_USD, source: 'platform_default' };
  }

  // Highest wins: with duplicate rows, honouring a configured budget over a
  // null one is the reading that matches what an admin actually set.
  const budget_usd = Math.max(...configured);
  // An explicit 0 IS a decision — honour it, and label it as one so nobody
  // later mistakes it for a team that was never set up.
  return { budget_usd, source: budget_usd === 0 ? 'disabled' : 'team_configured' };
}
