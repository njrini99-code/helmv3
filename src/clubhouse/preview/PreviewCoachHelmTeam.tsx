'use client';

import type { ChStation, ChTeamBoardData, ChTeamPlayer } from '../data/coachhelm-team-shape';
import { courseReads, STATIONS, stationFigures, storiesOf } from '../data/coachhelm-team-shape';
import { TeamBoard, type TeamBoardOpen, type TeamStation } from '../screens/coachhelm/team/TeamBoard';
import { TeamBoardSkeleton } from '../screens/coachhelm/team/TeamBoardSkeleton';
import { PREVIEW_TEAM_BOARD } from './fixtures-coachhelm-team';
import { PREVIEW_TRACK_RECORD } from './fixtures-coachhelm-track';

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
    return { ...base, players: { list: empty, error: false }, stations: stationFigures(empty), teamTotal: { strokes: null, rounds: 0 }, course: { history: null, reads: [], against: null }, record: { status: 'ok', value: { ...PREVIEW_TRACK_RECORD, empty: true } as never } };
  }
  if (state === 'failed') return { ...base, brief: { status: 'failed' }, record: { status: 'failed' } } as ChTeamBoardData;
  if (state === 'failed-all') return { ...base, players: { list: [], error: true } };
  if (state === 'partial') return { ...base, players: { list: [], error: true } };
  if (state === 'noplayers') return { ...base, roster: { count: 0, error: false }, players: { list: [], error: false } };
  // The figures staging really produced, which sank the hole's halos and labels: one early player carrying the whole board (TEAM-1 to TEAM-5).
  if (state === 'stress') {
    const stress: ChTeamPlayer = { ...(list[3] as ChTeamPlayer), id: 'pl-stress', name: 'Cole Bennett', first: 'Cole', rounds: 3, early: true, total: 0.5, worst: 'putting', legs: { tee: { strokes: 2.5, rounds: 3, missing: null }, approach: { strokes: 1.9, rounds: 3, missing: null }, short_game: { strokes: 0, rounds: 3, missing: null }, putting: { strokes: -3.9, rounds: 3, missing: null } } };
    return { ...base, team: { ...base.team, name: 'Demo University Golf' }, roster: { count: 1, error: false }, players: { list: [stress], error: false }, stations: stationFigures([stress]), teamTotal: { strokes: 0.5, rounds: 3 } };
  }
  if (state === 'long') {
    const worst: ChStation = 'approach';
    const many = Array.from({ length: 15 }, (_, i) => ({ ...(list[i % list.length] as ChTeamPlayer), id: `pl-long-${i}`, first: i % 2 ? 'Elijah' : 'Priyanka', name: i % 2 ? 'Elijah Brandt-Whitaker' : 'Priyanka Natarajan-Okonkwo', worst }));
    return { ...base, roster: { count: 15, error: false }, players: { list: many, error: false } };
  }
  return base;
}

/** `&open=`: what the sheet or inspector opens on (02-PLAN 11). A brief or track record that failed draws its own notice (`failed`). */
function openOf(data: ChTeamBoardData, station: TeamStation, open: string | undefined, which: string | undefined): TeamBoardOpen | undefined {
  const list = data.players.list;
  if (open === 'read') {
    const reads = list.flatMap((p) => p.reads.needs);
    const r = which === 'assigned' ? (reads.find((x) => x.assigned) ?? reads[0]) : which === 'course' ? courseReads(list)[0] : reads[0];
    return r ? { kind: 'read', id: r.id } : undefined;
  }
  if (open === 'player') {
    const leg = station === 'course' ? 'approach' : station;
    const p = [...list].sort((a, b) => (a.legs[leg].strokes ?? 0) - (b.legs[leg].strokes ?? 0))[0];
    return p ? { kind: 'player', id: p.id } : undefined;
  }
  if (open === 'course') {
    const c = data.course.history?.courses.find((x) => x.id === 'hill') ?? data.course.history?.courses[0];
    return c ? { kind: 'course', id: c.id } : undefined;
  }
  if (open === 'story') {
    const part = data.brief instanceof Promise ? null : data.brief;
    const brief = part?.status === 'ok' ? part.value : null;
    const s = storiesOf(brief, null, new Map(list.map((p) => [p.id, p.name])))[0];
    return s ? { kind: 'story', id: s.id, story: s, week: brief?.week ?? 'This week' } : undefined;
  }
  return undefined;
}

/** The team board with fixture data; names match the capture script's (02-PLAN 11). Nothing reaches the server. */
export function PreviewCoachHelmTeam({ state, station, open, read, all }: { state?: string; station?: string; open?: string; read?: string; all?: boolean }) {
  if (state === 'loading') return <TeamBoardSkeleton />;
  const data = stateData(state);
  const first = station ? STATION_KEY[station] : undefined;
  const initialStation = first ?? (read === 'course' ? 'course' : undefined);
  return <TeamBoard askOn data={data} onRetry={() => {}} initialStation={initialStation} initialAll={all} initialOpen={openOf(data, initialStation ?? 'approach', open, read)} />;
}
