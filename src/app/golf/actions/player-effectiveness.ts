'use server';

/**
 * Player-facing CoachHelm effectiveness summary — the player equivalent of
 * `coachhelm-analytics.ts` but scoped to a single player.
 *
 * NOT WIRED. Verified 2026-08-16: `getPlayerEffectiveness` has no caller
 * anywhere — no component, page, action or test invokes it. The only
 * references are `coverage-contract.b8-files.test.ts` and
 * `feature-registry.test.ts`, both of which assert this FILE PATH is listed,
 * not that anything calls into it.
 *
 * The previous version of this comment said it was "used by the player's
 * /dashboard/coachhelm 'Your CoachHelm Impact' card". That card does not
 * exist and never has — grep "CoachHelm Impact" returns this comment and
 * nothing else. Leaving that claim in place is what makes an orphan read as
 * live code, so it is corrected rather than deleted.
 *
 * Also note `feature-registry.ts` maps this file into the `coachhelm_analytics`
 * feature with 'ALL', so the admin dashboard counts its exports toward a live
 * feature. The feature's actual health signal reads `golf_insight_effectiveness`
 * (its primaryTable), which this file never touches, so nothing is currently
 * mis-measured — but the mapping over-claims.
 *
 * BEFORE WIRING THIS, READ THIS. It has no empty-state guard, and its inputs
 * are almost entirely unpopulated: `outcome_status` is NULL on 594 of 596
 * production `golf_coach_insights` rows, so `improvedCount` and
 * `totalStrokesSavedPerRound` would render a confident **0 strokes saved** for
 * effectively every player — a measured-looking zero for something never
 * measured. Its sibling `coachhelm-analytics.ts` already solved this (it logs
 * "would have reported zero effectiveness it never measured" and ships a
 * tested empty state); this file would reintroduce the bug. The ledger is
 * empty for workflow reasons, not a defect: only 5 of 25 focus areas carry a
 * `from_insight_id`, and none of those 5 are completed yet, so
 * `recordFocusAreaOutcome` has had nothing to credit.
 *
 * Stroke impact lives on `golf_coach_insights.metadata.stroke_impact` (jsonb)
 * because the column itself isn't present on the insights table — only on
 * patterns. We pluck it out per row.
 */

import { applyInsightVisibility } from '@/lib/coachhelm/v3/insight-visibility';
import { createClient } from '@/lib/supabase/server';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { resolveCoachTeamIdWithCookie } from '@/lib/golf/resolve-team-server';
import { logServerError } from '@/lib/server-error-logger';
import { withAdminObserved } from '@/lib/admin/observed-action';

const WINDOW_DAYS = 90;

export interface PlayerEffectivenessSummary {
  totalInsights: number;
  resolvedCount: number;
  improvedCount: number;
  totalStrokesSavedPerRound: number;
  topResolvedInsights: Array<{
    id: string;
    title: string;
    category: string;
    strokeImpactPerRound: number;
    resolvedAt: string;
  }>;
  windowDays: number;
}

interface InsightRow {
  id: string;
  title: string | null;
  category: string | null;
  lifecycle_state: string | null;
  outcome_status: string | null;
  resolved_at: string | null;
  metadata: Record<string, unknown> | null;
}

// ---------------------------------------------------------------------------
// Authorization — caller must be the player or a coach of the player's team.
// Mirrors the pattern in stats-intelligence.ts so coach + player surfaces stay
// consistent.
// ---------------------------------------------------------------------------

async function authorizePlayerAccess(
  playerId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await getGolfSessionProfile();
  if (!session) return { ok: false, error: 'Unauthorized' };
  const supabase = await createClient();

  if (session.player?.id === playerId) return { ok: true };

  if (session.coach?.organization_id) {
    const teamId = await resolveCoachTeamIdWithCookie(
      supabase,
      session.coach.organization_id,
      session.coach.id,
    );
    if (teamId) {
      const { data: membership } = await supabase
        .from('golf_team_members')
        .select('player_id')
        .eq('team_id', teamId)
        .eq('player_id', playerId)
        .maybeSingle();
      if (membership) return { ok: true };
    }
  }

  return { ok: false, error: 'Not authorized for this player' };
}

