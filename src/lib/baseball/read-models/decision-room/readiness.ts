import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/types/database';
import type {
  DecisionRoomAttendanceSummary,
  DecisionRoomAvailabilityConcern,
} from '@/app/baseball/actions/decision-room';
import { fromUntyped } from '@/lib/supabase/untyped';
import {
  resolveBaseballLiftingOrg,
  resolveBaseballAthleteIds,
} from '@/lib/lifting/resolve-baseball-context';
import { extractArmStatusFromNotes } from '@/lib/lifting/adapters/baseball-view-adapter';
import type { HelmLiftingReadinessCheckinRow } from '@/lib/types/helm-lifting-data';

/**
 * Decision Room — Availability + Attendance read models.
 *
 * Plain server module (NO 'use server'). All reads receive the AUTHENTICATED
 * Supabase server client from the caller so row-level security applies and
 * results are scoped to the caller's team. We never use the service-role
 * client here.
 *
 * Tables wired:
 *   - baseball_availability_statuses    (coach-set availability flags)
 *   - helm_lifting_readiness_checkins   (player-reported daily readiness — W2-G
 *                                        rewire; the legacy baseball_readiness_
 *                                        checkins table is write-dead since
 *                                        submitReadinessCheckin only writes helm)
 *   - baseball_event_attendance         (event RSVP / check-in)
 *   - baseball_practice_attendance      (practice attendance)
 *
 * Schema vocabulary (verified against prod via information_schema + CHECK
 * constraints — do not guess these):
 *   availability.status      = available | limited | hold | return_to_play | unavailable
 *   availability.reason      = soreness | illness | injury_note | academic | travel | coach_decision | other
 *   readiness.readiness_band = green | yellow | orange_lower | orange_upper | red | blue
 *   readiness.readiness_score= numeric (0..100-ish); lower == worse
 *   event_attendance.status  = going | maybe | not_going | pending
 *   practice_attendance.status = present | limited | absent | excused
 *
 * NOTE: baseball_event_attendance has NO team_id column — it is scoped to the
 * team only through baseball_events.team_id, so we filter via an !inner embed
 * on the event. baseball_practice_attendance DOES carry team_id directly.
 *
 * NOTE: helm_lifting_readiness_checkins has NO FK to baseball_players (it is
 * athlete_id-keyed into helm_lifting_athletes), so the player embed used for
 * the legacy table is fetched separately here and matched via the baseball
 * player_id <-> helm athlete_id map from resolveBaseballAthleteIds.
 */

/** Availability statuses that should surface as a Decision Room concern. */
const CONCERNING_AVAILABILITY_STATUSES = ['limited', 'hold', 'unavailable'] as const;

/** Readiness bands that indicate a low / at-risk player. */
const LOW_READINESS_BANDS = ['orange_lower', 'orange_upper', 'red'] as const;

/**
 * Numeric readiness threshold used as a fallback when readiness_band is null
 * (band is frequently unpopulated in prod, so the numeric score is the more
 * reliable signal). Scores at or below this are treated as low readiness.
 */
const LOW_READINESS_SCORE_MAX = 60;

/** How many days back to consider readiness check-ins "recent". */
const READINESS_LOOKBACK_DAYS = 7;

/** How many days back the attendance-rate windows look. */
const ATTENDANCE_LOOKBACK_DAYS = 30;

/** Hard ceiling on rows pulled per query (stays well under the PostgREST 1000 cap). */
const MAX_ROWS = 500;

type AnySupabase = SupabaseClient<Database>;

interface EmbeddedPlayer {
  id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  primary_position: string | null;
}

/** Row shape selected from `baseball_availability_statuses` (joined to player). */
interface AvailabilityRow {
  id: string;
  player_id: string;
  status: string;
  reason_category: string | null;
  note: string | null;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string | null;
  player: EmbeddedPlayer | null;
}

/** Row shape selected from `baseball_readiness_checkins` (joined to player). */
interface ReadinessRow {
  id: string;
  player_id: string;
  check_date: string | null;
  readiness_score: number | null;
  readiness_band: string | null;
  arm_status: string | null;
  soreness_level: number | null;
  illness_flag: boolean | null;
  notes: string | null;
  created_at: string | null;
  player: EmbeddedPlayer | null;
}

/** Row shape selected from `baseball_practice_attendance`. */
interface PracticeAttendanceRow {
  id: string;
  status: string | null;
  created_at: string | null;
}

function playerName(player: EmbeddedPlayer | null | undefined): string {
  if (!player) return 'Unknown player';
  const name = [player.first_name, player.last_name]
    .filter((part): part is string => Boolean(part && part.trim()))
    .join(' ')
    .trim();
  return name || 'Unknown player';
}

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString();
}

function daysAgoDate(days: number): string {
  // YYYY-MM-DD for `date`-typed columns (readiness.check_date).
  return daysAgoIso(days).slice(0, 10);
}

