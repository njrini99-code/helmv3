// =============================================================================
// src/lib/baseball/read-models/stats-center.ts
//
// Wave 7 / packets P7.1 + P7.2 — Stats Center read model.
//
// The staff-facing, team-wide stats browser. Composes an honest, filtered view
// of a team's players and their season production, with two things the rest of
// the app gets wrong if they aren't centralized here:
//
//   1. OFFICIAL vs SCRIMMAGE separation. baseball_player_season_stats is a
//      single pre-aggregated row per (player, season) and does NOT distinguish
//      game vs scrimmage. The honest source of that split is the per-game box
//      score (baseball_box_score_batting / _pitching) joined to baseball_games
//      on game_type. This read model derives BOTH splits from the box-score game
//      logs so the UI can show "official only" vs "incl. scrimmages" without
//      lying, and RECONCILES them against the stored season-stat row (flagging
//      drift rather than silently trusting either source).
//
//   2. Team-wide browse + filter. One shaped read returns every rostered
//      player's batting + pitching lines (official + all), filterable by
//      position, stat side (batting/pitching), and a game-date window — so the
//      Stats Center grid and CSV export operate on a single consistent dataset.
//
// STAFF ONLY: the Stats Center is a coaching surface. This read model resolves
// the viewer server-side and returns an `authorized:false` envelope (NOT an
// error, NOT partial data) when the current user is not staff on the team. RLS
// backs every query; this is the in-process gate + honest envelope on top.
//
// HONESTY: players with zero captured box-score lines are marked `noData` (not a
// fabricated .000); the season-stat reconcile reports a real `reconciled` flag
// + drift deltas rather than masking a mismatch; counts are real counts.
//
// 'server-only' + plain async functions (NOT 'use server') so server components
// and other read models can import it.
// =============================================================================

import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';
import type { BaseballGameType } from '@/lib/types';

// -----------------------------------------------------------------------------
// Public shapes
// -----------------------------------------------------------------------------

/** Which side of the ball a browse row / filter targets. */
export type StatSide = 'batting' | 'pitching';

/**
 * A single batting accumulation (official-only or all-games).
 *
 * V6 "Official Batting Stats" breadth. Every counting field is a real captured
 * total (0 is a true 0, never a placeholder for "no data" — that is `noData` at
 * the row level). Every DERIVED rate is `null` on a zero denominator (never a
 * fabricated .000), and `singles` / `tb` are derived from the captured hit mix.
 */
export interface BattingSplit {
  /** Games (distinct game_ids contributing a batting line). */
  g: number;
  /** Plate appearances (AB + BB + HBP + SF + SH). */
  pa: number;
  ab: number;
  r: number;
  h: number;
  /** Derived: H − 2B − 3B − HR. */
  singles: number;
  doubles: number;
  triples: number;
  hr: number;
  /** Derived total bases: 1B + 2·2B + 3·3B + 4·HR. */
  tb: number;
  rbi: number;
  bb: number;
  ibb: number;
  k: number;
  sb: number;
  cs: number;
  hbp: number;
  sac: number;
  sf: number;
  gidp: number;
  roe: number;
  ci: number;
  lob: number;
  pickoffs: number;
  twoOutRbi: number;
  productiveOuts: number;
  runnersAdvanced: number;
  phAb: number;
  phH: number;
  prApp: number;
  /** Derived rates (null when the relevant denominator is zero). */
  avg: number | null;
  obp: number | null;
  slg: number | null;
  ops: number | null;
  /** Isolated power: SLG − AVG (null when no AB). */
  iso: number | null;
  /** Walk rate: BB / PA (null when no PA). */
  bbPct: number | null;
  /** Strikeout rate: K / PA (null when no PA). */
  kPct: number | null;
  /** Walk-to-strikeout ratio: BB / K (null when no K). */
  bbK: number | null;
  /** Extra-base-hit rate: (2B+3B+HR) / H (null when no H). */
  xbhPct: number | null;
  /** Stolen-base success rate: SB / (SB+CS) (null when no attempts). */
  sbPct: number | null;
  /** Runs created (basic Bill James): (H+BB)·TB / (AB+BB) (null when no AB+BB). */
  rc: number | null;
  /**
   * wOBA estimate from box-score grain (no IBB-adjusted denominator at PA grain,
   * so this is an ESTIMATE — labeled as such in the UI). Standard 2013 weights:
   * (0.69·uBB + 0.72·HBP + 0.89·1B + 1.27·2B + 1.62·3B + 2.10·HR) / (AB+BB−IBB+SF+HBP).
   * null when the denominator is zero.
   */
  wobaEst: number | null;
}

/**
 * A single pitching accumulation (official-only or all-games).
 *
 * V6 "Official Pitching Stats" breadth. Same honesty contract: captured counts
 * are real, derived rates are `null` on a zero denominator. W/L/SV come from the
 * per-appearance `result` code; GF/holds/blown/etc. from the new box-score
 * columns (default 0 until captured) so this stays additive and never fakes.
 */
