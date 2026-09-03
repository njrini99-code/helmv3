import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import type { JourneyLens, JourneyStage } from './types';

/**
 * Lift Lab Program Execution Flow (brief §20-27: "Program assigned →
 * Session opened → Readiness → Sets logged → Completed → Progress updated
 * — with completion rate, stuck sessions, readiness failures, PR/max
 * persistence errors, cross-sport impact, release regression").
 *
 * The ONE lens of the three (golf/baseball/lifting) with a genuinely
 * measurable per-stage funnel end to end — every stage below is backed by a
 * durable helm_lifting_* row, per the schema in
 * supabase/migrations/20260625000020_helm_lifting_data_sessions_readiness.sql:
 *   - Program assigned: helm_lifting_program_assignments.status='published'.
 *   - Session opened: helm_lifting_sessions.status <> 'assigned' (the
 *     materialized default before an athlete has touched it).
 *   - Readiness: helm_lifting_sessions.readiness_checkin_id IS NOT NULL.
 *   - Sets logged: helm_lifting_set_results carries `athlete_id` directly
 *     (denormalized onto the row, not just session_exercise_id) — counted
 *     as DISTINCT ATHLETES who logged >=1 set in the window, an
 *     athlete-level proxy for "opened a session and logged sets", not a
 *     strict per-session join (disclosed, not silently precise-sounding).
 *   - Completed: helm_lifting_sessions.status='completed'.
 *   - Progress updated: helm_lifting_maxes OR helm_lifting_prs created in
 *     the window (a new max/PR is the durable trace of "progress").
 *
 * This is cross-sport by design (helm_lifting_* carries its own `sport`
 * column, matching lifting.ts's convention) — not sport-filtered here.
 */

const WINDOW_DAYS = 14;

const FEATURE_KEYS = ['baseball_lifting', 'baseball_lift_onboarding'] as const;

interface IncidentCounts {
  count: number | null;
  criticalCount: number | null;
  errors: string[];
}

async function incidentCountsForFeatures(
  admin: ReturnType<typeof createAdminClient>,
  featureKeys: readonly string[],
  sinceIso: string,
): Promise<IncidentCounts> {
  const [allRes, criticalRes] = await Promise.all([
    admin
      .from('admin_events')
      .select('id', { count: 'exact', head: true })
      .in('feature', [...featureKeys])
      .in('severity', ['error', 'critical'])
      .gte('created_at', sinceIso),
    admin
      .from('admin_events')
      .select('id', { count: 'exact', head: true })
      .in('feature', [...featureKeys])
      .eq('severity', 'critical')
      .gte('created_at', sinceIso),
  ]);
  const errors: string[] = [];
  if (allRes.error) errors.push(`Lift Lab incidents count unreadable: ${allRes.error.message}`);
  if (criticalRes.error) errors.push(`Lift Lab critical-incidents count unreadable: ${criticalRes.error.message}`);
  return {
    count: allRes.error ? null : allRes.count ?? 0,
    criticalCount: criticalRes.error ? null : criticalRes.count ?? 0,
    errors,
  };
}

function successRate(attempts: number | null, completions: number | null): number | null {
  if (attempts === null || completions === null || attempts <= 0) return null;
  return completions / attempts;
}

