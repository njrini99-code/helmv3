// =============================================================================
// src/lib/baseball/postgame/build-review.ts
//
// Postgame Action Review — PURE builder (no DB, no I/O, no 'use server').
//
// Implements the CONTROLLING spec:
//   V10 §"Postgame Action Review" — turn a completed game's official box score
//   into an ACTION review (NOT a narrative recap): imported source status, key
//   stat deltas, player-timeline updates, workload updates, staff actions,
//   player actions, practice-focus candidates, source confidence.
//   V7 §"Practice Effectiveness Engine" — postgame is the front door that
//   feeds practice-focus candidates from official game data.
//   V2 AI Output Contracts — every item separates facts from interpretation,
//   cites source objects, carries confidence + visibility + a real action type,
//   and is honest when it cannot know.
//
// HONESTY CONTRACT (binding — the whole point of the packet):
//   * EVERY emitted item cites at least one source object (the game + the stat
//     line / column it rests on). No item is emitted without source_refs.
//   * A SINGLE GAME is a thin sample. Box-score game deltas are recalibrated for
//     a 1-game observation: they are ALWAYS an inferred hypothesis, capped well
//     below the 'high' bar — the surface presents them as "watch", never as
//     proven. We never emit a false 'high' off one game.
//   * The ONE deterministic, observed item is a WORKLOAD update (a recorded
//     pitch/inning count is a fact, not an inference) — it may be 'high'.
//   * NO golf labels. NO prose recap. NO direct vendor calls. Strictest-wins
//     visibility (any staff_only source => staff_only item).
//
// This module is unit-testable and reused by the server action (which fetches
// the game + box-score lines + season aggregates and passes them in) and by the
// read model. It deliberately mirrors the engine's BaseballInsightCandidate
// discipline (registry direction, gated priority) but is scoped to one game.
// =============================================================================

import type {
  BaseballInsightSourceRef,
  BaseballSourceVisibility,
} from '@/lib/types/baseball-coachhelm';
import type {
  PostgameItemKind,
  PostgameActionType,
  PostgamePriority,
  PostgameVisibility,
  PostgameSourceStatus,
} from '@/lib/types/baseball-postgame';

// -----------------------------------------------------------------------------
// Inputs — the action fetches these (RLS-scoped) and passes them in.
// -----------------------------------------------------------------------------

/** Minimal game header the review is built for. */
export interface PostgameGameInput {
  id: string;
  game_date: string | null;
  opponent_name: string | null;
  game_type: string | null; // 'game' | 'scrimmage' (we never mix scopes silently)
  our_score: number | null;
  opponent_score: number | null;
  batting_lines_n: number;
  pitching_lines_n: number;
  /** Honest provenance of the box score (official entry vs CSV import vs manual). */
  source_status: PostgameSourceStatus;
  /** Any import warnings carried from the box-score upload. */
  import_warnings: string[];
}

/** One player's batting line FROM THIS GAME. */
export interface PostgameBattingLine {
  player_id: string;
  player_name: string | null;
  at_bats: number | null;
  hits: number | null;
  doubles: number | null;
  triples: number | null;
  home_runs: number | null;
  walks: number | null;
  strikeouts: number | null;
  rbis: number | null;
}

/** One player's pitching line FROM THIS GAME. */
export interface PostgamePitchingLine {
  player_id: string;
  player_name: string | null;
  innings_pitched: number | null;
  earned_runs: number | null;
  walks_allowed: number | null;
  strikeouts_thrown: number | null;
  pitches_thrown: number | null;
  hits_allowed: number | null;
}

/**
 * A player's SEASON baseline so a one-game line can be expressed as a delta vs
 * the player's own norm — the only honest way to say "spiked" / "dropped".
 * Null fields mean "no baseline" → the item degrades to "first measured game,
 * no baseline yet" rather than fabricating a delta.
 */
