import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * #1256 — CoachHelm AI availability.
 *
 * CoachHelm produced zero real LLM output for 8 days and no surface said so.
 * The Feature Health board showed the subsystem as ONE amber dot, driven by a
 * single logged warning.
 *
 * That is not a bug in the board, it is a category error. The dot grid is
 * computed from ERROR COUNTS with 2-window hysteresis, which is correct for
 * errors — a single blip must not flip a dot. But a total AI outage generates
 * almost no error volume, because falling back to a deterministic template is a
 * SUCCESSFUL code path that logs one throttled warning. The signal is a rate,
 * not a count, so it needs its own reading and must NOT inherit the hysteresis:
 * one fully dark day is worth showing immediately.
 *
 * The data already exists and is exact. `golf_coachhelm_llm_calls` records
 * `fallback_to_template` on every single call, so availability is one
 * aggregate away — nothing new needs to be instrumented.
 *
 * Reads through the service-role client, the same as every other admin data
 * module: `golf_coachhelm_llm_calls` has RLS on with a single coach-scoped
 * SELECT policy, so a super-admin's own session cannot read the whole table.
 */

export interface AiAvailability {
  /** Calls in the window. 0 means "no traffic", which is NOT an outage. */
  calls: number;
  /** How many of those fell back to a deterministic template. */
  fellBack: number;
  /**
   * Fraction of calls that reached a real model, 0..1. `null` when there were
   * no calls at all — an honest "no signal", never a fabricated 100%.
   */
  availability: number | null;
  /** ISO timestamp of the most recent call that reached a real model. */
  lastSuccessfulAt: string | null;
  /** Whole days since the last real model call; null if there has never been one. */
  daysSinceSuccess: number | null;
  status: 'green' | 'amber' | 'red' | 'neutral';
  /** One line stating what was measured, for display under the readout. */
  summary: string;
  /** True when the query itself failed — render stale, never a green dot. */
  degraded: boolean;
}

const WINDOW_HOURS = 24;

/** Below this fraction the AI layer is meaningfully degraded rather than flaky. */
const AMBER_BELOW = 0.8;

export async function fetchAiAvailability(): Promise<AiAvailability> {
  const admin = createAdminClient();
  const since = new Date(Date.now() - WINDOW_HOURS * 60 * 60 * 1000).toISOString();

  const [windowRes, lastOkRes] = await Promise.all([
    admin
      .from('golf_coachhelm_llm_calls')
      .select('fallback_to_template')
      .gte('created_at', since),
    admin
      .from('golf_coachhelm_llm_calls')
      .select('created_at')
      .eq('fallback_to_template', false)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (windowRes.error) {
    return {
      calls: 0,
      fellBack: 0,
      availability: null,
      lastSuccessfulAt: null,
      daysSinceSuccess: null,
      status: 'neutral',
      summary: 'Could not read golf_coachhelm_llm_calls — availability unknown.',
      degraded: true,
    };
  }

  const rows = windowRes.data ?? [];
  const calls = rows.length;
  const fellBack = rows.filter((r) => r.fallback_to_template).length;
  const availability = calls === 0 ? null : (calls - fellBack) / calls;

  const lastSuccessfulAt = lastOkRes.error ? null : (lastOkRes.data?.created_at ?? null);
  const daysSinceSuccess = lastSuccessfulAt
    ? Math.floor((Date.now() - new Date(lastSuccessfulAt).getTime()) / 86_400_000)
    : null;

  // No traffic is genuinely no signal. Reporting green here would be the same
  // class of lie this whole readout exists to prevent.
  let status: AiAvailability['status'] = 'neutral';
  let summary = `No CoachHelm LLM calls in the last ${WINDOW_HOURS}h — no signal either way.`;

  if (availability !== null) {
    const pct = Math.round(availability * 100);
    if (availability === 0) {
      status = 'red';
      summary =
        `0% availability — all ${calls} CoachHelm LLM calls in the last ${WINDOW_HOURS}h ` +
        `fell back to a deterministic template.`;
    } else if (availability < AMBER_BELOW) {
      status = 'amber';
      summary = `${pct}% availability — ${fellBack} of ${calls} calls fell back to a template.`;
    } else {
      status = 'green';
      summary = `${pct}% availability across ${calls} calls in the last ${WINDOW_HOURS}h.`;
    }
  }

  if (status === 'red' && daysSinceSuccess !== null && daysSinceSuccess >= 1) {
    summary += ` Last successful model call was ${daysSinceSuccess} day${
      daysSinceSuccess === 1 ? '' : 's'
    } ago.`;
  } else if (status === 'red' && lastSuccessfulAt === null) {
    summary += ' There is no record of a successful model call.';
  }

  return {
    calls,
    fellBack,
    availability,
    lastSuccessfulAt,
    daysSinceSuccess,
    status,
    summary,
    degraded: false,
  };
}
