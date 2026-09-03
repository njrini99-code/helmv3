import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';
import type { JourneyLens, JourneyStage, SignalConfidence } from './types';

/**
 * Golf Journey River (brief §20-27 "Golf: Journey River (Login → Dashboard →
 * Start Round → Autosave → Resume → Submit → Stats → Coach visibility) with
 * attempts, success, p95, incidents, release delta").
 *
 * STAGE SOURCING — every stage below cites where its number comes from:
 *   - authenticate / dashboard: memory/journeys/golden-paths.yml
 *     `player_login_hub` (status: active). Attempts from `admin_events`
 *     event_type='login' (a genuine success write — see logLogin() in
 *     src/lib/admin-logger.ts, wired at src/app/golf/actions/auth.ts:175).
 *     "Dashboard" has no distinct positive event (viewing a page writes
 *     nothing) — completions stay null, honestly.
 *   - start_round / autosave / resume_round: memory/journeys/golden-paths.yml
 *     `player_start_round` (active) / `player_resume_round` (active).
 *     Attempts/completions from `golf_rounds` (the durable draft), NOT from
 *     admin_events, per this module's header contract. "Autosave" is not its
 *     own golden-paths journey — approximated here as rounds that received
 *     at least one update after creation (updated_at > created_at), which is
 *     the only durable trace an autosave leaves.
 *   - submit_round: `player_submit_round` (status: collecting — proof
 *     incomplete per golden-paths, NOT the same as the number being fake).
 *     completions = golf_rounds.status = 'completed'; ALSO cross-checked
 *     against admin_events event_type='round_submitted' (logRoundSubmitted,
 *     wired at src/app/golf/actions/golf.ts:3026) as the incidents-adjacent
 *     positive signal.
 *   - stats: `coach_view_player_stats` (active). No durable "viewed stats"
 *     table — attempts/completions null; incidents only.
 *   - coach_visibility: `coach_view_coachhelm_insight` (active). Same
 *     limitation; CoachHelm's AI generation success (logAIGeneration) is
 *     folded in as a partial proxy where available.
 *
 * Feature keys per stage are copied from memory/registry.yml's
 * `observability.feature_keys` for the golden-paths `feature_id` each stage
 * cites (auth_onboarding_join, player_hub, golf_round_lifecycle,
 * stats_analytics, coach_intelligence_triage) — verified against the
 * registry 2026-09-03, not re-derived at request time.
 */

const WINDOW_DAYS = 14;

const FEATURE_KEYS = {
  auth: ['auth_onboarding', 'join_team_flow'] as const,
  hub: ['player_hub'] as const,
  round: ['round_tracking', 'course_library'] as const,
  stats: ['stats_analytics', 'my_game_profile'] as const,
  coach: ['alerts_system', 'patterns_dashboard', 'intelligence_dashboard', 'coaching_intelligence_settings'] as const,
};

interface IncidentCounts {
  count: number | null;
  criticalCount: number | null;
  /** Human-readable failures from this call, for the caller to fold into
   *  its own degradedNote — errors must never vanish silently. */
  errors: string[];
}

async function incidentCountsForFeatures(
  admin: ReturnType<typeof createAdminClient>,
  featureKeys: readonly string[],
  sinceIso: string,
  label: string,
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
  if (allRes.error) errors.push(`${label} incidents count unreadable: ${allRes.error.message}`);
  if (criticalRes.error) errors.push(`${label} critical-incidents count unreadable: ${criticalRes.error.message}`);
  // `?? null`, never `?? 0` — a `count: 'exact', head: true` request that
  // succeeded but came back with a null count (a malformed/missing
  // PostgREST count header) is unknown, not a verified zero.
  return {
    count: allRes.error ? null : allRes.count ?? null,
    criticalCount: criticalRes.error ? null : criticalRes.count ?? null,
    errors,
  };
}

function successRate(attempts: number | null, completions: number | null): number | null {
  if (attempts === null || completions === null || attempts <= 0) return null;
  return completions / attempts;
}