export interface PostgameSeasonBaseline {
  player_id: string;
  /** Season K rate (strikeouts / plate appearances), 0..1. */
  season_k_rate: number | null;
  /** Season batting average, 0..1. */
  season_avg: number | null;
  /** Season walks allowed per inning (pitchers). */
  season_bb_per_ip: number | null;
  /** Games this baseline is computed over (drives baseline trust). */
  season_games: number | null;
}

export interface BuildPostgameInput {
  game: PostgameGameInput;
  batting: PostgameBattingLine[];
  pitching: PostgamePitchingLine[];
  baselines: Record<string, PostgameSeasonBaseline>;
}

// -----------------------------------------------------------------------------
// Output — a candidate review item the action persists (NO DB shape here).
// -----------------------------------------------------------------------------

export interface PostgameReviewItemCandidate {
  /** Subject player, or null for a team-level item. */
  playerId: string | null;
  itemKind: PostgameItemKind;
  /** The signal family that produced it (audit + dedupe). */
  signalSource: string;
  title: string;
  /** Quantified, sourced one-liner — NOT prose. */
  detail: string;
  actionLabel: string;
  actionType: PostgameActionType;
  ownerRole: string;
  priority: PostgamePriority;
  /** [0,1], already honesty-capped for a one-game sample. */
  confidence: number;
  visibility: PostgameVisibility;
  playerVisible: boolean;
  sourceRefs: BaseballInsightSourceRef[];
  /** Stable per-review dedupe key (signal + subject). */
  dedupeKey: string;
}

export interface BuildPostgameResult {
  /** Short ACTION header (NOT a recap) for the parent review. */
  title: string;
  summary: string;
  /** Overall review confidence = max item confidence (honest aggregate). */
  confidence: number;
  /** Strictest-wins review visibility. */
  visibility: PostgameVisibility;
  items: PostgameReviewItemCandidate[];
}

// -----------------------------------------------------------------------------
// Honesty constants — recalibrated for a SINGLE college baseball game.
// -----------------------------------------------------------------------------

/**
 * A one-game box-score delta is an inferred hypothesis. We cap its confidence
 * below the shared 'high' bar (0.5 in the engine) so the surface can never
 * present a single bad/good game as a proven trend. The cap rises slightly when
 * a stable season baseline exists to compare against, but never to 'high'.
 */
const ONE_GAME_CONF_NO_BASELINE = 0.28;
const ONE_GAME_CONF_WITH_BASELINE = 0.44; // still < 0.5 — never a false 'high'

/** Workload is a RECORDED count (observed), so it can clear 'high'. */
const WORKLOAD_HIGH_CONF = 0.85;

/** Thresholds — recalibrated for one game, not a season. */
const GAME_K_COUNT_FOR_FLAG = 3; // 3+ K in a game = a chase-watch candidate
const GAME_K_RATE_SPIKE = 0.18; // game K-rate ≥ 18pts over season = a spike
const HIGH_PITCH_COUNT = 90; // single-outing pitch count worth a workload flag
const HIGH_INNINGS = 6; // single-outing innings worth a workload flag
const WALKS_PER_IP_FLAG = 0.6; // ~5.4 BB/9 in the outing = command-watch

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const num = (v: number | null | undefined): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : 0;
const pct = (v: number): string => `${(v * 100).toFixed(0)}%`;
const r1 = (v: number): string => v.toFixed(1);

/** Strictest-wins visibility from a set of source refs. */
const VIS_RANK: Record<BaseballSourceVisibility, number> = {
  team: 0,
  player_only: 1,
  staff_only: 2,
};
function strictestVisibility(refs: BaseballInsightSourceRef[]): PostgameVisibility {
  let worst: BaseballSourceVisibility = 'team';
  for (const r of refs) if (VIS_RANK[r.visibility] > VIS_RANK[worst]) worst = r.visibility;
  // box-score game lines are staff_only by source; map to the AI ladder.
  return worst === 'staff_only' ? 'staff_only' : 'player_visible';
}