export interface PitchingSplit {
  /** Appearances (distinct game_ids contributing a pitching line). */
  g: number;
  gs: number;
  gf: number;
  w: number;
  l: number;
  sv: number;
  holds: number;
  blownSaves: number;
  cg: number;
  sho: number;
  ip: number;
  bf: number;
  h: number;
  doublesAllowed: number;
  triplesAllowed: number;
  r: number;
  er: number;
  bb: number;
  ibb: number;
  k: number;
  hbp: number;
  wp: number;
  balk: number;
  hr: number;
  pitches: number;
  strikes: number;
  firstPitchStrikes: number;
  inheritedRunners: number;
  inheritedRunnersScored: number;
  /** Derived rates (null when the relevant denominator is zero). */
  era: number | null;
  whip: number | null;
  k9: number | null;
  bb9: number | null;
  hr9: number | null;
  h9: number | null;
  /** Strikeout rate: K / BF (null when no BF). */
  kPct: number | null;
  /** Walk rate: BB / BF (null when no BF). */
  bbPct: number | null;
  /** Opponent batting average: H / (BF − BB − HBP − SF − SH); SF/SH unknown at
   * box grain, so AB-against ≈ BF − BB − HBP. null when that is ≤ 0. */
  oppBa: number | null;
  /** Strike percentage: strikes / pitches (null when no pitches). */
  strikePct: number | null;
  /** First-pitch-strike percentage: FPS / BF (null when no BF). */
  fpsPct: number | null;
  /** Left-on-base %: (H+BB+HBP−R) / (H+BB+HBP−1.4·HR) — LOB% formula. null when
   * the denominator is ≤ 0. */
  lobPct: number | null;
}

/**
 * Reconcile envelope for a player: how the box-score-derived OFFICIAL batting
 * totals compare to the stored season-stat row. `reconciled` is true when the
 * stored row matches the official-derived totals on the spot-check fields.
 * Honest: when no season-stat row exists we report `hasSeasonRow:false` instead
 * of pretending the derived numbers are the canonical season line.
 */
export interface SeasonReconcile {
  hasSeasonRow: boolean;
  reconciled: boolean;
  /** Field-level deltas (derived-official minus stored) for the fields we check. */
  drift: {
    ab: number;
    h: number;
    hr: number;
    rbi: number;
  } | null;
}

/**
 * Official CATCHING accumulation derived from baseball_catching_events
 * (official_game context only). Honest: every field is a real captured event
 * count; rates are null on a zero denominator. Pop-time is a measured average,
 * null when no throwdown carried a pop_time. `events` is the raw event count so
 * the UI can show sample-aware confidence and an honest empty state.
 */
export interface CatchingSplit {
  events: number;
  /** Distinct games with a catching event. */
  g: number;
  throwdowns: number;
  caughtStealing: number;
  stolenBasesAllowed: number;
  pickoffs: number;
  blockOpportunities: number;
  blocksMade: number;
  passedBalls: number;
  framingChances: number;
  /** Caught-stealing rate: CS / (CS + SBA) (null when no steal attempts). */
  csPct: number | null;
  /** Block rate: blocks made / block opportunities (null when none). */
  blockPct: number | null;
  /** Average measured pop time (seconds), null when no measured throwdown. */
  popTimeAvg: number | null;
}

/**
 * Official FIELDING accumulation derived from baseball_fielding_events
 * (official_game context only). PO/A/E from result codes; fielding % derived.
 */
export interface FieldingSplit {
  events: number;
  g: number;
  putouts: number;
  assists: number;
  errors: number;
  doublePlays: number;
  chances: number;
  /** Fielding %: (PO + A) / (PO + A + E) (null when no chances). */
  fldPct: number | null;
  /** Routine-play conversion when chance_difficulty is captured (null otherwise). */
  routinePct: number | null;
}

/**
 * Official BASERUNNING accumulation derived from baseball_baserunning_events
 * (official_game context only) plus the box-score SB/CS already in BattingSplit.
 */
export interface BaserunningSplit {
  events: number;
  g: number;
  stolenBases: number;
  caughtStealing: number;
  pickoffs: number;
  extraBasesTaken: number;
  outsOnBases: number;
  /** SB success: SB / (SB + CS) (null when no attempts). */
  sbPct: number | null;
  /** Average measured home-to-first (seconds), null when none captured. */
  homeToFirstAvg: number | null;
}

export interface StatsCenterRow {
  playerId: string;
  firstName: string | null;
  lastName: string | null;
  jerseyNumber: number | null;
  primaryPosition: string | null;
  /** Box-score-derived OFFICIAL (game_type='game') splits. */
  battingOfficial: BattingSplit;
  pitchingOfficial: PitchingSplit;
  /** Box-score-derived ALL-games (official + scrimmage) splits. */
  battingAll: BattingSplit;
  pitchingAll: PitchingSplit;
  /**
   * Official defensive / baserunning splits derived from the elite event model
   * (official_game context). These render honest empty states until events are
   * captured for the player — they are NOT box-score columns.
   */
  catchingOfficial: CatchingSplit;
  fieldingOfficial: FieldingSplit;
  baserunningOfficial: BaserunningSplit;
  /** True when the player has zero captured box-score lines (honest empty). */
  noData: boolean;
  /** Season-stat reconcile against the stored aggregate row. */
  reconcile: SeasonReconcile;
}

export interface StatsCenterReadModel {
  teamId: string;
  seasonYear: number;
  /** False when the current user is not staff on this team. */
  authorized: boolean;
  rows: StatsCenterRow[];
  /** Distinct positions present on the roster (for the filter control). */
  positions: string[];
  summary: {
    rosterSize: number;
    playersWithData: number;
    officialGames: number;
    scrimmages: number;
    /** Players whose stored season row drifted from official-derived totals. */
    unreconciled: number;
  };
  /** Honest error string when a sub-read failed; arrays are still safe ([]). */
  error: string | null;
}

// -----------------------------------------------------------------------------
// Options
// -----------------------------------------------------------------------------

