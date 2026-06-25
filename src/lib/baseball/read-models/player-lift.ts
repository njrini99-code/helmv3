// =============================================================================
// src/lib/baseball/read-models/player-lift.ts
//
// V11 player lift surface read models (spec "Player Lift Experience" L465-520).
// SELF-ONLY: resolves the current player from the session and only returns THAT
// player's sessions; RLS backs every query. 'server-only' plain async.
// =============================================================================

import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type {
  BaseballLiftSessionRow,
  BaseballLiftSessionExerciseRow,
  BaseballLiftSetResultRow,
  BaseballLiftSessionWithExercises,
} from '@/lib/types/baseball-lifting-v11';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export interface PlayerLiftHome {
  /** Today's (and upcoming) sessions for this player. */
  upcoming: BaseballLiftSessionRow[];
  /** Recently completed sessions (history preview). */
  recent: BaseballLiftSessionRow[];
  /** Whether today's readiness check-in has been submitted. */
  readinessSubmittedToday: boolean;
}

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function getPlayerLiftHome(playerId: string): Promise<PlayerLiftHome> {
  const supabase = (await createClient()) as Db;
  const today = todayYmd();

  const { data: upcomingRows } = await supabase
    .from('baseball_lift_sessions')
    .select('*')
    .eq('player_id', playerId)
    .gte('scheduled_date', today)
    .in('status', ['assigned', 'started', 'modified'])
    .order('scheduled_date', { ascending: true })
    .limit(20);

  const { data: recentRows } = await supabase
    .from('baseball_lift_sessions')
    .select('*')
    .eq('player_id', playerId)
    .eq('status', 'completed')
    .order('completed_at', { ascending: false })
    .limit(10);

  const { data: checkin } = await supabase
    .from('baseball_readiness_checkins')
    .select('id')
    .eq('player_id', playerId)
    .eq('check_date', today)
    .maybeSingle();

  return {
    upcoming: (upcomingRows ?? []) as BaseballLiftSessionRow[],
    recent: (recentRows ?? []) as BaseballLiftSessionRow[],
    readinessSubmittedToday: Boolean(checkin),
  };
}

export async function getPlayerLiftSession(
  playerId: string,
  sessionId: string,
): Promise<BaseballLiftSessionWithExercises | null> {
  const supabase = (await createClient()) as Db;

  const { data: session } = await supabase
    .from('baseball_lift_sessions')
    .select('*')
    .eq('id', sessionId)
    .eq('player_id', playerId) // defense-in-depth on top of RLS
    .maybeSingle();
  if (!session) return null;

  const { data: exRows } = await supabase
    .from('baseball_lift_session_exercises')
    .select('*')
    .eq('session_id', sessionId)
    .order('order_index', { ascending: true });
  const exercises = (exRows ?? []) as BaseballLiftSessionExerciseRow[];

  const exIds = exercises.map((e) => e.id);
  let setsByExercise = new Map<string, BaseballLiftSetResultRow[]>();
  if (exIds.length) {
    const { data: setRows } = await supabase
      .from('baseball_lift_set_results')
      .select('*')
      .in('session_exercise_id', exIds)
      .order('set_number', { ascending: true });
    setsByExercise = new Map();
    for (const s of (setRows ?? []) as BaseballLiftSetResultRow[]) {
      const arr = setsByExercise.get(s.session_exercise_id) ?? [];
      arr.push(s);
      setsByExercise.set(s.session_exercise_id, arr);
    }
  }

  return {
    ...(session as BaseballLiftSessionRow),
    exercises: exercises.map((e) => ({ ...e, sets: setsByExercise.get(e.id) ?? [] })),
  };
}
