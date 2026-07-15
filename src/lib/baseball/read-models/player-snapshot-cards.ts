// =============================================================================
// src/lib/baseball/read-models/player-snapshot-cards.ts
//
// V7 Player Profile Snapshot System (controlling layer: v10 §"Player Profile" ->
// "Snapshot Cards"; deepest treatment: v7 §"V7 Player Profile Snapshot System").
//
// Assembles the STAFF-facing operating snapshot a coach opens before a player
// meeting — "the whole story in one place, not six tools" (v7 "Why It Wins").
// Produces the v7 Profile Header band + the EIGHT snapshot cards, each sourced
// from its REAL subsystem table:
//
//   Header        — status / today availability / latest readiness / next event /
//                   latest CoachHelm signal / source-trust posture.
//   1 Performance — official game vs scrimmage vs practice, latest trend, freshness.
//   2 Hitting     — season AVG/OBP/SLG/OPS + EV trend (gated on a hitting role).
//   3 Pitching    — season ERA/WHIP/K/BB/IP/SV + first-pitch-strike + command
//                   (gated on a pitching role).
//   4 Defense     — fielding chances/errors + (catcher) pop/block/receive
//                   (gated on a defensive role).
//   5 Strength    — bodyweight trend + last lift completion + soreness + next lift.
//   6 Classes     — class schedule + academic standing/eligibility.
//   7 Video       — latest / assigned / reviewed / passport clips.
//   8 Task & Dev  — active+overdue tasks + dev-plan items + last meeting + owner.
//
// ROLE-AWARE: a pitcher's profile leads with Pitching, a two-way shows both, a
// position player never sees an empty Pitching card. The role is inferred from
// the player's positions + handedness + which subsystems actually have data, so
// the cards shown match what the athlete actually does.
//
// HONESTY (binding): every card is gated on real data presence. `present:false`
// means "no data captured" — the card renders an honest empty state and NEVER a
// fabricated number. Confidence/freshness are explicit; a stale source says so.
//
// STAFF-SCOPE + FAULT-TOLERANT: resolves staff via the same
// baseball_team_coach_staff link the timeline uses. Returns an honest
// `authorized:false` envelope (not a throw) when the viewer is not staff, and an
// `error` string (not a 500) when a sub-read fails. Mirrors the established
// read-model conventions (timeline.ts / player-today.ts / player-passport.ts).
//
// 'server-only' + plain async function (NOT 'use server').
// =============================================================================

import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { fromUntyped } from '@/lib/supabase/untyped';
import { buildSourceTrust } from '@/components/baseball/source-trust/build-source-trust';
import type { SourceTrust } from '@/components/baseball/source-trust/source-trust-types';
import {
  computeReadiness,
  readinessBandTone,
} from '@/lib/baseball/lifting/readiness-compute';
import { resolveBaseballCapabilities } from '@/lib/baseball/capabilities';
import {
  resolveBaseballLiftingOrg,
  resolveBaseballAthleteIds,
} from '@/lib/lifting/resolve-baseball-context';
import { extractArmStatusFromNotes, sleepQualityToHours } from '@/lib/lifting/adapters/baseball-view-adapter';
import type { HelmLiftingReadinessCheckinRow } from '@/lib/types/helm-lifting-data';
// #379 — exit velocity is derived via the same pure aggregator elite-stat-
// events.ts's canonical read model uses (avg_exit_velocity metric + the
// evLaPoints visual payload), fed with this player's own batted-ball events
// queried directly here (this file already resolves its own staff gate above
// and reads several other event-grain tables the same way).
import { buildHitterMetrics } from '@/lib/baseball/read-models/elite-stat-events';
import type { BaseballBattedBallEvent } from '@/lib/types/baseball-stat-events';

// The V6 event/elite tables + V11 lifting/readiness tables ship via migrations
// and are NOT in the generated database.ts (no db:types regen without a live
// apply). Cast the query-builder for those reads; RLS is the gate and the
// hand-written shapes below are the contract. Mirrors player-today.ts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UntypedClient = any;

// -----------------------------------------------------------------------------
// Public shapes — header
// -----------------------------------------------------------------------------

/** v7 status enum — the player's standing on the program. */
export type SnapshotPlayerStatus =
  | 'active'
  | 'limited'
  | 'injured'
  | 'redshirt'
  | 'trial'
  | 'showcase';

/** The athlete's functional role, inferred from positions + data presence. */
export type SnapshotRole = 'hitter' | 'pitcher' | 'two_way' | 'catcher' | 'utility';

export interface SnapshotReadinessChip {
  /** False until the player has ever submitted a check-in (honest gate). */
  present: boolean;
  band: 'green' | 'yellow' | 'orange' | 'red' | 'blue' | null;
  label: string | null;
  tone: 'success' | 'warning' | 'error' | 'info' | null;
  /** True when the most-recent check-in is older than the freshness window. */
  stale: boolean;
  checkDate: string | null;
}

export interface SnapshotNextEvent {
  present: boolean;
  id: string | null;
  title: string | null;
  eventType: string | null;
  startTime: string | null;
  location: string | null;
}

export interface SnapshotLatestSignal {
  present: boolean;
  id: string | null;
  title: string | null;
  category: string | null;
  severity: string | null;
  /** Normalized [0,1] confidence, or null (renders "—", never a fake %). */
  confidence: number | null;
  createdAt: string | null;
}

export interface SnapshotHeader {
  /** Program standing. `present:false` when no availability record exists. */
  status: { present: boolean; value: SnapshotPlayerStatus; note: string | null };
  /** Today's availability (from the active availability_statuses row). */
  availability: {
    present: boolean;
    status: string | null;
    reason: string | null;
  };
  readiness: SnapshotReadinessChip;
  nextEvent: SnapshotNextEvent;
  latestSignal: SnapshotLatestSignal;
  /** Inferred functional role (drives which performance cards are shown). */
  role: SnapshotRole;
  roleLabel: string;
  /**
   * Overall source-trust posture of the snapshot: the highest-trust source that
   * fed any present card, so the header can flag "official-fed" vs "manual only".
   */
  sourceTrust: SourceTrust | null;
  /** Count of cards that have real data (drives a "completeness" affordance). */
  cardsPresent: number;
}

// -----------------------------------------------------------------------------
// Public shapes — cards
// -----------------------------------------------------------------------------

/** Common envelope every card carries. */
interface CardBase {
  /** True when the card has real data; false renders the honest empty state. */
  present: boolean;
  /** Provenance/trust for the card's primary source (null when not present). */
  trust: SourceTrust | null;
  /** Most-recent timestamp feeding the card (ISO) — drives a freshness line. */
  asOf: string | null;
}

