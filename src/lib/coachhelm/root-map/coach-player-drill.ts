/**
 * ============================================================================
 * Coach drill into one player's root map (Team roots → a player)
 * ----------------------------------------------------------------------------
 * `/golf/dashboard/intelligence?view=team&player=<id>&cause=<insightId>`.
 *
 * The SAME pipeline the player's own CoachHelm Today view runs
 * (`src/app/golf/(dashboard)/dashboard/coachhelm/page.tsx`): countable
 * per-round SG, the last 10 rounds, the short-putt slope sample, the approach
 * band split + narrowing, then `buildRootMap` / `branchDetailOf` /
 * `buildGreenView`. Only the insight source differs:
 *
 * - Insights come from `getInsightsForCoachWithMeta(coachId, { player_id })`,
 *   which runs `verifyPlayerAccess` for the requesting coach and
 *   `applyInsightVisibility` (so course-management and other hidden rows never
 *   reach the drill). NOT `getInsightsForPlayer`: that records `player_feed`
 *   exposures, and a coach looking is not the player seeing.
 * - Every read uses the caller's request-scoped client, so RLS applies as it
 *   does for the rest of the Brief (coaches read team rounds/holes/shots via
 *   `is_golf_team_coach`). No service role, nothing widened.
 * - The clicked cause can be absent from that list (collapsed par-scoring
 *   rows, subject dedupe, the 30-row limit). Its Why is then built from the
 *   matching visibility-filtered team signal the Brief already holds, so a
 *   matrix cell always opens something honest.
 *
 * Failure contract: a failed access check or insight read returns
 * `{ status: 'failed' }`; the view says so instead of drawing an empty map.
 * ========================================================================== */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import type { GroupedSignal } from '@/lib/coachhelm/signal-grouping';
import type { InsightEvidence } from '@/lib/coachhelm/v2/insights/types';
import { getInsightsForCoachWithMeta } from '@/app/golf/actions/insight-delivery';
import { logServerError } from '@/lib/server-error-logger';
import { describeError } from '@/lib/utils/describe-error';
import { buildRootMap } from './build-player-root-map';
import {
  ROOT_AREAS,
  branchDetailOf,
  buildRootHeadline,
  daysBetween,
  findBranch,
  type BranchDetail,
  type RootMapModel,
} from './build-root-map';
import { loadApproachContext, loadPlayersAreaSg, loadRecentAreaSgRounds, loadShortPuttSlopes } from './loaders';
import { buildPlayerApproachRoot } from './approach-root';
import { measureWhat, type MeasuredWhat } from './measured-what';
import type { ApproachWhyView } from './approach-context';
import { buildGreenView, type GreenView } from './green-view';

export interface CoachDrillInsight {
  id: string;
  playerId: string;
  category: string | null;
}

export interface CoachPlayerDrillReady {
  status: 'ready';
  playerId: string;
  /** First name, for third-person copy ("Ava's last 18 rounds"). */
  playerName: string;
  /** The requested cause (`?cause=`), or null. */
  causeId: string | null;
  model: RootMapModel;
  details: Record<string, BranchDetail>;
  insights: CoachDrillInsight[];
  headline: string | null;
  roundsRead: number | null;
  throughDate: string | null;
  /** Days from `throughDate` to today (server clock). */
  daysSinceThrough: number | null;
  greenView: GreenView | null;
  approachWhy: Record<string, ApproachWhyView>;
}

export interface CoachPlayerDrillFailed {
  status: 'failed';
  playerId: string;
  playerName: string;
  causeId: string | null;
}

export type CoachPlayerDrill = CoachPlayerDrillReady | CoachPlayerDrillFailed;

const APPROACH_BAND_METRIC = /^approach_proximity_(50_125ft|125_175ft|175_plus_ft)$/;

