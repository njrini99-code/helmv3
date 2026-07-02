'use server';

/**
 * Player Game Fingerprint aggregator — Wave 2 / Task G1.
 *
 * ONE server action (`getPlayerFingerprint`) that returns every piece of data
 * the 7-section scouting report at `/dashboard/players/[id]/game` needs, in
 * parallel, in a single round-trip.
 *
 * Design intent:
 *  - Coaches open this page to prep a 1:1 with a player. The page's shape
 *    mirrors how a coach thinks about a player: Tee → Approach → Short Game →
 *    Putting → Scoring → Pressure → Trend.
 *  - Each section gets its own `SectionData` block with a small set of
 *    metrics, a list of pre-fetched evidence-backed insights (routed to the
 *    right section via `category`), and optional chart data.
 *  - Composite rating + trend arrow come from `golf_player_stats_cache` if
 *    present, with a sensible fallback derived from recent rounds.
 *
 * Data sources:
 *  - `golf_players`              player name + team surface
 *  - `golf_team_members` / `golf_teams`   team name
 *  - `golf_player_stats_cache`   per-category aggregates (primary source)
 *  - `golf_rounds`               trend line + scoring fallback
 *  - `getInsightsForCoach`       evidence-backed insights, drill-joined
 *
 * Auth: coach must own the player via `verify_coach_owns_player` (delegated
 * to `verifyPlayerAccess`). Anonymous / denied users get `null`.
 *
 * Contract: docs/superpowers/plans/2026-04-22-insight-delivery/00-design-contract.md
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { logServerError } from '@/lib/server-error-logger';
import { verifyPlayerAccess } from '@/lib/auth/verify-player-access';
import {
  getInsightsForCoach,
  type EvidenceInsight,
} from '@/app/golf/actions/insight-delivery';
import { withAdminObserved } from '@/lib/admin/observed-action';

// ---------------------------------------------------------------------------
// Public types — the Fingerprint shape. Downstream UI imports these.
// ---------------------------------------------------------------------------

export type FingerprintSectionKey =
  | 'tee'
  | 'approach'
  | 'short_game'
  | 'putting'
  | 'scoring'
  | 'pressure';

/** Ordered category mapping for routing evidence insights into sections.
 *  `scoring` in the UI catches `course_management` too, since those insights
 *  are really "where you're losing strokes" conversations. */
const SECTION_CATEGORIES: Record<FingerprintSectionKey, string[]> = {
  tee: ['tee'],
  approach: ['approach'],
  short_game: ['short_game'],
  putting: ['putting'],
  scoring: ['scoring', 'course_management'],
  pressure: ['pressure'],
};

// `FINGERPRINT_SECTION_ORDER` lives in `./player-fingerprint-types.ts` —
// `'use server'` files can only export async functions, and the const array
// is a runtime value the build collector rejects here. Consumers import it
// from the types module directly.

export interface FingerprintMetric {
  label: string;
  value: string;
  comparison?: string;
  /** `good` = strength; `bad` = weakness; `neutral` = neither. Drives the
   *  small coloured dot + copy tone per metric pill. */
  tone: 'good' | 'neutral' | 'bad';
}

/** Shape passed to the per-section chart primitive. Unknown on purpose — each
 *  section knows its own chart and reads the fields it needs. */
export type FingerprintChartData =
  | { kind: 'bars'; bars: Array<{ label: string; value: number; max?: number }> }
  | {
      kind: 'pills';
      pills: Array<{ label: string; value: string; tone: 'good' | 'neutral' | 'bad' }>;
    }
  | null;

export interface SectionData {
  key: FingerprintSectionKey;
  category: string;
  /** `true` when we have < 5 qualifying samples for this section's
   *  underlying metric(s). UI renders "Not enough data" but preserves the
   *  slot so the layout doesn't shift. */
  sparse: boolean;
  metrics: FingerprintMetric[];
  insights: EvidenceInsight[];
  chart_data: FingerprintChartData;
}