export interface PerformanceCard extends CardBase {
  /** Per-context AVG (null when no AB in that context). */
  gameAvg: number | null;
  scrimmageAvg: number | null;
  practiceAvg: number | null;
  last5Avg: number | null;
  trend: 'improving' | 'declining' | 'stable' | null;
  /** Total captured sessions feeding the snapshot. */
  sessions: number;
  /** Game vs scrimmage gap in points (×1000), or null. */
  pressureGapPts: number | null;
}

export interface HittingCard extends CardBase {
  avg: number | null;
  obp: number | null;
  slg: number | null;
  ops: number | null;
  hr: number;
  rbi: number;
  ab: number;
  /** Avg / max exit velocity (mph) when sensor data exists. */
  avgExitVelocity: number | null;
  maxExitVelocity: number | null;
  seasonYear: number | null;
}

export interface PitchingCard extends CardBase {
  era: number | null;
  whip: number | null;
  k: number;
  bb: number;
  ip: number | null;
  sv: number;
  w: number;
  l: number;
  hAllowed: number;
  /** K per BB (command proxy) — null when bb === 0 and k === 0. */
  kbb: number | null;
  /** First-pitch-strike % from box pitch counts, when derivable. */
  firstPitchStrikePct: number | null;
  /** Strike % from box (strikes / pitch_count), when derivable. */
  strikePct: number | null;
  appearances: number;
  seasonYear: number | null;
}

export interface DefenseCard extends CardBase {
  /** True when the player has catcher-grain events (pop/block/receive). */
  isCatcher: boolean;
  chances: number;
  errors: number;
  /** Fielding pct = (chances - errors) / chances, or null when chances === 0. */
  fieldingPct: number | null;
  /** Avg throw velocity across fielding events (mph), or null. */
  avgThrowVelocity: number | null;
  // Catcher metrics (only when isCatcher):
  avgPopTime: number | null;
  blockCount: number;
  blockSuccessPct: number | null;
  receiveCount: number;
  throwdownCount: number;
  primaryPosition: string | null;
}

export interface StrengthCard extends CardBase {
  /** Latest recorded bodyweight (lbs) + 7-entry delta. */
  bodyweightLbs: number | null;
  bodyweightDelta: number | null;
  /** Last completed lift session date + title. */
  lastLiftDate: string | null;
  lastLiftTitle: string | null;
  lastLiftStatus: string | null;
  /** Sessions completed in the trailing window vs assigned. */
  completedCount: number;
  assignedCount: number;
  completionPct: number | null;
  /** Max soreness severity from the latest check-in (0–10), or null. */
  sorenessMax: number | null;
  /** Next scheduled lift (date + title), when any. */
  nextLiftDate: string | null;
  nextLiftTitle: string | null;
}

export interface ClassesCard extends CardBase {
  /** Distinct classes this semester. */
  classCount: number;
  semester: string | null;
  /** Sample of class names (capped) for the card body. */
  classNames: string[];
  /**
   * Whether THIS viewer may see the private academic block (standing / GPA /
   * eligibility / credits). Gated on the `can_view_academics` capability (head /
   * primary coaches pass). When false, the academic fields below are forced null
   * regardless of what exists, and the card renders only the (non-private) class
   * schedule. The role-permission matrix forbids exposing academic standing to
   * staff without an academic remit (e.g. pitching / hitting / strength coach).
   */
  canViewAcademics: boolean;
  /** Academic standing + eligibility — null unless `canViewAcademics`. */
  academicStanding: string | null;
  gpa: number | null;
  isEligible: boolean | null;
  creditsCompleted: number | null;
  creditsRequired: number | null;
}

export interface VideoCard extends CardBase {
  total: number;
  /** Latest clip (title + thumb) for the card hero. */
  latestTitle: string | null;
  latestThumb: string | null;
  latestId: string | null;
  /** Clip-state counts (assigned = clips, primary = passport, reviewed = viewed). */
  assignedCount: number;
  passportCount: number;
  reviewedCount: number;
}

export interface TaskDevCard extends CardBase {
  activeTasks: number;
  overdueTasks: number;
  /** Sample of the next-due task titles. */
  taskTitles: string[];
  /** Active development plan(s). */
  devPlanCount: number;
  devPlanTitle: string | null;
  devPlanGoalCount: number;
  /** Staff owner of the latest dev plan (coach display, when resolvable). */
  staffOwner: string | null;
  /** Last coach meeting note date, when any meeting-tagged note exists. */
  lastMeetingDate: string | null;
}

export interface PlayerSnapshotCardsReadModel {
  authorized: boolean;
  playerId: string;
  teamId: string;
  header: SnapshotHeader;
  performance: PerformanceCard;
  hitting: HittingCard;
  pitching: PitchingCard;
  defense: DefenseCard;
  strength: StrengthCard;
  classes: ClassesCard;
  video: VideoCard;
  taskDev: TaskDevCard;
  error: string | null;
}

// -----------------------------------------------------------------------------
// Empty/honest factories
// -----------------------------------------------------------------------------

function emptyHeader(role: SnapshotRole = 'utility'): SnapshotHeader {
  return {
    status: { present: false, value: 'active', note: null },
    availability: { present: false, status: null, reason: null },
    readiness: { present: false, band: null, label: null, tone: null, stale: false, checkDate: null },
    nextEvent: { present: false, id: null, title: null, eventType: null, startTime: null, location: null },
    latestSignal: { present: false, id: null, title: null, category: null, severity: null, confidence: null, createdAt: null },
    role,
    roleLabel: roleLabel(role),
    sourceTrust: null,
    cardsPresent: 0,
  };
}