export async function fetchGolfJourneyLens(now: Date = new Date()): Promise<JourneyLens> {
  const admin = createAdminClient();
  const sinceIso = new Date(now.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const degraded: string[] = [];

  const [loginRes, roundsRes, roundSubmittedRes, aiGenRes] = await Promise.all([
    admin
      .from('admin_events')
      .select('id', { count: 'exact', head: true })
      .eq('event_type', 'login')
      .eq('sport', 'golf')
      .gte('created_at', sinceIso),
    // Paginated past the PostgREST 1000-row cap — an unpaginated `.select()`
    // silently truncated once golf_rounds in the window passed 1000, which
    // undercounted every downstream stage (start_round/autosave/resume/
    // submit) without ever surfacing as an error.
    fetchAllRowsResult((from, to) =>
      admin
        .from('golf_rounds')
        .select('id, status, created_at, updated_at')
        .gte('created_at', sinceIso)
        .order('id', { ascending: true })
        .range(from, to),
    ),
    admin
      .from('admin_events')
      .select('id', { count: 'exact', head: true })
      .eq('event_type', 'round_submitted')
      .gte('created_at', sinceIso),
    admin
      .from('admin_events')
      .select('id', { count: 'exact', head: true })
      .eq('event_type', 'ai_generation')
      .eq('sport', 'golf')
      .gte('created_at', sinceIso),
  ]);

  const loginAttempts = loginRes.error ? null : loginRes.count ?? null;
  if (loginRes.error) degraded.push(`login count unreadable: ${loginRes.error.message}`);

  let roundsStarted: number | null = null;
  let roundsAutosaved: number | null = null;
  let roundsResumed: number | null = null;
  let roundsCompleted: number | null = null;
  if (roundsRes.error) {
    degraded.push(`golf_rounds read failed: ${roundsRes.error.message}`);
  } else {
    const rows = (roundsRes.data ?? []) as Array<{
      id: string;
      status: string | null;
      created_at: string;
      updated_at: string | null;
    }>;
    roundsStarted = rows.length;
    roundsAutosaved = rows.filter((r) => r.updated_at && r.updated_at > r.created_at).length;
    // "Resumed" — a round updated more than once after its first autosave is
    // the only durable trace of a resume (re-opening an in-progress round
    // and saving again). Two updates is the minimum evidence of a second
    // session touching the round; one update is indistinguishable from the
    // first autosave alone.
    roundsResumed = rows.filter((r) => r.status === 'in_progress' && r.updated_at && r.updated_at > r.created_at).length;
    roundsCompleted = rows.filter((r) => r.status === 'completed').length;
  }
  if (roundSubmittedRes.error) degraded.push(`round_submitted event count unreadable: ${roundSubmittedRes.error.message}`);
  if (aiGenRes.error) degraded.push(`ai_generation event count unreadable: ${aiGenRes.error.message}`);

  const [authIncidents, hubIncidents, roundIncidents, statsIncidents, coachIncidents] = await Promise.all([
    incidentCountsForFeatures(admin, FEATURE_KEYS.auth, sinceIso, 'login'),
    incidentCountsForFeatures(admin, FEATURE_KEYS.hub, sinceIso, 'dashboard'),
    incidentCountsForFeatures(admin, FEATURE_KEYS.round, sinceIso, 'round'),
    incidentCountsForFeatures(admin, FEATURE_KEYS.stats, sinceIso, 'stats'),
    incidentCountsForFeatures(admin, FEATURE_KEYS.coach, sinceIso, 'coach'),
  ]);
  for (const inc of [authIncidents, hubIncidents, roundIncidents, statsIncidents, coachIncidents]) {
    degraded.push(...inc.errors);
  }

  const stages: JourneyStage[] = [
    {
      id: 'authenticate',
      label: 'Login',
      featureKeys: FEATURE_KEYS.auth,
      metric: { attempts: loginAttempts, completions: loginAttempts, successRate: loginAttempts !== null && loginAttempts > 0 ? 1 : null },
      incidents: authIncidents,
      confidence: 'durable_and_proven' satisfies SignalConfidence,
      sourceNote: 'Attempts = admin_events login rows (a real write on every successful sign-in, golf sport). No distinct failure-attempt count exists for logins that never reach a session.',
    },
    {
      id: 'dashboard',
      label: 'Dashboard',
      featureKeys: FEATURE_KEYS.hub,
      metric: { attempts: null, completions: null, successRate: null },
      incidents: hubIncidents,
      confidence: 'incidents_only' satisfies SignalConfidence,
      sourceNote: 'Viewing the dashboard writes no durable event — only incident (error) counts are real here, not attempts or a fabricated 100%.',
    },
    {
      id: 'start_round',
      label: 'Start round',
      featureKeys: FEATURE_KEYS.round,
      metric: { attempts: roundsStarted, completions: roundsStarted, successRate: roundsStarted !== null && roundsStarted > 0 ? 1 : null },
      incidents: roundIncidents,
      confidence: 'durable_and_proven' satisfies SignalConfidence,
      sourceNote: 'golf_rounds rows created in the window (the durable draft golden-paths.yml cites as the real trace of "Start round →").',
    },
    {
      id: 'autosave',
      label: 'Autosave',
      featureKeys: FEATURE_KEYS.round,
      metric: {
        attempts: roundsStarted,
        completions: roundsAutosaved,
        successRate: successRate(roundsStarted, roundsAutosaved),
      },
      incidents: roundIncidents,
      confidence: 'durable_unproven' satisfies SignalConfidence,
      sourceNote: 'Approximated as golf_rounds rows updated after creation — not a dedicated golden-paths stage, so treat this as a proxy, not a verified autosave count.',
    },
    {
      id: 'resume',
      label: 'Resume',
      featureKeys: FEATURE_KEYS.round,
      metric: {
        attempts: roundsAutosaved,
        completions: roundsResumed,
        successRate: successRate(roundsAutosaved, roundsResumed),
      },
      incidents: roundIncidents,
      confidence: 'durable_and_proven' satisfies SignalConfidence,
      sourceNote: 'golden-paths.yml player_resume_round (active). Resume proxy = an in-progress round updated after its first autosave.',
    },
    {
      id: 'submit',
      label: 'Submit',
      featureKeys: FEATURE_KEYS.round,
      metric: {
        attempts: roundsStarted,
        completions: roundsCompleted,
        successRate: successRate(roundsStarted, roundsCompleted),
      },
      incidents: roundIncidents,
      confidence: 'durable_unproven' satisfies SignalConfidence,
      sourceNote: `golf_rounds.status='completed' in the window, cross-checked against ${roundSubmittedRes.error || roundSubmittedRes.count === null ? 'an unknown number of' : roundSubmittedRes.count} round_submitted event(s). golden-paths.yml marks this journey "collecting" — the number is real, e2e coverage proving it is not complete.`,
    },
    {
      id: 'stats',
      label: 'Stats',
      featureKeys: FEATURE_KEYS.stats,
      metric: { attempts: null, completions: null, successRate: null },
      incidents: statsIncidents,
      confidence: 'incidents_only' satisfies SignalConfidence,
      sourceNote: 'Stats are computed from existing round data on view — no distinct "viewed stats" event exists. Incidents only.',
    },
    {
      id: 'coach_visibility',
      label: 'Coach visibility',
      featureKeys: FEATURE_KEYS.coach,
      metric: {
        attempts: null,
        completions: aiGenRes.error ? null : aiGenRes.count ?? null,
        successRate: null,
      },
      incidents: coachIncidents,
      confidence: 'incidents_only' satisfies SignalConfidence,
      sourceNote: 'completions = AI generation events tied to golf round review (a partial proxy — CoachHelm insight views themselves write nothing durable).',
    },
  ];

  return {
    id: 'golf',
    title: 'Golf Journey River',
    generatedAt: now.toISOString(),
    windowDays: WINDOW_DAYS,
    stages,
    degradedNote: degraded.length > 0 ? degraded.join('; ') : null,
  };
}