export interface FingerprintTrendPoint {
  round_id: string;
  round_date: string;
  score_to_par: number | null;
  total_score: number | null;
  course_name: string | null;
  notable: boolean;
}

export interface PlayerFingerprint {
  player: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    team_name: string | null;
  };
  composite: {
    rating: number | null;
    trend: 'up' | 'flat' | 'down';
    rounds_in_calculation: number;
  };
  sections: Record<FingerprintSectionKey, SectionData>;
  trend: {
    rolling: FingerprintTrendPoint[];
  };
  generated_at: string;
}

// ---------------------------------------------------------------------------
// Internal row shapes — we pull exactly the columns each section consumes.
// ---------------------------------------------------------------------------

interface PlayerRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
}

interface TeamMembershipRow {
  team_id: string | null;
  golf_teams: { id: string; name: string } | null;
}

interface StatsCacheRow {
  rounds_in_calculation: number | null;
  scoring_average: number | null;
  scoring_average_vs_par: number | null;
  par3_average: number | null;
  par4_average: number | null;
  par5_average: number | null;
  driving_distance_average: number | null;
  driving_accuracy_percentage: number | null;
  fairways_hit: number | null;
  fairways_total: number | null;
  gir_percentage: number | null;
  greens_hit: number | null;
  greens_total: number | null;
  approach_proximity_average: number | null;
  approach_miss_left_pct: number | null;
  approach_miss_right_pct: number | null;
  approach_miss_short_pct: number | null;
  approach_miss_long_pct: number | null;
  scrambling_percentage: number | null;
  sand_save_percentage: number | null;
  up_and_down_percentage: number | null;
  putts_per_round: number | null;
  putts_per_gir: number | null;
  one_putt_percentage: number | null;
  three_putt_percentage: number | null;
  putt_make_pct_0_3ft: number | null;
  putt_make_pct_3_5ft: number | null;
  putt_make_pct_5_10ft: number | null;
  putt_make_pct_10_15ft: number | null;
  putt_make_pct_15_20ft: number | null;
  putt_make_pct_20_plus_ft: number | null;
  sg_total_per_round: number | null;
  sg_tee_per_round: number | null;
  sg_approach_per_round: number | null;
  sg_around_green_per_round: number | null;
  sg_putting_per_round: number | null;
  last_5_average: number | null;
  last_10_average: number | null;
  improvement_trend: number | null;
  trend_direction: string | null;
  last_round_date: string | null;
}

