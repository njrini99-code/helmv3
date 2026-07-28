'use server';

// ============================================================================
// WHAT'S NEW — COACH LIFECYCLE CHANGE FEED
// ============================================================================
//
// Aggregates lifecycle activity across the coach's team for the past 7 days:
//   - Insights resolved / matured (lifecycle_state transitions)
//   - Insights detected (newly created)
//   - Patterns validated by the coach
//   - Focus areas created / completed
//
// Returned in a single chronological feed (occurredAt desc). The window is
// already bounded to 7 days, so the full feed is returned — counts the UI shows
// are the true total, never a silently-capped number (B4: no data lies). Each
// per-category query is bounded to PER_QUERY_LIMIT rows; if any branch returns
// at that ceiling more events may exist beyond the window's loaded set, which we
// disclose honestly via the `truncated` flag rather than presenting the capped
// count as definitive.
// ============================================================================

import { createClient } from '@/lib/supabase/server';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { logServerError } from '@/lib/server-error-logger';
import { applyInsightVisibility } from '@/lib/coachhelm/v3/insight-visibility';
import { resolveCoachTeamIdWithCookie } from '@/lib/golf/resolve-team-server';
import { withAdminObserved } from '@/lib/admin/observed-action';
import { describeError } from '@/lib/utils/describe-error';

// ============================================================================
// TYPES
// ============================================================================

export type WhatsNewType =
  | 'insight_resolved'
  | 'insight_matured'
  | 'insight_detected'
  | 'pattern_validated'
  | 'focus_area_created'
  | 'focus_area_completed';

export interface WhatsNewItem {
  type: WhatsNewType;
  occurredAt: string;
  playerId: string;
  playerName: string;
  title: string;
  description?: string;
  insightId?: string;
  patternId?: string;
  focusAreaId?: string;
}

interface PlayerNameRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
}

// Per-category row ceiling. Generous relative to a realistic 7-day window so the
// common case is never truncated; when a single category does hit this ceiling
// we surface `truncated` rather than under-reporting the count (B4).
const PER_QUERY_LIMIT = 200;

// ============================================================================
// HELPERS
// ============================================================================

function sevenDaysAgoISO(): string {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString();
}

