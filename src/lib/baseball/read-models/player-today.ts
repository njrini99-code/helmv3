// =============================================================================
// src/lib/baseball/read-models/player-today.ts
//
// Wave 3 / packet P3.2 — Player Today (daily loop) read model.
//
// The player-facing "what do I need to do / know today" feed for a single team.
// Composes the player's own:
//
//   1. schedule    — today's baseball_events for their team, each annotated with
//                    THIS player's acknowledgement status (acknowledged / pending).
//   2. recentStats — their last few games with a captured box score (active
//                    captures), source-labeled, so "Today" can show real
//                    recent activity. Reads baseball_box_score_batting /
//                    _pitching (joined to baseball_games) — the canonical
//                    layer-2 tables — not the deprecated flat per-session
//                    stat table this read model used before its #379
//                    migration. Box-score rows carry no CSV-import
//                    provenance columns (they are staff-entered via the
//                    box-score save flow, not imported), so each entry's
//                    trust/provenance chip is honestly null rather than a
//                    fabricated import stamp.
//   3. assignments — today's (and near-term upcoming) lift sessions for THIS
//                    player, read from helm_lifting_sessions — the unified Lab
//                    table the W2-G rewire moved publishLiftDay materialization,
//                    the Lifting-Lite quick-assign bridge (lifting.ts), and the
//                    Lift & Check-in card (player-today-lift.ts) onto. Reading the
//                    same table here keeps the daily loop's "Lifts Due" count in
//                    sync with what the card actually shows instead of two
//                    surfaces disagreeing on the same day's data (#456).
//   4. readiness   — the player's own most-recent readiness check-in
//                    (helm_lifting_readiness_checkins + soreness map + bodyweight
//                    trend + staff availability) run through the SAME transparent
//                    computeReadiness() the coach Readiness board uses. This puts
//                    the readiness gate ON the daily loop (the whole point of the
//                    "Today -> assignments/lift -> readiness gate" cycle) instead
//                    of leaving it only on the coach /dashboard/readiness page.
//                    Reads the unified Lab table (not the legacy
//                    baseball_readiness_checkins) so a check-in submitted via the
//                    Lift & Check-in card shows up here within one refresh.
//
// SELF ONLY: this read model resolves the current player from the auth session
// and only ever returns THAT player's data. It does not accept a player id from
// the caller. RLS backs every query.
//
// HONESTY (v12): readiness carries its own confidence + reasons + missing inputs
// and is `available:false` until the player submits a check-in — never a
// fabricated "green". The assignments feed shows only real session rows; an empty
// feed is correct, not a stub. Sub-read failures degrade to an honest empty feed
// + an `error` string; the daily loop never throws.
//
// 'server-only' + plain async functions (NOT 'use server').
// =============================================================================

import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { fromUntyped } from '@/lib/supabase/untyped';
import {
  resolveBaseballLiftingOrg,
  resolveMyBaseballAthleteId,
} from '@/lib/lifting/resolve-baseball-context';
import {
  resolveTeamTimezone,
  todayIsoInTz,
  localDayBoundsUtc,
} from '@/lib/baseball/daily-contract/contract-day';
import { buildSourceRef, type SourceRef } from '@/lib/baseball/source-record';
import type {
  SourceTrust,
  SourceProvenance,
} from '@/components/baseball/source-trust/source-trust-types';
import {
  computeReadiness,
  readinessBandLabel,
  readinessBandTone,
} from '@/lib/baseball/lifting/readiness-compute';
import type {
  BaseballReadinessBand,
  BaseballReadinessComputation,
} from '@/lib/types/baseball-lifting-v11';

// Some lifting/readiness result shapes are narrowed through hand-written V11
// domain types after selection. Keep this alias only for query-builder edges
// that still need local result shaping.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UntypedClient = any;

// -----------------------------------------------------------------------------
// Public shapes
// -----------------------------------------------------------------------------

export type AckStatus = 'acknowledged' | 'pending';

/**
 * The subset of baseball_actions.action_type values that are a real, completable
 * obligation FOR the player. A coach converting a signal into a `player_task`
 * (or any of these) assigns the player work — this feed is the player-side half
 * of the source -> signal -> action mechanic the staff Signal Inbox starts.
 * Staff-internal types (meeting_item, player_note, import_review, practice_block,
 * lift_modification) never appear here even if mis-assigned, because they are
 * filtered by visibility AND are not in this set.
 */
export type PlayerActionType =
  | 'player_task'
  | 'video_request'
  | 'message';

/** The action statuses that are still "live" for the player (must act on). */
export type PlayerActionStatus = 'open' | 'in_progress' | 'blocked';

/**
 * One coach-assigned action surfaced on the player's daily view. It is a real
 * obligation: the player can acknowledge it (open -> in_progress) and complete
 * it (-> completed), which feeds the staff outcome sweep. `sourceRef` cites the
 * originating signal so the player can see source -> signal -> assigned-to-you.
 */
export interface PlayerActionItem {
  id: string;
  actionType: PlayerActionType;
  title: string;
  detail: string | null;
  status: PlayerActionStatus;
  /** Optional due date (YYYY-MM-DD). */
  dueDate: string | null;
  /** True when due_date is today or earlier (drives the "due now" emphasis). */
  isDue: boolean;
  /** True when due_date is strictly before today (overdue). */
  isOverdue: boolean;
  /** The signal this action was converted from, when any (source provenance). */
  signalId: string | null;
  /** Render-ready provenance citing the originating signal/coach. */
  sourceRef: SourceRef;
  /** Normalized [0,1] confidence carried from the signal, or null. */
  confidence: number | null;
  createdAt: string;
}

/**
 * The player-action feed — "Today's assignments from your coach". `available` is
 * always true once the surface is wired; an empty `items` is honest (the coach
 * has not assigned anything), not a stub.
 */
export interface PlayerActionsFeed {
  available: boolean;
  items: PlayerActionItem[];
  /** Human note for the empty state. */
  note: string;
}

