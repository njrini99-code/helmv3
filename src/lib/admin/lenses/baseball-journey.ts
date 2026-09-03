import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';
import type { JourneyLens, JourneyStage } from './types';

/**
 * Baseball journey mirror (brief §20-27: "Baseball: mirror with Baseball's
 * actual golden paths (roster/onboarding, practice planning, player
 * development, stats/import, communications)").
 *
 * BRIEF-DERIVED, NOT REGISTRY-PROVEN: memory/journeys/golden-paths.yml only
 * seeds 8 golf journeys as of 2026-09-03 (its own header explains why —
 * scoped to the Bridge Track C task). There is no citation-checked baseball
 * journey/stage list to draw from, and this module does NOT edit
 * golden-paths.yml to invent one — its header explicitly forbids inventing
 * coverage. Every stage here carries `confidence: 'brief_derived'`.
 *
 * Feature-key groupings below are taken from memory/registry.yml's
 * `baseball_core.observability.feature_keys` list (49 keys, verified
 * 2026-09-03), clustered by the brief's 5 named areas — a judgment call,
 * not a registry mapping (baseball_core is ONE feature entry covering all of
 * BaseballHelm, so there is no finer-grained registry split to defer to).
 *
 * Durable-table sourcing (same rule as golf-journey.ts — never count
 * admin_events rows as "usage", only as incidents):
 *   - roster_onboarding: baseball_players.onboarding_completed (attempts =
 *     players created in window, completions = onboarding_completed=true).
 *   - player_development: baseball_developmental_plans (attempts = plans
 *     created in window, completions = status <> 'draft' — approximate,
 *     since the column carries no CHECK constraint / fixed enum to key a
 *     precise "completed" test off of).
 *   - stats_import / practice_planning / communications: no durable table
 *     was identified for these in the time available — incidents only,
 *     honestly disclosed rather than guessed at.
 */

const WINDOW_DAYS = 14;

const FEATURE_KEYS = {
  roster_onboarding: ['baseball_onboarding', 'baseball_roster', 'baseball_auth', 'baseball_teams', 'baseball_staff'] as const,
  practice_planning: ['baseball_practice', 'baseball_calendar', 'baseball_lineups'] as const,
  player_development: ['baseball_dev_plans', 'baseball_player_actions', 'baseball_postgame', 'baseball_lifting', 'baseball_lift_onboarding'] as const,
  stats_import: ['baseball_stats', 'baseball_import', 'baseball_insights', 'baseball_compare'] as const,
  communications: ['baseball_messages', 'baseball_announcements', 'baseball_notifications'] as const,
};