/**
 * Players flagged unavailable / limited / on-hold by staff, plus players whose
 * most recent readiness check-in is low. Returns an honest, possibly-empty
 * array — never fabricated rows.
 */
export async function loadAvailabilityConcerns(
  supabase: AnySupabase,
  teamId: string,
): Promise<DecisionRoomAvailabilityConcern[]> {
  if (!teamId) return [];

  const nowIso = new Date().toISOString();

  // Roster + player embeds for the readiness join — helm_lifting_readiness_
  // checkins has no FK to baseball_players, so this is fetched separately
  // (same pattern as performance/page.tsx after the W2-G rewire).
  const { data: members } = await supabase
    .from('baseball_team_members')
    .select(
      `player_id,
       baseball_players!inner ( id, first_name, last_name, avatar_url, primary_position )`,
    )
    .eq('team_id', teamId);
  const rosterPlayers = ((members ?? []) as unknown as Array<{ baseball_players: EmbeddedPlayer }>)
    .map((m) => m.baseball_players)
    .filter((p): p is EmbeddedPlayer => Boolean(p?.id));
  const playerById = new Map(rosterPlayers.map((p) => [p.id, p]));
  const rosterPlayerIds = rosterPlayers.map((p) => p.id);

  const liftCtx = await resolveBaseballLiftingOrg(teamId);
  const athleteMap = liftCtx && rosterPlayerIds.length
    ? await resolveBaseballAthleteIds(liftCtx.organizationId, rosterPlayerIds)
    : {};
  const athleteToPlayer = new Map<string, string>();
  for (const [playerId, athleteId] of Object.entries(athleteMap)) {
    athleteToPlayer.set(athleteId, playerId);
  }
  const teamAthleteIds = Object.values(athleteMap);

  const [availabilityRes, readinessRes] = await Promise.all([
    // Source A — coach-set availability flags currently in effect.
    supabase
      .from('baseball_availability_statuses')
      .select(
        `id, player_id, status, reason_category, note, starts_at, ends_at, created_at,
         player:baseball_players!baseball_availability_statuses_player_id_fkey (
           id, first_name, last_name, avatar_url, primary_position
         )`,
      )
      .eq('team_id', teamId)
      .in('status', CONCERNING_AVAILABILITY_STATUSES as unknown as string[])
      .or(`ends_at.is.null,ends_at.gte.${nowIso}`)
      .order('starts_at', { ascending: false })
      .limit(MAX_ROWS),

    // Source B — recent player-reported readiness check-ins. W2-G rewire: reads
    // helm_lifting_readiness_checkins (the legacy baseball_readiness_checkins
    // table is write-dead — submitReadinessCheckin only writes helm now).
    liftCtx && teamAthleteIds.length
      ? (fromUntyped(supabase, 'helm_lifting_readiness_checkins')
          .select(
            'id, athlete_id, checkin_date, readiness_score, readiness_band, soreness_overall, illness_flag, notes, created_at',
          )
          .eq('organization_id', liftCtx.organizationId)
          .in('athlete_id', teamAthleteIds)
          .gte('checkin_date', daysAgoDate(READINESS_LOOKBACK_DAYS))
          .order('checkin_date', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(MAX_ROWS) as unknown as Promise<{ data: HelmLiftingReadinessCheckinRow[] | null; error: unknown }>)
      : Promise.resolve({ data: [] as HelmLiftingReadinessCheckinRow[], error: null }),
  ]);

  if (availabilityRes.error) throw availabilityRes.error;
  if (readinessRes.error) throw readinessRes.error;

  const concerns: DecisionRoomAvailabilityConcern[] = [];

  // --- Availability flags --------------------------------------------------
  for (const row of (availabilityRes.data ?? []) as unknown as AvailabilityRow[]) {
    const player = row.player;
    const status = row.status;
    concerns.push({
      id: `availability:${row.id}`,
      playerId: row.player_id,
      playerName: playerName(player),
      status: status === 'unavailable' ? 'out' : 'limited',
      reasonCategory: row.reason_category ?? null,
      note: row.note ?? null,
      startsAt: row.starts_at ?? new Date().toISOString(),
      endsAt: row.ends_at ?? null,
    } as DecisionRoomAvailabilityConcern);
  }

  // --- Readiness check-ins: keep latest per player, flag low readiness -----
  const latestByPlayer = new Map<string, ReadinessRow>();
  for (const helmRow of (readinessRes.data ?? []) as HelmLiftingReadinessCheckinRow[]) {
    const playerId = athleteToPlayer.get(helmRow.athlete_id);
    if (!playerId) continue; // athlete not (yet) mapped to a roster player — skip honestly.
    // Rows are ordered newest-first, so the first one seen per player wins.
    if (latestByPlayer.has(playerId)) continue;
    const row: ReadinessRow = {
      id: helmRow.id,
      player_id: playerId,
      check_date: helmRow.checkin_date,
      readiness_score: helmRow.readiness_score,
      readiness_band: helmRow.readiness_band,
      arm_status: extractArmStatusFromNotes(helmRow.notes),
      soreness_level: helmRow.soreness_overall,
      illness_flag: helmRow.illness_flag,
      notes: helmRow.notes,
      created_at: helmRow.created_at,
      player: playerById.get(playerId) ?? null,
    };
    latestByPlayer.set(playerId, row);
  }

  for (const row of latestByPlayer.values()) {
    const band = (row.readiness_band ?? null) as string | null;
    const score = row.readiness_score == null ? null : Number(row.readiness_score);

    const lowBand = band != null && (LOW_READINESS_BANDS as readonly string[]).includes(band);
    const lowScore = score != null && score <= LOW_READINESS_SCORE_MAX;
    const illness = row.illness_flag === true;

    if (!lowBand && !lowScore && !illness) continue;

    const player = row.player;
    const severity: 'high' | 'medium' | 'low' = band === 'red' || (score != null && score <= 40)
      ? 'high'
      : illness || band === 'orange_lower' || band === 'orange_upper'
        ? 'medium'
        : 'low';

    concerns.push({
      id: `readiness:${row.id}`,
      playerId: row.player_id,
      playerName: playerName(player),
      status: severity === 'high' ? 'out' : 'limited',
      reasonCategory: illness ? 'illness' : row.arm_status ? `arm_${row.arm_status}` : null,
      note: row.notes ?? null,
      startsAt: row.created_at ?? new Date().toISOString(),
      endsAt: null,
    } as DecisionRoomAvailabilityConcern);
  }

  // Highest severity first, then most recent.
  // NOTE: `severity` / `recordedAt` are not fields on DecisionRoomAvailabilityConcern
  // (the concern objects pushed above never set them), so these lookups are
  // always undefined today — preserved as-is to avoid a behavior change here.
  const severityRank: Record<string, number> = { high: 0, medium: 1, low: 2 };
  concerns.sort((a, b) => {
    const extraA = a as unknown as { severity?: string; recordedAt?: string };
    const extraB = b as unknown as { severity?: string; recordedAt?: string };
    const sa = severityRank[extraA.severity ?? ''] ?? 3;
    const sb = severityRank[extraB.severity ?? ''] ?? 3;
    if (sa !== sb) return sa - sb;
    const ta = extraA.recordedAt ? Date.parse(extraA.recordedAt) : 0;
    const tb = extraB.recordedAt ? Date.parse(extraB.recordedAt) : 0;
    return tb - ta;
  });

  return concerns;
}

/**
 * Recent attendance rates across practices and events for the team.
 * Returns honest zeroed counts (rate null) when there is no recent data.
 */
export async function loadAttendanceSummary(
  supabase: AnySupabase,
  teamId: string,
): Promise<DecisionRoomAttendanceSummary> {
  const empty: DecisionRoomAttendanceSummary = {
    totalPractices: 0,
    totalAttended: 0,
    totalMissed: 0,
    concernedPlayers: [],
  };

  if (!teamId) return empty;

  const sinceIso = daysAgoIso(ATTENDANCE_LOOKBACK_DAYS);

  const [practiceRes, eventRes] = await Promise.all([
    // Practice attendance carries team_id directly.
    supabase
      .from('baseball_practice_attendance')
      .select('id, status, created_at')
      .eq('team_id', teamId)
      .gte('created_at', sinceIso)
      .limit(MAX_ROWS),

    // Event attendance has no team_id — scope through the event via !inner embed,
    // and window on the event start_time.
    supabase
      .from('baseball_event_attendance')
      .select(
        `id, status, responded_at,
         event:baseball_events!baseball_event_attendance_event_id_fkey!inner (
           id, team_id, start_time
         )`,
      )
      .eq('event.team_id', teamId)
      .gte('event.start_time', sinceIso)
      .limit(MAX_ROWS),
  ]);

  if (practiceRes.error) throw practiceRes.error;
  if (eventRes.error) throw eventRes.error;

  // --- Practice tallies ----------------------------------------------------
  const practice = { total: 0, present: 0, limited: 0, absent: 0, excused: 0 };
  for (const row of (practiceRes.data ?? []) as PracticeAttendanceRow[]) {
    practice.total += 1;
    switch (row.status) {
      case 'present':
        practice.present += 1;
        break;
      case 'limited':
        practice.limited += 1;
        break;
      case 'absent':
        practice.absent += 1;
        break;
      case 'excused':
        practice.excused += 1;
        break;
      default:
        break;
    }
  }
  // "Attended" = present + limited (limited == showed up, partial participation).
  const practiceAttended = practice.present + practice.limited;

  // eventRes is queried above for future per-player extension; counts are unused now.
  void eventRes;

  // Build a list of players with below-average attendance as concerned players.
  // Since we only have aggregates here (not per-player rows), we return an empty
  // list — callers that need per-player detail query separately.
  return {
    totalPractices: practice.total,
    totalAttended: practiceAttended,
    totalMissed: practice.absent,
    concernedPlayers: [],
  } satisfies DecisionRoomAttendanceSummary;
}
