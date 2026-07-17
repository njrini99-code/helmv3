'use server';

// =============================================================================
// src/app/baseball/actions/postgame.ts
//
// Postgame Action Review — WRITE + lifecycle + read server actions.
//
// Implements V10 §"Postgame Action Review": turn a completed game's official box
// score into a SOURCE-CITED action review (NOT a recap) that produces
// player-timeline candidates, staff decision items, and recommended practice
// focus — each citing the stat/source object it rests on, with stored
// confidence + visibility + disposition (V2 AI Output Contracts).
//
// CONTRACT (binding):
//   * withBaseballAction enforces auth + active team + capability SERVER-SIDE.
//     Generating/managing a postgame review is a stats-analysis action →
//     requiredCapability: 'can_manage_stats' (matches coachhelm.ts).
//   * NO DESTRUCTIVE WRITES. The review is upserted by (team_id, game_id); items
//     are upserted by (review_id, dedupe_key). A re-run UPDATES rows in place.
//     Items no longer emitted are soft-dismissed (disposition), never deleted —
//     preserving any coach conversion/dismissal.
//   * Converting an item to a timeline event uses the append-only timeline-writer
//     (no delete/reinsert) and links the created event back onto the item.
//   * Player-facing safety: staff_only items are never exposed; the item-level
//     player_visible flag is materialized strictest-wins by the pure builder and
//     re-enforced by RLS (migration 20260624000090).
//   * Reads use the request-scoped RLS client (NOT service_role). The engine
//     loaders are reused for season baselines so postgame and the season engine
//     share one honest confidence implementation.
//   * This file performs NO schema changes at runtime; the migration is a .sql
//     file only.
// =============================================================================

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';
import { withBaseballAction } from '@/lib/baseball/with-baseball-action';
import { hasBaseballCapability } from '@/lib/baseball/capabilities';
import { appendTimelineEvent } from '@/lib/baseball/timeline-writer';
import { materializePracticeBlockFromSignal } from '@/app/baseball/actions/practice';
import {
  buildPostgameReview,
  type PostgameGameInput,
  type PostgameBattingLine,
  type PostgamePitchingLine,
  type PostgameSeasonBaseline,
  type PostgameReviewItemCandidate,
} from '@/lib/baseball/postgame/build-review';
import type {
  BaseballPostgameReviewInsert,
  BaseballPostgameReviewItemInsert,
  PostgameSourceStatus,
} from '@/lib/types/baseball-postgame';
import {
  sweepActionOutcomes,
  type OutcomeSweepClient,
} from '@/lib/baseball/coachhelm/outcome-sweep';
import { logServerException } from '@/lib/server-error-logger';

const POSTGAME_PATH = '/baseball/dashboard/postgame';
const PRACTICE_PATH = '/baseball/dashboard/practice';
const GENERATED_BY_MODEL = 'baseball-postgame-builder@1';

// -----------------------------------------------------------------------------
// Result types
// -----------------------------------------------------------------------------

export interface GeneratePostgameResult {
  success: boolean;
  reviewId?: string;
  itemsGenerated?: number;
  itemsDismissed?: number;
  error?: string;
}

// -----------------------------------------------------------------------------
// generatePostgameReview — build + persist a review for one completed game.
// -----------------------------------------------------------------------------