interface IncidentCounts {
  count: number | null;
  criticalCount: number | null;
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
  // `?? null`, never `?? 0` — a succeeded count query with a null count
  // (malformed/missing PostgREST count header) is unknown, not a verified
  // zero.
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

export async function fetchBaseballJourneyLens(now: Date = new Date()): Promise<JourneyLens> {
  const admin = createAdminClient();
  const sinceIso = new Date(now.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const degraded: string[] = [];

  // Paginated past the PostgREST 1000-row cap — an unpaginated `.select()`
  // silently truncates once either table's rows in the window pass 1000,
  // which undercounts attempts/completions without ever surfacing as an
  // error (see golf-journey.ts's identical fix for the same defect).
  const [playersRes, devPlansRes] = await Promise.all([
    fetchAllRowsResult((from, to) =>
      admin
        .from('baseball_players')
        .select('id, onboarding_completed, created_at')
        .gte('created_at', sinceIso)
        .order('id', { ascending: true })
        .range(from, to),
    ),
    fetchAllRowsResult((from, to) =>
      admin
        .from('baseball_developmental_plans')
        .select('id, status, created_at')
        .gte('created_at', sinceIso)
        .order('id', { ascending: true })
        .range(from, to),
    ),
  ]);

  let playersOnboarded: number | null = null;
  let playersCreated: number | null = null;
  if (playersRes.error) {
    degraded.push(`baseball_players read failed: ${playersRes.error.message}`);
  } else {
    const rows = (playersRes.data ?? []) as Array<{ id: string; onboarding_completed: boolean | null }>;
    playersCreated = rows.length;
    playersOnboarded = rows.filter((r) => r.onboarding_completed === true).length;
  }

  let devPlansCreated: number | null = null;
  let devPlansActive: number | null = null;
  if (devPlansRes.error) {
    degraded.push(`baseball_developmental_plans read failed: ${devPlansRes.error.message}`);
  } else {
    const rows = (devPlansRes.data ?? []) as Array<{ id: string; status: string | null }>;
    devPlansCreated = rows.length;
    devPlansActive = rows.filter((r) => r.status !== null && r.status !== 'draft').length;
  }

  const [rosterIncidents, practiceIncidents, devIncidents, statsIncidents, commsIncidents] = await Promise.all([
    incidentCountsForFeatures(admin, FEATURE_KEYS.roster_onboarding, sinceIso, 'roster/onboarding'),
    incidentCountsForFeatures(admin, FEATURE_KEYS.practice_planning, sinceIso, 'practice planning'),
    incidentCountsForFeatures(admin, FEATURE_KEYS.player_development, sinceIso, 'player development'),
    incidentCountsForFeatures(admin, FEATURE_KEYS.stats_import, sinceIso, 'stats/import'),
    incidentCountsForFeatures(admin, FEATURE_KEYS.communications, sinceIso, 'communications'),
  ]);
  for (const inc of [rosterIncidents, practiceIncidents, devIncidents, statsIncidents, commsIncidents]) {
    degraded.push(...inc.errors);
  }

  const stages: JourneyStage[] = [
    {
      id: 'roster_onboarding',
      label: 'Roster & onboarding',
      featureKeys: FEATURE_KEYS.roster_onboarding,
      metric: { attempts: playersCreated, completions: playersOnboarded, successRate: successRate(playersCreated, playersOnboarded) },
      incidents: rosterIncidents,
      confidence: 'brief_derived',
      sourceNote: 'attempts = baseball_players rows created in the window; completions = onboarding_completed=true. Stage grouping is brief-derived, not a golden-paths citation.',
    },
    {
      id: 'practice_planning',
      label: 'Practice planning',
      featureKeys: FEATURE_KEYS.practice_planning,
      metric: { attempts: null, completions: null, successRate: null },
      incidents: practiceIncidents,
      confidence: 'brief_derived',
      sourceNote: 'No durable table identified for practice-plan creation in the time available — incidents only, not a fabricated attempt count.',
    },
    {
      id: 'player_development',
      label: 'Player development',
      featureKeys: FEATURE_KEYS.player_development,
      metric: { attempts: devPlansCreated, completions: devPlansActive, successRate: successRate(devPlansCreated, devPlansActive) },
      incidents: devIncidents,
      confidence: 'brief_derived',
      sourceNote: "attempts = baseball_developmental_plans rows created; completions = status <> 'draft' (approximate — the column has no fixed enum to key a precise \"completed\" test off of).",
    },
    {
      id: 'stats_import',
      label: 'Stats & import',
      featureKeys: FEATURE_KEYS.stats_import,
      metric: { attempts: null, completions: null, successRate: null },
      incidents: statsIncidents,
      confidence: 'brief_derived',
      sourceNote: 'No durable table identified for a stats-import success signal — incidents only.',
    },
    {
      id: 'communications',
      label: 'Communications',
      featureKeys: FEATURE_KEYS.communications,
      metric: { attempts: null, completions: null, successRate: null },
      incidents: commsIncidents,
      confidence: 'brief_derived',
      sourceNote: 'No durable send/read table was read for this lens — incidents only.',
    },
  ];

  return {
    id: 'baseball',
    title: 'Baseball journeys',
    generatedAt: now.toISOString(),
    windowDays: WINDOW_DAYS,
    stages,
    degradedNote: degraded.length > 0 ? degraded.join('; ') : null,
  };
}
