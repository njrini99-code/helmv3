'use client';

import type { ChStation, ChTeamBoardData, ChTeamPlayer } from '../data/coachhelm-team-shape';
import { STATIONS, stationFigures } from '../data/coachhelm-team-shape';
import { TeamBoard, type TeamStation } from '../screens/coachhelm/team/TeamBoard';
import { TeamBoardSkeleton } from '../screens/coachhelm/team/TeamBoardSkeleton';
import { PREVIEW_TEAM_BOARD } from './fixtures-coachhelm-team';

const STATION_KEY: Record<string, TeamStation> = { tee: 'tee', app: 'approach', sg: 'short_game', putt: 'putting', course: 'course' };

function stateData(state: string | undefined): ChTeamBoardData {
  const base = PREVIEW_TEAM_BOARD;
  const list = base.players.list;
  if (state === 'early') {
    const early = list.map((p, i) => ({ ...p, rounds: [3, 4, 4, 3, 2][i] ?? 3, early: true }));
    return { ...base, players: { list: early, error: false }, teamTotal: { ...base.teamTotal, rounds: 16 } };
  }
  if (state === 'empty') {
    const empty: ChTeamPlayer[] = list.map((p) => ({ ...p, rounds: 0, early: true, reads: { needs: [], working: [] }, total: null, worst: null, legs: Object.fromEntries(STATIONS.map((s) => [s, { strokes: null, rounds: 0, missing: 'No rounds yet.' }])) as ChTeamPlayer['legs'] }));
    return { ...base, players: { list: empty, error: false }, stations: stationFigures(empty), teamTotal: { strokes: null, rounds: 0 }, course: { history: null, reads: [], against: null } };
  }
  if (state === 'partial') return { ...base, players: { list: [], error: true } };
  if (state === 'noplayers') return { ...base, roster: { count: 0, error: false }, players: { list: [], error: false } };
  if (state === 'long') {
    const worst: ChStation = 'approach';
    const many = Array.from({ length: 15 }, (_, i) => ({ ...(list[i % list.length] as ChTeamPlayer), id: `pl-long-${i}`, name: i % 2 ? 'Elijah Brandt-Whitaker' : 'Priyanka Natarajan-Okonkwo', worst }));
    return { ...base, roster: { count: 15, error: false }, players: { list: many, error: false } };
  }
  return base;
}

/** The team board with fixture data; names match the capture script's (02-PLAN 11). Nothing reaches the server. */
export function PreviewCoachHelmTeam({ state, station }: { state?: string; station?: string; open?: string; all?: boolean }) {
  if (state === 'loading') return <TeamBoardSkeleton />;
  return <TeamBoard data={stateData(state)} initialStation={station ? STATION_KEY[station] : undefined} />;
}