export interface StatsCenterOptions {
  /** Season to scope to. Defaults to the current calendar year. */
  seasonYear?: number;
  /** Restrict to players whose primary_position is in this set. */
  positions?: string[];
  /** Filter to a single side of the ball (still returns both splits). */
  side?: StatSide;
  /** Inclusive game-date lower bound (YYYY-MM-DD) for the box-score window. */
  fromDate?: string;
  /** Inclusive game-date upper bound (YYYY-MM-DD) for the box-score window. */
  toDate?: string;
}

// -----------------------------------------------------------------------------
// Empty split factories + pure rate finalizers.
//
// EXPORTED for unit tests (stats-center.test.ts): these are the deepened
// derivation surface (V6 official rate set + the honesty contract — null rates
// on zero denominators, derived singles/TB) and must stay test-covered. They are
// pure and side-effect-free; getStatsCenter is the only DB-touching export.
// -----------------------------------------------------------------------------

export function emptyBatting(): BattingSplit {
  return {
    g: 0, pa: 0, ab: 0, r: 0, h: 0, singles: 0, doubles: 0, triples: 0, hr: 0,
    tb: 0, rbi: 0, bb: 0, ibb: 0, k: 0, sb: 0, cs: 0, hbp: 0, sac: 0, sf: 0,
    gidp: 0, roe: 0, ci: 0, lob: 0, pickoffs: 0, twoOutRbi: 0, productiveOuts: 0,
    runnersAdvanced: 0, phAb: 0, phH: 0, prApp: 0,
    avg: null, obp: null, slg: null, ops: null, iso: null, bbPct: null,
    kPct: null, bbK: null, xbhPct: null, sbPct: null, rc: null, wobaEst: null,
  };
}

export function emptyPitching(): PitchingSplit {
  return {
    g: 0, gs: 0, gf: 0, w: 0, l: 0, sv: 0, holds: 0, blownSaves: 0, cg: 0,
    sho: 0, ip: 0, bf: 0, h: 0, doublesAllowed: 0, triplesAllowed: 0, r: 0,
    er: 0, bb: 0, ibb: 0, k: 0, hbp: 0, wp: 0, balk: 0, hr: 0, pitches: 0,
    strikes: 0, firstPitchStrikes: 0, inheritedRunners: 0, inheritedRunnersScored: 0,
    era: null, whip: null, k9: null, bb9: null, hr9: null, h9: null,
    kPct: null, bbPct: null, oppBa: null, strikePct: null, fpsPct: null, lobPct: null,
  };
}

export function emptyCatching(): CatchingSplit {
  return {
    events: 0, g: 0, throwdowns: 0, caughtStealing: 0, stolenBasesAllowed: 0,
    pickoffs: 0, blockOpportunities: 0, blocksMade: 0, passedBalls: 0,
    framingChances: 0, csPct: null, blockPct: null, popTimeAvg: null,
  };
}

export function emptyFielding(): FieldingSplit {
  return {
    events: 0, g: 0, putouts: 0, assists: 0, errors: 0, doublePlays: 0,
    chances: 0, fldPct: null, routinePct: null,
  };
}

export function emptyBaserunning(): BaserunningSplit {
  return {
    events: 0, g: 0, stolenBases: 0, caughtStealing: 0, pickoffs: 0,
    extraBasesTaken: 0, outsOnBases: 0, sbPct: null, homeToFirstAvg: null,
  };
}

function round3(n: number): number {
  return parseFloat(n.toFixed(3));
}

function round2(n: number): number {
  return parseFloat(n.toFixed(2));
}

function ratio(num: number, den: number, decimals = 3): number | null {
  if (den <= 0) return null;
  return parseFloat((num / den).toFixed(decimals));
}

// Finalize derived rates from accumulated counting stats. Singles/TB are derived
// from the captured hit mix; every rate is null on a zero denominator.
export function finalizeBatting(b: BattingSplit): BattingSplit {
  b.singles = Math.max(0, b.h - b.doubles - b.triples - b.hr);
  b.tb = b.singles + 2 * b.doubles + 3 * b.triples + 4 * b.hr;
  b.pa = b.ab + b.bb + b.hbp + b.sf + b.sac;
  if (b.ab > 0) {
    b.avg = round3(b.h / b.ab);
    b.slg = round3(b.tb / b.ab);
    b.iso = b.avg !== null && b.slg !== null ? round3(b.slg - b.avg) : null;
  }
  // OBP uses the standard AB+BB+HBP+SF denominator (SH excluded by convention).
  const obpDen = b.ab + b.bb + b.hbp + b.sf;
  b.obp = obpDen > 0 ? round3((b.h + b.bb + b.hbp) / obpDen) : null;
  b.ops = b.obp !== null && b.slg !== null ? round3(b.obp + b.slg) : null;
  b.bbPct = ratio(b.bb, b.pa);
  b.kPct = ratio(b.k, b.pa);
  b.bbK = ratio(b.bb, b.k, 2);
  b.xbhPct = ratio(b.doubles + b.triples + b.hr, b.h);
  b.sbPct = ratio(b.sb, b.sb + b.cs);
  // Basic runs created: (H+BB)·TB / (AB+BB).
  const rcDen = b.ab + b.bb;
  b.rc = rcDen > 0 ? round2(((b.h + b.bb) * b.tb) / rcDen) : null;
  // wOBA estimate (2013 weights). uBB = BB − IBB.
  const ubb = Math.max(0, b.bb - b.ibb);
  const wobaNum =
    0.69 * ubb + 0.72 * b.hbp + 0.89 * b.singles + 1.27 * b.doubles +
    1.62 * b.triples + 2.1 * b.hr;
  const wobaDen = b.ab + b.bb - b.ibb + b.sf + b.hbp;
  b.wobaEst = wobaDen > 0 ? round3(wobaNum / wobaDen) : null;
  return b;
}