function buildPlayerNameLookup(rows: PlayerNameRow[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of rows) {
    const name = `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim();
    map.set(row.id, name.length > 0 ? name : `Player ${row.id.slice(0, 8)}`);
  }
  return map;
}

function nameFor(map: Map<string, string>, playerId: string | null | undefined): string {
  if (!playerId) return 'Unknown player';
  return map.get(playerId) ?? `Player ${playerId.slice(0, 8)}`;
}

/**
 * Turn a raw golf_patterns_v2.pattern_type enum (e.g. "putting_miss",
 * "recurring_weakness") into a human label for the change feed. Known types
 * map to curated labels; anything else falls back to Title-Cased snake_case so
 * the coach never sees a raw "putting_miss" string.
 */
const PATTERN_TYPE_LABELS: Record<string, string> = {
  putting: 'Putting',
  putting_miss: 'Putting',
  approach: 'Approach',
  driving: 'Driving',
  tee: 'Driving',
  short_game: 'Short game',
  scoring: 'Scoring',
  scoring_decline: 'Scoring',
  contextual: 'Contextual pattern',
  pattern_detected: 'Active pattern',
  recurring_weakness: 'Recurring weakness',
  tournament_pressure: 'Tournament play',
  stat_regression: 'Stat regression',
  plateau: 'Plateau',
  general: 'General',
};

function humanizePatternType(patternType: string | null | undefined): string {
  if (!patternType) return 'Pattern validated';
  const label =
    PATTERN_TYPE_LABELS[patternType] ??
    patternType
      .split('_')
      .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w))
      .join(' ');
  return `${label} pattern`;
}

// ============================================================================
// MAIN ACTION
// ============================================================================

async function getWhatsNewForCoachImpl(): Promise<{
  success: boolean;
  items?: WhatsNewItem[];
  /**
   * True when at least one per-category query returned at its row ceiling, so
   * the feed may not include every event in the window. Lets the UI disclose
   * "showing latest N" instead of presenting the count as the definitive total.
   */
  truncated?: boolean;
  error?: string;
}> {
  const session = await getGolfSessionProfile();
  if (!session) {
    return { success: false, error: 'Not authenticated' };
  }

  const { coach } = session;
  if (!coach) {
    return { success: false, error: 'Coach profile required' };
  }

  if (!coach.organization_id) {
    return { success: true, items: [], truncated: false };
  }

  const supabase = await createClient();
  const sinceIso = sevenDaysAgoISO();

  try {
    // Resolve coach's active team (cookie-aware, multi-team safe)
    const teamId = await resolveCoachTeamIdWithCookie(supabase, coach.organization_id, coach.id);

    if (!teamId) {
      return { success: true, items: [], truncated: false };
    }

    // Roster — used to scope pattern_validated to team players
    const { data: rosterRows } = await supabase
      .from('golf_team_members')
      .select('player_id')
      .eq('team_id', teamId)
      .eq('status', 'active');

    const teamPlayerIds = (rosterRows ?? [])
      .map((r) => r.player_id)
      .filter((id): id is string => typeof id === 'string');

    // Run the five lifecycle queries in parallel.
    // matured_at is NOT a column on golf_coach_insights — lifecycle_state
    // transitions are the source of truth. We treat lifecycle_state='matured'
    // rows updated within the window as "matured" events.
    const [
      lifecycleResult,
      detectedResult,
      patternsResult,
      focusCreatedResult,
      focusCompletedResult,
    ] = await Promise.all([
      // 1) Insights matured or resolved (lifecycle transitions). Apply the
      //    SAME product-visibility contract (P2): the change feed must not
      //    announce stale v2 / dismissed rows. The explicit ['matured','resolved']
      //    narrows the visible-lifecycle superset to just these two transitions.
      applyInsightVisibility(
        supabase
          .from('golf_coach_insights')
          .select('id, player_id, title, content, lifecycle_state, resolved_at, updated_at')
          .eq('team_id', teamId)
          .in('lifecycle_state', ['matured', 'resolved'])
          .or(`resolved_at.gte.${sinceIso},updated_at.gte.${sinceIso}`),
      )
        .order('updated_at', { ascending: false })
        .limit(PER_QUERY_LIMIT),

      // 2) Insights detected (newly created). Without a visibility filter this
      //    branch had NO lifecycle/engine guard at all, so newly-written
      //    tentative / archived / v2 rows surfaced as "detected" events. The
      //    shared helper restricts it to product-visible v3 rows.
      applyInsightVisibility(
        supabase
          .from('golf_coach_insights')
          .select('id, player_id, title, content, created_at')
          .eq('team_id', teamId)
          .gte('created_at', sinceIso),
      )
        .order('created_at', { ascending: false })
        .limit(PER_QUERY_LIMIT),

      // 3) Patterns validated within window (scope to team roster)
      teamPlayerIds.length > 0
        ? supabase
            .from('golf_patterns_v2')
            .select('id, player_id, pattern_type, validation_date, conditions')
            .in('player_id', teamPlayerIds)
            .gte('validation_date', sinceIso)
            .eq('validated_by_coach', true)
            .order('validation_date', { ascending: false })
            .limit(PER_QUERY_LIMIT)
        : Promise.resolve({ data: [] as never[], error: null }),

      // 4) Focus areas created
      supabase
        .from('golf_player_focus_areas')
        .select('id, player_id, title, description, created_at')
        .eq('team_id', teamId)
        .gte('created_at', sinceIso)
        .order('created_at', { ascending: false })
        .limit(PER_QUERY_LIMIT),

      // 5) Focus areas completed
      supabase
        .from('golf_player_focus_areas')
        .select('id, player_id, title, description, completed_at')
        .eq('team_id', teamId)
        .gte('completed_at', sinceIso)
        .order('completed_at', { ascending: false })
        .limit(PER_QUERY_LIMIT),
    ]);

    // Soft-fail individual branches: log but keep going.
    if (lifecycleResult.error) {
      await logServerError(
        `getWhatsNewForCoach lifecycle query failed: ${lifecycleResult.error.message}`,
        {
          action: 'getWhatsNewForCoach.lifecycle',
          featureArea: 'whats-new',
          extra: { teamId, errorCode: lifecycleResult.error.code },
        },
      );
    }
    if (detectedResult.error) {
      await logServerError(
        `getWhatsNewForCoach detected query failed: ${detectedResult.error.message}`,
        {
          action: 'getWhatsNewForCoach.detected',
          featureArea: 'whats-new',
          extra: { teamId, errorCode: detectedResult.error.code },
        },
      );
    }
    if (patternsResult.error) {
      await logServerError(
        `getWhatsNewForCoach patterns query failed: ${patternsResult.error.message}`,
        {
          action: 'getWhatsNewForCoach.patterns',
          featureArea: 'whats-new',
          extra: { teamId, errorCode: patternsResult.error.code },
        },
      );
    }
    if (focusCreatedResult.error) {
      await logServerError(
        `getWhatsNewForCoach focus-created query failed: ${focusCreatedResult.error.message}`,
        {
          action: 'getWhatsNewForCoach.focusCreated',
          featureArea: 'whats-new',
          extra: { teamId, errorCode: focusCreatedResult.error.code },
        },
      );
    }
    if (focusCompletedResult.error) {
      await logServerError(
        `getWhatsNewForCoach focus-completed query failed: ${focusCompletedResult.error.message}`,
        {
          action: 'getWhatsNewForCoach.focusCompleted',
          featureArea: 'whats-new',
          extra: { teamId, errorCode: focusCompletedResult.error.code },
        },
      );
    }

    const lifecycleRows = lifecycleResult.data ?? [];
    const detectedRows = detectedResult.data ?? [];
    const patternRows = patternsResult.data ?? [];
    const focusCreatedRows = focusCreatedResult.data ?? [];
    const focusCompletedRows = focusCompletedResult.data ?? [];

    // Honesty (B4): if any single category came back at its row ceiling, older
    // events in the 7-day window may have been dropped — disclose that rather
    // than letting the UI report the loaded count as the definitive total.
    const truncated =
      lifecycleRows.length >= PER_QUERY_LIMIT ||
      detectedRows.length >= PER_QUERY_LIMIT ||
      patternRows.length >= PER_QUERY_LIMIT ||
      focusCreatedRows.length >= PER_QUERY_LIMIT ||
      focusCompletedRows.length >= PER_QUERY_LIMIT;

    // Collect all referenced player ids → one batched name lookup
    const referencedPlayerIds = new Set<string>();
    for (const r of lifecycleRows) if (r.player_id) referencedPlayerIds.add(r.player_id);
    for (const r of detectedRows) if (r.player_id) referencedPlayerIds.add(r.player_id);
    for (const r of patternRows) if (r.player_id) referencedPlayerIds.add(r.player_id);
    for (const r of focusCreatedRows) if (r.player_id) referencedPlayerIds.add(r.player_id);
    for (const r of focusCompletedRows) if (r.player_id) referencedPlayerIds.add(r.player_id);

    let nameLookup = new Map<string, string>();
    if (referencedPlayerIds.size > 0) {
      const { data: playerRows } = await supabase
        .from('golf_players')
        .select('id, first_name, last_name')
        .in('id', Array.from(referencedPlayerIds));
      nameLookup = buildPlayerNameLookup((playerRows ?? []) as PlayerNameRow[]);
    }

    const items: WhatsNewItem[] = [];

    // 1) Lifecycle (matured / resolved)
    for (const row of lifecycleRows) {
      if (!row.player_id) continue;
      const isResolved = row.lifecycle_state === 'resolved';
      const occurredAt = isResolved
        ? row.resolved_at ?? row.updated_at ?? null
        : row.updated_at ?? null;
      if (!occurredAt) continue;
      // Re-check the 7-day window since the .or() lets through rows where
      // either column qualifies — we only want the qualifying timestamp.
      if (occurredAt < sinceIso) continue;

      items.push({
        type: isResolved ? 'insight_resolved' : 'insight_matured',
        occurredAt,
        playerId: row.player_id,
        playerName: nameFor(nameLookup, row.player_id),
        title: row.title,
        description: row.content ?? undefined,
        insightId: row.id,
      });
    }

    // 2) Detected
    for (const row of detectedRows) {
      if (!row.player_id || !row.created_at) continue;
      items.push({
        type: 'insight_detected',
        occurredAt: row.created_at,
        playerId: row.player_id,
        playerName: nameFor(nameLookup, row.player_id),
        title: row.title,
        description: row.content ?? undefined,
        insightId: row.id,
      });
    }

    // 3) Pattern validated
    for (const row of patternRows) {
      if (!row.player_id || !row.validation_date) continue;
      items.push({
        type: 'pattern_validated',
        occurredAt: row.validation_date,
        playerId: row.player_id,
        playerName: nameFor(nameLookup, row.player_id),
        title: humanizePatternType(row.pattern_type),
        patternId: row.id,
      });
    }

    // 4) Focus area created
    for (const row of focusCreatedRows) {
      if (!row.player_id || !row.created_at) continue;
      items.push({
        type: 'focus_area_created',
        occurredAt: row.created_at,
        playerId: row.player_id,
        playerName: nameFor(nameLookup, row.player_id),
        title: row.title,
        description: row.description ?? undefined,
        focusAreaId: row.id,
      });
    }

    // 5) Focus area completed
    for (const row of focusCompletedRows) {
      if (!row.player_id || !row.completed_at) continue;
      items.push({
        type: 'focus_area_completed',
        occurredAt: row.completed_at,
        playerId: row.player_id,
        playerName: nameFor(nameLookup, row.player_id),
        title: row.title,
        description: row.description ?? undefined,
        focusAreaId: row.id,
      });
    }

    items.sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : a.occurredAt > b.occurredAt ? -1 : 0));

    // No global cap: the 7-day window already bounds the feed, so returning every
    // assembled item keeps the UI's counts honest (B4). `truncated` carries the
    // one remaining honesty caveat (a single category hitting PER_QUERY_LIMIT).
    return { success: true, items, truncated };
  } catch (error) {
    await logServerError(
      `getWhatsNewForCoach failed: ${describeError(error)}`,
      {
        action: 'getWhatsNewForCoach',
        featureArea: 'whats-new',
        extra: { coachId: coach.id },
      },
    );
    return { success: false, error: 'An unexpected error occurred' };
  }
}

const observedGetWhatsNewForCoach = withAdminObserved(
  'getWhatsNewForCoach',
  { sport: 'golf', feature: 'whats_new' },
  getWhatsNewForCoachImpl,
);

export async function getWhatsNewForCoach(): Promise<{
  success: boolean;
  items?: WhatsNewItem[];
  truncated?: boolean;
  error?: string;
}> {
  return observedGetWhatsNewForCoach();
}