interface RoundRow {
  id: string;
  round_date: string;
  total_score: number | null;
  score_to_par: number | null;
  course_name: string | null;
  holes_played: number | null;
  round_type: string | null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns the full Player Game Fingerprint for the UI at
 * `/dashboard/players/[id]/game`.
 *
 * Returns `null` when the viewer is not authenticated, not a coach that owns
 * the player, or the player does not exist.
 */
async function getPlayerFingerprintImpl(
  playerId: string,
  supabaseOverride?: SupabaseClient,
): Promise<PlayerFingerprint | null> {
  if (!playerId) return null;

  const supabase = supabaseOverride ?? (await createClient());

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return null;

  const access = await verifyPlayerAccess(playerId, user.id, supabase);
  if (!access.allowed) return null;

  // --- Parallel fetch — everything we need in a single round-trip. ----------
  //
  // The insights fetcher takes a coachId, but `getInsightsForCoach` uses RLS
  // to restrict to teams the caller staffs and also accepts a `player_id`
  // scope. We pass `user.id` as the coachId — the `getInsightsForCoach`
  // implementation reads `player_id` opt as the hard filter and defers the
  // "am I a coach for this team" decision to verifyPlayerAccess (which we
  // just ran). This keeps us from duplicating the coach-lookup query.

  const [
    playerResult,
    teamResult,
    statsResult,
    roundsResult,
    insights,
  ] = await Promise.all([
    supabase
      .from('golf_players')
      .select('id, first_name, last_name')
      .eq('id', playerId)
      .maybeSingle(),
    supabase
      .from('golf_team_members')
      .select('team_id, golf_teams(id, name)')
      .eq('player_id', playerId)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle(),
    supabase
      .from('golf_player_stats_cache')
      .select(
        'rounds_in_calculation, scoring_average, scoring_average_vs_par, par3_average, par4_average, par5_average, driving_distance_average, driving_accuracy_percentage, fairways_hit, fairways_total, gir_percentage, greens_hit, greens_total, approach_proximity_average, approach_miss_left_pct, approach_miss_right_pct, approach_miss_short_pct, approach_miss_long_pct, scrambling_percentage, sand_save_percentage, up_and_down_percentage, putts_per_round, putts_per_gir, one_putt_percentage, three_putt_percentage, putt_make_pct_0_3ft, putt_make_pct_3_5ft, putt_make_pct_5_10ft, putt_make_pct_10_15ft, putt_make_pct_15_20ft, putt_make_pct_20_plus_ft, sg_total_per_round, sg_tee_per_round, sg_approach_per_round, sg_around_green_per_round, sg_putting_per_round, last_5_average, last_10_average, improvement_trend, trend_direction, last_round_date',
      )
      .eq('player_id', playerId)
      .maybeSingle(),
    supabase
      .from('golf_rounds')
      .select(
        'id, round_date, total_score, score_to_par, course_name, holes_played, round_type',
      )
      .eq('player_id', playerId)
      .not('total_score', 'is', null)
      .order('round_date', { ascending: false })
      .limit(10),
    getInsightsForCoach(
      user.id,
      { player_id: playerId, limit: 40 },
      supabase,
    ),
  ]);

  if (playerResult.error) {
    await logServerError(
      `getPlayerFingerprint.player failed: ${playerResult.error.message}`,
      { action: 'player-fingerprint.getPlayerFingerprint', featureArea: 'insights', playerId },
    );
    return null;
  }
  const player = (playerResult.data as PlayerRow | null) ?? null;
  if (!player) return null;

  if (teamResult.error) {
    // Non-fatal — we can still render without a team name. Log + continue.
    await logServerError(
      `getPlayerFingerprint.team failed: ${teamResult.error.message}`,
      { action: 'player-fingerprint.getPlayerFingerprint', featureArea: 'insights', playerId },
    );
  }
  const teamMembership = (teamResult.data as TeamMembershipRow | null) ?? null;
  const teamName = teamMembership?.golf_teams?.name ?? null;

  if (statsResult.error) {
    await logServerError(
      `getPlayerFingerprint.stats failed: ${statsResult.error.message}`,
      { action: 'player-fingerprint.getPlayerFingerprint', featureArea: 'insights', playerId },
    );
  }
  const stats = (statsResult.data as StatsCacheRow | null) ?? null;

  if (roundsResult.error) {
    await logServerError(
      `getPlayerFingerprint.rounds failed: ${roundsResult.error.message}`,
      { action: 'player-fingerprint.getPlayerFingerprint', featureArea: 'insights', playerId },
    );
  }
  const rounds = (roundsResult.data as RoundRow[] | null) ?? [];

  // --- Build sections -------------------------------------------------------
  const sections = buildSections(stats, rounds, insights);

  // --- Composite + trend ----------------------------------------------------
  const composite = computeComposite(stats, rounds);
  const trend = buildTrend(rounds, insights);

  return {
    player: {
      id: player.id,
      first_name: player.first_name,
      last_name: player.last_name,
      team_name: teamName,
    },
    composite,
    sections,
    trend,
    generated_at: new Date().toISOString(),
  };
}

const observedGetPlayerFingerprint = withAdminObserved(
  'getPlayerFingerprint',
  { sport: 'golf', feature: 'coachhelm_ai_engine' },
  getPlayerFingerprintImpl,
);
export async function getPlayerFingerprint(
  playerId: string,
  supabaseOverride?: SupabaseClient,
): Promise<PlayerFingerprint | null> {
  return observedGetPlayerFingerprint(playerId, supabaseOverride);
}

// ---------------------------------------------------------------------------
// Section builders
// ---------------------------------------------------------------------------

function buildSections(
  stats: StatsCacheRow | null,
  rounds: RoundRow[],
  insights: EvidenceInsight[],
): Record<FingerprintSectionKey, SectionData> {
  const insightsByCategory = groupInsightsByCategory(insights);

  const sample = stats?.rounds_in_calculation ?? rounds.length;
  const hasEnoughRounds = sample >= 5;

  return {
    tee: buildTeeSection(stats, hasEnoughRounds, pickInsights(insightsByCategory, 'tee')),
    approach: buildApproachSection(
      stats,
      hasEnoughRounds,
      pickInsights(insightsByCategory, 'approach'),
    ),
    short_game: buildShortGameSection(
      stats,
      hasEnoughRounds,
      pickInsights(insightsByCategory, 'short_game'),
    ),
    putting: buildPuttingSection(
      stats,
      hasEnoughRounds,
      pickInsights(insightsByCategory, 'putting'),
    ),
    scoring: buildScoringSection(
      stats,
      rounds,
      pickInsights(insightsByCategory, 'scoring'),
    ),
    pressure: buildPressureSection(
      rounds,
      pickInsights(insightsByCategory, 'pressure'),
    ),
  };
}

/** Evidence insights grouped by normalized category key. Unknown categories
 *  fall under `null` and are ignored (we only surface the six known buckets). */
function groupInsightsByCategory(
  insights: EvidenceInsight[],
): Map<string, EvidenceInsight[]> {
  const map = new Map<string, EvidenceInsight[]>();
  for (const insight of insights) {
    const cat = insight.category;
    if (!cat) continue;
    const bucket = map.get(cat) ?? [];
    bucket.push(insight);
    map.set(cat, bucket);
  }
  return map;
}

function pickInsights(
  grouped: Map<string, EvidenceInsight[]>,
  section: FingerprintSectionKey,
): EvidenceInsight[] {
  const buckets = SECTION_CATEGORIES[section];
  const collected: EvidenceInsight[] = [];
  for (const bucket of buckets) {
    const arr = grouped.get(bucket);
    if (arr) collected.push(...arr);
  }
  // Sort by rank score (impact × confidence), descending. Urgent priority
  // jumps to the top regardless of score so the coach reads the riskiest
  // note first inside each section.
  return collected.sort((a, b) => {
    if (a.priority === 'urgent' && b.priority !== 'urgent') return -1;
    if (b.priority === 'urgent' && a.priority !== 'urgent') return 1;
    return scoreOf(b) - scoreOf(a);
  });
}

function scoreOf(insight: EvidenceInsight): number {
  const impact = Math.abs(Number(insight.evidence.strokes_impact ?? 0));
  const confidence = Number(insight.evidence.confidence ?? 0);
  return impact * confidence;
}

// --- Tee section -----------------------------------------------------------

function buildTeeSection(
  stats: StatsCacheRow | null,
  hasRounds: boolean,
  insights: EvidenceInsight[],
): SectionData {
  const fwPct = toPct(stats?.driving_accuracy_percentage);
  const distance = stats?.driving_distance_average;
  const sgTee = stats?.sg_tee_per_round;

  const metrics: FingerprintMetric[] = [];
  if (distance != null) {
    metrics.push({
      label: 'Avg distance',
      value: `${Math.round(distance)} yd`,
      tone: 'neutral',
    });
  }
  if (fwPct != null) {
    metrics.push({
      label: 'Fairways',
      value: `${fwPct}%`,
      comparison: fwPct >= 60 ? 'Above avg' : fwPct >= 45 ? 'Avg' : 'Below avg',
      tone: fwPct >= 60 ? 'good' : fwPct >= 45 ? 'neutral' : 'bad',
    });
  }
  if (sgTee != null) {
    metrics.push({
      label: 'SG: Tee',
      value: formatSigned(sgTee),
      tone: sgTee > 0.1 ? 'good' : sgTee < -0.1 ? 'bad' : 'neutral',
    });
  }

  const sparse = !hasRounds || metrics.length === 0;
  return {
    key: 'tee',
    category: 'From the tee',
    sparse,
    metrics,
    insights,
    chart_data: null,
  };
}

// --- Approach section ------------------------------------------------------

function buildApproachSection(
  stats: StatsCacheRow | null,
  hasRounds: boolean,
  insights: EvidenceInsight[],
): SectionData {
  const girPct = toPct(stats?.gir_percentage);
  const proximity = stats?.approach_proximity_average;
  const sgApproach = stats?.sg_approach_per_round;

  const metrics: FingerprintMetric[] = [];
  if (girPct != null) {
    metrics.push({
      label: 'GIR',
      value: `${girPct}%`,
      comparison: girPct >= 55 ? 'Above avg' : girPct >= 40 ? 'Avg' : 'Below avg',
      tone: girPct >= 55 ? 'good' : girPct >= 40 ? 'neutral' : 'bad',
    });
  }
  if (proximity != null) {
    metrics.push({
      label: 'Proximity',
      value: `${proximity.toFixed(0)} ft`,
      tone: proximity <= 30 ? 'good' : proximity <= 45 ? 'neutral' : 'bad',
    });
  }
  if (sgApproach != null) {
    metrics.push({
      label: 'SG: Approach',
      value: formatSigned(sgApproach),
      tone: sgApproach > 0.1 ? 'good' : sgApproach < -0.1 ? 'bad' : 'neutral',
    });
  }

  // Miss-direction pill chart (only renders if we have at least one non-null).
  const missPills = buildMissPills(stats);

  const sparse = !hasRounds || metrics.length === 0;
  return {
    key: 'approach',
    category: 'Approach',
    sparse,
    metrics,
    insights,
    chart_data: missPills,
  };
}

function buildMissPills(stats: StatsCacheRow | null): FingerprintChartData {
  if (!stats) return null;
  const entries: Array<{ label: string; raw: number | null }> = [
    { label: 'Left', raw: stats.approach_miss_left_pct },
    { label: 'Right', raw: stats.approach_miss_right_pct },
    { label: 'Short', raw: stats.approach_miss_short_pct },
    { label: 'Long', raw: stats.approach_miss_long_pct },
  ];
  const hasAny = entries.some((e) => typeof e.raw === 'number');
  if (!hasAny) return null;

  return {
    kind: 'pills',
    pills: entries.map((e) => {
      const pct = toPct(e.raw);
      return {
        label: e.label,
        value: pct != null ? `${pct}%` : '--',
        // Miss-direction is just diagnostic — tone stays neutral; we don't
        // want to mark a coach-useful distribution as "bad".
        tone: 'neutral' as const,
      };
    }),
  };
}

// --- Short game section ----------------------------------------------------

function buildShortGameSection(
  stats: StatsCacheRow | null,
  hasRounds: boolean,
  insights: EvidenceInsight[],
): SectionData {
  const scramble = toPct(stats?.scrambling_percentage);
  const sandSave = toPct(stats?.sand_save_percentage);
  const upDown = toPct(stats?.up_and_down_percentage);
  const sgArg = stats?.sg_around_green_per_round;

  const metrics: FingerprintMetric[] = [];
  if (upDown != null) {
    metrics.push({
      label: 'Up-and-down',
      value: `${upDown}%`,
      tone: upDown >= 55 ? 'good' : upDown >= 35 ? 'neutral' : 'bad',
    });
  }
  if (scramble != null) {
    metrics.push({
      label: 'Scrambling',
      value: `${scramble}%`,
      tone: scramble >= 55 ? 'good' : scramble >= 35 ? 'neutral' : 'bad',
    });
  }
  if (sandSave != null) {
    metrics.push({
      label: 'Sand saves',
      value: `${sandSave}%`,
      tone: sandSave >= 45 ? 'good' : sandSave >= 25 ? 'neutral' : 'bad',
    });
  }
  if (sgArg != null) {
    metrics.push({
      label: 'SG: Around green',
      value: formatSigned(sgArg),
      tone: sgArg > 0.1 ? 'good' : sgArg < -0.1 ? 'bad' : 'neutral',
    });
  }

  const sparse = !hasRounds || metrics.length === 0;
  return {
    key: 'short_game',
    category: 'Around the green',
    sparse,
    metrics,
    insights,
    chart_data: null,
  };
}

// --- Putting section -------------------------------------------------------

function buildPuttingSection(
  stats: StatsCacheRow | null,
  hasRounds: boolean,
  insights: EvidenceInsight[],
): SectionData {
  const ppr = stats?.putts_per_round;
  const onePutt = toPct(stats?.one_putt_percentage);
  const threePutt = toPct(stats?.three_putt_percentage);
  const sgPutt = stats?.sg_putting_per_round;

  const metrics: FingerprintMetric[] = [];
  if (ppr != null) {
    metrics.push({
      label: 'Putts / round',
      value: ppr.toFixed(1),
      tone: ppr <= 29 ? 'good' : ppr <= 32 ? 'neutral' : 'bad',
    });
  }
  if (onePutt != null) {
    metrics.push({
      label: '1-putt %',
      value: `${onePutt}%`,
      tone: onePutt >= 40 ? 'good' : onePutt >= 25 ? 'neutral' : 'bad',
    });
  }
  if (threePutt != null) {
    metrics.push({
      label: '3-putt %',
      value: `${threePutt}%`,
      // Inverse: LOW 3-putt is good.
      tone: threePutt <= 5 ? 'good' : threePutt <= 10 ? 'neutral' : 'bad',
    });
  }
  if (sgPutt != null) {
    metrics.push({
      label: 'SG: Putting',
      value: formatSigned(sgPutt),
      tone: sgPutt > 0.1 ? 'good' : sgPutt < -0.1 ? 'bad' : 'neutral',
    });
  }

  // Make % bars by distance bucket — render when we have any bucket data.
  const bars = buildPuttingBars(stats);

  const sparse = !hasRounds || metrics.length === 0;
  return {
    key: 'putting',
    category: 'Putting',
    sparse,
    metrics,
    insights,
    chart_data: bars,
  };
}

function buildPuttingBars(stats: StatsCacheRow | null): FingerprintChartData {
  if (!stats) return null;
  const buckets: Array<{ label: string; raw: number | null }> = [
    { label: '0-3 ft', raw: stats.putt_make_pct_0_3ft },
    { label: '3-5 ft', raw: stats.putt_make_pct_3_5ft },
    { label: '5-10 ft', raw: stats.putt_make_pct_5_10ft },
    { label: '10-15 ft', raw: stats.putt_make_pct_10_15ft },
    { label: '15-20 ft', raw: stats.putt_make_pct_15_20ft },
    { label: '20+ ft', raw: stats.putt_make_pct_20_plus_ft },
  ];
  const hasAny = buckets.some((b) => typeof b.raw === 'number');
  if (!hasAny) return null;

  return {
    kind: 'bars',
    bars: buckets.map((b) => ({
      label: b.label,
      value: toPct(b.raw) ?? 0,
      max: 100,
    })),
  };
}

// --- Scoring section -------------------------------------------------------

function buildScoringSection(
  stats: StatsCacheRow | null,
  rounds: RoundRow[],
  insights: EvidenceInsight[],
): SectionData {
  // Prefer the cache; fall back to computing from rounds for coaches whose
  // stats cache hasn't been backfilled yet.
  const par3 = stats?.par3_average ?? null;
  const par4 = stats?.par4_average ?? null;
  const par5 = stats?.par5_average ?? null;
  const avg = stats?.scoring_average ?? computeScoringAverage(rounds);
  const vsPar = stats?.scoring_average_vs_par ?? computeScoringVsPar(rounds);

  const metrics: FingerprintMetric[] = [];
  if (avg != null) {
    metrics.push({
      label: 'Scoring avg',
      value: avg.toFixed(1),
      comparison: vsPar != null ? `${formatSigned(vsPar, 1)} to par` : undefined,
      tone: vsPar == null ? 'neutral' : vsPar <= 3 ? 'good' : vsPar <= 6 ? 'neutral' : 'bad',
    });
  }
  if (par3 != null) metrics.push(makeParMetric('Par 3', par3, 3));
  if (par4 != null) metrics.push(makeParMetric('Par 4', par4, 4));
  if (par5 != null) metrics.push(makeParMetric('Par 5', par5, 5));

  const sparse = rounds.length < 5 && metrics.length === 0;

  // Simple bar chart of par-type averages (if we have them).
  let chart: FingerprintChartData = null;
  if (par3 != null || par4 != null || par5 != null) {
    chart = {
      kind: 'bars',
      bars: [
        { label: 'Par 3', value: par3 ?? 0, max: 5 },
        { label: 'Par 4', value: par4 ?? 0, max: 6 },
        { label: 'Par 5', value: par5 ?? 0, max: 7 },
      ],
    };
  }

  return {
    key: 'scoring',
    category: 'Scoring',
    sparse,
    metrics,
    insights,
    chart_data: chart,
  };
}

function makeParMetric(label: string, avg: number, par: number): FingerprintMetric {
  const diff = avg - par;
  return {
    label,
    value: avg.toFixed(2),
    comparison: formatSigned(diff, 2),
    tone: diff <= 0.1 ? 'good' : diff <= 0.4 ? 'neutral' : 'bad',
  };
}

// --- Pressure section ------------------------------------------------------

/**
 * Pressure = practice vs tournament scoring gap.
 *
 * We bucket recent rounds by `round_type`: 'practice' vs anything else
 * (tournament / qualifier). The metric is the avg score-to-par delta between
 * the two groups. A positive delta means tournament scoring is worse than
 * practice scoring — the pressure tax.
 */
function buildPressureSection(
  rounds: RoundRow[],
  insights: EvidenceInsight[],
): SectionData {
  const withDiff = rounds.filter(
    (r): r is RoundRow & { score_to_par: number } =>
      typeof r.score_to_par === 'number',
  );
  const practice = withDiff.filter((r) => r.round_type === 'practice');
  const competitive = withDiff.filter((r) => r.round_type && r.round_type !== 'practice');

  const metrics: FingerprintMetric[] = [];
  let sparse = false;

  if (practice.length >= 2 && competitive.length >= 2) {
    const practiceAvg = avgOf(practice.map((r) => r.score_to_par));
    const competitiveAvg = avgOf(competitive.map((r) => r.score_to_par));
    const gap = competitiveAvg - practiceAvg;

    metrics.push({
      label: 'Practice avg',
      value: formatSigned(practiceAvg, 1),
      comparison: `${practice.length} rd`,
      tone: 'neutral',
    });
    metrics.push({
      label: 'Tournament avg',
      value: formatSigned(competitiveAvg, 1),
      comparison: `${competitive.length} rd`,
      tone: 'neutral',
    });
    metrics.push({
      label: 'Pressure gap',
      value: formatSigned(gap, 1),
      comparison:
        gap <= 0
          ? 'Plays well under pressure'
          : gap <= 2
            ? 'Holds up'
            : 'Tightens up',
      tone: gap <= 0 ? 'good' : gap <= 2 ? 'neutral' : 'bad',
    });
  } else {
    sparse = true;
  }

  return {
    key: 'pressure',
    category: 'Pressure',
    sparse,
    metrics,
    insights,
    chart_data: null,
  };
}

// ---------------------------------------------------------------------------
// Composite rating + trend
// ---------------------------------------------------------------------------

function computeComposite(
  stats: StatsCacheRow | null,
  rounds: RoundRow[],
): PlayerFingerprint['composite'] {
  // If we have a proper last-5 / last-10 average, derive trend from the
  // delta. Otherwise fall back to a naive front-half vs back-half split.
  let rating: number | null = null;
  let trend: 'up' | 'flat' | 'down' = 'flat';
  let sample = stats?.rounds_in_calculation ?? 0;

  if (stats?.scoring_average_vs_par != null) {
    // Map score-to-par → 0-100 composite. Scratch ≈ 80, +10 ≈ 50, +20 ≈ 20.
    rating = clamp(Math.round(80 - stats.scoring_average_vs_par * 3), 0, 100);
  } else if (rounds.length > 0) {
    sample = rounds.length;
    const vsPar = avgOf(
      rounds
        .filter((r) => typeof r.score_to_par === 'number')
        .map((r) => r.score_to_par as number),
    );
    rating = clamp(Math.round(80 - vsPar * 3), 0, 100);
  }

  if (stats?.last_5_average != null && stats?.last_10_average != null) {
    const diff = stats.last_10_average - stats.last_5_average;
    trend = diff > 0.8 ? 'up' : diff < -0.8 ? 'down' : 'flat';
  } else if (stats?.trend_direction) {
    // Cache already derived a direction — trust it. The string is free-form
    // across the codebase ("improving" / "declining" / "stable"), so coerce.
    const t = stats.trend_direction.toLowerCase();
    trend = t.includes('improv') || t.includes('up')
      ? 'up'
      : t.includes('declin') || t.includes('down')
        ? 'down'
        : 'flat';
  } else if (rounds.length >= 4) {
    const sorted = rounds.filter((r) => typeof r.score_to_par === 'number');
    const mid = Math.floor(sorted.length / 2);
    const recent = avgOf(sorted.slice(0, mid).map((r) => r.score_to_par as number));
    const older = avgOf(sorted.slice(mid).map((r) => r.score_to_par as number));
    const diff = older - recent;
    trend = diff > 1 ? 'up' : diff < -1 ? 'down' : 'flat';
  }

  return { rating, trend, rounds_in_calculation: sample };
}

function buildTrend(
  rounds: RoundRow[],
  insights: EvidenceInsight[],
): PlayerFingerprint['trend'] {
  // Ordered oldest → newest so the line reads left→right.
  const ordered = [...rounds].sort((a, b) =>
    a.round_date.localeCompare(b.round_date),
  );

  // "Notable" rounds are those near an insight's updated_at window — lets the
  // UI annotate spikes without requiring another DB round-trip.
  const insightDays = new Set(
    insights.map((i) => i.updated_at.slice(0, 10)),
  );

  const rolling: FingerprintTrendPoint[] = ordered.map((r) => ({
    round_id: r.id,
    round_date: r.round_date,
    score_to_par: r.score_to_par,
    total_score: r.total_score,
    course_name: r.course_name,
    notable: insightDays.has(r.round_date),
  }));

  return { rolling };
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function toPct(v: number | null | undefined): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  // The canonical writer (refresh_player_stats_cache / full-refresh writer)
  // stores every *_percentage and *_pct column as (numerator/denominator) * 100
  // into numeric(5,2) — i.e. already a 0-100 percent. The old fraction-vs-percent
  // magnitude guess (v <= 1.5 ⇒ treat as fraction, ×100) turned a real 1.0%
  // (e.g. a low one-putt % or 20+ ft make %) into 100%. Treat the stored value
  // as a percent and clamp to the valid 0-100 range.
  return clamp(Math.round(v), 0, 100);
}

function formatSigned(v: number, decimals = 1): string {
  if (v > 0) return `+${v.toFixed(decimals)}`;
  if (v < 0) return v.toFixed(decimals);
  return decimals > 0 ? v.toFixed(decimals) : '0';
}

function avgOf(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function computeScoringAverage(rounds: RoundRow[]): number | null {
  // Scoring average is defined over 18-hole rounds only; mixing 9-hole
  // rounds in deflates the average. Treat missing holes_played as 18.
  const scored = rounds.filter(
    (r) => typeof r.total_score === 'number' && (r.holes_played ?? 18) === 18,
  );
  if (scored.length === 0) return null;
  return avgOf(scored.map((r) => r.total_score as number));
}

function computeScoringVsPar(rounds: RoundRow[]): number | null {
  // 18-hole rounds only, mirroring computeScoringAverage.
  const scored = rounds.filter(
    (r) => typeof r.score_to_par === 'number' && (r.holes_played ?? 18) === 18,
  );
  if (scored.length === 0) return null;
  return avgOf(scored.map((r) => r.score_to_par as number));
}
