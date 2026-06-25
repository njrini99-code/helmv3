// =============================================================================
// src/lib/baseball/read-models/postgame.ts
//
// Read model for the Postgame Action Review surface.
//
// Fetches a saved review + its items (RLS-scoped — staff see everything, a
// player sees only their own player_visible items) and shapes them for the
// client: grouped by V10 section (player-timeline updates, staff decisions,
// practice focus, workload updates), each item carrying a render-ready
// SourceTrust descriptor + SourceProvenance for the Foundations
// <SourceTrustBadge> / <SourceDrawer> (imported, never re-built here).
//
// HONESTY: confidence renders as a real percent (or "—" when null). One-game
// items are tagged so the surface labels them "watch", never "trend". This is a
// pure read — no writes, no service_role; the page passes the RLS-scoped client.
// =============================================================================

import 'server-only';

import { buildSourceTrust } from '@/components/baseball/source-trust/build-source-trust';
import type {
  SourceTrust,
  SourceProvenance,
} from '@/components/baseball/source-trust';
import { buildSourceRef } from '@/lib/baseball/source-record';
import { hasBaseballCapability } from '@/lib/baseball/capabilities';
import type { BaseballInsightSourceRef } from '@/lib/types/baseball-coachhelm';
import type {
  PostgameItemKind,
  PostgameActionType,
  PostgamePriority,
  PostgameVisibility,
  PostgameSourceStatus,
  PostgameReviewDisposition,
  PostgameItemDisposition,
} from '@/lib/types/baseball-postgame';

// -----------------------------------------------------------------------------
// View shapes the client renders.
// -----------------------------------------------------------------------------

export interface PostgameItemView {
  id: string;
  playerId: string | null;
  playerName: string | null;
  itemKind: PostgameItemKind;
  title: string;
  detail: string | null;
  actionLabel: string | null;
  actionType: PostgameActionType;
  ownerRole: string | null;
  priority: PostgamePriority;
  confidencePct: number | null;
  visibility: PostgameVisibility;
  playerVisible: boolean;
  disposition: PostgameItemDisposition;
  /** Render-ready trust descriptor for the FIRST (primary) source ref. */
  trust: SourceTrust;
  /** Rich provenance for the drawer (lists every source ref). */
  provenance: SourceProvenance;
  /** Whether this rests on a single-game sample (surface labels it "watch"). */
  oneGame: boolean;
}

export interface PostgameReviewView {
  id: string;
  gameId: string | null;
  title: string;
  summary: string | null;
  confidencePct: number | null;
  visibility: PostgameVisibility;
  disposition: PostgameReviewDisposition;
  sourceStatus: PostgameSourceStatus;
  battingLinesN: number;
  pitchingLinesN: number;
  importWarnings: string[];
  generatedAt: string;
  opponentName: string | null;
  gameDate: string | null;
  ourScore: number | null;
  opponentScore: number | null;
  /** Items grouped by V10 section, each already sorted by priority then conf. */
  sections: {
    timelineUpdates: PostgameItemView[];
    staffDecisions: PostgameItemView[];
    practiceFocus: PostgameItemView[];
    workloadUpdates: PostgameItemView[];
    videoEvidence: PostgameItemView[];
  };
  itemCount: number;
}

export interface PostgameReadResult {
  authorized: boolean;
  review: PostgameReviewView | null;
  /** Lightweight list of completed games (for the picker). */
  recentGames: Array<{
    gameId: string;
    opponentName: string | null;
    gameDate: string | null;
    hasReview: boolean;
  }>;
  error?: string;
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const PRIORITY_RANK: Record<PostgamePriority, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
};