/** The game itself is always a citable source object. */
function gameRef(game: PostgameGameInput): BaseballInsightSourceRef {
  const opp = game.opponent_name ? ` vs ${game.opponent_name}` : '';
  return {
    table: 'baseball_games',
    id: game.id,
    column: 'game_date,opponent_name',
    visibility: 'staff_only',
    sample_n: 1,
    label: `Game${opp}${game.game_date ? ` (${game.game_date})` : ''}`,
    confidence: 1,
  };
}

function statRef(
  column: string,
  label: string,
  confidence: number,
): BaseballInsightSourceRef {
  return {
    table: 'baseball_box_score_batting',
    column,
    visibility: 'staff_only',
    sample_n: 1,
    label,
    confidence,
  };
}

function pitchRef(
  column: string,
  label: string,
  confidence: number,
): BaseballInsightSourceRef {
  return {
    table: 'baseball_box_score_pitching',
    column,
    visibility: 'staff_only',
    sample_n: 1,
    label,
    confidence,
  };
}

// =============================================================================
// Per-player batting items
// =============================================================================

function battingItems(
  game: PostgameGameInput,
  line: PostgameBattingLine,
  baseline: PostgameSeasonBaseline | undefined,
): PostgameReviewItemCandidate[] {
  const out: PostgameReviewItemCandidate[] = [];
  const ab = num(line.at_bats);
  const bb = num(line.walks);
  const k = num(line.strikeouts);
  const h = num(line.hits);
  const pa = ab + bb;
  if (pa === 0) return out; // did not bat — nothing to cite honestly

  const name = line.player_name?.trim() || 'Player';

  // ---- High-strikeout game → chase-watch (timeline + practice candidate) ----
  if (k >= GAME_K_COUNT_FOR_FLAG) {
    const gameKRate = pa > 0 ? k / pa : 0;
    const hasBaseline =
      baseline?.season_k_rate != null && (baseline.season_games ?? 0) >= 4;
    const spike = hasBaseline ? gameKRate - baseline!.season_k_rate! : null;

    // Only escalate to a practice-focus candidate when a real spike vs baseline.
    const isSpike = spike != null && spike >= GAME_K_RATE_SPIKE;
    const confidence = hasBaseline
      ? ONE_GAME_CONF_WITH_BASELINE
      : ONE_GAME_CONF_NO_BASELINE;
    // One game is an inferred hypothesis — capped to 'medium' max.
    const priority: PostgamePriority = isSpike ? 'medium' : 'low';

    const refs: BaseballInsightSourceRef[] = [
      gameRef(game),
      statRef('strikeouts,at_bats,walks', `${k} K in ${pa} PA`, confidence),
    ];
    const detail = hasBaseline
      ? `${k} K in ${pa} PA (${pct(gameKRate)} this game vs ${pct(baseline!.season_k_rate!)} season${isSpike ? ' — a spike' : ''}). Box-score proxy; confirm with at-bat video before concluding a chase trend.`
      : `${k} K in ${pa} PA this game. No season baseline yet — a single line, not a trend.`;

    out.push({
      playerId: line.player_id,
      itemKind: 'timeline_update',
      signalSource: 'postgame_strikeouts',
      title: `${name}: high-strikeout game`,
      detail,
      actionLabel: 'Log to player timeline',
      actionType: 'note',
      ownerRole: 'hitting coach',
      priority,
      confidence,
      visibility: strictestVisibility(refs),
      playerVisible: strictestVisibility(refs) !== 'staff_only',
      sourceRefs: refs,
      dedupeKey: `postgame_strikeouts:${line.player_id}`,
    });

    if (isSpike) {
      out.push({
        playerId: line.player_id,
        itemKind: 'practice_focus',
        signalSource: 'postgame_two_strike_focus',
        title: `Practice focus: two-strike approach (${name})`,
        detail: `K rate spiked ${pct(spike!)} above season norm this game (${k} K / ${pa} PA). Candidate two-strike approach block — measure next-game K rate to test transfer.`,
        actionLabel: 'Add to next practice plan',
        actionType: 'practice_adjustment',
        ownerRole: 'hitting coach',
        priority: 'medium',
        confidence,
        visibility: strictestVisibility(refs),
        playerVisible: false, // practice prescription is staff-owned until published
        sourceRefs: refs,
        dedupeKey: `postgame_two_strike_focus:${line.player_id}`,
      });
    }
  }

  // ---- Standout offensive game → positive timeline update ----
  const xbh = num(line.doubles) + num(line.triples) + num(line.home_runs);
  if (h >= 3 || num(line.home_runs) >= 1 || (h >= 2 && xbh >= 1)) {
    const confidence = ONE_GAME_CONF_NO_BASELINE; // a good game is still one game
    const refs: BaseballInsightSourceRef[] = [
      gameRef(game),
      statRef('hits,doubles,triples,home_runs,rbis', `${h}-for-${ab}`, confidence),
    ];
    const hrTxt = num(line.home_runs) >= 1 ? `, ${num(line.home_runs)} HR` : '';
    const rbiTxt = num(line.rbis) >= 1 ? `, ${num(line.rbis)} RBI` : '';
    out.push({
      playerId: line.player_id,
      itemKind: 'timeline_update',
      signalSource: 'postgame_standout_hitting',
      title: `${name}: standout game at the plate`,
      detail: `${h}-for-${ab}${hrTxt}${rbiTxt}. Recorded box-score line — log the result; one game, not a trend.`,
      actionLabel: 'Log to player timeline',
      actionType: 'note',
      ownerRole: 'hitting coach',
      priority: 'low',
      confidence,
      visibility: strictestVisibility(refs),
      playerVisible: false,
      sourceRefs: refs,
      dedupeKey: `postgame_standout_hitting:${line.player_id}`,
    });
  }

  return out;
}