export interface PlayerTodayEvent {
  id: string;
  title: string;
  eventType: string;
  startTime: string;
  endTime: string | null;
  location: string | null;
  isMandatory: boolean;
  /** This player's acknowledgement state for the event. */
  ackStatus: AckStatus;
  acknowledgedAt: string | null;
}

export interface PlayerTodayStat {
  id: string;
  statType: string;
  sessionDate: string;
  sessionName: string | null;
  /** Provenance of this stat row (manual / csv_import / integration). */
  sourceRef: SourceRef;
  /**
   * GAP 3 — render-ready trust descriptor built from the import-stamped columns
   * (source_trust_level / match tier / confidence / import run / review state).
   * Always null for box-score-sourced rows (#379): box-score entries are
   * staff-entered via the box-score save flow, not imported, so there is no
   * stamped import provenance to describe — an honest null, never a
   * fabricated stamp. Kept as a real (not removed) field so the shape stays
   * ready for a future source that does carry stamped provenance.
   */
  trust: SourceTrust | null;
  /** Rich provenance for the drawer (opens the Import Dossier run). Same honesty note as `trust`. */
  provenance: SourceProvenance | null;
}

/**
 * A real lift session due for THIS player, read from helm_lifting_sessions.
 * `isToday` distinguishes today's work from near-term upcoming so the daily view
 * can lead with what's due now. `sourceRef` cites the session row (source ->
 * signal -> action: the player can open the session to log it).
 */
export interface PlayerTodayAssignment {
  id: string;
  title: string;
  scheduledDate: string;
  status: string;
  dayType: string | null;
  baseballContext: string | null;
  estimatedMinutes: number | null;
  isToday: boolean;
  /** Scheduled before today and still open — surfaced as "Overdue" on Today. */
  isOverdue: boolean;
  sourceRef: SourceRef;
}

/**
 * Assignments feed. `available` is true whenever the lift surface is wired (it
 * now always is); `items` is the real session list (empty is honest, not a stub).
 */
export interface PlayerTodayAssignmentsFeed {
  available: boolean;
  items: PlayerTodayAssignment[];
  /** Human note for the empty state. */
  note: string;
}

/**
 * The readiness gate on the daily loop. Mirrors the transparent
 * BaseballReadinessComputation the coach board uses, plus player-safe display
 * fields. `available:false` means the player has not submitted a check-in yet —
 * the daily view prompts them rather than fabricating a band.
 */
export interface PlayerTodayReadiness {
  /** False until the player submits today/recent check-in (honest gate prompt). */
  available: boolean;
  /** True once a check-in has ever been submitted (drives "update" vs "start"). */
  hasEverChecked: boolean;
  /** Whether TODAY's check-in is already submitted. */
  submittedToday: boolean;
  band: BaseballReadinessBand | null;
  bandLabel: string | null;
  /** cream/green status tone — no new palette. */
  tone: 'success' | 'warning' | 'error' | 'info' | null;
  reasons: string[];
  missingInputs: string[];
  stale: boolean;
  confidence: BaseballReadinessComputation['confidence'] | null;
  suggestedAction: string | null;
  /** YYYY-MM-DD of the check-in the band was computed from, if any. */
  checkDate: string | null;
  note: string;
}

// ---------------------------------------------------------------------------
// My Tasks (spec line 81) — tasks assigned to this player via baseball_tasks +
// baseball_task_assignments. Active (not completed / cancelled) only. An empty
// feed is honest — the coach has not assigned any tasks.
// ---------------------------------------------------------------------------

export interface PlayerTodayTaskItem {
  id: string;
  taskId: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  isDue: boolean;
  isOverdue: boolean;
  priority: string | null;
  category: string | null;
  assignmentStatus: string;
}

export interface PlayerTasksFeed {
  available: boolean;
  items: PlayerTodayTaskItem[];
  note: string;
}

// ---------------------------------------------------------------------------
// Player-visible coach notes (spec line 85) — baseball_coach_notes scoped to
// 'player_visible' for this player. Staff-only scopes are NEVER shown here.
// ---------------------------------------------------------------------------

export interface PlayerTodayCoachNote {
  id: string;
  body: string;
  title: string | null;
  createdAt: string;
  pinned: boolean;
}

export interface PlayerCoachNotesFeed {
  available: boolean;
  items: PlayerTodayCoachNote[];
  note: string;
}

// ---------------------------------------------------------------------------
// Practice group (spec line 84) — today's published practice from
// baseball_practices + the blocks with 'all' visibility. The practice-group
// table (baseball_practice_groups / baseball_group_assignments) does not yet
// exist in the schema; instead we surface today's published practice plan so
// the player sees what's on for today. Honest empty when no practice is
// scheduled.
// ---------------------------------------------------------------------------

export interface PlayerTodayPracticeBlock {
  id: string;
  activity: string;
  startOffsetMin: number;
  durationMin: number;
  location: string | null;
}

export interface PlayerPracticeGroupFeed {
  available: boolean;
  /** Today's published practice plan title, or null when none. */
  practiceTitle: string | null;
  practiceFocus: string | null;
  practiceId: string | null;
  /** Player-visible blocks for today's practice (visibility = 'all'). */
  blocks: PlayerTodayPracticeBlock[];
  note: string;
}