/** Turn the stored source_refs into a trust descriptor + drawer provenance. */
function toTrustAndProvenance(
  refs: BaseballInsightSourceRef[],
  generatedAt: string,
  visibility: PostgameVisibility,
): { trust: SourceTrust; provenance: SourceProvenance } {
  const primary = refs[0];
  const label = primary?.label ?? 'Game box score';
  const confidence = primary?.confidence ?? null;
  // Postgame items are AI-derived from box-score objects → ai-derived trust,
  // active capture (the underlying stat WAS observed), not logged intent.
  const ref = buildSourceRef({ source: 'ai', sourceId: null, label });
  const trust = buildSourceTrust({
    ref,
    confidence,
    captureMode: 'active_capture',
    trustLevel: 'ai_derived',
  });
  const provenance: SourceProvenance = {
    ref: { source: 'ai', sourceId: null, label },
    sourceName: 'Postgame Action Review (CoachHelm)',
    generatedAt,
    visibility: visibility === 'player_visible' ? 'player_visible' : 'staff_only',
    relatedObjects: refs.map((r) => ({
      kind: r.table === 'baseball_games' ? 'Game' : 'Stat line',
      label: r.label ?? r.column ?? r.table,
    })),
    facts: refs
      .map((r) => r.label)
      .filter((x): x is string => !!x),
    interpretation:
      'Derived from this game’s recorded box-score objects. Single-game signals are watch-level, not proven trends.',
  };
  return { trust, provenance };
}

function mapItem(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  row: any,
  generatedAt: string,
): PostgameItemView {
  const refs = (row.source_refs ?? []) as BaseballInsightSourceRef[];
  const visibility = (row.visibility ?? 'staff_only') as PostgameVisibility;
  const { trust, provenance } = toTrustAndProvenance(refs, generatedAt, visibility);
  const player = row.baseball_players as
    | { first_name: string | null; last_name: string | null }
    | null;
  const playerName = player
    ? [player.first_name, player.last_name].filter(Boolean).join(' ').trim() || null
    : null;
  const confidence = row.confidence == null ? null : Number(row.confidence);
  return {
    id: row.id,
    playerId: row.player_id ?? null,
    playerName,
    itemKind: row.item_kind as PostgameItemKind,
    title: row.title,
    detail: row.detail ?? null,
    actionLabel: row.action_label ?? null,
    actionType: (row.action_type ?? 'none') as PostgameActionType,
    ownerRole: row.owner_role ?? null,
    priority: (row.priority ?? 'low') as PostgamePriority,
    confidencePct: confidence == null ? null : Math.round(confidence * 100),
    visibility,
    playerVisible: row.player_visible === true,
    disposition: (row.disposition ?? 'new') as PostgameItemDisposition,
    trust,
    provenance,
    // Box-score postgame items are all single-game by construction (workload is
    // an observed count, still from one outing).
    oneGame: true,
  };
}

function sortItems(items: PostgameItemView[]): PostgameItemView[] {
  return [...items].sort((a, b) => {
    const p = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (p !== 0) return p;
    return (b.confidencePct ?? 0) - (a.confidencePct ?? 0);
  });
}

// -----------------------------------------------------------------------------
// getPostgameReview — load the review for a game (or the latest if no gameId).
//
// STAFF GATE: the postgame action review is staff coaching intelligence built
// from the official box score, and the same `can_manage_stats` capability that
// gates generating it (the write action + the nav-registry entry) gates READING
// it. A college/JUCO staffer who lacks can_manage_stats (academic viewer,
// director of ops, a scoped assistant) must NOT be able to navigate directly to
// /baseball/dashboard/postgame and read the full source-cited review. This is the
// in-process gate that mirrors getPracticeEffectivenessData(); RLS still backstops
// it and the middleware adds a second (defense-in-depth) layer.
// -----------------------------------------------------------------------------