export const generatePostgameReview = withBaseballAction(
  'generatePostgameReview',
  { featureArea: 'baseball-postgame', requiredCapability: 'can_manage_stats' },
  async (ctx, gameId: string): Promise<GeneratePostgameResult> => {
    if (!gameId) return { success: false, error: 'Missing game.' };
    const supabase = await createClient();
    const teamId = ctx.targetTeamId;
    const coachId = ctx.activeCoachId;

    // -------------------------------------------------------------------------
    // 1. LOAD the game (must belong to the active team) + its box-score lines.
    // -------------------------------------------------------------------------
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- baseball_games not in generated types
    const { data: gameRow } = await (supabase as any)
      .from('baseball_games')
      .select('id, team_id, game_date, opponent_name, game_type, our_score, opponent_score')
      .eq('id', gameId)
      .eq('team_id', teamId)
      .maybeSingle();
    if (!gameRow) return { success: false, error: 'Game not found for this team.' };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: battingRows } = await (supabase as any)
      .from('baseball_box_score_batting')
      .select('player_id, ab, h, doubles, triples, hr, rbi, bb, k, baseball_players(first_name,last_name)')
      .eq('game_id', gameId)
      .eq('team_id', teamId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: pitchingRows } = await (supabase as any)
      .from('baseball_box_score_pitching')
      .select('player_id, ip, er, bb, k, hr, h, pitch_count, baseball_players(first_name,last_name)')
      .eq('game_id', gameId)
      .eq('team_id', teamId);

    const batting = mapBatting(battingRows ?? []);
    const pitching = mapPitching(pitchingRows ?? []);

    // -------------------------------------------------------------------------
    // 2. LOAD season baselines so a one-game line is honestly a delta vs norm.
    // -------------------------------------------------------------------------
    const playerIds = Array.from(
      new Set([...batting.map((b) => b.player_id), ...pitching.map((p) => p.player_id)]),
    );
    const baselines = await loadBaselines(supabase, teamId, playerIds);

    // -------------------------------------------------------------------------
    // 3. BUILD — pure, honest, source-cited.
    // -------------------------------------------------------------------------
    const sourceStatus: PostgameSourceStatus =
      batting.length + pitching.length === 0 ? 'missing' : 'official';
    const game: PostgameGameInput = {
      id: gameRow.id,
      game_date: gameRow.game_date ?? null,
      opponent_name: gameRow.opponent_name ?? null,
      game_type: gameRow.game_type ?? 'game',
      our_score: gameRow.our_score ?? null,
      opponent_score: gameRow.opponent_score ?? null,
      batting_lines_n: batting.length,
      pitching_lines_n: pitching.length,
      source_status: sourceStatus,
      import_warnings: [],
    };
    const built = buildPostgameReview({ game, batting, pitching, baselines });

    // -------------------------------------------------------------------------
    // 4. PERSIST the review header (upsert by team_id, game_id — non-destructive).
    // -------------------------------------------------------------------------
    const reviewInsert: BaseballPostgameReviewInsert = {
      team_id: teamId,
      game_id: gameId,
      coach_id: coachId,
      source_status: sourceStatus,
      batting_lines_n: batting.length,
      pitching_lines_n: pitching.length,
      import_warnings: game.import_warnings,
      title: built.title,
      summary: built.summary,
      confidence: built.confidence,
      visibility: built.visibility,
      disposition: 'new',
      generated_by_model: GENERATED_BY_MODEL,
      generated_at: new Date().toISOString(),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- new table not in generated types
    const { data: reviewRow, error: reviewErr } = await (supabase as any)
      .from('baseball_postgame_reviews')
      .upsert(reviewInsert, { onConflict: 'team_id,game_id', ignoreDuplicates: false })
      .select('id')
      .single();
    if (reviewErr || !reviewRow) {
      return { success: false, error: 'Could not save the postgame review.' };
    }
    const reviewId = reviewRow.id as string;

    // -------------------------------------------------------------------------
    // 5. PERSIST items (upsert by review_id, dedupe_key — non-destructive). Only
    //    overwrite content + re-open NEW items; never clobber a coach conversion.
    // -------------------------------------------------------------------------
    const emittedKeys = new Set<string>();

    // Preserve any coach disposition (converted_to_timeline/converted_to_task/
    // dismissed/resolved) across re-runs. The upsert below (ignoreDuplicates:
    // false) would otherwise reset every conflicting row's disposition to
    // mapItem's default 'new', re-opening items the coach already actioned.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: priorItems } = await (supabase as any)
      .from('baseball_postgame_review_items')
      .select('dedupe_key, disposition')
      .eq('review_id', reviewId);
    const priorDisposition = new Map<string, string>(
      ((priorItems ?? []) as { dedupe_key: string; disposition: string }[]).map(
        (r) => [r.dedupe_key, r.disposition],
      ),
    );

    const itemRows: BaseballPostgameReviewItemInsert[] = built.items.map((c) => {
      emittedKeys.add(c.dedupeKey);
      const row = mapItem(c, teamId, reviewId);
      const prior = priorDisposition.get(c.dedupeKey);
      if (prior && prior !== 'new') {
        row.disposition = prior as BaseballPostgameReviewItemInsert['disposition'];
      }
      return row;
    });

    let itemsGenerated = 0;
    if (itemRows.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: itemErr } = await (supabase as any)
        .from('baseball_postgame_review_items')
        .upsert(itemRows, { onConflict: 'review_id,dedupe_key', ignoreDuplicates: false });
      if (itemErr) {
        return { success: false, error: 'Could not save postgame review items.' };
      }
      itemsGenerated = itemRows.length;
    }

    // -------------------------------------------------------------------------
    // 6. RECONCILE STALE items: any 'new' item on this review no longer emitted
    //    is soft-dismissed (disposition), never deleted. Converted/dismissed
    //    items are left untouched.
    // -------------------------------------------------------------------------
    let itemsDismissed = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existing } = await (supabase as any)
      .from('baseball_postgame_review_items')
      .select('id, dedupe_key, disposition')
      .eq('review_id', reviewId)
      .eq('disposition', 'new');
    const staleIds = (existing ?? [])
      .filter((r: { dedupe_key: string }) => !emittedKeys.has(r.dedupe_key))
      .map((r: { id: string }) => r.id);
    if (staleIds.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: archErr } = await (supabase as any)
        .from('baseball_postgame_review_items')
        .update({ disposition: 'dismissed', updated_at: new Date().toISOString() })
        .in('id', staleIds);
      if (!archErr) itemsDismissed = staleIds.length;
    }

    // -------------------------------------------------------------------------
    // 7. CLOSE THE DECISION LOOP (V10 — source → signal → action → did-it-move).
    //    A finished game is new AFTER-window data for any open action that
    //    targets a metric one of these players could have moved. Re-measure
    //    those actions NOW so the Decision Ledger updates the moment a game is
    //    reviewed — not only on the nightly cron. Scoped to the box-score
    //    players (cheap) and best-effort: a sweep failure must NEVER fail the
    //    postgame review the coach just generated.
    // -------------------------------------------------------------------------
    if (playerIds.length > 0) {
      try {
        await sweepActionOutcomes(supabase as unknown as OutcomeSweepClient, teamId, {
          playerIds,
          remeasure: true,
        });
        revalidatePath('/baseball/dashboard/decision-room');
        revalidatePath('/baseball/dashboard/command-center');
      } catch (error) {
        void logServerException(
          error,
          { action: 'postgame.sweepActionOutcomes', sport: 'baseball', source: 'server_action', skipSentry: true },
          'warning',
        );
        // Swallow — the review is the primary deliverable; the ledger refreshes
        // again on the nightly cron.
      }
    }

    revalidatePath(POSTGAME_PATH);
    revalidatePath(`${POSTGAME_PATH}/${gameId}`);
    return { success: true, reviewId, itemsGenerated, itemsDismissed };
  },
);