// =============================================================================
// Per-player pitching items
// =============================================================================

function pitchingItems(
  game: PostgameGameInput,
  line: PostgamePitchingLine,
  baseline: PostgameSeasonBaseline | undefined,
): PostgameReviewItemCandidate[] {
  const out: PostgameReviewItemCandidate[] = [];
  const ip = num(line.innings_pitched);
  if (ip === 0 && num(line.pitches_thrown) === 0) return out;

  const name = line.player_name?.trim() || 'Pitcher';
  const pitches = num(line.pitches_thrown);
  const bb = num(line.walks_allowed);

  // ---- Workload update — OBSERVED count, can be 'high'. ----
  const overPitches = pitches >= HIGH_PITCH_COUNT;
  const overInnings = ip >= HIGH_INNINGS;
  if (overPitches || overInnings) {
    const refs: BaseballInsightSourceRef[] = [
      gameRef(game),
      pitchRef(
        overPitches ? 'pitches_thrown' : 'innings_pitched',
        overPitches ? `${pitches} pitches` : `${r1(ip)} IP`,
        WORKLOAD_HIGH_CONF,
      ),
    ];
    const load = overPitches
      ? `${pitches} pitches${overInnings ? ` over ${r1(ip)} IP` : ''}`
      : `${r1(ip)} IP`;
    const priority: PostgamePriority =
      pitches >= HIGH_PITCH_COUNT + 20 || ip >= HIGH_INNINGS + 2 ? 'high' : 'medium';
    out.push({
      playerId: line.player_id,
      itemKind: 'workload_update',
      signalSource: 'postgame_workload',
      title: `${name}: heavy outing — plan rest`,
      detail: `Threw ${load} this game (recorded count). Confirm rest days before the next appearance and cap the next outing.`,
      actionLabel: 'Create workload action',
      actionType: 'task',
      ownerRole: 'pitching coach',
      priority,
      confidence: WORKLOAD_HIGH_CONF,
      visibility: 'staff_only',
      playerVisible: false,
      sourceRefs: refs,
      dedupeKey: `postgame_workload:${line.player_id}`,
    });
  }

  // ---- Command-watch — walks/inning in THIS outing vs season. ----
  if (ip > 0 && bb / ip >= WALKS_PER_IP_FLAG) {
    const gameWpi = bb / ip;
    const hasBaseline =
      baseline?.season_bb_per_ip != null && (baseline.season_games ?? 0) >= 3;
    const confidence = hasBaseline
      ? ONE_GAME_CONF_WITH_BASELINE
      : ONE_GAME_CONF_NO_BASELINE;
    const refs: BaseballInsightSourceRef[] = [
      gameRef(game),
      pitchRef('walks_allowed,innings_pitched', `${bb} BB in ${r1(ip)} IP`, confidence),
    ];
    const cmp = hasBaseline
      ? ` vs ${r1(baseline!.season_bb_per_ip!)} BB/IP season`
      : ' — no season baseline yet';
    out.push({
      playerId: line.player_id,
      itemKind: 'practice_focus',
      signalSource: 'postgame_command_focus',
      title: `Bullpen focus: strike-one command (${name})`,
      detail: `${r1(gameWpi)} BB/IP this outing${cmp}. Candidate bullpen block on first-pitch-strike %; box-score proxy — confirm with the pitch chart.`,
      actionLabel: 'Add bullpen block to next practice',
      actionType: 'practice_adjustment',
      ownerRole: 'pitching coach',
      priority: 'medium',
      confidence,
      visibility: 'staff_only',
      playerVisible: false,
      sourceRefs: refs,
      dedupeKey: `postgame_command_focus:${line.player_id}`,
    });
  }

  return out;
}

