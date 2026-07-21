'use server';

/**
 * Triage Desk — server layer.
 *
 * Reads active `golf_coach_insights` + `golf_patterns_v2` rows for a team,
 * maps them into the shared `GroupedSignal` shape, and hands them to the
 * pure grouping/scoring logic in `src/lib/coachhelm/signal-grouping.ts`
 * (kept DB-free there so it's unit-testable in isolation).
 *
 * `reviewSignal` / `dismissSignal` are thin delegates onto the mutations
 * that already own auth + the write for each kind — intelligence-dashboard.ts
 * for insights, pattern-management.ts for patterns — so ownership
 * verification lives in exactly ONE place per kind instead of being
 * re-implemented (and potentially drifting) here.
 */

import { createClient } from '@/lib/supabase/server';
import { logServerError } from '@/lib/server-error-logger';
import { verifyTeamAccess as sharedVerifyTeamAccess } from '@/lib/auth/verify-player-access';
import { applyInsightVisibility } from '@/lib/coachhelm/v3/insight-visibility';
import { withAdminObserved } from '@/lib/admin/observed-action';
import {
  groupSignals,
  severityFromInsightPriority,
  severityFromPatternSeverity,
  ageDaysFromCreatedAt,
  type GroupedSignal,
  type SignalGroup,
} from '@/lib/coachhelm/signal-grouping';
import { acknowledgeInsight, dismissInsight } from './intelligence-dashboard';
import { markPatternAddressed, dismissPattern } from './pattern-management';

// ============================================================================
// AUTH
// ============================================================================

/**
 * Same coach-team access rule as `intelligence-dashboard.ts`'s
 * `verifyTeamAccess` — a thin wrapper over the shared RPC-backed helper so
 * the Triage Desk agrees with every other CoachHelm surface on who may see a
 * team's signals (multi-org-safe: matches via `golf_team_coach_staff`, not
 * "any coach in the same organization_id").
 */
async function verifyTeamAccess(teamId: string): Promise<{ authorized: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { authorized: false, error: 'Not authenticated' };
  }
  const access = await sharedVerifyTeamAccess(teamId, user.id, supabase);
  if (!access.allowed) {
    return { authorized: false, error: 'Not authorized to access this team' };
  }
  return { authorized: true };
}

// ============================================================================
// HELPERS
// ============================================================================