// -----------------------------------------------------------------------------
// convertItemToTimeline — turn a player-facing review item into a timeline event
// (append-only) and link the created event back onto the item.
// -----------------------------------------------------------------------------

export const convertPostgameItemToTimeline = withBaseballAction(
  'convertPostgameItemToTimeline',
  { featureArea: 'baseball-postgame', requiredCapability: 'can_manage_stats' },
  async (ctx, itemId: string): Promise<{ success: boolean; error?: string }> => {
    if (!itemId) return { success: false, error: 'Missing item.' };
    const supabase = await createClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: item } = await (supabase as any)
      .from('baseball_postgame_review_items')
      .select('id, team_id, player_id, title, detail, visibility, player_visible, confidence, signal_source')
      .eq('id', itemId)
      .maybeSingle();
    if (!item || item.team_id !== ctx.targetTeamId) {
      return { success: false, error: 'Item not found for this team.' };
    }
    if (!item.player_id) {
      return { success: false, error: 'Team-level items cannot be logged to a player timeline.' };
    }

    // Append-only timeline write (coach session → RLS-scoped client). The
    // writer enforces visibility; a staff_only item stays staff_only.
    const visibility = item.visibility === 'player_visible' ? 'player_only' : 'staff_only';
    const appended = await appendTimelineEvent({
      teamId: item.team_id,
      playerId: item.player_id,
      kind: 'note',
      title: item.title,
      body: item.detail ?? null,
      visibility,
      source: 'ai',
      sourceId: item.id,
      confidence: item.confidence,
      createdBy: ctx.user.id,
    });
    if (!appended.ok) {
      return { success: false, error: 'Could not log the timeline event.' };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: linkErr } = await (supabase as any)
      .from('baseball_postgame_review_items')
      .update({
        disposition: 'converted_to_timeline',
        timeline_event_id: appended.id ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', itemId)
      .eq('team_id', ctx.targetTeamId);
    if (linkErr) return { success: false, error: 'Could not link the timeline event.' };

    revalidatePath(POSTGAME_PATH);
    return { success: true };
  },
);

// -----------------------------------------------------------------------------
// convertPostgameItemToPractice — turn a "Recommended practice focus" item into
// a REAL practice-planner block (the Postgame -> practice-focus loop, V10).
//
// Mirrors the signal -> practice_block path: it reuses the SAME
// materializePracticeBlockFromSignal helper that lands the block in the team's
// "Signal backlog" draft practice, but stamps source_postgame_item_id (not a
// signal id) so the block round-trips to the originating review item.
//
// CAPABILITY (binding): generating/reading a postgame review is can_manage_stats,
// but WRITING into the practice subsystem requires can_manage_practice (the
// baseball_practice_blocks RLS policy gate). A stats-only coach who can read the
// recommendation is NOT automatically allowed to publish a block. So this action
// runs under can_manage_stats (matching the rest of the postgame surface) and
// PRECHECKS can_manage_practice BEFORE the insert — exactly as
// convertSignalToAction does — to return a clean permission error instead of a
// silent RLS denial. NON-DESTRUCTIVE: the helper only inserts; the item is moved
// to disposition='converted_to_task' (never deleted) and linked.
// -----------------------------------------------------------------------------

export const convertPostgameItemToPractice = withBaseballAction(
  'convertPostgameItemToPractice',
  { featureArea: 'baseball-postgame', requiredCapability: 'can_manage_stats' },
  async (ctx, itemId: string): Promise<{ success: boolean; error?: string }> => {
    if (!itemId) return { success: false, error: 'Missing item.' };

    // Per-subsystem capability precheck: writing a practice block needs
    // can_manage_practice (NOT can_manage_stats). Fail BEFORE any write so a
    // denied conversion never leaves an orphan block or a half-flipped item.
    const canPractice = await hasBaseballCapability(ctx.targetTeamId, 'can_manage_practice');
    if (!canPractice) {
      return { success: false, error: 'You do not have permission to create practice blocks.' };
    }

    const supabase = await createClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: item } = await (supabase as any)
      .from('baseball_postgame_review_items')
      .select('id, team_id, item_kind, title, detail, action_label, disposition')
      .eq('id', itemId)
      .maybeSingle();
    if (!item || item.team_id !== ctx.targetTeamId) {
      return { success: false, error: 'Item not found for this team.' };
    }
    if (item.item_kind !== 'practice_focus') {
      return { success: false, error: 'Only a recommended practice focus can become a practice block.' };
    }
    // Idempotent: a re-convert (item already converted) is a no-op success, not a
    // duplicate block. This guards a double-click / retried request.
    if (item.disposition === 'converted_to_task') {
      return { success: true };
    }

    const res = await materializePracticeBlockFromSignal(supabase, {
      teamId: item.team_id,
      title: item.action_label || item.title,
      detail: item.detail ?? null,
      sourceReason: item.detail ?? item.title,
      sourcePostgameItemId: item.id,
      coachOwnerId: ctx.activeCoachId,
    });
    if (!res.ok) return { success: false, error: res.error };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: linkErr } = await (supabase as any)
      .from('baseball_postgame_review_items')
      .update({ disposition: 'converted_to_task', updated_at: new Date().toISOString() })
      .eq('id', itemId)
      .eq('team_id', ctx.targetTeamId);
    if (linkErr) return { success: false, error: 'Could not link the practice block.' };

    revalidatePath(POSTGAME_PATH);
    revalidatePath(PRACTICE_PATH);
    return { success: true };
  },
);