export async function getPostgameReview(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  teamId: string,
  gameId?: string | null,
): Promise<PostgameReadResult> {
  // Staff gate: reading the postgame review requires can_manage_stats on this
  // team. Head/primary coaches implicitly hold it (resolved in the capability
  // layer). Anyone without it gets the honest unauthorized envelope — NOT an
  // error, NOT partial data — exactly like practice-effectiveness.
  const allowed = await hasBaseballCapability(teamId, 'can_manage_stats');
  if (!allowed) {
    return { authorized: false, review: null, recentGames: [] };
  }

  // Recent completed games for the picker.
  const { data: gameRows, error: gamesErr } = await supabase
    .from('baseball_games')
    .select('id, opponent_name, game_date, status')
    .eq('team_id', teamId)
    .eq('status', 'completed')
    .order('game_date', { ascending: false })
    .limit(25);

  if (gamesErr) {
    return { authorized: false, review: null, recentGames: [], error: 'Could not load games.' };
  }

  // Which of those games already have a review.
  const { data: reviewRows } = await supabase
    .from('baseball_postgame_reviews')
    .select('id, game_id')
    .eq('team_id', teamId);
  const reviewByGame = new Map<string, string>(
    (reviewRows ?? []).map((r: { id: string; game_id: string | null }) => [r.game_id ?? '', r.id]),
  );

  const recentGames = (gameRows ?? []).map(
    (g: { id: string; opponent_name: string | null; game_date: string | null }) => ({
      gameId: g.id,
      opponentName: g.opponent_name,
      gameDate: g.game_date,
      hasReview: reviewByGame.has(g.id),
    }),
  );

  // Resolve which review to show: explicit gameId, else most recent reviewed game.
  const targetGameId =
    gameId ??
    recentGames.find((g: { hasReview: boolean }) => g.hasReview)?.gameId ??
    null;
  if (!targetGameId) {
    return { authorized: true, review: null, recentGames };
  }

  const { data: reviewRow } = await supabase
    .from('baseball_postgame_reviews')
    .select('*')
    .eq('team_id', teamId)
    .eq('game_id', targetGameId)
    .maybeSingle();

  // Game header (for opponent/score in the view).
  const { data: gameHeader } = await supabase
    .from('baseball_games')
    .select('id, opponent_name, game_date, our_score, opponent_score')
    .eq('id', targetGameId)
    .maybeSingle();

  if (!reviewRow) {
    // Game exists but no review yet — return null review so the page offers
    // "Generate review". recentGames still populated.
    return { authorized: true, review: null, recentGames };
  }

  const { data: itemRows } = await supabase
    .from('baseball_postgame_review_items')
    .select('*, baseball_players(first_name, last_name)')
    .eq('review_id', reviewRow.id)
    .neq('disposition', 'dismissed')
    .order('created_at', { ascending: true });

  const generatedAt = reviewRow.generated_at ?? reviewRow.created_at;
  const items = (itemRows ?? []).map((r: unknown) => mapItem(r, generatedAt));

  const review: PostgameReviewView = {
    id: reviewRow.id,
    gameId: reviewRow.game_id ?? null,
    title: reviewRow.title,
    summary: reviewRow.summary ?? null,
    confidencePct:
      reviewRow.confidence == null ? null : Math.round(Number(reviewRow.confidence) * 100),
    visibility: (reviewRow.visibility ?? 'staff_only') as PostgameVisibility,
    disposition: (reviewRow.disposition ?? 'new') as PostgameReviewDisposition,
    sourceStatus: (reviewRow.source_status ?? 'official') as PostgameSourceStatus,
    battingLinesN: reviewRow.batting_lines_n ?? 0,
    pitchingLinesN: reviewRow.pitching_lines_n ?? 0,
    importWarnings: (reviewRow.import_warnings ?? []) as string[],
    generatedAt,
    opponentName: gameHeader?.opponent_name ?? null,
    gameDate: gameHeader?.game_date ?? null,
    ourScore: gameHeader?.our_score ?? null,
    opponentScore: gameHeader?.opponent_score ?? null,
    sections: {
      timelineUpdates: sortItems(items.filter((i: PostgameItemView) => i.itemKind === 'timeline_update')),
      staffDecisions: sortItems(items.filter((i: PostgameItemView) => i.itemKind === 'staff_decision')),
      practiceFocus: sortItems(items.filter((i: PostgameItemView) => i.itemKind === 'practice_focus')),
      workloadUpdates: sortItems(items.filter((i: PostgameItemView) => i.itemKind === 'workload_update')),
      videoEvidence: sortItems(items.filter((i: PostgameItemView) => i.itemKind === 'video_evidence')),
    },
    itemCount: items.length,
  };

  return { authorized: true, review, recentGames };
}
