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

type Sb = SupabaseClient<Database>;

export interface BudgetCheckResult {
  allowed: boolean;
  remaining_usd: number;
  budget_usd: number;
  spent_usd: number;
  /** When falling back, this is the human-readable reason. */
  fallback_reason?: string;
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
  if (existing) {
    budget_usd = Number(existing.budget_usd);
    spent_usd = Number(existing.spent_usd);
  } else {
    budget_usd = await resolveDefaultBudgetForCoach(supabase, coach_id);
    spent_usd = 0;
  }

  const remaining = Math.max(0, budget_usd - spent_usd);
  const allowed = budget_usd > 0 && remaining >= estimated_cost_usd;

  return {
    allowed,
    remaining_usd: remaining,
    budget_usd,
    spent_usd,
    fallback_reason: allowed
      ? undefined
      : budget_usd === 0
        ? 'budget_zero'
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
  const budget_usd = await resolveDefaultBudgetForCoach(supabase, args.coach_id);

  // Fetch current to compute new task_class_usage breakdown.
  const { data: cur } = await supabase
    .from('golf_coachhelm_llm_budget')
    .select('spent_usd, task_class_usage, budget_usd')
    .eq('coach_id', args.coach_id)
    .eq('date', date)
    .maybeSingle();

  const usage = (cur?.task_class_usage as Record<string, number> | null) ?? {};
  usage[args.task] = (Number(usage[args.task] ?? 0)) + args.cost_usd;

  await supabase.from('golf_coachhelm_llm_budget').upsert(
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
}

/**
 * Resolve the coach's team's default daily LLM budget. Returns 0 if
 * no settings row exists for the team or the column is null — meaning
 * the gate denies all calls (safer default than letting calls through).
 */
async function resolveDefaultBudgetForCoach(supabase: Sb, coach_id: string): Promise<number> {
  // coach -> team via golf_team_coach_staff (per coachhelm-v3 schema notes)
  const { data: staff } = await supabase
    .from('golf_team_coach_staff')
    .select('team_id')
    .eq('coach_id', coach_id)
    .limit(1)
    .maybeSingle();
  if (!staff) return 0;

  const { data: settings } = await supabase
    .from('golf_coachhelm_settings')
    .select('llm_budget_usd_per_day')
    .eq('team_id', staff.team_id)
    .maybeSingle();

  const raw = settings?.llm_budget_usd_per_day;
  if (raw === null || raw === undefined) return 0;
  return Number(raw);
}