function titleCasePatternType(patternType: string): string {
  return patternType
    .split('_')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// ============================================================================
// GET SIGNAL GROUPS
// ============================================================================

async function getSignalGroupsImpl(
  teamId: string
): Promise<{ success: boolean; groups: SignalGroup[]; scannedAt: string | null; error?: string }> {
  try {
    const access = await verifyTeamAccess(teamId);
    if (!access.authorized) {
      return { success: false, groups: [], scannedAt: null, error: access.error || 'Not authorized' };
    }

    const supabase = await createClient();

    // Active roster player ids — used both for player-name lookup and to
    // scope the (player-only, no team_id column) patterns query.
    const { data: teamMemberRows, error: teamMembersError } = await supabase
      .from('golf_team_members')
      .select('player_id')
      .eq('team_id', teamId)
      .eq('status', 'active');

    if (teamMembersError) {
      await logServerError(`getSignalGroups roster query failed: ${teamMembersError.message}`, {
        action: 'signal_groups.getSignalGroups.roster',
        metadata: { teamId, errorCode: teamMembersError.code },
      });
      return { success: false, groups: [], scannedAt: null, error: 'Failed to fetch the active roster' };
    }

    const teamPlayerIds = (teamMemberRows ?? [])
      .map((row) => row.player_id)
      .filter((id): id is string => !!id);

    const { data: playerRows, error: playersError } =
      teamPlayerIds.length > 0
        ? await supabase.from('golf_players').select('id, first_name, last_name').in('id', teamPlayerIds)
        : { data: [] as Array<{ id: string; first_name: string | null; last_name: string | null }>, error: null };

    if (playersError) {
      await logServerError(`getSignalGroups player query failed: ${playersError.message}`, {
        action: 'signal_groups.getSignalGroups.players',
        metadata: { teamId, errorCode: playersError.code },
      });
      return { success: false, groups: [], scannedAt: null, error: 'Failed to fetch player details' };
    }

    const playerNames: Record<string, string> = {};
    for (const player of playerRows ?? []) {
      playerNames[player.id] =
        [player.first_name, player.last_name].filter(Boolean).join(' ').trim() || 'Unknown Player';
    }

    // Active insights for the team — SAME product-visibility contract every
    // other coach surface applies (P2 legacy-surface; see
    // intelligence-dashboard.ts's getTeamInsightsSummary for the identical
    // `.eq('dismissed', false)` + `applyInsightVisibility` pairing).
    const { data: insightRows, error: insightsError } = await applyInsightVisibility(
      supabase
        .from('golf_coach_insights')
        .select('id, player_id, insight_type, category, title, content, priority, status, metadata, created_at')
        .eq('team_id', teamId)
        // The desk is an ACTION queue. Reviewed/resolved rows remain valid
        // history elsewhere, but must leave this queue after the coach acts.
        .eq('status', 'active')
        .eq('dismissed', false)
    ).order('created_at', { ascending: false });

    if (insightsError) {
      await logServerError(
        `getSignalGroups insights query failed: ${insightsError instanceof Error ? insightsError.message : String(insightsError)}`,
        { action: 'signal_groups.getSignalGroups', metadata: { teamId } }
      );
      return { success: false, groups: [], scannedAt: null, error: 'Failed to fetch signals' };
    }

    // Active patterns for the team's roster. `golf_patterns_v2` has NO
    // team_id column (player-scoped), so it's scoped via teamPlayerIds.
    // Contextual patterns are excluded — same read-time suppression
    // `getTeamPatterns` (pattern-management.ts) applies by default: they are
    // ~99.8% of rows and near-zero signal (avg -0.33 strokes), and would
    // drown out every real signal on this desk.
    const { data: patternRows, error: patternsError } =
      teamPlayerIds.length > 0
        ? await supabase
            .from('golf_patterns_v2')
            .select('id, player_id, pattern_type, severity, stroke_impact, lifecycle_state, metadata, created_at')
            .in('player_id', teamPlayerIds)
            .eq('is_active', true)
            // Addressed/resolved patterns belong in lifecycle/history views,
            // not the open triage queue. Keeping them here made "Mark
            // reviewed" appear to work optimistically, then reappear after
            // router.refresh().
            .in('lifecycle_state', ['detected', 'confirmed'])
            .neq('pattern_type', 'contextual')
        : { data: [] as Array<{
            id: string;
            player_id: string;
            pattern_type: string;
            severity: string | null;
            stroke_impact: number | null;
            lifecycle_state: string | null;
            metadata: unknown;
            created_at: string | null;
          }>, error: null };

    if (patternsError) {
      await logServerError(`getSignalGroups patterns query failed: ${patternsError.message}`, {
        action: 'signal_groups.getSignalGroups.patterns',
        metadata: { teamId, errorCode: patternsError.code },
      });
      return { success: false, groups: [], scannedAt: null, error: 'Failed to fetch patterns' };
    }

    const insightSignals: GroupedSignal[] = (insightRows ?? []).map((row) => {
      const metadata = (row.metadata as Record<string, unknown> | null) ?? {};
      const strokesImpact = metadata.strokes_impact;
      return {
        id: row.id,
        kind: 'insight',
        // `category` is nullable (v2-era rows never set it); insight_type is
        // always present and is the de facto category for those rows.
        category: row.category || row.insight_type || 'general',
        severity: severityFromInsightPriority(row.priority),
        title: row.title || 'Untitled insight',
        claim: row.content || row.title || '',
        ageDays: ageDaysFromCreatedAt(row.created_at),
        status: row.status || 'active',
        strokeImpact: typeof strokesImpact === 'number' ? strokesImpact : null,
        playerId: row.player_id,
        supersededCount: 0,
      };
    });

    const patternSignals: GroupedSignal[] = (patternRows ?? []).map((row) => {
      const metadata = (row.metadata as { description?: string } | null) ?? {};
      return {
        id: row.id,
        kind: 'pattern',
        category: row.pattern_type || 'pattern',
        severity: severityFromPatternSeverity(row.severity),
        title: `${titleCasePatternType(row.pattern_type || 'pattern')} pattern`,
        claim: metadata.description || 'A performance pattern was detected.',
        ageDays: ageDaysFromCreatedAt(row.created_at),
        status: row.lifecycle_state || 'detected',
        strokeImpact: typeof row.stroke_impact === 'number' ? row.stroke_impact : null,
        playerId: row.player_id,
        supersededCount: 0,
      };
    });

    const groups = groupSignals([...insightSignals, ...patternSignals], playerNames);

    const timestamps = [...(insightRows ?? []), ...(patternRows ?? [])]
      .map((row) => row.created_at)
      .filter((t): t is string => !!t);
    const scannedAt = timestamps.length > 0 ? timestamps.reduce((latest, t) => (t > latest ? t : latest)) : null;

    return { success: true, groups, scannedAt };
  } catch (error) {
    await logServerError(`getSignalGroups failed: ${error instanceof Error ? error.message : String(error)}`, {
      action: 'signal_groups.getSignalGroups',
      metadata: { teamId },
    });
    return { success: false, groups: [], scannedAt: null, error: 'Internal server error' };
  }
}

const observedGetSignalGroups = withAdminObserved(
  'getSignalGroups',
  { sport: 'golf', feature: 'intelligence_dashboard' },
  getSignalGroupsImpl
);

export async function getSignalGroups(
  teamId: string
): Promise<{ success: boolean; groups: SignalGroup[]; scannedAt: string | null; error?: string }> {
  return observedGetSignalGroups(teamId);
}

// ============================================================================
// REVIEW SIGNAL (delegates to acknowledgeInsight / markPatternAddressed —
// both already auth-checked and already revalidate the canonical Intelligence
// route after this file's fixes to pattern-management.ts).
// ============================================================================

async function reviewSignalImpl(id: string, kind: 'insight' | 'pattern'): Promise<{ success: boolean; error?: string }> {
  return kind === 'insight' ? acknowledgeInsight(id) : markPatternAddressed(id);
}

const observedReviewSignal = withAdminObserved(
  'reviewSignal',
  { sport: 'golf', feature: 'intelligence_dashboard' },
  reviewSignalImpl
);

export async function reviewSignal(id: string, kind: 'insight' | 'pattern'): Promise<{ success: boolean; error?: string }> {
  return observedReviewSignal(id, kind);
}

// ============================================================================
// DISMISS SIGNAL (delegates to dismissInsight / dismissPattern — same
// already-auth-checked, already-revalidating mutations).
// ============================================================================

async function dismissSignalImpl(id: string, kind: 'insight' | 'pattern'): Promise<{ success: boolean; error?: string }> {
  return kind === 'insight' ? dismissInsight(id) : dismissPattern(id);
}

const observedDismissSignal = withAdminObserved(
  'dismissSignal',
  { sport: 'golf', feature: 'intelligence_dashboard' },
  dismissSignalImpl
);

export async function dismissSignal(id: string, kind: 'insight' | 'pattern'): Promise<{ success: boolean; error?: string }> {
  return observedDismissSignal(id, kind);
}
