import 'server-only';

// =============================================================================
// src/lib/baseball/coachhelm/scheduled-evaluator.ts
//
// V12 — the CoachHelm baseball SCHEDULED EVALUATOR core.
//
// THE GAP THIS CLOSES (V5 System 1: "Signals are the heartbeat of BaseballHelm"):
//   Before this, runBaseballEngine fired ONLY on a manual "Run engine" click or
//   right after an import. Nothing ran it on a cadence, so the rule evaluator's
//   TIME-RELATIVE conditions (next-event proximity ranking, stale-source decay,
//   the expires_at TTL) could never re-evaluate on their own. A coach who never
//   clicked the button had a permanently empty, frozen inbox. This module is the
//   daily operational heartbeat: it re-runs the engine core per active team and
//   sweeps expired signals out of the inbox, every day, with no human click.
//
// DESIGN (mirrors outcome-sweep.ts — client-agnostic core, thin Inngest shell):
//   - Discover only ACTIVE teams: a team with >=1 staff coach AND >=1 roster
//     member. Anything else can produce no insight, so we never iterate it.
//   - Resolve the OWNING coach per team (is_primary > head_coach > first staff)
//     so the generated insight rows have a stable, sensible coach_id owner across
//     daily runs (the dedupe_key upsert UPDATES the same rows, so the owner must
//     be deterministic, not "whoever clicked last").
//   - Resolve that coach's auth user_id for created_by on signals/audit rows.
//   - Read the team's AI policy with the SAME logic the RLS engine uses
//     (readAiPolicyWithClient over the admin client) so the master switch + gates
//     are honored identically — a team with AI off generates nothing here either.
//   - Run runBaseballEngineCore per team. The core is fully idempotent + non-
//     destructive (dedupe_key upsert, soft archive/resolve/expire), so a daily
//     re-run never duplicates or clobbers coach-triaged rows.
//
// SECURITY: uses the service-role admin client (no session in a cron). Every
// query scopes by team_id, so cross-team leakage is impossible. This is the same
// trust model as the existing coachhelmOutcomeSweep.
//
// NO schema changes. NO new tables. The evaluator only READS staff/roster and
// drives the already-shipped engine core.
// =============================================================================

import { readAiPolicyWithClient } from '@/lib/baseball/ai-policy-server';
import {
  runBaseballEngineCore,
  sweepExpiredSignals,
  type EngineRunClient,
  type BaseballEngineRunResult,
} from '@/lib/baseball/coachhelm/engine-run';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';