export function finalizePitching(p: PitchingSplit): PitchingSplit {
  if (p.ip > 0) {
    p.era = round2((p.er * 9) / p.ip);
    p.whip = round2((p.bb + p.h) / p.ip);
    p.k9 = round2((p.k * 9) / p.ip);
    p.bb9 = round2((p.bb * 9) / p.ip);
    p.hr9 = round2((p.hr * 9) / p.ip);
    p.h9 = round2((p.h * 9) / p.ip);
  }
  p.kPct = ratio(p.k, p.bf);
  p.bbPct = ratio(p.bb, p.bf);
  // AB-against ≈ BF − BB − HBP (SF/SH unknown at box grain).
  const abAgainst = p.bf - p.bb - p.hbp;
  p.oppBa = ratio(p.h, abAgainst);
  p.strikePct = ratio(p.strikes, p.pitches);
  p.fpsPct = ratio(p.firstPitchStrikes, p.bf);
  // LOB%: (H+BB+HBP−R) / (H+BB+HBP−1.4·HR).
  const onBase = p.h + p.bb + p.hbp;
  const lobDen = onBase - 1.4 * p.hr;
  p.lobPct = lobDen > 0 ? round3((onBase - p.r) / lobDen) : null;
  return p;
}

export function finalizeCatching(c: CatchingSplit): CatchingSplit {
  c.csPct = ratio(c.caughtStealing, c.caughtStealing + c.stolenBasesAllowed);
  c.blockPct = ratio(c.blocksMade, c.blockOpportunities);
  return c;
}

export function finalizeFielding(f: FieldingSplit): FieldingSplit {
  f.chances = f.putouts + f.assists + f.errors;
  f.fldPct = ratio(f.putouts + f.assists, f.chances);
  return f;
}

export function finalizeBaserunning(b: BaserunningSplit): BaserunningSplit {
  b.sbPct = ratio(b.stolenBases, b.stolenBases + b.caughtStealing);
  return b;
}

// -----------------------------------------------------------------------------
// Staff authorization (mirrors command-center read model)
// -----------------------------------------------------------------------------

async function isTeamStaff(
  supabase: Awaited<ReturnType<typeof createClient>>,
  teamId: string,
): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data: coach } = await supabase
    .from('baseball_coaches')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!coach) return false;

  const { data: staff } = await supabase
    .from('baseball_team_coach_staff')
    .select('id')
    .eq('team_id', teamId)
    .eq('coach_id', coach.id)
    .maybeSingle();

  return !!staff;
}

// -----------------------------------------------------------------------------
// Internal row shapes from the box-score reads
// -----------------------------------------------------------------------------

interface BattingLineRow {
  game_id: string;
  player_id: string;
  ab: number | null;
  r: number | null;
  h: number | null;
  doubles: number | null;
  triples: number | null;
  hr: number | null;
  rbi: number | null;
  bb: number | null;
  ibb: number | null;
  k: number | null;
  sb: number | null;
  cs: number | null;
  hbp: number | null;
  sac: number | null;
  sf: number | null;
  gidp: number | null;
  roe: number | null;
  ci: number | null;
  lob: number | null;
  pickoffs: number | null;
  two_out_rbi: number | null;
  productive_outs: number | null;
  runners_advanced: number | null;
  ph_ab: number | null;
  ph_h: number | null;
  pr_app: number | null;
}

interface PitchingLineRow {
  game_id: string;
  player_id: string;
  ip: number | null;
  h: number | null;
  r: number | null;
  er: number | null;
  bb: number | null;
  ibb: number | null;
  k: number | null;
  hr: number | null;
  result: string | null;
  gs: number | null;
  gf: number | null;
  holds: number | null;
  blown_saves: number | null;
  complete_game: number | null;
  shutout: number | null;
  bf: number | null;
  hbp: number | null;
  wp: number | null;
  balk: number | null;
  doubles_allowed: number | null;
  triples_allowed: number | null;
  pitch_count: number | null;
  strikes: number | null;
  first_pitch_strikes: number | null;
  inherited_runners: number | null;
  inherited_runners_scored: number | null;
}

interface CatchingEventRow {
  game_id: string | null;
  catcher_id: string | null;
  event_type: string | null;
  block_result: string | null;
  steal_result: string | null;
  framing_result: string | null;
  pop_time: number | null;
}

interface FieldingEventRow {
  game_id: string | null;
  player_id: string | null;
  event_type: string | null;
  result: string | null;
  chance_difficulty: string | null;
}

interface BaserunningEventRow {
  game_id: string | null;
  runner_id: string | null;
  event_type: string | null;
  result: string | null;
  home_to_first: number | null;
}

interface StoredSeasonRow {
  player_id: string;
  ab: number | null;
  h: number | null;
  hr: number | null;
  rbi: number | null;
}

// -----------------------------------------------------------------------------
// getStatsCenter
// -----------------------------------------------------------------------------

/**
 * Build the Stats Center read model for a team + season. Staff-only: returns
 * `authorized:false` with empty rows when the current user is not staff.
 * Never throws — sub-read failures degrade to empty arrays + an `error` string.
 *
 * The official/scrimmage split + season reconcile are derived from per-game box
 * scores joined to baseball_games.game_type; the stored season-stat row is used
 * ONLY as a reconcile target, never as the displayed split source.
 */