// ---------------------------------------------------------------------------
// Stroke impact extraction — engine writes the per-round stroke impact into
// metadata.stroke_impact (number) when available. Some legacy rows store it
// under metadata.strokes_impact (plural). Normalize both, return |value|.
// ---------------------------------------------------------------------------

function extractStrokeImpact(metadata: Record<string, unknown> | null): number | null {
  if (!metadata) return null;
  const candidates = [metadata.stroke_impact, metadata.strokes_impact];
  for (const raw of candidates) {
    if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
    if (typeof raw === 'string') {
      const parsed = Number(raw);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Public action
// ---------------------------------------------------------------------------

async function getPlayerEffectivenessImpl(
  playerId: string,
): Promise<{ success: boolean; data?: PlayerEffectivenessSummary; error?: string }> {
  try {
    const auth = await authorizePlayerAccess(playerId);
    if (!auth.ok) return { success: false, error: auth.error };

    const supabase = await createClient();
    const sinceIso = new Date(
      Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString();

    // Shared visibility contract (rescore partial #5) — effectiveness is
    // measured over product-visible insights only.
    const { data: rows, error } = await applyInsightVisibility(
      supabase
        .from('golf_coach_insights')
        .select(
          'id, title, category, lifecycle_state, outcome_status, resolved_at, metadata',
        )
        .eq('player_id', playerId),
    ).gte('created_at', sinceIso);

    if (error) {
      return { success: false, error: error.message };
    }

    const insights = (rows ?? []) as InsightRow[];

    let resolvedCount = 0;
    let improvedCount = 0;
    let totalStrokesSavedPerRound = 0;

    type ResolvedTopRow = PlayerEffectivenessSummary['topResolvedInsights'][number];
    const candidates: Array<ResolvedTopRow & { absImpact: number }> = [];

    for (const row of insights) {
      const isResolved = row.lifecycle_state === 'resolved';
      const isImproved = row.outcome_status === 'improved';
      if (isResolved) resolvedCount++;

      const impact = extractStrokeImpact(row.metadata);
      if (isImproved && impact != null) {
        totalStrokesSavedPerRound += Math.abs(impact);
        improvedCount++;
      }

      if (isResolved && impact != null) {
        candidates.push({
          id: row.id,
          title: row.title ?? 'Insight',
          category: row.category ?? 'general',
          strokeImpactPerRound: impact,
          resolvedAt: row.resolved_at ?? '',
          absImpact: Math.abs(impact),
        });
      }
    }

    candidates.sort((a, b) => b.absImpact - a.absImpact);
    const topResolvedInsights: ResolvedTopRow[] = candidates
      .slice(0, 3)
      .map(({ absImpact: _absImpact, ...rest }) => rest);

    return {
      success: true,
      data: {
        totalInsights: insights.length,
        resolvedCount,
        improvedCount,
        totalStrokesSavedPerRound: Math.round(totalStrokesSavedPerRound * 10) / 10,
        topResolvedInsights,
        windowDays: WINDOW_DAYS,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    await logServerError(message, { action: 'getPlayerEffectiveness' }, 'error');
    return { success: false, error: message };
  }
}

const observedGetPlayerEffectiveness = withAdminObserved(
  'getPlayerEffectiveness',
  { sport: 'golf', feature: 'coachhelm_analytics' },
  getPlayerEffectivenessImpl,
);

export async function getPlayerEffectiveness(
  playerId: string,
): Promise<{ success: boolean; data?: PlayerEffectivenessSummary; error?: string }> {
  return observedGetPlayerEffectiveness(playerId);
}