export interface PlayerTodayReadModel {
  /** Resolved from the session; null when the user is not a player on the team. */
  playerId: string | null;
  teamId: string;
  /** False when the current user is not a player-member of this team. */
  authorized: boolean;
  schedule: PlayerTodayEvent[];
  recentStats: PlayerTodayStat[];
  /** Today's + near-term lift sessions for this player (helm_lifting_sessions). */
  assignments: PlayerTodayAssignmentsFeed;
  /**
   * Coach-assigned actions (the player-side of source -> signal -> action). Reads
   * baseball_actions for this player; player-visible + active only. This is what
   * makes a converted `player_task` a real, completable obligation on Today.
   */
  coachActions: PlayerActionsFeed;
  /** The readiness gate computed from this player's own check-in. */
  readiness: PlayerTodayReadiness;
  /**
   * Player tasks assigned via baseball_tasks + baseball_task_assignments.
   * Spec line 81 — "My tasks" required card.
   */
  tasks: PlayerTasksFeed;
  /**
   * Player-visible coach notes (scope = 'player_visible') for this player.
   * Spec line 85 — "Player-visible coach note" required card.
   */
  coachNotes: PlayerCoachNotesFeed;
  /**
   * Today's published practice plan (baseball_practices). Surfaces as the
   * "Practice group" card (spec line 84). Honest empty when no practice is
   * published for today.
   */
  practiceGroup: PlayerPracticeGroupFeed;
  summary: {
    eventsToday: number;
    eventsPendingAck: number;
    recentStatCount: number;
    /** Lift sessions due TODAY for this player. */
    assignmentsToday: number;
    /** Open (not completed/skipped) lift sessions today. */
    assignmentsOpen: number;
    /**
     * Lift sessions the player still owes: due today PLUS overdue-but-open.
     * This is the count the right-rail Lift & Check-in card shows, so the
     * summary tile and the card never contradict each other.
     */
    assignmentsDue: number;
    /** Coach-assigned actions still live for the player (open/in_progress/blocked). */
    coachActionsOpen: number;
    /** Coach-assigned actions that are due today or overdue. */
    coachActionsDue: number;
    /** Whether the readiness gate is asking the player for action today. */
    readinessNeedsAttention: boolean;
    /** Active tasks assigned to this player (not completed/cancelled). */
    tasksOpen: number;
    /** Tasks due today or overdue. */
    tasksDue: number;
  };
  error: string | null;
}

// -----------------------------------------------------------------------------
// Options
// -----------------------------------------------------------------------------

export interface PlayerTodayOptions {
  /** ISO date (YYYY-MM-DD) to treat as "today"; defaults to server now. */
  forDate?: string;
  /** How many recent stat sessions to include (default 5). */
  recentStatLimit?: number;
}

// -----------------------------------------------------------------------------
// Player + membership resolution
// -----------------------------------------------------------------------------

interface ResolvedPlayer {
  userId: string | null;
  playerId: string | null;
  isMember: boolean;
}

async function resolvePlayer(
  supabase: Awaited<ReturnType<typeof createClient>>,
  teamId: string,
): Promise<ResolvedPlayer> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { userId: null, playerId: null, isMember: false };

  const { data: player } = await supabase
    .from('baseball_players')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!player) return { userId: user.id, playerId: null, isMember: false };

  const { data: member } = await supabase
    .from('baseball_team_members')
    .select('id')
    .eq('team_id', teamId)
    .eq('player_id', player.id)
    .maybeSingle();

  return { userId: user.id, playerId: player.id, isMember: !!member };
}

// -----------------------------------------------------------------------------
// Recent activity (#379 — canonical box-score source; see
// docs/baseball/stats-architecture.md for the three-layer stat model this
// read model no longer reads the deprecated flat/aggregate layer of)
// -----------------------------------------------------------------------------

/** One game this player has a captured box-score line for. */
interface RecentBoxScoreGame {
  id: string;
  game_date: string;
  game_type: string;
  opponent_name: string | null;
}

/**
 * This player's most recent games with a captured box-score line (batting OR
 * pitching), newest first. Reads baseball_box_score_batting/_pitching (game
 * ids only) then baseball_games for the display fields — the canonical
 * layer-2 tables, per #379's migration of this read model off the deprecated
 * flat/aggregate stat layer. Degrades to an honest empty list + error string
 * on a sub-read failure, matching this read model's existing fault-tolerance
 * convention.
 */
async function fetchRecentBoxScoreActivity(
  supabase: Awaited<ReturnType<typeof createClient>>,
  playerId: string,
  teamId: string,
  limit: number,
): Promise<{ data: RecentBoxScoreGame[]; error: string | null }> {
  const [battingRes, pitchingRes] = await Promise.all([
    supabase
      .from('baseball_box_score_batting')
      .select('game_id')
      .eq('player_id', playerId)
      .eq('team_id', teamId),
    supabase
      .from('baseball_box_score_pitching')
      .select('game_id')
      .eq('player_id', playerId)
      .eq('team_id', teamId),
  ]);
  if (battingRes.error || pitchingRes.error) {
    return { data: [], error: 'Your recent stats could not be loaded.' };
  }

  const gameIds = [
    ...new Set([
      ...(battingRes.data ?? []).map((r) => r.game_id),
      ...(pitchingRes.data ?? []).map((r) => r.game_id),
    ]),
  ];
  if (gameIds.length === 0) return { data: [], error: null };

  const { data: games, error: gamesErr } = await supabase
    .from('baseball_games')
    .select('id, game_date, game_type, opponent_name')
    .in('id', gameIds)
    .order('game_date', { ascending: false })
    .limit(limit);
  if (gamesErr) return { data: [], error: 'Your recent stats could not be loaded.' };

  return { data: (games ?? []) as RecentBoxScoreGame[], error: null };
}

// -----------------------------------------------------------------------------
// getPlayerToday
// -----------------------------------------------------------------------------

/**
 * Build the Player Today read model for the current player on `teamId`. Returns
 * `authorized:false` when the current user is not a player-member of the team.
 * Never throws — sub-read failures degrade to empty feeds + an `error` string.
 */