const emptyPerformance = (): PerformanceCard => ({ present: false, trust: null, asOf: null, gameAvg: null, scrimmageAvg: null, practiceAvg: null, last5Avg: null, trend: null, sessions: 0, pressureGapPts: null });
const emptyHitting = (): HittingCard => ({ present: false, trust: null, asOf: null, avg: null, obp: null, slg: null, ops: null, hr: 0, rbi: 0, ab: 0, avgExitVelocity: null, maxExitVelocity: null, seasonYear: null });
const emptyPitching = (): PitchingCard => ({ present: false, trust: null, asOf: null, era: null, whip: null, k: 0, bb: 0, ip: null, sv: 0, w: 0, l: 0, hAllowed: 0, kbb: null, firstPitchStrikePct: null, strikePct: null, appearances: 0, seasonYear: null });
const emptyDefense = (): DefenseCard => ({ present: false, trust: null, asOf: null, isCatcher: false, chances: 0, errors: 0, fieldingPct: null, avgThrowVelocity: null, avgPopTime: null, blockCount: 0, blockSuccessPct: null, receiveCount: 0, throwdownCount: 0, primaryPosition: null });
const emptyStrength = (): StrengthCard => ({ present: false, trust: null, asOf: null, bodyweightLbs: null, bodyweightDelta: null, lastLiftDate: null, lastLiftTitle: null, lastLiftStatus: null, completedCount: 0, assignedCount: 0, completionPct: null, sorenessMax: null, nextLiftDate: null, nextLiftTitle: null });
const emptyClasses = (): ClassesCard => ({ present: false, trust: null, asOf: null, classCount: 0, semester: null, classNames: [], canViewAcademics: false, academicStanding: null, gpa: null, isEligible: null, creditsCompleted: null, creditsRequired: null });
const emptyVideo = (): VideoCard => ({ present: false, trust: null, asOf: null, total: 0, latestTitle: null, latestThumb: null, latestId: null, assignedCount: 0, passportCount: 0, reviewedCount: 0 });
const emptyTaskDev = (): TaskDevCard => ({ present: false, trust: null, asOf: null, activeTasks: 0, overdueTasks: 0, taskTitles: [], devPlanCount: 0, devPlanTitle: null, devPlanGoalCount: 0, staffOwner: null, lastMeetingDate: null });

function emptyModel(
  playerId: string,
  teamId: string,
  authorized: boolean,
  error: string | null,
  role: SnapshotRole = 'utility',
): PlayerSnapshotCardsReadModel {
  return {
    authorized,
    playerId,
    teamId,
    header: emptyHeader(role),
    performance: emptyPerformance(),
    hitting: emptyHitting(),
    pitching: emptyPitching(),
    defense: emptyDefense(),
    strength: emptyStrength(),
    classes: emptyClasses(),
    video: emptyVideo(),
    taskDev: emptyTaskDev(),
    error,
  };
}

// -----------------------------------------------------------------------------
// Role inference
// -----------------------------------------------------------------------------

export function roleLabel(role: SnapshotRole): string {
  switch (role) {
    case 'hitter': return 'Position Player';
    case 'pitcher': return 'Pitcher';
    case 'two_way': return 'Two-Way Player';
    case 'catcher': return 'Catcher';
    case 'utility': return 'Utility';
  }
}

const PITCHER_POS = /\b(p|pitcher|rhp|lhp|sp|rp|cl)\b/i;
const CATCHER_POS = /\b(c|catcher)\b/i;

/**
 * Infer the athlete's functional role from positions + which subsystems carry
 * real data. Data presence dominates a stale label: a "P" who has season hitting
 * AND pitching rows is two-way; a position player with pitching appearances is
 * two-way; a "C" is a catcher. The header uses this to order cards and to never
 * show an empty Pitching card to a position player.
 */
export function inferRole(input: {
  primaryPosition: string | null;
  secondaryPosition: string | null;
  hasHitting: boolean;
  hasPitching: boolean;
  isCatcher: boolean;
}): SnapshotRole {
  const pos = `${input.primaryPosition ?? ''} ${input.secondaryPosition ?? ''}`;
  const posPitcher = PITCHER_POS.test(pos);
  const posCatcher = CATCHER_POS.test(pos);

  // Two-way is earned by DATA in BOTH streams — a position label alone (e.g. a
  // "P" who only has hitting rows) does not fabricate a two-way profile.
  if (input.hasHitting && input.hasPitching) return 'two_way';
  // Catcher dominates the defensive slot (the card becomes Catching).
  if (input.isCatcher || posCatcher) return 'catcher';
  // Pitching data OR a pitcher position -> pitcher (honest empty cards if no data).
  if (input.hasPitching || posPitcher) return 'pitcher';
  // Any hitting data -> position player.
  if (input.hasHitting) return 'hitter';
  return 'utility';
}

// -----------------------------------------------------------------------------
// Readiness band collapse (orange_lower/orange_upper -> orange)
// -----------------------------------------------------------------------------

export function collapseBand(
  band: string | null,
): SnapshotReadinessChip['band'] {
  if (!band) return null;
  if (band === 'orange_lower' || band === 'orange_upper') return 'orange';
  if (band === 'green' || band === 'yellow' || band === 'red' || band === 'blue') return band;
  return null;
}

function bandLabel(band: SnapshotReadinessChip['band']): string | null {
  switch (band) {
    case 'green': return 'Ready';
    case 'yellow': return 'Monitor';
    case 'orange': return 'Modify';
    case 'red': return 'Hold';
    case 'blue': return 'Recovery';
    default: return null;
  }
}

// -----------------------------------------------------------------------------
// Staff resolution (same link the timeline uses)
// -----------------------------------------------------------------------------

async function isStaffOnTeam(
  supabase: Awaited<ReturnType<typeof createClient>>,
  teamId: string,
): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data: coach } = await supabase
    .from('baseball_coaches')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!coach?.id) return false;
  const { data: staffRow } = await supabase
    .from('baseball_team_coach_staff')
    .select('id')
    .eq('team_id', teamId)
    .eq('coach_id', coach.id)
    .maybeSingle();
  return !!staffRow;
}

// -----------------------------------------------------------------------------
// Trust helpers — map a stat `source` string to a SourceTrust posture.
// -----------------------------------------------------------------------------

function trustForSource(sourceRaw: string | null, label: string): SourceTrust {
  const s = (sourceRaw ?? 'manual').toLowerCase();
  // captureMode: a measured/imported value is an active capture; a manual entry
  // is also an active capture (it records a real observation). logged_intent is
  // reserved for planned/assigned rows (used for the next-lift trust).
  const isOfficial = /official|box|conference|ncaa|presto|statcrew|gamechanger/.test(s);
  const isDevice = /rapsodo|trackman|blast|kinetics|sensor|synergy|armcare/.test(s);
  const isImport = /import|csv|sheet|xlsx/.test(s);
  return buildSourceTrust({
    ref: { source: isOfficial ? 'integration' : isImport ? 'csv_import' : 'manual', sourceId: null, label },
    confidence: null,
    captureMode: 'active_capture',
    verified: isOfficial,
    trustLevel: isOfficial ? 'official' : isDevice ? 'device_export' : isImport ? 'imported' : 'staff_entered',
  });
}

// -----------------------------------------------------------------------------
// getPlayerSnapshotCards
// -----------------------------------------------------------------------------

export interface SnapshotCardsOptions {
  /** ISO date (YYYY-MM-DD) to treat as "today"; defaults to server now. */
  forDate?: string;
  /** Season year for season-stats cards; defaults to the current calendar year. */
  seasonYear?: number;
  /** Staleness window for readiness in days (default 3). */
  readinessStaleDays?: number;
}