export async function fetchLiftingFlowLens(now: Date = new Date()): Promise<JourneyLens> {
  const admin = createAdminClient();
  const sinceIso = new Date(now.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const degraded: string[] = [];

  const [assignmentsRes, sessionsRes, setResultsRes, maxesRes, prsRes, incidents] = await Promise.all([
    admin.from('helm_lifting_program_assignments').select('id, status, created_at').gte('created_at', sinceIso),
    admin.from('helm_lifting_sessions').select('id, status, readiness_checkin_id, athlete_id, created_at').gte('created_at', sinceIso),
    admin.from('helm_lifting_set_results').select('athlete_id, created_at').gte('created_at', sinceIso),
    admin.from('helm_lifting_maxes').select('athlete_id, created_at').gte('created_at', sinceIso),
    admin.from('helm_lifting_prs').select('athlete_id, achieved_at').gte('achieved_at', sinceIso),
    incidentCountsForFeatures(admin, FEATURE_KEYS, sinceIso),
  ]);
  degraded.push(...incidents.errors);

  let assignmentsCreated: number | null = null;
  let assignmentsPublished: number | null = null;
  if (assignmentsRes.error) {
    degraded.push(`helm_lifting_program_assignments read failed: ${assignmentsRes.error.message}`);
  } else {
    const rows = (assignmentsRes.data ?? []) as Array<{ id: string; status: string | null }>;
    assignmentsCreated = rows.length;
    assignmentsPublished = rows.filter((r) => r.status === 'published').length;
  }

  let sessionsMaterialized: number | null = null;
  let sessionsOpened: number | null = null;
  let sessionsWithReadiness: number | null = null;
  let sessionsCompleted: number | null = null;
  let athletesWithSessions = new Set<string>();
  if (sessionsRes.error) {
    degraded.push(`helm_lifting_sessions read failed: ${sessionsRes.error.message}`);
  } else {
    const rows = (sessionsRes.data ?? []) as Array<{
      id: string;
      status: string | null;
      readiness_checkin_id: string | null;
      athlete_id: string;
    }>;
    sessionsMaterialized = rows.length;
    sessionsOpened = rows.filter((r) => r.status !== 'assigned').length;
    sessionsWithReadiness = rows.filter((r) => r.readiness_checkin_id !== null).length;
    sessionsCompleted = rows.filter((r) => r.status === 'completed').length;
    athletesWithSessions = new Set(rows.filter((r) => r.status !== 'assigned').map((r) => r.athlete_id));
  }

  let athletesLoggedSets: number | null = null;
  if (setResultsRes.error) {
    degraded.push(`helm_lifting_set_results read failed: ${setResultsRes.error.message}`);
  } else {
    const rows = (setResultsRes.data ?? []) as Array<{ athlete_id: string }>;
    athletesLoggedSets = new Set(rows.map((r) => r.athlete_id)).size;
  }

  let athletesWithProgress: number | null = null;
  if (maxesRes.error || prsRes.error) {
    degraded.push(
      [
        maxesRes.error ? `helm_lifting_maxes read failed: ${maxesRes.error.message}` : null,
        prsRes.error ? `helm_lifting_prs read failed: ${prsRes.error.message}` : null,
      ]
        .filter(Boolean)
        .join('; '),
    );
  } else {
    const maxAthletes = ((maxesRes.data ?? []) as Array<{ athlete_id: string }>).map((r) => r.athlete_id);
    const prAthletes = ((prsRes.data ?? []) as Array<{ athlete_id: string }>).map((r) => r.athlete_id);
    athletesWithProgress = new Set([...maxAthletes, ...prAthletes]).size;
  }

  const stages: JourneyStage[] = [
    {
      id: 'program_assigned',
      label: 'Program assigned',
      featureKeys: FEATURE_KEYS,
      metric: { attempts: assignmentsCreated, completions: assignmentsPublished, successRate: successRate(assignmentsCreated, assignmentsPublished) },
      incidents,
      confidence: 'durable_unproven',
      sourceNote: "attempts = helm_lifting_program_assignments rows created; completions = status='published' (the materialize-into-sessions step). No golden-paths.yml citation exists for Lift Lab yet.",
    },
    {
      id: 'session_opened',
      label: 'Session opened',
      featureKeys: FEATURE_KEYS,
      metric: { attempts: sessionsMaterialized, completions: sessionsOpened, successRate: successRate(sessionsMaterialized, sessionsOpened) },
      incidents,
      confidence: 'durable_unproven',
      sourceNote: "attempts = sessions materialized at publish; completions = status <> 'assigned' (an athlete has actually opened it).",
    },
    {
      id: 'readiness',
      label: 'Readiness',
      featureKeys: FEATURE_KEYS,
      metric: { attempts: sessionsOpened, completions: sessionsWithReadiness, successRate: successRate(sessionsOpened, sessionsWithReadiness) },
      incidents,
      confidence: 'durable_unproven',
      sourceNote: 'completions = sessions with a readiness_checkin_id set. A session can be opened without a readiness check-in — this is real attrition, not a data gap.',
    },
    {
      id: 'sets_logged',
      label: 'Sets logged',
      featureKeys: FEATURE_KEYS,
      metric: { attempts: sessionsOpened === null ? null : athletesWithSessions.size, completions: athletesLoggedSets, successRate: null },
      incidents,
      confidence: 'durable_unproven',
      sourceNote: 'Athlete-level proxy: distinct athletes who logged >=1 set (helm_lifting_set_results carries athlete_id directly) against distinct athletes with an opened session — not a strict per-session join.',
    },
    {
      id: 'completed',
      label: 'Completed',
      featureKeys: FEATURE_KEYS,
      metric: { attempts: sessionsOpened, completions: sessionsCompleted, successRate: successRate(sessionsOpened, sessionsCompleted) },
      incidents,
      confidence: 'durable_unproven',
      sourceNote: "completions = helm_lifting_sessions.status='completed'.",
    },
    {
      id: 'progress_updated',
      label: 'Progress updated',
      featureKeys: FEATURE_KEYS,
      metric: { attempts: sessionsCompleted, completions: athletesWithProgress, successRate: null },
      incidents,
      confidence: 'durable_unproven',
      sourceNote: 'completions = distinct athletes with a new helm_lifting_maxes or helm_lifting_prs row in the window (the durable trace of recorded progress).',
    },
  ];

  return {
    id: 'lifting',
    title: 'Lift Lab Program Execution Flow',
    generatedAt: now.toISOString(),
    windowDays: WINDOW_DAYS,
    stages,
    degradedNote: degraded.length > 0 ? degraded.filter(Boolean).join('; ') : null,
  };
}
