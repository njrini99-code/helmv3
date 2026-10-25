import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { chLogServer } from '../lib/track-server';
import { dayInZone, fetchLiveSnapshot } from '../live/live-queries';
import { laneMatchesScope, type LiveScope } from '../live/scope';
import { EMPTY_SNAPSHOT, type LiveLane, type LiveSnapshot } from '../live/model';
import { loadTeamZone } from './season';
import { calculateStatsFromShots, type HoleInfo, type RawShot, type RoundInfo } from '@/lib/utils/golf-stats-calculator-shots';

export type { LiveScope } from '../live/scope';

/**
 * Live rounds (P-6): the first paint of Home's Live now card, the live view, the player's own card and the teammates
 * card. One server read through the viewer's own session, so RLS decides who sees what: a coach sees the rounds their
 * players share (and every qualifier and tournament round), a player sees their own and, when they are not on the course
 * themselves, the practice rounds teammates shared with the team. The client hook polls the same reads afterwards
 * (`live/live-queries.ts`). Until held migration 20261025050000 is applied the table is absent and this reads the v0 poll
 * (qualifier and tournament rounds only); nothing here writes, and shot tracking is untouched.
 */

export interface LiveLoadInput {
  teamId: string;
  viewer: { role: 'coach' | 'player'; playerId: string | null };
  scope?: LiveScope;
  now?: Date;
}

export async function loadLiveRounds(input: LiveLoadInput): Promise<LiveSnapshot> {
  const supabase = await createClient();
  const now = input.now ?? new Date();
  try {
    const zone = await loadTeamZone(supabase, input.teamId, 'live');
    const snap = await fetchLiveSnapshot(supabase, { teamId: input.teamId, role: input.viewer.role, playerId: input.viewer.playerId, now, zone });
    if (snap.error) chLogServer('live', 'lanes', new Error('a live rounds read failed'));
    const scope = input.scope;
    return scope ? { ...snap, lanes: snap.lanes.filter((l) => laneMatchesScope(l, scope)) } : snap;
  } catch (error) {
    chLogServer('live', 'snapshot', error);
    return { ...EMPTY_SNAPSHOT(input.teamId), fetchedAt: now.toISOString(), error: true };
  }
}

/** The calendar event behind `?event=`: its day (in the team's zone) and course, which narrow the lanes. */
export async function loadEventScope(input: { teamId: string; eventId: string }): Promise<LiveScope | null> {
  const supabase = await createClient();
  const [zone, ev] = await Promise.all([
    loadTeamZone(supabase, input.teamId, 'live'),
    supabase.from('golf_events').select('start_time, course_id').eq('id', input.eventId).eq('team_id', input.teamId).maybeSingle(),
  ]);
  if (ev.error) chLogServer('live', 'event', ev.error);
  const row = ev.data as { start_time: string; course_id: string | null } | null;
  if (!row) return null;
  return { eventId: input.eventId, date: dayInZone(new Date(row.start_time), zone), courseId: row.course_id };
}

/** The viewer's own lane (any round type), for the own card and the Dock. Null when they have no round in progress. */
export async function loadOwnLiveRound(input: { teamId: string; playerId: string; now?: Date }): Promise<LiveLane | null> {
  const snap = await loadLiveRounds({ teamId: input.teamId, viewer: { role: 'player', playerId: input.playerId }, now: input.now });
  return snap.lanes.find((l) => l.playerId === input.playerId && (l.phase === 'on_course' || l.phase === 'finished')) ?? null;
}

/** Strokes gained so far this round, by leg (the own card, practice rounds only). A leg with no shots yet is null. */
export interface OwnLegs {
  tee: number | null;
  approach: number | null;
  short: number | null;
  putting: number | null;
}

/** What Player Home needs from the live feed: the first-paint snapshot, and the legs of a practice round in progress. */
export interface ChPlayerLive {
  snapshot: LiveSnapshot;
  legs: OwnLegs | null;
}

/**
 * Strokes gained by leg for the round in progress, from the shots it has so far. Reads only (golf_shots, golf_holes, the
 * scale RPC) and uses the same engine and per-team baseline scale as the stats pages, so the figure agrees with the one
 * the round shows once it is posted. Null when no shot has been recorded or a read failed: the card hides the grid.
 */