/**
 * Build the v7 Profile Header + 8 snapshot cards for `playerId` on `teamId`.
 * STAFF-ONLY: returns an honest `authorized:false` envelope when the viewer is
 * not staff on the team. Never throws — sub-read failures degrade the affected
 * card to its empty state and set `error`.
 */
export async function getPlayerSnapshotCards(
  teamId: string,
  playerId: string,
  options: SnapshotCardsOptions = {},
): Promise<PlayerSnapshotCardsReadModel> {
  if (!teamId || !playerId) {
    return emptyModel(playerId ?? '', teamId ?? '', false, 'A team id and player id are required.');
  }

  const supabase = await createClient();
  const staff = await isStaffOnTeam(supabase, teamId);
  if (!staff) {
    // Honest unauthorized envelope (rendered as a quiet "staff only" notice).
    return emptyModel(playerId, teamId, false, null);
  }

  const db = supabase as UntypedClient;
  const today = options.forDate ?? new Date().toISOString().slice(0, 10);
  const seasonYear = options.seasonYear ?? new Date(today).getUTCFullYear();
  const staleDays = options.readinessStaleDays ?? 3;

  // Private-academics gate. Academic standing / GPA / eligibility / credits are
  // private details the role-permission matrix restricts to staff with the
  // `can_view_academics` capability (head / primary coaches pass). A general
  // baseball coach (pitching / hitting / strength) must NOT see them. We skip the
  // eligibility read entirely when not permitted — closing the leak at the app
  // layer even before RLS — and force the academic fields null below. (RLS on
  // baseball_academic_eligibility is the defense-in-depth backstop.)
  const caps = await resolveBaseballCapabilities(teamId);
  const canViewAcademics = caps.is_head_coach === true || caps.can_view_academics === true;

  let error: string | null = null;
  const note = (msg: string) => { error = error ?? msg; };

  // W2-G rewire: submitReadinessCheckin (lifting.ts) writes ONLY to
  // helm_lifting_readiness_checkins now — the legacy baseball_readiness_
  // checkins table is write-dead. Resolve this player's helm athlete id BEFORE
  // the fan-out below so the checkin read can target the right table.
  const liftCtx = await resolveBaseballLiftingOrg(teamId);
  const athleteMap = liftCtx
    ? await resolveBaseballAthleteIds(liftCtx.organizationId, [playerId])
    : {};
  const athleteId = athleteMap[playerId] ?? null;
  const checkinQuery = liftCtx && athleteId
    ? fromUntyped(db, 'helm_lifting_readiness_checkins')
        .select('id, checkin_date, sleep_quality, energy_level, stress_level, soreness_overall, notes, lower_body_status, illness_flag')
        .eq('organization_id', liftCtx.organizationId)
        .eq('athlete_id', athleteId)
        .order('checkin_date', { ascending: false }).limit(1).maybeSingle()
    : Promise.resolve({ data: null, error: null });

  // Strength card: active availability, bodyweight trend, and lift session
  // history all live in the unified helm_lifting_* tables (athlete_id-keyed),
  // resolved via the same org + athlete-id bridge as the checkin query above.
  const availQuery = liftCtx && athleteId
    ? fromUntyped(db, 'helm_lifting_availability_statuses')
        .select('status, reason_category, starts_at')
        .eq('organization_id', liftCtx.organizationId)
        .eq('athlete_id', athleteId)
        .order('starts_at', { ascending: false }).limit(1).maybeSingle()
    : Promise.resolve({ data: null, error: null });
  const bwQuery = liftCtx && athleteId
    ? fromUntyped(db, 'helm_lifting_bodyweight_entries')
        .select('entry_date, weight_lbs')
        .eq('organization_id', liftCtx.organizationId)
        .eq('athlete_id', athleteId)
        .order('entry_date', { ascending: false }).limit(8)
    : Promise.resolve({ data: [], error: null });
  const liftDoneQuery = liftCtx && athleteId
    ? fromUntyped(db, 'helm_lifting_sessions')
        .select('id, title, scheduled_date, status, completed_at')
        .eq('organization_id', liftCtx.organizationId)
        .eq('athlete_id', athleteId)
        .lte('scheduled_date', today)
        .order('scheduled_date', { ascending: false }).limit(30)
    : Promise.resolve({ data: [], error: null });
  const liftNextQuery = liftCtx && athleteId
    ? fromUntyped(db, 'helm_lifting_sessions')
        .select('id, title, scheduled_date, status')
        .eq('organization_id', liftCtx.organizationId)
        .eq('athlete_id', athleteId)
        .gte('scheduled_date', today)
        .in('status', ['assigned', 'started', 'modified'])
        .order('scheduled_date', { ascending: true }).limit(1).maybeSingle()
    : Promise.resolve({ data: null, error: null });

  // --- Fan out every independent read in parallel ---
  const [
    playerRes,
    seasonRes,
    aggRes,
    nextEventRes,
    signalRes,
    availRes,
    checkinRes,
    fieldRes,
    catchRes,
    bwRes,
    liftDoneRes,
    liftNextRes,
    classesRes,
    eligibilityRes,
    videosRes,
    tasksRes,
    devPlanRes,
    evRes,
  ] = await Promise.all([
    supabase.from('baseball_players')
      .select('primary_position, secondary_position')
      .eq('id', playerId).maybeSingle(),
    // Season stats — one row per (player, team, season); carries BOTH hitting and
    // pitching columns (database.ts confirmed). The canonical card source.
    db.from('baseball_player_season_stats')
      .select('ab, avg, obp, slg, ops, hr, rbi, h, era, whip, k, bb, ip, sv, w, l, h_allowed, k_thrown, bb_allowed, g_p, last_updated, season_year')
      .eq('player_id', playerId).eq('team_id', teamId).eq('season_year', seasonYear)
      .maybeSingle(),
    db.from('baseball_player_aggregates')
      .select('career_avg, career_obp, career_slg, career_ops, game_avg, practice_avg, last_5_avg, recent_trend, pressure_gap, total_sessions, updated_at')
      .eq('player_id', playerId).eq('team_id', teamId).maybeSingle(),
    supabase.from('baseball_events')
      .select('id, title, event_type, start_time, location')
      .eq('team_id', teamId).gte('start_time', `${today}T00:00:00.000Z`)
      .order('start_time', { ascending: true }).limit(1).maybeSingle(),
    // Latest CoachHelm signal for THIS player (staff-visible, still-live).
    db.from('baseball_signals')
      .select('id, title, category, severity, confidence, created_at, disposition, visibility')
      .eq('team_id', teamId).eq('player_id', playerId)
      .order('created_at', { ascending: false }).limit(5),
    // Strength card availability — resolved above into availQuery (the unified
    // helm_lifting_availability_statuses table; the legacy
    // baseball_availability_statuses table is write-dead).
    availQuery,
    // No persisted band column — pull the inputs and run computeReadiness (the
    // same transparent function the coach Readiness board + Player Today use).
    // W2-G rewire: reads helm_lifting_readiness_checkins (resolved above into
    // checkinQuery — the legacy baseball_readiness_checkins table is write-dead).
    checkinQuery,
    db.from('baseball_fielding_events')
      .select('position, result, error_type, throw_velocity, measured_at, created_at')
      .eq('team_id', teamId).eq('player_id', playerId)
      .order('created_at', { ascending: false }).limit(500),
    db.from('baseball_catching_events')
      .select('event_type, pop_time, block_result, measured_at, created_at')
      .eq('team_id', teamId).eq('catcher_id', playerId)
      .order('created_at', { ascending: false }).limit(500),
    // Bodyweight trend — resolved above into bwQuery (the unified
    // helm_lifting_bodyweight_entries table; the legacy
    // baseball_bodyweight_entries table is write-dead).
    bwQuery,
    // Completed/assigned lift sessions in the trailing 30-day window — resolved
    // above into liftDoneQuery (the unified helm_lifting_sessions table).
    liftDoneQuery,
    // Next scheduled (assigned/started/modified) lift after today — resolved
    // above into liftNextQuery.
    liftNextQuery,
    supabase.from('baseball_player_classes')
      .select('class_name, semester, days, start_time, updated_at')
      .eq('player_id', playerId).order('updated_at', { ascending: false }).limit(40),
    // Only read private academic eligibility when this viewer is permitted; a
    // non-academic staff viewer never even fetches the GPA / standing / credits.
    canViewAcademics
      ? supabase.from('baseball_academic_eligibility')
          .select('academic_standing, gpa, is_eligible, credits_completed, credits_required, updated_at')
          .eq('player_id', playerId)
          .order('updated_at', { ascending: false }).limit(1).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase.from('baseball_videos')
      .select('id, title, thumbnail_url, is_clip, is_primary, view_count, created_at')
      .eq('player_id', playerId).order('created_at', { ascending: false }).limit(100),
    // Tasks assigned to the player (join via assignments) + dev plans.
    supabase.from('baseball_task_assignments')
      .select('status, completed_at, task:baseball_tasks(id, title, status, due_date)')
      .eq('player_id', playerId).limit(100),
    supabase.from('baseball_developmental_plans')
      .select('title, goals, status, coach_id, updated_at, coach:baseball_coaches(full_name)')
      .eq('player_id', playerId).eq('team_id', teamId)
      .order('updated_at', { ascending: false }).limit(5),
    // #379 — exit velocity is derived from the elite batted-ball event grain
    // (the canonical layer-3 source), not the deprecated flat per-session stat
    // table (previously "typed but un-migrated" per this file's own comment).
    // Scoped to the official/scrimmage contexts — the same default set
    // elite-stat-events.ts's canonical entry point uses — and to CURRENT rows
    // only (a corrected import supersedes the prior row via GAP 5's
    // superseded_by_run_id, mirrored from elite-stat-events.ts's own filter).
    // Ordered newest-first BEFORE the cap so the 500-row sample is the most
    // recent events, never an arbitrary PostgREST slice (#813) — mirrors the
    // fielding/catching event queries above.
    fromUntyped(db, 'baseball_batted_ball_events')
      .select('*')
      .eq('team_id', teamId).eq('batter_id', playerId)
      .in('data_context', ['official_game', 'scrimmage'])
      .is('superseded_by_run_id', null)
      .order('created_at', { ascending: false })
      .limit(500),
  ]);

  // Exit-velocity aggregation from real batted-ball events (honest: null when
  // none captured yet). Reuses elite-stat-events.ts's own pure aggregator so
  // the numbers match the Stats Lab exactly rather than a second derivation.
  const battedBalls = (evRes?.error ? [] : evRes?.data ?? []) as BaseballBattedBallEvent[];
  const hitterMetrics = buildHitterMetrics(playerId, [], battedBalls, 'official_game');
  const rawAvgExitVelocity =
    hitterMetrics.metrics.find((m) => m.metricKey === 'avg_exit_velocity')?.value ?? null;
  const avgExitVelocity =
    rawAvgExitVelocity != null ? Math.round(rawAvgExitVelocity * 10) / 10 : null;
  const evValues = hitterMetrics.visuals.evLaPoints
    .map((p) => p.exitVelocity)
    .filter((v): v is number => v != null && Number.isFinite(v));
  const maxExitVelocity = evValues.length ? Math.round(Math.max(...evValues) * 10) / 10 : null;

  // ---------------------------------------------------------------------------
  // Season stats -> Hitting + Pitching
  // ---------------------------------------------------------------------------
  const season = (seasonRes?.error ? null : seasonRes?.data ?? null) as null | {
    ab: number; avg: number | null; obp: number | null; slg: number | null; ops: number | null;
    hr: number; rbi: number; h: number; era: number | null; whip: number | null;
    k: number; bb: number; ip: number | null; sv: number; w: number; l: number;
    h_allowed: number; k_thrown: number; bb_allowed: number; g_p: number;
    last_updated: string | null; season_year: number;
  };
  if (seasonRes?.error) note('Season stats could not be loaded.');

  const agg = (aggRes?.error ? null : aggRes?.data ?? null) as null | {
    career_avg: number | null; career_obp: number | null; career_slg: number | null;
    career_ops: number | null; game_avg: number | null; practice_avg: number | null;
    last_5_avg: number | null; recent_trend: 'improving' | 'declining' | 'stable' | null;
    pressure_gap: number | null; total_sessions: number | null; updated_at: string | null;
  };

  const hasHittingData = !!(season && season.ab > 0) || !!(agg && (agg.total_sessions ?? 0) > 0);
  const hasPitchingData = !!(season && ((season.ip ?? 0) > 0 || season.g_p > 0 || season.k > 0));

  // Hitting card
  let hitting = emptyHitting();
  if (hasHittingData) {
    hitting = {
      present: true,
      trust: trustForSource(null, 'Season stats'),
      asOf: season?.last_updated ?? agg?.updated_at ?? null,
      avg: season?.avg ?? agg?.career_avg ?? null,
      obp: season?.obp ?? agg?.career_obp ?? null,
      slg: season?.slg ?? agg?.career_slg ?? null,
      ops: season?.ops ?? agg?.career_ops ?? null,
      hr: season?.hr ?? 0,
      rbi: season?.rbi ?? 0,
      ab: season?.ab ?? 0,
      avgExitVelocity,
      maxExitVelocity,
      seasonYear: season?.season_year ?? null,
    };
  }

  // Pitching card
  let pitching = emptyPitching();
  if (hasPitchingData && season) {
    const kbb = season.bb > 0 ? Math.round((season.k / season.bb) * 100) / 100 : (season.k > 0 ? season.k : null);
    pitching = {
      present: true,
      trust: trustForSource(null, 'Season pitching'),
      asOf: season.last_updated ?? null,
      era: season.era,
      whip: season.whip,
      k: season.k,
      bb: season.bb,
      ip: season.ip,
      sv: season.sv,
      w: season.w,
      l: season.l,
      hAllowed: season.h_allowed,
      kbb,
      // First-pitch-strike + strike% live on the box pitch grain, not season
      // totals; derived from box rows below when present, else honest null.
      firstPitchStrikePct: null,
      strikePct: null,
      appearances: season.g_p,
      seasonYear: season.season_year,
    };
  }

  // Enrich pitching strike% from box pitching rows (strikes / pitch_count).
  if (pitching.present) {
    const boxRes = await db.from('baseball_box_score_pitching')
      .select('strikes, pitch_count')
      .eq('player_id', playerId).eq('team_id', teamId).limit(200);
    if (!boxRes?.error) {
      const rows = (boxRes?.data ?? []) as Array<{ strikes: number | null; pitch_count: number | null }>;
      let strikes = 0, pitches = 0;
      for (const r of rows) {
        if (r.strikes != null && r.pitch_count != null && r.pitch_count > 0) {
          strikes += r.strikes; pitches += r.pitch_count;
        }
      }
      if (pitches > 0) pitching.strikePct = Math.round((strikes / pitches) * 1000) / 10;
    }
  }

  // ---------------------------------------------------------------------------
  // Defense / Catching
  // ---------------------------------------------------------------------------
  const fieldRows = (fieldRes?.error ? [] : fieldRes?.data ?? []) as Array<{
    position: string | null; result: string | null; error_type: string | null;
    throw_velocity: number | null; measured_at: string | null; created_at: string | null;
  }>;
  const catchRows = (catchRes?.error ? [] : catchRes?.data ?? []) as Array<{
    event_type: string | null; pop_time: number | null; block_result: string | null;
    measured_at: string | null; created_at: string | null;
  }>;
  const isCatcher = catchRows.length > 0 || /\b(c|catcher)\b/i.test(playerRes?.data?.primary_position ?? '');

  let defense = emptyDefense();
  if (fieldRows.length > 0 || catchRows.length > 0) {
    const chances = fieldRows.length;
    const errors = fieldRows.filter((r) => r.error_type != null || /error|e\b/i.test(r.result ?? '')).length;
    const throwVel = fieldRows.map((r) => r.throw_velocity).filter((v): v is number => v != null);
    const popTimes = catchRows.map((r) => r.pop_time).filter((v): v is number => v != null);
    const blocks = catchRows.filter((r) => r.event_type === 'block');
    const blockSuccess = blocks.filter((r) => /clean|success|blocked/i.test(r.block_result ?? '')).length;
    const receives = catchRows.filter((r) => r.event_type === 'receive').length;
    const throwdowns = catchRows.filter((r) => r.event_type === 'throwdown').length;
    const asOf = fieldRows[0]?.measured_at ?? fieldRows[0]?.created_at ?? catchRows[0]?.measured_at ?? catchRows[0]?.created_at ?? null;
    defense = {
      present: true,
      trust: trustForSource(null, isCatcher ? 'Catching events' : 'Fielding events'),
      asOf,
      isCatcher,
      chances,
      errors,
      fieldingPct: chances > 0 ? Math.round(((chances - errors) / chances) * 1000) / 1000 : null,
      avgThrowVelocity: throwVel.length ? Math.round((throwVel.reduce((a, b) => a + b, 0) / throwVel.length) * 10) / 10 : null,
      avgPopTime: popTimes.length ? Math.round((popTimes.reduce((a, b) => a + b, 0) / popTimes.length) * 100) / 100 : null,
      blockCount: blocks.length,
      blockSuccessPct: blocks.length ? Math.round((blockSuccess / blocks.length) * 1000) / 10 : null,
      receiveCount: receives,
      throwdownCount: throwdowns,
      primaryPosition: playerRes?.data?.primary_position ?? null,
    };
  }

  // ---------------------------------------------------------------------------
  // Performance (cross-context overview)
  // ---------------------------------------------------------------------------
  let performance = emptyPerformance();
  if (agg && (agg.total_sessions ?? 0) > 0) {
    performance = {
      present: true,
      trust: trustForSource(null, 'Captured sessions'),
      asOf: agg.updated_at ?? null,
      gameAvg: agg.game_avg,
      scrimmageAvg: agg.practice_avg,
      practiceAvg: agg.practice_avg,
      last5Avg: agg.last_5_avg,
      trend: agg.recent_trend ?? null,
      sessions: agg.total_sessions ?? 0,
      pressureGapPts: agg.pressure_gap != null ? Math.round(agg.pressure_gap * 1000) : null,
    };
  }

  // ---------------------------------------------------------------------------
  // Strength
  // ---------------------------------------------------------------------------
  // Active availability row — consumed by both the readiness computation (below)
  // and the header status (further down). Parsed once here.
  const avail = (availRes?.error ? null : availRes?.data ?? null) as null | {
    status: string | null; reason_category: string | null; starts_at: string | null;
  };

  const bwRows = (bwRes?.error ? [] : bwRes?.data ?? []) as Array<{ entry_date: string; weight_lbs: number }>;
  const liftDone = (liftDoneRes?.error ? [] : liftDoneRes?.data ?? []) as Array<{
    id: string; title: string | null; scheduled_date: string; status: string; completed_at: string | null;
  }>;
  const liftNext = (liftNextRes?.error ? null : liftNextRes?.data ?? null) as null | { title: string | null; scheduled_date: string };
  if (checkinRes?.error) note('Readiness check-in could not be loaded.');
  const checkinRow = (checkinRes?.error ? null : checkinRes?.data ?? null) as HelmLiftingReadinessCheckinRow | null;
  // Remap the helm row into the legacy field-name shape this function has
  // always built (check_date/sleep_hours/soreness_level/arm_status), so
  // computeReadiness() below is unchanged.
  const checkin: null | {
    id: string; check_date: string; sleep_hours: number | null; energy_level: number | null;
    stress_level: number | null; soreness_level: number | null;
    arm_status: 'fresh' | 'normal' | 'tight' | 'sore' | 'pain' | null;
    lower_body_status: number | null; illness_flag: boolean | null;
  } = checkinRow
    ? {
        id: checkinRow.id,
        check_date: checkinRow.checkin_date,
        sleep_hours: sleepQualityToHours(checkinRow.sleep_quality),
        energy_level: checkinRow.energy_level,
        stress_level: checkinRow.stress_level,
        soreness_level: checkinRow.soreness_overall,
        arm_status: extractArmStatusFromNotes(checkinRow.notes),
        lower_body_status: checkinRow.lower_body_status,
        illness_flag: checkinRow.illness_flag,
      }
    : null;

  // Soreness map for the latest check-in (drives card severity + readiness band).
  // helm_lifting_soreness_maps FKs checkin_id -> helm_lifting_readiness_checkins(id),
  // matching checkin.id above.
  let sorenessMax: number | null = null;
  let soreUpper = false;
  let soreLower = false;
  if (checkin?.id) {
    const soreRes = await fromUntyped(db, 'helm_lifting_soreness_maps').select('body_region, severity').eq('checkin_id', checkin.id);
    if (!soreRes?.error) {
      const rows = (soreRes?.data ?? []) as Array<{ body_region: string; severity: number }>;
      sorenessMax = rows.length ? Math.max(...rows.map((s) => s.severity)) : null;
      soreUpper = rows.some((s) => /arm|shoulder|elbow|chest|upper|back/i.test(s.body_region));
      soreLower = rows.some((s) => /leg|knee|hip|quad|hamstring|calf|ankle|lower/i.test(s.body_region));
    }
  }

  // 7-day-ish bodyweight delta (newest minus oldest of the trailing window).
  const bwNewest = bwRows[0];
  const bwOldest = bwRows[bwRows.length - 1];
  const bwDelta7d = bwRows.length >= 2 && bwNewest && bwOldest
    ? Math.round((bwNewest.weight_lbs - bwOldest.weight_lbs) * 10) / 10
    : null;

  // Compute the readiness band transparently from the check-in inputs (no band
  // column exists; this matches the coach board + Player Today).
  const readinessComp = checkin
    ? computeReadiness({
        playerId,
        checkDate: checkin.check_date,
        today,
        sleepHours: checkin.sleep_hours,
        energyLevel: checkin.energy_level,
        stressLevel: checkin.stress_level,
        sorenessLevel: checkin.soreness_level,
        armStatus: checkin.arm_status,
        lowerBodyStatus: checkin.lower_body_status,
        illnessFlag: Boolean(checkin.illness_flag),
        maxSorenessSeverity: sorenessMax,
        hasUpperSoreness: soreUpper,
        hasLowerSoreness: soreLower,
        bodyweightDelta7d: bwDelta7d,
        availabilityStatus: (avail?.status ?? null) as never,
      })
    : null;

  let strength = emptyStrength();
  const newestBw = bwNewest;
  const lastCompleted = liftDone.find((s) => s.status === 'completed') ?? null;
  const completedCount = liftDone.filter((s) => s.status === 'completed').length;
  const hasStrengthData = bwRows.length > 0 || liftDone.length > 0 || checkin != null;
  if (hasStrengthData) {
    strength = {
      present: true,
      trust: trustForSource('player', 'Lifting & readiness'),
      asOf: lastCompleted?.completed_at ?? newestBw?.entry_date ?? checkin?.check_date ?? null,
      bodyweightLbs: newestBw ? Math.round(newestBw.weight_lbs * 10) / 10 : null,
      bodyweightDelta: bwDelta7d,
      lastLiftDate: lastCompleted?.scheduled_date ?? null,
      lastLiftTitle: lastCompleted?.title ?? null,
      lastLiftStatus: lastCompleted?.status ?? null,
      completedCount,
      assignedCount: liftDone.length,
      completionPct: liftDone.length ? Math.round((completedCount / liftDone.length) * 1000) / 10 : null,
      sorenessMax,
      nextLiftDate: liftNext?.scheduled_date ?? null,
      nextLiftTitle: liftNext?.title ?? null,
    };
  }

  // ---------------------------------------------------------------------------
  // Classes & Availability
  // ---------------------------------------------------------------------------
  const classRows = (classesRes?.error ? [] : classesRes?.data ?? []) as Array<{
    class_name: string; semester: string | null; days: string[] | null; start_time: string | null; updated_at: string | null;
  }>;
  const eligibility = (eligibilityRes?.error ? null : eligibilityRes?.data ?? null) as null | {
    academic_standing: string | null; gpa: number | null; is_eligible: boolean | null;
    credits_completed: number | null; credits_required: number | null; updated_at: string | null;
  };
  let classes = emptyClasses();
  if (classRows.length > 0 || eligibility != null) {
    // Prefer the most-recent semester's classes for the headline count.
    const latestSemester = classRows[0]?.semester ?? null;
    const semClasses = latestSemester ? classRows.filter((c) => c.semester === latestSemester) : classRows;
    classes = {
      present: true,
      trust: trustForSource('player', 'Classes & academics'),
      asOf: classRows[0]?.updated_at ?? eligibility?.updated_at ?? null,
      classCount: semClasses.length,
      semester: latestSemester,
      classNames: semClasses.slice(0, 5).map((c) => c.class_name),
      // Private academic block — populated ONLY for permitted viewers. `eligibility`
      // is already null when !canViewAcademics (the read was skipped), but we null
      // every field explicitly so the gate is unmistakable and leak-proof.
      canViewAcademics,
      academicStanding: canViewAcademics ? (eligibility?.academic_standing ?? null) : null,
      gpa: canViewAcademics ? (eligibility?.gpa ?? null) : null,
      isEligible: canViewAcademics ? (eligibility?.is_eligible ?? null) : null,
      creditsCompleted: canViewAcademics ? (eligibility?.credits_completed ?? null) : null,
      creditsRequired: canViewAcademics ? (eligibility?.credits_required ?? null) : null,
    };
  }

  // ---------------------------------------------------------------------------
  // Video
  // ---------------------------------------------------------------------------
  const videoRows = (videosRes?.error ? [] : videosRes?.data ?? []) as Array<{
    id: string; title: string | null; thumbnail_url: string | null;
    is_clip: boolean | null; is_primary: boolean | null; view_count: number | null; created_at: string | null;
  }>;
  let video = emptyVideo();
  if (videoRows.length > 0) {
    const latest = videoRows[0];
    video = {
      present: true,
      trust: trustForSource(null, 'Video library'),
      asOf: latest?.created_at ?? null,
      total: videoRows.length,
      latestTitle: latest?.title ?? null,
      latestThumb: latest?.thumbnail_url ?? null,
      latestId: latest?.id ?? null,
      assignedCount: videoRows.filter((v) => v.is_clip === true).length,
      passportCount: videoRows.filter((v) => v.is_primary === true).length,
      reviewedCount: videoRows.filter((v) => (v.view_count ?? 0) > 0).length,
    };
  }

  // ---------------------------------------------------------------------------
  // Tasks & Development
  // ---------------------------------------------------------------------------
  const taskRows = (tasksRes?.error ? [] : tasksRes?.data ?? []) as Array<{
    status: string; completed_at: string | null;
    task: { id: string; title: string; status: string; due_date: string | null } | null;
  }>;
  const devRows = (devPlanRes?.error ? [] : devPlanRes?.data ?? []) as unknown as Array<{
    title: string; goals: unknown; status: string | null; coach_id: string;
    updated_at: string | null; coach: { full_name: string | null } | null;
  }>;
  const activeTaskRows = taskRows.filter((t) => t.task && t.status !== 'completed' && t.task.status !== 'completed');
  const overdue = activeTaskRows.filter((t) => t.task?.due_date != null && t.task.due_date < today);
  const activeDevPlans = devRows.filter((d) => d.status == null || d.status === 'active' || d.status === 'in_progress');
  const latestDev = activeDevPlans[0] ?? devRows[0] ?? null;
  const goalCount = latestDev && Array.isArray(latestDev.goals) ? latestDev.goals.length : 0;
  const ownerName = latestDev?.coach?.full_name?.trim() || null;
  let taskDev = emptyTaskDev();
  if (activeTaskRows.length > 0 || devRows.length > 0) {
    taskDev = {
      present: true,
      trust: trustForSource(null, 'Tasks & development'),
      asOf: latestDev?.updated_at ?? null,
      activeTasks: activeTaskRows.length,
      overdueTasks: overdue.length,
      taskTitles: activeTaskRows
        .slice()
        .sort((a, b) => (a.task?.due_date ?? '9999').localeCompare(b.task?.due_date ?? '9999'))
        .slice(0, 4)
        .map((t) => t.task?.title ?? 'Task'),
      devPlanCount: activeDevPlans.length,
      devPlanTitle: latestDev?.title ?? null,
      devPlanGoalCount: goalCount,
      staffOwner: ownerName,
      lastMeetingDate: null, // baseball_coach_notes (meeting notes) not yet wired; honest null.
    };
  }

  // ---------------------------------------------------------------------------
  // Header band
  // ---------------------------------------------------------------------------
  const role = inferRole({
    primaryPosition: playerRes?.data?.primary_position ?? null,
    secondaryPosition: playerRes?.data?.secondary_position ?? null,
    hasHitting: hitting.present,
    hasPitching: pitching.present,
    isCatcher,
  });

  // Status: derive from the active availability row (limited/hold/unavailable
  // map to limited/injured); default 'active' but flagged not-present so the UI
  // can show it as an assumed default rather than a confirmed status. (`avail`
  // was parsed earlier so the readiness computation could use it.)
  let status: SnapshotHeader['status'] = { present: false, value: 'active', note: null };
  if (avail?.status) {
    const v: SnapshotPlayerStatus =
      avail.status === 'unavailable' && avail.reason_category === 'injury_note' ? 'injured'
      : avail.status === 'unavailable' ? 'limited'
      : avail.status === 'limited' || avail.status === 'hold' || avail.status === 'return_to_play' ? 'limited'
      : 'active';
    status = { present: true, value: v, note: avail.reason_category };
  }

  // Readiness chip — from the transparent computeReadiness band (no stored band).
  const band = collapseBand(readinessComp?.band ?? null);
  const stale = checkin?.check_date
    ? (new Date(`${today}T00:00:00Z`).getTime() - new Date(`${checkin.check_date}T00:00:00Z`).getTime()) / 86400000 > staleDays
    : false;
  const readiness: SnapshotReadinessChip = checkin && readinessComp
    ? {
        present: true,
        band,
        label: bandLabel(band),
        tone: readinessBandTone(readinessComp.band),
        stale: stale || readinessComp.stale,
        checkDate: checkin.check_date,
      }
    : { present: false, band: null, label: null, tone: null, stale: false, checkDate: null };

  // Next event
  const nextEv = (nextEventRes?.error ? null : nextEventRes?.data ?? null) as null | {
    id: string; title: string; event_type: string; start_time: string; location: string | null;
  };
  const nextEvent: SnapshotNextEvent = nextEv
    ? { present: true, id: nextEv.id, title: nextEv.title, eventType: nextEv.event_type, startTime: nextEv.start_time, location: nextEv.location }
    : { present: false, id: null, title: null, eventType: null, startTime: null, location: null };

  // Latest signal (staff-visible, not-dismissed). Defense in depth on RLS.
  const signalRows = (signalRes?.error ? [] : signalRes?.data ?? []) as Array<{
    id: string; title: string; category: string | null; severity: string | null;
    confidence: number | null; created_at: string; disposition: string | null; visibility: string | null;
  }>;
  const liveSignal = signalRows.find(
    (s) => s.visibility !== 'restricted' && s.disposition !== 'dismissed' && s.disposition !== 'resolved',
  ) ?? signalRows[0] ?? null;
  const latestSignal: SnapshotLatestSignal = liveSignal
    ? {
        present: true,
        id: liveSignal.id,
        title: liveSignal.title,
        category: liveSignal.category,
        severity: liveSignal.severity,
        confidence: liveSignal.confidence != null && Number.isFinite(Number(liveSignal.confidence))
          ? Math.max(0, Math.min(1, Number(liveSignal.confidence))) : null,
        createdAt: liveSignal.created_at,
      }
    : { present: false, id: null, title: null, category: null, severity: null, confidence: null, createdAt: null };

  // Overall source-trust posture = the highest-trust present card source.
  const presentCards = [performance, hitting, pitching, defense, strength, classes, video, taskDev];
  const cardsPresent = presentCards.filter((c) => c.present).length;
  const trustRank: Record<string, number> = { official: 5, device_export: 4, imported: 3, staff_entered: 2, player_entered: 1 };
  const sourceTrust = presentCards
    .map((c) => c.trust)
    .filter((t): t is SourceTrust => t != null)
    .sort((a, b) => (trustRank[b.trustLevel ?? 'staff_entered'] ?? 0) - (trustRank[a.trustLevel ?? 'staff_entered'] ?? 0))[0] ?? null;

  const header: SnapshotHeader = {
    status,
    availability: avail
      ? { present: true, status: avail.status, reason: avail.reason_category }
      : { present: false, status: null, reason: null },
    readiness,
    nextEvent,
    latestSignal,
    role,
    roleLabel: roleLabel(role),
    sourceTrust,
    cardsPresent,
  };

  return {
    authorized: true,
    playerId,
    teamId,
    header,
    performance,
    hitting,
    pitching,
    defense,
    strength,
    classes,
    video,
    taskDev,
    error,
  };
}