// Same minimally-typed client as the engine core: the admin client (or, in
// tests, a fake) satisfies `.from`. We additionally require the SupabaseClient
// shape for the policy read, so the concrete admin client is what callers pass.
type EvaluatorClient = EngineRunClient & {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

// Staff-role precedence when a team has multiple staff and none is is_primary.
// Lower index = higher precedence for "who owns the engine rows".
const ROLE_PRECEDENCE: readonly string[] = [
  'head_coach',
  'associate_head_coach',
  'assistant_coach',
];

export interface ScheduledEvaluatorTeamResult {
  teamId: string;
  /** The run result, or null if the team was skipped before the engine ran. */
  result: BaseballEngineRunResult | null;
  /** Why a team was skipped (no engine run) — observable in the cron summary. */
  skipped?: 'no-coach' | 'no-coach-user' | 'no-roster';
}

export interface ScheduledEvaluatorSummary {
  teamsConsidered: number;
  teamsEvaluated: number;
  teamsSkipped: number;
  signalsEmitted: number;
  signalsResolved: number;
  signalsExpired: number;
  insightsGenerated: number;
  aiDisabledTeams: number;
  errors: number;
  skipReasons: Record<string, number>;
}

interface StaffRow {
  team_id: string | null;
  coach_id: string | null;
  role: string | null;
  is_primary: boolean | null;
}

/**
 * Resolve, per team, the single owning coach id from its staff rows:
 *   is_primary === true  >  role precedence (head/assoc/assistant)  >  first seen.
 * Deterministic for a fixed staff set, so daily re-runs keep the same owner.
 */
export function resolveOwningCoachByTeam(staff: StaffRow[]): Map<string, string> {
  const byTeam = new Map<string, StaffRow[]>();
  for (const s of staff) {
    if (!s.team_id || !s.coach_id) continue;
    const list = byTeam.get(s.team_id) ?? [];
    list.push(s);
    byTeam.set(s.team_id, list);
  }

  const out = new Map<string, string>();
  for (const [teamId, rows] of byTeam) {
    const primary = rows.find((r) => r.is_primary === true && r.coach_id);
    if (primary?.coach_id) {
      out.set(teamId, primary.coach_id);
      continue;
    }
    const ranked = [...rows].sort((a, b) => {
      const ra = ROLE_PRECEDENCE.indexOf(a.role ?? '');
      const rb = ROLE_PRECEDENCE.indexOf(b.role ?? '');
      const na = ra === -1 ? ROLE_PRECEDENCE.length : ra;
      const nb = rb === -1 ? ROLE_PRECEDENCE.length : rb;
      return na - nb;
    });
    const chosen = ranked.find((r) => r.coach_id);
    if (chosen?.coach_id) out.set(teamId, chosen.coach_id);
  }
  return out;
}

/**
 * Run the daily heartbeat over EVERY active team. Returns an aggregate summary +
 * per-team results. Never throws on a single team's failure — each team is
 * isolated so one bad team never aborts the roster of teams.
 *
 * `nowIso` is a single run clock (so every team in a run agrees on "now"); pass
 * it from the Inngest step so retries are deterministic.
 */
export async function runScheduledEvaluator(
  client: EvaluatorClient,
  opts: { nowIso?: string } = {},
): Promise<{ summary: ScheduledEvaluatorSummary; perTeam: ScheduledEvaluatorTeamResult[] }> {
  const nowIso = opts.nowIso ?? new Date().toISOString();

  const summary: ScheduledEvaluatorSummary = {
    teamsConsidered: 0,
    teamsEvaluated: 0,
    teamsSkipped: 0,
    signalsEmitted: 0,
    signalsResolved: 0,
    signalsExpired: 0,
    insightsGenerated: 0,
    aiDisabledTeams: 0,
    errors: 0,
    skipReasons: {},
  };
  const perTeam: ScheduledEvaluatorTeamResult[] = [];

  // 1. Discover staff (team -> coach) across EVERY team. This is a platform-wide
  //    read (no team filter — the cron has no team scope yet), so it is exactly
  //    the read most likely to exceed the PostgREST 1000-row cap at scale. The
  //    old `.limit(50000)` was silently capped to 1000, which meant once the
  //    platform crossed 1000 staff rows, every team after the first page was
  //    NEVER discovered and so NEVER evaluated by the heartbeat. Paginate the
  //    full set with a stable order (id asc) so page boundaries are deterministic
  //    and no team is dropped.
  const { data: staffRaw, error: staffErr } = await fetchAllRowsResult<StaffRow>(
    (from, to) =>
      client
        .from('baseball_team_coach_staff')
        .select('team_id, coach_id, role, is_primary, id')
        .order('id', { ascending: true })
        .range(from, to),
  );
  if (staffErr) {
    summary.errors += 1;
    return { summary, perTeam };
  }
  const staff = (staffRaw ?? []) as StaffRow[];
  const owningCoachByTeam = resolveOwningCoachByTeam(staff);
  const teamIds = Array.from(owningCoachByTeam.keys());
  summary.teamsConsidered = teamIds.length;
  if (teamIds.length === 0) return { summary, perTeam };

  // 2. Resolve each owning coach's auth user_id (created_by stamp). One read.
  const coachIds = Array.from(new Set(owningCoachByTeam.values()));
  const { data: coachRows } = await client
    .from('baseball_coaches')
    .select('id, user_id')
    .in('id', coachIds);
  const userIdByCoach = new Map<string, string>();
  for (const c of (coachRows ?? []) as Array<{ id: string; user_id: string | null }>) {
    if (c.user_id) userIdByCoach.set(c.id, c.user_id);
  }

  // 3. Determine which teams actually have a roster (>=1 member). A team with no
  //    members produces no insights; we still SWEEP its expired signals so a
  //    drained roster's stale inbox clears, then skip the engine run.
  const { data: memberRows } = await client
    .from('baseball_team_members')
    .select('team_id')
    .in('team_id', teamIds);
  const teamsWithRoster = new Set<string>();
  for (const m of (memberRows ?? []) as Array<{ team_id: string | null }>) {
    if (m.team_id) teamsWithRoster.add(m.team_id);
  }

  // 4. Evaluate each team. Isolated per-team so one failure never aborts the run.
  for (const teamId of teamIds) {
    const coachId = owningCoachByTeam.get(teamId);
    if (!coachId) {
      summary.teamsSkipped += 1;
      summary.skipReasons['no-coach'] = (summary.skipReasons['no-coach'] ?? 0) + 1;
      perTeam.push({ teamId, result: null, skipped: 'no-coach' });
      continue;
    }
    const createdByUserId = userIdByCoach.get(coachId);
    if (!createdByUserId) {
      summary.teamsSkipped += 1;
      summary.skipReasons['no-coach-user'] = (summary.skipReasons['no-coach-user'] ?? 0) + 1;
      perTeam.push({ teamId, result: null, skipped: 'no-coach-user' });
      continue;
    }

    if (!teamsWithRoster.has(teamId)) {
      // No roster — sweep its expired signals (drain a stale inbox) then skip.
      try {
        const expired = await sweepExpiredSignals(client, teamId, nowIso);
        summary.signalsExpired += expired;
      } catch {
        summary.errors += 1;
      }
      summary.teamsSkipped += 1;
      summary.skipReasons['no-roster'] = (summary.skipReasons['no-roster'] ?? 0) + 1;
      perTeam.push({ teamId, result: null, skipped: 'no-roster' });
      continue;
    }

    try {
      const policy = await readAiPolicyWithClient(
        client as unknown as Parameters<typeof readAiPolicyWithClient>[0],
        teamId,
      );
      const result = await runBaseballEngineCore(client, {
        teamId,
        coachId,
        createdByUserId,
        policy,
        nowIso,
      });
      perTeam.push({ teamId, result });
      summary.teamsEvaluated += 1;
      summary.signalsEmitted += result.signalsEmitted;
      summary.signalsResolved += result.signalsResolved;
      summary.signalsExpired += result.signalsExpired;
      summary.insightsGenerated += result.generated;
      if (result.aiDisabled) summary.aiDisabledTeams += 1;
      if (!result.success) summary.errors += 1;
    } catch {
      summary.errors += 1;
      perTeam.push({ teamId, result: null });
    }
  }

  return { summary, perTeam };
}
