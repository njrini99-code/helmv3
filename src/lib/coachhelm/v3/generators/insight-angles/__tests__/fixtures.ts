/** Synthetic AngleData builders for the insight-angle tests (no DB). */
import type { AngleData, AngleHole, AngleRound, AngleShot, PeerRound } from '../angle-data';

export const PLAYER = '11111111-2222-3333-4444-555555555555';

export function mkRound(i: number, over: Partial<AngleRound> = {}): AngleRound {
  const day = String(1 + (i % 28)).padStart(2, '0');
  const month = String(1 + Math.floor(i / 28)).padStart(2, '0');
  return {
    id: `r${i}`,
    date: `2026-${month}-${day}`,
    holes: 18,
    team_id: 'team-1',
    sg: { total: 0, tee: 0, approach: 0, short_game: 0, putting: 0 },
    ...over,
  };
}

export function mkHole(roundId: string, n: number, over: Partial<AngleHole> = {}): AngleHole {
  return {
    id: `${roundId}-h${n}`,
    round_id: roundId,
    hole_number: n,
    par: 4,
    score: 4,
    penalty_strokes: 0,
    putts: 2,
    fairway_hit: true,
    gir: true,
    ...over,
  };
}

let shotSeq = 0;
export function mkShot(roundId: string, hole: number, shotNumber: number, over: Partial<AngleShot> = {}): AngleShot {
  shotSeq += 1;
  return {
    id: `s${shotSeq}`,
    round_id: roundId,
    hole_id: `${roundId}-h${hole}`,
    hole_number: hole,
    shot_number: shotNumber,
    shot_type: 'approach',
    club_type: 'non_driver',
    lie_before: 'fairway',
    lie_after: 'green',
    result: 'green',
    distance_to_hole_before: 150,
    distance_unit_before: 'yards',
    distance_to_hole_after: 20,
    distance_unit_after: 'feet',
    is_penalty: false,
    putt_made: null,
    miss_direction: null,
    created_at: null,
    putt_distance_feet: null,
    putt_slope: null,
    ...over,
  };
}

export function mkData(rounds: AngleRound[], holes: AngleHole[], shots: AngleShot[], over: Partial<AngleData> = {}): AngleData {
  return { playerId: PLAYER, rounds, holes, shots, scale: 1, scoringBaseline: 74, ...over };
}

export function mkPeerRounds(playerId: string, n: number, over: (i: number) => Partial<PeerRound>): PeerRound[] {
  return Array.from({ length: n }, (_, i) => ({
    player_id: playerId,
    date: `2026-03-${String(1 + (i % 28)).padStart(2, '0')}`,
    holes: 18,
    sg_total: 0,
    score_to_par: 0,
    fairways_hit: 10,
    fairways_total: 14,
    ...over(i),
  }));
}