export async function loadOwnLegs(input: { roundId: string; playerId: string; roundDate: string; courseName: string | null; holesPlanned: number }): Promise<OwnLegs | null> {
  const supabase = await createClient();
  try {
    const [shots, holes, scale] = await Promise.all([
      supabase.from('golf_shots').select('*').eq('round_id', input.roundId).order('hole_number').order('shot_number').order('id', { ascending: true }).limit(1000),
      supabase.from('golf_holes').select('round_id, hole_number, par, yardage, gir, score, putts, fairway_hit, sand_save, penalty_strokes').eq('round_id', input.roundId).limit(40),
      supabase.rpc('sg_scale_for_player', { p_player_id: input.playerId }),
    ]);
    // A scale that failed to read would put the figure on a different footing from the stats pages, so it hides the grid too.
    if (shots.error || holes.error || scale.error) {
      chLogServer('live', 'ownLegs', shots.error ?? holes.error ?? scale.error ?? new Error('own legs read failed'));
      return null;
    }
    if (!shots.data?.length) return null;
    const sgScale = typeof scale.data === 'number' && scale.data > 0 ? scale.data : 1;
    const rawShots: RawShot[] = shots.data.map((s) => ({
      id: s.id,
      round_id: s.round_id,
      hole_number: s.hole_number,
      shot_number: s.shot_number,
      shot_type: s.shot_type,
      club_type: s.club_type,
      lie_before: s.lie_before,
      lie_after: s.lie_after,
      distance_to_hole_before: s.distance_to_hole_before,
      distance_unit_before: s.distance_unit_before,
      distance_to_hole_after: s.distance_to_hole_after,
      distance_unit_after: s.distance_unit_after,
      shot_distance: s.shot_distance,
      result: s.result,
      miss_direction: s.miss_direction,
      putt_break: s.putt_break,
      putt_distance_feet: s.putt_distance_feet,
      putt_slope: s.putt_slope,
      putt_made: s.putt_made,
      is_penalty: s.is_penalty,
      penalty_type: s.penalty_type,
    }));
    const holeInfo: HoleInfo[] = (holes.data ?? []).map((h) => ({
      round_id: h.round_id,
      hole_number: h.hole_number,
      par: h.par,
      yardage: h.yardage ?? null,
      gir: h.gir ?? null,
      score: h.score ?? null,
      putts: h.putts ?? null,
      fairway_hit: h.fairway_hit ?? null,
      sand_save: h.sand_save ?? null,
      penalty_strokes: h.penalty_strokes ?? null,
    }));
    const round: RoundInfo = { id: input.roundId, round_date: input.roundDate, course_name: input.courseName, round_type: 'practice', holes_played: input.holesPlanned };
    const stats = calculateStatsFromShots(rawShots, holeInfo, [round], { sgScale });
    const legs: OwnLegs = { tee: stats.strokesGainedTee, approach: stats.strokesGainedApproach, short: stats.strokesGainedAroundGreen, putting: stats.strokesGainedPutting };
    return Object.values(legs).some((v) => v != null) ? legs : null;
  } catch (error) {
    chLogServer('live', 'ownLegs', error);
    return null;
  }
}

/** Player Home's live data: the viewer's lane and the teammates' (RLS decides), and the legs for a practice round. */
export async function loadPlayerLive(input: { teamId: string; playerId: string; now?: Date }): Promise<ChPlayerLive> {
  const snapshot = await loadLiveRounds({ teamId: input.teamId, viewer: { role: 'player', playerId: input.playerId }, now: input.now });
  const own = snapshot.lanes.find((l) => l.playerId === input.playerId && (l.phase === 'on_course' || l.phase === 'finished'));
  const legs = own && own.roundType === 'practice' ? await loadOwnLegs({ roundId: own.roundId, playerId: own.playerId, roundDate: own.roundDate, courseName: own.courseName, holesPlanned: own.holesPlanned }) : null;
  return { snapshot, legs };
}