export async function getStatsCenter(
  teamId: string,
  options: StatsCenterOptions = {},
): Promise<StatsCenterReadModel> {
  const seasonYear = options.seasonYear ?? new Date().getFullYear();
  const positionFilter =
    options.positions && options.positions.length > 0
      ? new Set(options.positions)
      : null;

  const base = (
    authorized: boolean,
    error: string | null,
  ): StatsCenterReadModel => ({
    teamId,
    seasonYear,
    authorized,
    rows: [],
    positions: [],
    summary: {
      rosterSize: 0,
      playersWithData: 0,
      officialGames: 0,
      scrimmages: 0,
      unreconciled: 0,
    },
    error,
  });

  if (!teamId) return base(false, 'A team id is required.');

  const supabase = await createClient();
  if (!(await isTeamStaff(supabase, teamId))) {
    return base(false, null); // not staff — honest unauthorized envelope
  }

  // Season window for game-date scoping; callers can narrow further with
  // from/to. The wider of (season bounds, caller bounds) wins on each side.
  const seasonStart = `${seasonYear}-01-01`;
  const seasonEnd = `${seasonYear}-12-31`;
  const fromDate =
    options.fromDate && options.fromDate > seasonStart
      ? options.fromDate
      : seasonStart;
  const toDate =
    options.toDate && options.toDate < seasonEnd ? options.toDate : seasonEnd;

  // The box-score + season-stat tables ship via baseball migrations whose
  // generated database.ts types are present, but the date-windowed join below
  // is simplest expressed through the `as any` table-accessor pattern already
  // used across baseball read models. Row shapes are asserted explicitly.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const [membersRes, gamesRes, seasonRes] = await Promise.all([
    supabase
      .from('baseball_team_members')
      .select(
        `player_id, jersey_number,
         baseball_players!inner ( id, first_name, last_name, primary_position )`,
      )
      .eq('team_id', teamId),
    // Games in the window, so we can classify each box-score line as official
    // (game_type='game') vs scrimmage and bound the box-score reads by game id.
    db
      .from('baseball_games')
      .select('id, game_type')
      .eq('team_id', teamId)
      .gte('game_date', fromDate)
      .lte('game_date', toDate),
    // Stored season aggregate — reconcile target only.
    db
      .from('baseball_player_season_stats')
      .select('player_id, ab, h, hr, rbi')
      .eq('team_id', teamId)
      .eq('season_year', seasonYear),
  ]);

  let error: string | null = null;

  // ---- Roster ----
  if (membersRes.error) {
    return base(true, 'The roster could not be loaded.');
  }
  type PlayerEmbed = {
    id: string;
    first_name: string | null;
    last_name: string | null;
    primary_position: string | null;
  };
  const members = (membersRes.data ?? [])
    .map((m) => ({
      player: (m.baseball_players as unknown as PlayerEmbed) ?? null,
      jerseyNumber: m.jersey_number ?? null,
    }))
    .filter((m): m is { player: PlayerEmbed; jerseyNumber: number | null } => !!m.player);

  // ---- Game classification ----
  const officialGameIds = new Set<string>();
  const scrimmageGameIds = new Set<string>();
  if (gamesRes.error) {
    error = 'Game classification could not be loaded; splits may be incomplete.';
  } else {
    for (const g of (gamesRes.data ?? []) as { id: string; game_type: string | null }[]) {
      const gt = (g.game_type as BaseballGameType | null) ?? 'game';
      if (gt === 'scrimmage') scrimmageGameIds.add(g.id);
      else officialGameIds.add(g.id);
    }
  }
  const allGameIds = [...officialGameIds, ...scrimmageGameIds];

  // ---- Box-score lines + defensive/baserunning OFFICIAL events ----
  // Box scores carry batting/pitching. Catching/fielding/baserunning OFFICIAL
  // production is NOT a box-score column; it lives in the elite event model. We
  // read those events scoped to OFFICIAL games only (official_game context) and
  // degrade honestly to empty splits when the event tables are absent/empty.
  let battingLines: BattingLineRow[] = [];
  let pitchingLines: PitchingLineRow[] = [];
  let catchingEvents: CatchingEventRow[] = [];
  let fieldingEvents: FieldingEventRow[] = [];
  let baserunningEvents: BaserunningEventRow[] = [];
  if (allGameIds.length > 0) {
    const officialIds = [...officialGameIds];
    // PostgREST caps every read at 1000 rows (supabase/config.toml max_rows).
    // A full college season ( ~55 games × ~35-player roster ) puts batting alone
    // near ~1,900 rows, and the defensive/baserunning event tables accumulate one
    // row per chance across the season — all comfortably over the cap. WITHOUT
    // pagination AND a stable order, an over-cap read returns an arbitrary,
    // non-deterministic 1000-row slice and the season hitting + defensive splits
    // are silently computed from a partial subset (wrong numbers, every reload).
    //
    // Every season-wide read below is therefore paginated via fetchAllRowsResult
    // (mirrors the GolfHelm golf_holes/golf_shots fix) with an explicit
    // .order('id') so each page is a stable, deterministic slice. game-id scoping
    // already bounds the set to the season date window (gamesRes is date-bounded),
    // so this is correctness-preserving, not a behavioral change.
    const [battingRes, pitchingRes, catchRes, fieldRes, runRes] = await Promise.all([
      fetchAllRowsResult<BattingLineRow>((from, to) =>
        db
          .from('baseball_box_score_batting')
          .select(
            'game_id, player_id, ab, r, h, doubles, triples, hr, rbi, bb, ibb, k, sb, cs, hbp, sac, sf, gidp, roe, ci, lob, pickoffs, two_out_rbi, productive_outs, runners_advanced, ph_ab, ph_h, pr_app',
          )
          .eq('team_id', teamId)
          .in('game_id', allGameIds)
          .order('id', { ascending: true })
          .range(from, to),
      ),
      fetchAllRowsResult<PitchingLineRow>((from, to) =>
        db
          .from('baseball_box_score_pitching')
          .select(
            'game_id, player_id, ip, h, r, er, bb, ibb, k, hr, result, gs, gf, holds, blown_saves, complete_game, shutout, bf, hbp, wp, balk, doubles_allowed, triples_allowed, pitch_count, strikes, first_pitch_strikes, inherited_runners, inherited_runners_scored',
          )
          .eq('team_id', teamId)
          .in('game_id', allGameIds)
          .order('id', { ascending: true })
          .range(from, to),
      ),
      // Defensive / baserunning events are OFFICIAL-only here (the Stats Center
      // official splits): scope to official games + official_game context.
      officialIds.length > 0
        ? fetchAllRowsResult<CatchingEventRow>((from, to) =>
            db
              .from('baseball_catching_events')
              .select('game_id, catcher_id, event_type, block_result, steal_result, framing_result, pop_time')
              .eq('team_id', teamId)
              .eq('data_context', 'official_game')
              .in('game_id', officialIds)
              .order('id', { ascending: true })
              .range(from, to),
          )
        : Promise.resolve({ data: [] as CatchingEventRow[], error: null }),
      officialIds.length > 0
        ? fetchAllRowsResult<FieldingEventRow>((from, to) =>
            db
              .from('baseball_fielding_events')
              .select('game_id, player_id, event_type, result, chance_difficulty')
              .eq('team_id', teamId)
              .eq('data_context', 'official_game')
              .in('game_id', officialIds)
              .order('id', { ascending: true })
              .range(from, to),
          )
        : Promise.resolve({ data: [] as FieldingEventRow[], error: null }),
      officialIds.length > 0
        ? fetchAllRowsResult<BaserunningEventRow>((from, to) =>
            db
              .from('baseball_baserunning_events')
              .select('game_id, runner_id, event_type, result, home_to_first')
              .eq('team_id', teamId)
              .eq('data_context', 'official_game')
              .in('game_id', officialIds)
              .order('id', { ascending: true })
              .range(from, to),
          )
        : Promise.resolve({ data: [] as BaserunningEventRow[], error: null }),
    ]);
    if (battingRes.error) {
      error = error ?? 'Batting lines could not be loaded.';
    } else {
      battingLines = (battingRes.data ?? []) as BattingLineRow[];
    }
    if (pitchingRes.error) {
      error = error ?? 'Pitching lines could not be loaded.';
    } else {
      pitchingLines = (pitchingRes.data ?? []) as PitchingLineRow[];
    }
    // Event reads degrade SILENTLY (no error surface): they are an optional,
    // additive official layer — absence is honest "no captured events", not a
    // failure of the core box-score read.
    if (!catchRes.error) catchingEvents = (catchRes.data ?? []) as CatchingEventRow[];
    if (!fieldRes.error) fieldingEvents = (fieldRes.data ?? []) as FieldingEventRow[];
    if (!runRes.error) baserunningEvents = (runRes.data ?? []) as BaserunningEventRow[];
  }

  // ---- Stored season rows (reconcile target) ----
  const storedByPlayer = new Map<string, StoredSeasonRow>();
  if (!seasonRes.error) {
    for (const s of (seasonRes.data ?? []) as StoredSeasonRow[]) {
      storedByPlayer.set(s.player_id, s);
    }
  } else {
    error = error ?? 'Season totals could not be loaded for reconcile.';
  }

  // ---- Per-player accumulation ----
  interface Acc {
    battingOfficial: BattingSplit;
    pitchingOfficial: PitchingSplit;
    battingAll: BattingSplit;
    pitchingAll: PitchingSplit;
    catchingOfficial: CatchingSplit;
    fieldingOfficial: FieldingSplit;
    baserunningOfficial: BaserunningSplit;
    battingGamesOfficial: Set<string>;
    battingGamesAll: Set<string>;
    pitchingGamesOfficial: Set<string>;
    pitchingGamesAll: Set<string>;
    catchingGames: Set<string>;
    fieldingGames: Set<string>;
    baserunGames: Set<string>;
    popTimeSum: number;
    popTimeN: number;
    h2fSum: number;
    h2fN: number;
    fieldRoutineMade: number;
    fieldRoutineChances: number;
  }
  const accByPlayer = new Map<string, Acc>();
  const ensureAcc = (pid: string): Acc => {
    let a = accByPlayer.get(pid);
    if (!a) {
      a = {
        battingOfficial: emptyBatting(),
        pitchingOfficial: emptyPitching(),
        battingAll: emptyBatting(),
        pitchingAll: emptyPitching(),
        catchingOfficial: emptyCatching(),
        fieldingOfficial: emptyFielding(),
        baserunningOfficial: emptyBaserunning(),
        battingGamesOfficial: new Set(),
        battingGamesAll: new Set(),
        pitchingGamesOfficial: new Set(),
        pitchingGamesAll: new Set(),
        catchingGames: new Set(),
        fieldingGames: new Set(),
        baserunGames: new Set(),
        popTimeSum: 0,
        popTimeN: 0,
        h2fSum: 0,
        h2fN: 0,
        fieldRoutineMade: 0,
        fieldRoutineChances: 0,
      };
      accByPlayer.set(pid, a);
    }
    return a;
  };

  const addBatting = (dst: BattingSplit, line: BattingLineRow) => {
    dst.ab += line.ab ?? 0;
    dst.r += line.r ?? 0;
    dst.h += line.h ?? 0;
    dst.doubles += line.doubles ?? 0;
    dst.triples += line.triples ?? 0;
    dst.hr += line.hr ?? 0;
    dst.rbi += line.rbi ?? 0;
    dst.bb += line.bb ?? 0;
    dst.ibb += line.ibb ?? 0;
    dst.k += line.k ?? 0;
    dst.sb += line.sb ?? 0;
    dst.cs += line.cs ?? 0;
    dst.hbp += line.hbp ?? 0;
    dst.sac += line.sac ?? 0;
    dst.sf += line.sf ?? 0;
    dst.gidp += line.gidp ?? 0;
    dst.roe += line.roe ?? 0;
    dst.ci += line.ci ?? 0;
    dst.lob += line.lob ?? 0;
    dst.pickoffs += line.pickoffs ?? 0;
    dst.twoOutRbi += line.two_out_rbi ?? 0;
    dst.productiveOuts += line.productive_outs ?? 0;
    dst.runnersAdvanced += line.runners_advanced ?? 0;
    dst.phAb += line.ph_ab ?? 0;
    dst.phH += line.ph_h ?? 0;
    dst.prApp += line.pr_app ?? 0;
  };

  const addPitching = (dst: PitchingSplit, line: PitchingLineRow) => {
    dst.ip += line.ip ?? 0;
    dst.h += line.h ?? 0;
    dst.r += line.r ?? 0;
    dst.er += line.er ?? 0;
    dst.bb += line.bb ?? 0;
    dst.ibb += line.ibb ?? 0;
    dst.k += line.k ?? 0;
    dst.hr += line.hr ?? 0;
    dst.gs += line.gs ?? 0;
    dst.gf += line.gf ?? 0;
    dst.cg += line.complete_game ?? 0;
    dst.sho += line.shutout ?? 0;
    dst.bf += line.bf ?? 0;
    dst.hbp += line.hbp ?? 0;
    dst.wp += line.wp ?? 0;
    dst.balk += line.balk ?? 0;
    dst.doublesAllowed += line.doubles_allowed ?? 0;
    dst.triplesAllowed += line.triples_allowed ?? 0;
    dst.pitches += line.pitch_count ?? 0;
    dst.strikes += line.strikes ?? 0;
    dst.firstPitchStrikes += line.first_pitch_strikes ?? 0;
    dst.inheritedRunners += line.inherited_runners ?? 0;
    dst.inheritedRunnersScored += line.inherited_runners_scored ?? 0;
    // W/L/SV/H/BS from the per-appearance result code (captured today); the
    // dedicated holds/blown columns add to the result-derived counts so an
    // importer that populates either path is honored without double-thinking.
    switch (line.result) {
      case 'W': dst.w += 1; break;
      case 'L': dst.l += 1; break;
      case 'S': dst.sv += 1; break;
      case 'H': dst.holds += 1; break;
      case 'BS': dst.blownSaves += 1; break;
      default: break;
    }
    dst.holds += line.holds ?? 0;
    dst.blownSaves += line.blown_saves ?? 0;
  };

  for (const line of battingLines) {
    if (!line.player_id || !line.game_id) continue;
    const isOfficial = officialGameIds.has(line.game_id);
    const a = ensureAcc(line.player_id);
    addBatting(a.battingAll, line);
    a.battingGamesAll.add(line.game_id);
    if (isOfficial) {
      addBatting(a.battingOfficial, line);
      a.battingGamesOfficial.add(line.game_id);
    }
  }

  for (const line of pitchingLines) {
    if (!line.player_id || !line.game_id) continue;
    const isOfficial = officialGameIds.has(line.game_id);
    const a = ensureAcc(line.player_id);
    addPitching(a.pitchingAll, line);
    a.pitchingGamesAll.add(line.game_id);
    if (isOfficial) {
      addPitching(a.pitchingOfficial, line);
      a.pitchingGamesOfficial.add(line.game_id);
    }
  }

  // ---- Official defensive / baserunning event accumulation ----
  for (const ev of catchingEvents) {
    if (!ev.catcher_id) continue;
    const a = ensureAcc(ev.catcher_id);
    const c = a.catchingOfficial;
    c.events += 1;
    if (ev.game_id) a.catchingGames.add(ev.game_id);
    if (ev.event_type === 'throwdown') {
      c.throwdowns += 1;
      if (ev.steal_result === 'caught_stealing' || ev.steal_result === 'out') c.caughtStealing += 1;
      else if (ev.steal_result === 'safe' || ev.steal_result === 'stolen') c.stolenBasesAllowed += 1;
      else if (ev.steal_result === 'pickoff') c.pickoffs += 1;
      if (ev.pop_time != null) { a.popTimeSum += ev.pop_time; a.popTimeN += 1; }
    } else if (ev.event_type === 'block') {
      c.blockOpportunities += 1;
      if (ev.block_result === 'blocked' || ev.block_result === 'clean') c.blocksMade += 1;
      else if (ev.block_result === 'passed_ball' || ev.block_result === 'missed') c.passedBalls += 1;
    } else if (ev.event_type === 'receive') {
      if (ev.framing_result) c.framingChances += 1;
    }
  }

  for (const ev of fieldingEvents) {
    if (!ev.player_id) continue;
    const a = ensureAcc(ev.player_id);
    const f = a.fieldingOfficial;
    f.events += 1;
    if (ev.game_id) a.fieldingGames.add(ev.game_id);
    switch (ev.result) {
      case 'putout': f.putouts += 1; break;
      case 'assist': f.assists += 1; break;
      case 'error': f.errors += 1; break;
      case 'double_play': f.doublePlays += 1; f.putouts += 1; break;
      default: break;
    }
    if (ev.chance_difficulty === 'routine') {
      a.fieldRoutineChances += 1;
      if (ev.result !== 'error') a.fieldRoutineMade += 1;
    }
  }

  for (const ev of baserunningEvents) {
    if (!ev.runner_id) continue;
    const a = ensureAcc(ev.runner_id);
    const b = a.baserunningOfficial;
    b.events += 1;
    if (ev.game_id) a.baserunGames.add(ev.game_id);
    if (ev.event_type === 'steal') {
      if (ev.result === 'safe' || ev.result === 'stolen') b.stolenBases += 1;
      else if (ev.result === 'out' || ev.result === 'caught_stealing') b.caughtStealing += 1;
    } else if (ev.event_type === 'pickoff') {
      b.pickoffs += 1;
    } else if (ev.event_type === 'extra_base' || ev.event_type === 'advance') {
      if (ev.result === 'safe' || ev.result === 'advanced') b.extraBasesTaken += 1;
      else if (ev.result === 'out') b.outsOnBases += 1;
    } else if (ev.event_type === 'out_on_bases' || ev.result === 'out') {
      b.outsOnBases += 1;
    }
    if (ev.home_to_first != null) { a.h2fSum += ev.home_to_first; a.h2fN += 1; }
  }

  // ---- Build rows ----
  const positions = new Set<string>();
  const rows: StatsCenterRow[] = [];
  let unreconciled = 0;

  for (const { player, jerseyNumber } of members) {
    if (player.primary_position) positions.add(player.primary_position);

    if (positionFilter && !positionFilter.has(player.primary_position ?? '')) {
      continue;
    }

    const a = accByPlayer.get(player.id);
    const battingOfficial = finalizeBatting(a?.battingOfficial ?? emptyBatting());
    const pitchingOfficial = finalizePitching(a?.pitchingOfficial ?? emptyPitching());
    const battingAll = finalizeBatting(a?.battingAll ?? emptyBatting());
    const pitchingAll = finalizePitching(a?.pitchingAll ?? emptyPitching());
    const catchingOfficial = finalizeCatching(a?.catchingOfficial ?? emptyCatching());
    const fieldingOfficial = finalizeFielding(a?.fieldingOfficial ?? emptyFielding());
    const baserunningOfficial = finalizeBaserunning(a?.baserunningOfficial ?? emptyBaserunning());
    battingOfficial.g = a?.battingGamesOfficial.size ?? 0;
    battingAll.g = a?.battingGamesAll.size ?? 0;
    pitchingOfficial.g = a?.pitchingGamesOfficial.size ?? 0;
    pitchingAll.g = a?.pitchingGamesAll.size ?? 0;
    catchingOfficial.g = a?.catchingGames.size ?? 0;
    fieldingOfficial.g = a?.fieldingGames.size ?? 0;
    baserunningOfficial.g = a?.baserunGames.size ?? 0;
    // Averaged measured fields (null when nothing measured — honest, no 0).
    catchingOfficial.popTimeAvg =
      a && a.popTimeN > 0 ? round2(a.popTimeSum / a.popTimeN) : null;
    baserunningOfficial.homeToFirstAvg =
      a && a.h2fN > 0 ? round2(a.h2fSum / a.h2fN) : null;
    fieldingOfficial.routinePct =
      a && a.fieldRoutineChances > 0
        ? round3(a.fieldRoutineMade / a.fieldRoutineChances)
        : null;

    const noData =
      battingAll.g === 0 &&
      pitchingAll.g === 0 &&
      catchingOfficial.events === 0 &&
      fieldingOfficial.events === 0 &&
      baserunningOfficial.events === 0;

    // Reconcile OFFICIAL-derived batting against the stored season row.
    const stored = storedByPlayer.get(player.id) ?? null;
    let reconcile: SeasonReconcile;
    if (!stored) {
      reconcile = { hasSeasonRow: false, reconciled: false, drift: null };
    } else {
      const drift = {
        ab: battingOfficial.ab - (stored.ab ?? 0),
        h: battingOfficial.h - (stored.h ?? 0),
        hr: battingOfficial.hr - (stored.hr ?? 0),
        rbi: battingOfficial.rbi - (stored.rbi ?? 0),
      };
      const reconciled =
        drift.ab === 0 && drift.h === 0 && drift.hr === 0 && drift.rbi === 0;
      if (!reconciled) unreconciled += 1;
      reconcile = { hasSeasonRow: true, reconciled, drift };
    }

    rows.push({
      playerId: player.id,
      firstName: player.first_name,
      lastName: player.last_name,
      jerseyNumber,
      primaryPosition: player.primary_position,
      battingOfficial,
      pitchingOfficial,
      battingAll,
      pitchingAll,
      catchingOfficial,
      fieldingOfficial,
      baserunningOfficial,
      noData,
      reconcile,
    });
  }

  // Sort: players with data first, then by last name.
  rows.sort((x, y) => {
    if (x.noData !== y.noData) return x.noData ? 1 : -1;
    return (x.lastName ?? '').localeCompare(y.lastName ?? '');
  });

  const playersWithData = rows.filter((r) => !r.noData).length;

  return {
    teamId,
    seasonYear,
    authorized: true,
    rows,
    positions: [...positions].sort(),
    summary: {
      rosterSize: rows.length,
      playersWithData,
      officialGames: officialGameIds.size,
      scrimmages: scrimmageGameIds.size,
      unreconciled,
    },
    error,
  };
}