// -----------------------------------------------------------------------------
// setPostgameItemDisposition — dismiss / resolve a single item (non-destructive).
// -----------------------------------------------------------------------------

export const setPostgameItemDisposition = withBaseballAction(
  'setPostgameItemDisposition',
  { featureArea: 'baseball-postgame', requiredCapability: 'can_manage_stats' },
  async (
    ctx,
    itemId: string,
    disposition: 'new' | 'converted_to_task' | 'dismissed' | 'resolved',
  ): Promise<{ success: boolean; error?: string }> => {
    if (!itemId) return { success: false, error: 'Missing item.' };
    const supabase = await createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('baseball_postgame_review_items')
      .update({ disposition, updated_at: new Date().toISOString() })
      .eq('id', itemId)
      .eq('team_id', ctx.targetTeamId);
    if (error) return { success: false, error: 'Could not update the item.' };
    revalidatePath(POSTGAME_PATH);
    return { success: true };
  },
);

// -----------------------------------------------------------------------------
// Mapping helpers (box-score short columns → builder input shapes)
// -----------------------------------------------------------------------------

interface RawBatting {
  player_id: string;
  ab: number | null;
  h: number | null;
  doubles: number | null;
  triples: number | null;
  hr: number | null;
  rbi: number | null;
  bb: number | null;
  k: number | null;
  baseball_players?: { first_name: string | null; last_name: string | null } | null;
}
interface RawPitching {
  player_id: string;
  ip: number | null;
  er: number | null;
  bb: number | null;
  k: number | null;
  hr: number | null;
  h: number | null;
  pitch_count: number | null;
  baseball_players?: { first_name: string | null; last_name: string | null } | null;
}