export async function loadCoachPlayerDrill(
  sb: SupabaseClient<Database>,
  input: {
    coachId: string;
    playerId: string;
    playerName: string;
    causeId: string | null;
    /** The Brief's visibility-filtered signals (fallback detail source). */
    signals: GroupedSignal[];
  },
): Promise<CoachPlayerDrill> {
  const { coachId, playerId, playerName, causeId } = input;
  const failed: CoachPlayerDrillFailed = { status: 'failed', playerId, playerName, causeId };

  const reads = Promise.all([
    loadPlayersAreaSg(sb, [playerId]),
    loadRecentAreaSgRounds(sb, playerId, 10),
    loadShortPuttSlopes(sb, playerId),
    loadApproachContext(sb, playerId),
  ]);
  const insightsRes = await getInsightsForCoachWithMeta(coachId, { player_id: playerId, limit: 30 });
  if (!insightsRes.ok) return failed;

  try {
    const [sgRows, recentRounds, shortPutts, approachLoad] = await reads;
    let approachRoot: ReturnType<typeof buildPlayerApproachRoot> = null;
    try {
      approachRoot = approachLoad ? buildPlayerApproachRoot(approachLoad, playerId) : null;
    } catch (err) {
      void logServerError(
        `[team roots drill] approach context assembly failed for player ${playerId}: ${describeError(err)}`,
        { action: 'teamRoots.drill.approach', featureArea: 'coachhelm' },
        'warning',
      );
    }
    const shown = insightsRes.data;
    const sgRow = sgRows?.[0] ?? null;
    const throughDate = recentRounds?.[0]?.date ?? null;
    // The What row measured from recorded shots (same countable rounds as
    // the Where row; `measureWhat` checks the window and the reconciliation).
    let measured: MeasuredWhat | null = null;
    try {
      measured =
        approachLoad && sgRow
          ? measureWhat({
              rounds: approachLoad.rounds,
              shots: approachLoad.shots,
              holes: approachLoad.holes,
              scale: approachLoad.scale,
              whereSg: sgRow.sg,
              whereRounds: sgRow.roundsPlayed,
            })
          : null;
    } catch (err) {
      void logServerError(
        `[root map] measured What row failed for player ${playerId}: ${describeError(err)}`,
        { action: 'rootMap.measuredWhat', featureArea: 'coachhelm' },
        'warning',
      );
    }
    const model = buildRootMap({
      areas: ROOT_AREAS.map((area) => ({ area, sgPerRound: sgRow?.sg[area] ?? null })),
      insights: shown,
      newSinceDate: throughDate,
      approachBands: approachRoot?.bands ?? null,
      measured,
    });

    const details: Record<string, BranchDetail> = {};
    const insights: CoachDrillInsight[] = [];
    const approachWhy: Record<string, ApproachWhyView> = {};
    for (const insight of shown) {
      const d = branchDetailOf(insight);
      if (d) details[insight.id] = d;
      insights.push({ id: insight.id, playerId, category: insight.category ?? null });
      const m = typeof insight.evidence?.metric === 'string' ? insight.evidence.metric.match(APPROACH_BAND_METRIC) : null;
      const view = m?.[1] && approachRoot ? approachRoot.context.why[m[1] as keyof typeof approachRoot.context.why] : undefined;
      if (view) approachWhy[insight.id] = view;
    }

    // The clicked cause fell out of the ranked list: read it from the team
    // signal the Brief already fetched (same visibility filter, same player).
    if (causeId && !details[causeId]) {
      const sig = input.signals.find((s) => s.id === causeId && s.kind === 'insight' && s.playerId === playerId);
      const evidence = sig?.evidence && typeof sig.evidence === 'object' ? (sig.evidence as InsightEvidence) : null;
      const d = sig ? branchDetailOf({ id: sig.id, title: sig.title, content: sig.claim, evidence }) : null;
      if (sig && d) {
        details[sig.id] = d;
        insights.push({ id: sig.id, playerId, category: sig.category ?? null });
      }
    }

    return {
      status: 'ready',
      playerId,
      playerName,
      causeId,
      model,
      details,
      insights,
      // The headline leads the summary card, so it describes the map (as on
      // the player's own page), not the cause a link opened in the sheet.
      headline: buildRootHeadline(model, findBranch(model, model.defaultSelectedId), 'coach'),
      roundsRead: sgRow?.roundsPlayed ?? null,
      throughDate,
      daysSinceThrough: daysBetween(throughDate, new Date().toISOString()),
      greenView: shortPutts ? buildGreenView(shortPutts.putts, shortPutts.rounds) : null,
      approachWhy,
    };
  } catch (err) {
    void logServerError(
      `[team roots drill] root map assembly failed for player ${playerId}: ${describeError(err)}`,
      { action: 'teamRoots.drill', featureArea: 'coachhelm' },
      'warning',
    );
    return failed;
  }
}