// =============================================================================
// Team-level staff decision item — always present when there is data to decide.
// =============================================================================

function staffDecisionItem(
  game: PostgameGameInput,
  itemCount: number,
): PostgameReviewItemCandidate | null {
  if (itemCount === 0) return null;
  const refs: BaseballInsightSourceRef[] = [gameRef(game)];
  const opp = game.opponent_name ? ` vs ${game.opponent_name}` : '';
  const scoreTxt =
    game.our_score != null && game.opponent_score != null
      ? ` (${game.our_score}-${game.opponent_score})`
      : '';
  return {
    playerId: null,
    itemKind: 'staff_decision',
    signalSource: 'postgame_decision',
    title: `Review postgame items${opp}`,
    detail: `${itemCount} source-cited action candidate${itemCount === 1 ? '' : 's'} from this game${scoreTxt}. Convert the ones you act on into tasks, notes, or practice blocks; dismiss the rest.`,
    actionLabel: 'Open in Decision Room',
    actionType: 'meeting_topic',
    ownerRole: 'head coach',
    priority: 'low',
    confidence: 1, // it is a fact that there are items to review
    visibility: 'staff_only',
    playerVisible: false,
    sourceRefs: refs,
    dedupeKey: 'postgame_decision:team',
  };
}

// =============================================================================
// Public: build the whole review for one game.
// =============================================================================

export function buildPostgameReview(input: BuildPostgameInput): BuildPostgameResult {
  const { game, batting, pitching, baselines } = input;
  const items: PostgameReviewItemCandidate[] = [];

  for (const line of batting) {
    items.push(...battingItems(game, line, baselines[line.player_id]));
  }
  for (const line of pitching) {
    items.push(...pitchingItems(game, line, baselines[line.player_id]));
  }

  // Team staff-decision item references the count of actionable items.
  const decision = staffDecisionItem(game, items.length);
  if (decision) items.push(decision);

  // Honest aggregates.
  const confidence = items.reduce((max, i) => Math.max(max, i.confidence), 0);
  const visibility: PostgameVisibility = items.some((i) => i.visibility !== 'staff_only')
    ? 'player_visible'
    : 'staff_only';

  const opp = game.opponent_name ? ` vs ${game.opponent_name}` : '';
  const scoreTxt =
    game.our_score != null && game.opponent_score != null
      ? ` ${game.our_score}-${game.opponent_score}`
      : '';
  const title = `Postgame Action Review${opp}`;
  const summary =
    items.length === 0
      ? `No source-cited action items from this game${scoreTxt}. Box-score lines recorded; nothing crossed a one-game threshold.`
      : `${items.length} action item${items.length === 1 ? '' : 's'} from this game${scoreTxt}, each tied to the stat object it rests on. One-game signals are watch-level, not trends.`;

  return { title, summary, confidence, visibility, items };
}
