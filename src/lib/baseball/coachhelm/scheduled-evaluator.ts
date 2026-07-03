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


import { type BaseballEngineRunResult } from '@/lib/baseball/coachhelm/engine-run';


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