function fullName(p?: { first_name: string | null; last_name: string | null } | null): string | null {
  if (!p) return null;
  const n = [p.first_name, p.last_name].filter(Boolean).join(' ').trim();
  return n || null;
}

function mapBatting(rows: RawBatting[]): PostgameBattingLine[] {
  return rows.map((r) => ({
    player_id: r.player_id,
    player_name: fullName(r.baseball_players),
    at_bats: r.ab,
    hits: r.h,
    doubles: r.doubles,
    triples: r.triples,
    home_runs: r.hr,
    walks: r.bb,
    strikeouts: r.k,
    rbis: r.rbi,
  }));
}

function mapPitching(rows: RawPitching[]): PostgamePitchingLine[] {
  return rows.map((r) => ({
    player_id: r.player_id,
    player_name: fullName(r.baseball_players),
    innings_pitched: r.ip,
    earned_runs: r.er,
    walks_allowed: r.bb,
    strikeouts_thrown: r.k,
    pitches_thrown: r.pitch_count,
    hits_allowed: r.h,
  }));
}

function mapItem(
  c: PostgameReviewItemCandidate,
  teamId: string,
  reviewId: string,
): BaseballPostgameReviewItemInsert {
  return {
    team_id: teamId,
    review_id: reviewId,
    player_id: c.playerId,
    item_kind: c.itemKind,
    signal_source: c.signalSource,
    title: c.title,
    detail: c.detail,
    action_label: c.actionLabel,
    action_type: c.actionType,
    owner_role: c.ownerRole,
    priority: c.priority,
    confidence: c.confidence,
    visibility: c.visibility,
    player_visible: c.playerVisible,
    source_refs: c.sourceRefs,
    disposition: 'new',
    dedupe_key: c.dedupeKey,
  };
}

// -----------------------------------------------------------------------------
// Season baselines from baseball_player_season_stats (the recalc target).
// -----------------------------------------------------------------------------

async function loadBaselines(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  teamId: string,
  playerIds: string[],
): Promise<Record<string, PostgameSeasonBaseline>> {
  const out: Record<string, PostgameSeasonBaseline> = {};
  if (playerIds.length === 0) return out;
  const year = new Date().getFullYear();
  const { data } = await supabase
    .from('baseball_player_season_stats')
    .select('player_id, g, ab, bb, k, ip, bb_allowed')
    .eq('team_id', teamId)
    .eq('season_year', year)
    .in('player_id', playerIds);

  for (const r of (data ?? []) as Array<{
    player_id: string;
    g: number | null;
    ab: number | null;
    bb: number | null;
    k: number | null;
    ip: number | null;
    bb_allowed: number | null;
  }>) {
    const ab = Number(r.ab) || 0;
    const bb = Number(r.bb) || 0;
    const k = Number(r.k) || 0;
    const ip = Number(r.ip) || 0;
    const bbA = Number(r.bb_allowed) || 0;
    const pa = ab + bb;
    out[r.player_id] = {
      player_id: r.player_id,
      season_k_rate: pa > 0 ? k / pa : null,
      season_avg: null, // batting avg baseline not used by current items
      season_bb_per_ip: ip > 0 ? bbA / ip : null,
      season_games: r.g ?? null,
    };
  }
  return out;
}