export async function getPlayerToday(
  teamId: string,
  options: PlayerTodayOptions = {},
): Promise<PlayerTodayReadModel> {
  const { forDate, recentStatLimit = 5 } = options;

  const emptyAssignments = (note: string): PlayerTodayAssignmentsFeed => ({
    available: true,
    items: [],
    note,
  });

  const emptyCoachActions = (note: string): PlayerActionsFeed => ({
    available: true,
    items: [],
    note,
  });

  const emptyTasks = (note: string): PlayerTasksFeed => ({
    available: true,
    items: [],
    note,
  });

  const emptyCoachNotes = (note: string): PlayerCoachNotesFeed => ({
    available: true,
    items: [],
    note,
  });

  const emptyPracticeGroup = (note: string): PlayerPracticeGroupFeed => ({
    available: false,
    practiceTitle: null,
    practiceFocus: null,
    practiceId: null,
    blocks: [],
    note,
  });

  const emptyReadiness = (note: string): PlayerTodayReadiness => ({
    available: false,
    hasEverChecked: false,
    submittedToday: false,
    band: null,
    bandLabel: null,
    tone: null,
    reasons: [],
    missingInputs: [],
    stale: false,
    confidence: null,
    suggestedAction: null,
    checkDate: null,
    note,
  });

  const base = (
    playerId: string | null,
    authorized: boolean,
    error: string | null,
  ): PlayerTodayReadModel => ({
    playerId,
    teamId,
    authorized,
    schedule: [],
    recentStats: [],
    assignments: emptyAssignments('No lifts scheduled for you right now.'),
    coachActions: emptyCoachActions('No assignments from your coach right now.'),
    readiness: emptyReadiness('Submit a check-in so your readiness shows here.'),
    tasks: emptyTasks('No tasks assigned to you right now.'),
    coachNotes: emptyCoachNotes('No notes from your coach right now.'),
    practiceGroup: emptyPracticeGroup('No practice plan published for today.'),
    summary: {
      eventsToday: 0,
      eventsPendingAck: 0,
      recentStatCount: 0,
      assignmentsToday: 0,
      assignmentsOpen: 0,
      assignmentsDue: 0,
      coachActionsOpen: 0,
      coachActionsDue: 0,
      readinessNeedsAttention: false,
      tasksOpen: 0,
      tasksDue: 0,
    },
    error,
  });

  if (!teamId) return base(null, false, 'A team id is required.');

  const supabase = await createClient();
  const me = await resolvePlayer(supabase, teamId);
  // resolvePlayer only ever sets playerId in the branch where userId is also
  // set (both come from the same authenticated-user path) -- but that's an
  // invariant of resolvePlayer's own control flow, not something TS can see
  // from these two independently-typed properties. Check userId here too so
  // it's narrowed to non-null once, at the source, instead of re-checked
  // later against a property TS still (correctly, from its view) sees as
  // nullable.
  if (!me.isMember || !me.playerId || !me.userId) {
    return base(me.playerId, false, null); // honest unauthorized envelope
  }
  const playerId = me.playerId;
  const userId = me.userId;

  // The TEAM's IANA tz is the single source of truth for "today" (mirrors the
  // Daily Contract read/write — see contract-day.ts). `forDate` (when passed by
  // the Today page) already carries this team-local calendar date; a caller
  // that omits it still gets the team-local day, not the server's UTC day.
  const teamTz = await resolveTeamTimezone(supabase, teamId);
  const day = forDate ?? todayIsoInTz(teamTz);
  // Event/practice filters below query a `timestamptz` column, so the boundary
  // itself must be the team-local midnight expressed in UTC — not a literal
  // `${day}T00:00:00.000Z`, which silently assumed the team's midnight IS UTC
  // midnight (wrong for every non-UTC team, worst in the evening local time).
  const { startUtcIso: dayStart, endUtcIso: dayEnd } = localDayBoundsUtc(day, teamTz);
  // Near-term upcoming window for assignments (today + next 6 days). Keeps the
  // daily loop forward-looking without dumping a whole program onto Today.
  // (Bare calendar-date arithmetic is tz-independent — see isoMinusDays.)
  const horizon = new Date(`${day}T00:00:00.000Z`);
  horizon.setUTCDate(horizon.getUTCDate() + 6);
  const horizonYmd = horizon.toISOString().slice(0, 10);

  // Keep a narrowed alias for V11 reads whose result shape is asserted into
  // hand-written domain contracts below.
  const db = supabase as UntypedClient;

  // Resolve Helm Lifting Lab context (org + this player's athlete id) once, up
  // front, so the Lifts Due + Readiness gate queries below read the SAME
  // unified helm_lifting_* tables the Lift & Check-in card
  // (player-today-lift.ts) and the write paths (lifting.ts, lifting-v11.ts)
  // already read from / write to (#456). A team with no lifting organization
  // configured, or a player not yet seeded in helm_lifting_athletes, degrades
  // to an honest empty feed below rather than an error.
  const liftCtx = await resolveBaseballLiftingOrg(teamId);
  const athleteId = liftCtx ? await resolveMyBaseballAthleteId(liftCtx.organizationId) : null;

  const [
    eventsRes,
    statsRes,
    assignmentsRes,
    coachActionsRes,
    checkinRes,
    tasksRes,
    coachNotesRes,
    practiceRes,
  ] = await Promise.all([
    supabase
      .from('baseball_events')
      .select('id, title, event_type, start_time, end_time, location, is_mandatory')
      .eq('team_id', teamId)
      .gte('start_time', dayStart)
      .lte('start_time', dayEnd)
      .order('start_time', { ascending: true }),
    // #379 — recent activity is now sourced from the canonical box-score
    // layer (baseball_box_score_batting/_pitching joined to baseball_games),
    // not the deprecated flat/aggregate stat layer.
    fetchRecentBoxScoreActivity(
      supabase,
      playerId,
      teamId,
      Math.min(Math.max(recentStatLimit, 1), 25),
    ),
    // Assignments: this player's OPEN lift sessions — overdue (still not done)
    // through the near-term horizon. Reads helm_lifting_sessions — the unified
    // Lab table publishLiftDay materializes into and the Lift & Check-in card
    // (player-today-lift.ts) reads. The card includes overdue-but-open sessions
    // (scheduled_date <= today, open status); this feed previously started its
    // window at `day` (>= today), so an overdue lift showed on the right-rail
    // card but NOT in the "Lifts Due" section or the summary tile — the page
    // contradicted itself (card: 2 overdue / body: 0 due). We now use the same
    // "open + not past horizon" window as the card so both surfaces agree.
    // Degrades to an honest empty result when the team has no lifting
    // organization or this player has no helm_lifting_athletes row yet.
    liftCtx && athleteId
      ? fromUntyped(supabase, 'helm_lifting_sessions')
          .select(
            'id, title, scheduled_date, status, day_type, sport_context, estimated_minutes',
          )
          .eq('athlete_id', athleteId)
          .eq('organization_id', liftCtx.organizationId)
          .lte('scheduled_date', horizonYmd)
          .in('status', ['assigned', 'started', 'modified'])
          .order('scheduled_date', { ascending: true })
          .limit(20)
      : Promise.resolve({ data: [], error: null }),
    // Coach-assigned actions (the PLAYER side of source -> signal -> action). The
    // staff Signal Inbox converts a signal into a baseball_actions row assigned to
    // a player; this is the read that finally surfaces it ON the player. RLS
    // already scopes baseball_actions to (a) staff OR (b) the assignee player on a
    // player-visible row, so this query can never return another player's work or
    // a staff_only action. We additionally filter to the player-facing action
    // types + active statuses + non-staff visibility as defense in depth, and
    // exclude lift_modification: its conversion (signals.ts materializeActionObject
    // case 'lift_modification') writes directly to the unified helm_lifting_sessions
    // table (rewired off the graveyarded baseball_lift_assignments table), which
    // the Lifts-Due feed above already reads — so it is excluded here to avoid a
    // double-show, never a staff-internal action leaking onto the player.
    db
      .from('baseball_actions')
      .select(
        'id, signal_id, action_type, title, detail, status, due_date, visibility, confidence, created_at',
      )
      .eq('assignee_player_id', playerId)
      .eq('team_id', teamId)
      .in('action_type', ['player_task', 'video_request', 'message'])
      .in('status', ['open', 'in_progress', 'blocked'])
      .in('visibility', ['team', 'player_only'])
      .order('due_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(30),
    // Readiness: this player's most-recent check-in (any day) so the gate can show
    // a band + flag staleness honestly. Reads helm_lifting_readiness_checkins —
    // the unified Lab table submitReadinessCheckin (lifting.ts) writes and the
    // Lift & Check-in card reads — so a submitted check-in shows up on the
    // readiness gate within one refresh (#456). RLS scopes to self.
    liftCtx && athleteId
      ? fromUntyped(supabase, 'helm_lifting_readiness_checkins')
          .select(
            'id, checkin_date, sleep_quality, energy_level, stress_level, soreness_overall, lower_body_status, illness_flag, notes',
          )
          .eq('athlete_id', athleteId)
          .eq('organization_id', liftCtx.organizationId)
          .order('checkin_date', { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    // My Tasks (spec line 81): baseball_task_assignments JOIN baseball_tasks for
    // this player — active assignments only (not completed/cancelled). The typed
    // client covers these tables (they are in database.ts). We join via a
    // nested select so a single query returns the task title/meta + assignment
    // status without an N+1.
    supabase
      .from('baseball_task_assignments')
      .select('id, status, task_id, baseball_tasks(id, title, description, due_date, priority, category)')
      .eq('player_id', playerId)
      .not('status', 'in', '(completed,cancelled)')
      .order('task_id', { ascending: true })
      .limit(20),
    // Player-visible coach notes (spec line 85): baseball_coach_notes where
    // scope = 'player_visible' AND player_id = me AND team_id = teamId AND NOT
    // archived (archived_at is null). Staff-only scopes are NEVER shown.
    // Columns verified live against the deployed table: it DOES have
    // title / pinned / archived_at — the soft-delete column is `archived_at`,
    // NOT `deleted_at`. The previous query filtered `.is('deleted_at', null)`
    // on a non-existent column, which made every read fail and surfaced the
    // spurious "Your coach notes could not be loaded." banner on Today. We now
    // select the real title/pinned columns so the note cards render with their
    // heading + pin state instead of stripping them to null.
    supabase
      .from('baseball_coach_notes')
      .select('id, title, body, pinned, created_at')
      .eq('player_id', playerId)
      .eq('team_id', teamId)
      .eq('scope', 'player_visible')
      .is('archived_at', null)
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(5),
    // Practice group (spec line 84): today's published practice plan for the
    // team. Uses baseball_practices + baseball_practice_blocks (visibility='all').
    // A player sees the plan title/focus + any blocks marked player-visible.
    //
    // Date filtering: baseball_practices has no own date column — it links via
    // event_id → baseball_events.start_time. Use an inner join on baseball_events
    // and filter to the current day's window so only today's practice appears.
    // This mirrors the pattern in command-center/page.tsx. Falls back to an honest
    // empty state (available:false) when no practice is linked to today's event.
    db
      .from('baseball_practices')
      .select(
        `id, title, focus, published_at,
         baseball_practice_blocks(id, activity, start_offset_min, duration_min, location, visibility),
         baseball_events!inner(start_time)`,
      )
      .eq('team_id', teamId)
      .eq('status', 'published')
      .not('published_at', 'is', null)
      .gte('baseball_events.start_time', dayStart)
      .lte('baseball_events.start_time', dayEnd)
      .order('published_at', { ascending: false })
      .limit(1),
  ]);

  let error: string | null = null;

  // ---- Acknowledgements for today's events (this user only) ----
  const eventRows = eventsRes.error ? [] : eventsRes.data ?? [];
  let ackByEvent = new Map<string, string>(); // event_id -> acknowledged_at
  if (eventsRes.error) {
    error = 'Your schedule could not be loaded.';
  } else if (eventRows.length > 0) {
    const eventIds = eventRows.map((e) => e.id);
    const { data: acks, error: ackErr } = await supabase
      .from('baseball_event_acknowledgements')
      .select('event_id, acknowledged_at')
      .eq('user_id', userId)
      .in('event_id', eventIds);
    if (ackErr) {
      // Direct assignment: this branch is mutually exclusive with the
      // schedule-error branch above, so `error` is provably still null here
      // (CodeQL js/trivial-conditional flagged the dead `error ??`).
      error = 'Acknowledgement status could not be loaded.';
    } else {
      ackByEvent = new Map(
        (acks ?? []).map((a) => [a.event_id, a.acknowledged_at]),
      );
    }
  }

  const schedule: PlayerTodayEvent[] = eventRows.map((e) => {
    const acknowledgedAt = ackByEvent.get(e.id) ?? null;
    return {
      id: e.id,
      title: e.title,
      eventType: e.event_type,
      startTime: e.start_time,
      endTime: e.end_time,
      location: e.location,
      isMandatory: e.is_mandatory === true,
      ackStatus: acknowledgedAt ? 'acknowledged' : 'pending',
      acknowledgedAt,
    };
  });

  // ---- Recent stats (active captures) ----
  // #379 — sourced from box-score/season-era games (canonical layer 2), not
  // the deprecated flat/aggregate stat layer. Box-score rows carry no
  // CSV-import provenance columns (staff-entered via the box-score save flow,
  // not imported), so trust/provenance are honestly null rather than a
  // fabricated import stamp.
  const recentStats: PlayerTodayStat[] = [];
  if (statsRes.error) {
    error = error ?? statsRes.error;
  } else {
    for (const g of statsRes.data) {
      recentStats.push({
        id: g.id,
        statType: g.game_type,
        sessionDate: g.game_date,
        sessionName: g.opponent_name ? `vs ${g.opponent_name}` : null,
        sourceRef: buildSourceRef({ source: 'manual', sourceId: g.id, label: 'Box score' }),
        trust: null,
        provenance: null,
      });
    }
  }

  const eventsPendingAck = schedule.filter((e) => e.ackStatus === 'pending').length;

  // ---- Assignments (this player's lift sessions: today + near-term) ----
  let assignments: PlayerTodayAssignmentsFeed = emptyAssignments(
    'No lifts scheduled for you right now.',
  );
  if (assignmentsRes?.error) {
    error = error ?? 'Your lift assignments could not be loaded.';
    // available stays true; an empty-but-available feed is the honest fallback.
  } else {
    const rows = (assignmentsRes?.data ?? []) as Array<{
      id: string;
      title: string | null;
      scheduled_date: string;
      status: string;
      day_type: string | null;
      sport_context: string | null;
      estimated_minutes: number | null;
    }>;
    const items: PlayerTodayAssignment[] = rows.map((r) => ({
      id: r.id,
      title: r.title ?? 'Lift',
      scheduledDate: r.scheduled_date,
      status: r.status,
      dayType: r.day_type,
      baseballContext: r.sport_context,
      estimatedMinutes: r.estimated_minutes,
      isToday: r.scheduled_date === day,
      // Scheduled before today and still open (the query only returns
      // assigned/started/modified) → overdue. Surfaced with an "Overdue" label
      // so the player can lead with what they still owe.
      isOverdue: r.scheduled_date < day,
      // The lift session row is the source object (source -> signal -> action:
      // opening the session is the action). sourceId cites the session id.
      sourceRef: buildSourceRef({
        source: 'manual',
        sourceId: r.id,
        label: 'Lift session',
      }),
    }));
    // Surface what's owed first: overdue, then today, then upcoming — matching
    // the right-rail card's "open sessions first" ordering.
    items.sort((a, b) => {
      const rank = (x: PlayerTodayAssignment) =>
        x.isOverdue ? 0 : x.isToday ? 1 : 2;
      const ra = rank(a);
      const rb = rank(b);
      if (ra !== rb) return ra - rb;
      return a.scheduledDate.localeCompare(b.scheduledDate);
    });
    assignments = {
      available: true,
      items,
      note:
        items.length === 0
          ? 'No lifts scheduled for you right now.'
          : 'Open a session to log your sets.',
    };
  }
  const assignmentsToday = assignments.items.filter((a) => a.isToday).length;
  // "Open" = today's sessions still needing work. The query already filters to
  // active statuses (assigned/started/modified), so every today row is open; this
  // guards defensively against any terminal status slipping through.
  const TERMINAL_LIFT_STATUSES = new Set(['completed', 'missed', 'excused']);
  const assignmentsOpen = assignments.items.filter(
    (a) => a.isToday && !TERMINAL_LIFT_STATUSES.has(a.status),
  ).length;
  // "Due" = everything the player still owes right now: due today PLUS overdue.
  // This is the figure the right-rail Lift & Check-in card shows, so the summary
  // tile and the card can never disagree (the reconciliation the QA flagged).
  const assignmentsDue = assignments.items.filter(
    (a) => (a.isToday || a.isOverdue) && !TERMINAL_LIFT_STATUSES.has(a.status),
  ).length;

  // ---- Coach-assigned actions (player side of source -> signal -> action) ----
  let coachActions: PlayerActionsFeed = emptyCoachActions(
    'No assignments from your coach right now.',
  );
  if (coachActionsRes?.error) {
    error = error ?? 'Your coach assignments could not be loaded.';
    // available stays true; an empty-but-available feed is the honest fallback.
  } else {
    const rows = (coachActionsRes?.data ?? []) as Array<{
      id: string;
      signal_id: string | null;
      action_type: string;
      title: string;
      detail: string | null;
      status: string;
      due_date: string | null;
      visibility: string;
      confidence: number | null;
      created_at: string;
    }>;
    const items: PlayerActionItem[] = rows
      // Belt-and-suspenders: the query already constrains these, but never trust a
      // status/visibility that slipped through (e.g. a future enum value).
      .filter(
        (r) =>
          (r.status === 'open' ||
            r.status === 'in_progress' ||
            r.status === 'blocked') &&
          r.visibility !== 'staff_only' &&
          (r.action_type === 'player_task' ||
            r.action_type === 'video_request' ||
            r.action_type === 'message'),
      )
      .map((r) => {
        const isOverdue = r.due_date != null && r.due_date < day;
        const isDue = r.due_date != null && r.due_date <= day;
        return {
          id: r.id,
          actionType: r.action_type as PlayerActionType,
          title: r.title,
          detail: r.detail,
          status: r.status as PlayerActionStatus,
          dueDate: r.due_date,
          isDue,
          isOverdue,
          signalId: r.signal_id,
          // Provenance: the action came FROM a signal. Cite that signal id so the
          // player can trace source -> signal -> assigned-to-you. When there is no
          // signal (a directly-created action), fall back to a coach-assignment
          // label rather than a fabricated source.
          sourceRef: buildSourceRef({
            source: r.signal_id ? 'system' : 'manual',
            sourceId: r.signal_id,
            label: r.signal_id ? 'From a coaching signal' : 'Coach assignment',
          }),
          confidence:
            r.confidence != null && Number.isFinite(Number(r.confidence))
              ? Number(r.confidence)
              : null,
          createdAt: r.created_at,
        };
      });
    coachActions = {
      available: true,
      items,
      note:
        items.length === 0
          ? 'No assignments from your coach right now.'
          : 'Acknowledge an assignment to start it, then mark it done when finished.',
    };
  }
  const coachActionsOpen = coachActions.items.length;
  const coachActionsDue = coachActions.items.filter((a) => a.isDue).length;

  // ---- Readiness gate (this player's own check-in -> computeReadiness) ----
  let readiness: PlayerTodayReadiness = emptyReadiness(
    'Submit a check-in so your readiness shows here.',
  );
  if (checkinRes?.error) {
    error = error ?? 'Your readiness check-in could not be loaded.';
  } else {
    const checkin = (checkinRes?.data ?? null) as {
      id: string;
      checkin_date: string;
      sleep_quality: number | null;
      energy_level: number | null;
      stress_level: number | null;
      soreness_overall: number | null;
      lower_body_status: number | null;
      illness_flag: boolean | null;
      notes: string | null;
    } | null;

    if (checkin) {
      // helm_lifting_readiness_checkins has no dedicated arm_status column;
      // submitReadinessCheckin (lifting.ts) encodes it into notes as
      // "arm_status: <value>" on write — extract it the same way the Lift &
      // Check-in card's adapter (adaptHelmReadinessCheckin) does.
      type ArmStatus = 'fresh' | 'normal' | 'tight' | 'sore' | 'pain' | null;
      let armStatus: ArmStatus = null;
      if (checkin.notes) {
        const armMatch = checkin.notes.match(/arm_status:\s*(fresh|normal|tight|sore|pain)/i);
        if (armMatch?.[1]) {
          armStatus = armMatch[1].toLowerCase() as ArmStatus;
        }
      }
      // sleep_hours -> sleep_quality was a lossy 1-5 quintile mapping on write
      // (submitReadinessCheckin); reverse it the same way the adapter does.
      const sleepHours = checkin.sleep_quality != null ? checkin.sleep_quality * 2 : null;

      // Enrich with the same signals the coach board uses: the soreness map for
      // this check-in, a 7-day bodyweight trend, and active staff availability.
      // All best-effort: a missing enrichment read degrades the band's inputs to
      // null (computeReadiness stays honest) rather than failing the daily loop.
      // The soreness map is keyed off THIS checkin's id, so it reads the same
      // unified helm_lifting_soreness_maps table the checkin now lives in.
      // Bodyweight + availability also live in the unified helm_lifting_*
      // tables (athlete_id-keyed) — liftCtx/athleteId were already resolved
      // above (this branch only runs when the checkin query, gated on the
      // same liftCtx/athleteId, returned a row).
      const [soreRes, bwRes, availRes] = await Promise.all([
        fromUntyped(supabase, 'helm_lifting_soreness_maps')
          .select('body_region, severity')
          .eq('checkin_id', checkin.id),
        liftCtx && athleteId
          ? fromUntyped(supabase, 'helm_lifting_bodyweight_entries')
              .select('entry_date, weight_lbs')
              .eq('organization_id', liftCtx.organizationId)
              .eq('athlete_id', athleteId)
              .order('entry_date', { ascending: false })
              .limit(8)
          : Promise.resolve({ data: [], error: null }),
        liftCtx && athleteId
          ? fromUntyped(supabase, 'helm_lifting_availability_statuses')
              .select('status, starts_at')
              .eq('organization_id', liftCtx.organizationId)
              .eq('athlete_id', athleteId)
              .order('starts_at', { ascending: false })
              .limit(1)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);

      const soreList = (soreRes?.data ?? []) as Array<{
        body_region: string;
        severity: number;
      }>;
      const maxSeverity = soreList.length
        ? Math.max(...soreList.map((s) => s.severity))
        : null;
      const hasUpper = soreList.some((s) =>
        /arm|shoulder|elbow|chest|upper|back/i.test(s.body_region),
      );
      const hasLower = soreList.some((s) =>
        /leg|knee|hip|quad|hamstring|calf|ankle|lower/i.test(s.body_region),
      );

      const bwRows = (bwRes?.data ?? []) as Array<{
        entry_date: string;
        weight_lbs: number;
      }>;
      let bwDelta7d: number | null = null;
      const newest = bwRows[0];
      const oldest = bwRows[bwRows.length - 1];
      if (bwRows.length >= 2 && newest && oldest) {
        bwDelta7d = Math.round((newest.weight_lbs - oldest.weight_lbs) * 10) / 10;
      }

      const availStatus =
        (availRes?.data as { status: string } | null)?.status ?? null;

      const comp = computeReadiness({
        playerId,
        checkDate: checkin.checkin_date,
        today: day,
        sleepHours,
        energyLevel: checkin.energy_level,
        stressLevel: checkin.stress_level,
        // soreness_overall is written 1-5 by submitReadinessCheckin (same
        // semantics as the legacy 1-5 soreness_level — see
        // adaptHelmReadinessCheckin), so no rescale is needed here.
        sorenessLevel: checkin.soreness_overall,
        armStatus,
        lowerBodyStatus: checkin.lower_body_status,
        illnessFlag: Boolean(checkin.illness_flag),
        maxSorenessSeverity: maxSeverity,
        hasUpperSoreness: hasUpper,
        hasLowerSoreness: hasLower,
        bodyweightDelta7d: bwDelta7d,
        availabilityStatus: availStatus as never,
      });

      readiness = {
        available: true,
        hasEverChecked: true,
        submittedToday: checkin.checkin_date === day,
        band: comp.band,
        bandLabel: readinessBandLabel(comp.band),
        tone: readinessBandTone(comp.band),
        reasons: comp.reasons,
        missingInputs: comp.missing_inputs,
        stale: comp.stale,
        confidence: comp.confidence,
        suggestedAction: comp.suggested_action,
        checkDate: checkin.checkin_date,
        note:
          checkin.checkin_date === day
            ? 'Your readiness for today.'
            : 'Based on your last check-in — submit a new one for today.',
      };
    }
  }

  // The gate "needs attention" when there is no today check-in, the band is
  // stale, or the band recommends a modification/hold (anything but a confident
  // green for today).
  const readinessNeedsAttention =
    !readiness.submittedToday ||
    readiness.stale ||
    (readiness.band != null && readiness.band !== 'green');

  // ---- My Tasks (spec line 81) — baseball_task_assignments → baseball_tasks ----
  let tasks: PlayerTasksFeed = emptyTasks('No tasks assigned to you right now.');
  if (tasksRes?.error) {
    error = error ?? 'Your tasks could not be loaded.';
  } else {
    const taskRows = (tasksRes?.data ?? []) as Array<{
      id: string;
      status: string;
      task_id: string;
      baseball_tasks: {
        id: string;
        title: string;
        description: string | null;
        due_date: string | null;
        priority: string | null;
        category: string | null;
      } | null;
    }>;
    const taskItems: PlayerTodayTaskItem[] = taskRows
      .filter((r) => r.baseball_tasks != null)
      .map((r) => {
        const t = r.baseball_tasks!;
        const isOverdue = t.due_date != null && t.due_date < day;
        const isDue = t.due_date != null && t.due_date <= day;
        return {
          id: r.id,
          taskId: t.id,
          title: t.title,
          description: t.description,
          dueDate: t.due_date,
          isDue,
          isOverdue,
          priority: t.priority,
          category: t.category,
          assignmentStatus: r.status,
        };
      });
    tasks = {
      available: true,
      items: taskItems,
      note:
        taskItems.length === 0
          ? 'No tasks assigned to you right now.'
          : 'Complete your assigned tasks and mark them done when finished.',
    };
  }
  const tasksOpen = tasks.items.length;
  const tasksDue = tasks.items.filter((t) => t.isDue).length;

  // ---- Player-visible coach notes (spec line 85) — baseball_coach_notes ----
  let coachNotes: PlayerCoachNotesFeed = emptyCoachNotes(
    'No notes from your coach right now.',
  );
  if (coachNotesRes?.error) {
    error = error ?? 'Your coach notes could not be loaded.';
  } else {
    const noteRows = (coachNotesRes?.data ?? []) as Array<{
      id: string;
      title: string | null;
      body: string;
      pinned: boolean | null;
      created_at: string;
    }>;
    const noteItems: PlayerTodayCoachNote[] = noteRows.map((n) => ({
      id: n.id,
      body: n.body,
      title: n.title ?? null,
      createdAt: n.created_at,
      pinned: n.pinned ?? false,
    }));
    coachNotes = {
      available: true,
      items: noteItems,
      note:
        noteItems.length === 0
          ? 'No notes from your coach right now.'
          : 'Notes your coach has shared with you.',
    };
  }

  // ---- Practice group / today's practice plan (spec line 84) ----
  let practiceGroup: PlayerPracticeGroupFeed = emptyPracticeGroup(
    'No practice plan published for today.',
  );
  if (practiceRes?.error) {
    error = error ?? 'Today\'s practice plan could not be loaded.';
  } else {
    const practiceRows = (practiceRes?.data ?? []) as Array<{
      id: string;
      title: string;
      focus: string | null;
      published_at: string | null;
      baseball_practice_blocks: Array<{
        id: string;
        activity: string;
        start_offset_min: number;
        duration_min: number;
        location: string | null;
        visibility: string;
      }>;
    }>;
    // The query already filtered to practices whose linked event starts today
    // (via baseball_events!inner + dayStart/dayEnd). At most 1 row is returned.
    // An honest empty is fine when no practice is linked to today's event.
    const practice = practiceRows[0] ?? null;
    if (practice) {
      const visibleBlocks: PlayerTodayPracticeBlock[] = (
        practice.baseball_practice_blocks ?? []
      )
        // Only show player-visible blocks (never show staff_only blocks here).
        .filter(
          (b) =>
            b.visibility === 'all' ||
            b.visibility === 'player_visible' ||
            b.visibility === 'public',
        )
        .map((b) => ({
          id: b.id,
          activity: b.activity,
          startOffsetMin: b.start_offset_min,
          durationMin: b.duration_min,
          location: b.location,
        }));
      practiceGroup = {
        available: true,
        practiceTitle: practice.title,
        practiceFocus: practice.focus,
        practiceId: practice.id,
        blocks: visibleBlocks,
        note:
          visibleBlocks.length === 0
            ? 'Practice plan published — details shown to coaching staff.'
            : 'Your practice plan for today.',
      };
    }
  }

  return {
    playerId,
    teamId,
    authorized: true,
    schedule,
    recentStats,
    assignments,
    coachActions,
    readiness,
    tasks,
    coachNotes,
    practiceGroup,
    summary: {
      eventsToday: schedule.length,
      eventsPendingAck,
      recentStatCount: recentStats.length,
      assignmentsToday,
      assignmentsOpen,
      assignmentsDue,
      coachActionsOpen,
      coachActionsDue,
      readinessNeedsAttention,
      tasksOpen,
      tasksDue,
    },
    error,
  };
}
