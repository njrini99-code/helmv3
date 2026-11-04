import { toChFileField, toChFilePlan, toChFileSg, toChFileTrack, type ChFileCards, type ChFileField, type ChFilePlan, type ChFileRosterRow, type ChFileSg, type ChPlayerFile, type ChPlayerWeek } from '../data/coachhelm-file-shape';
import type { ChLadder } from '../data/coachhelm-ladder-shape';
import type { ChDeepInsight } from '../data/coachhelm-dive-shape';
import { PREVIEW_FILE_DIVE as PREVIEW_COACH_DIVE, PREVIEW_COACH_VOICE } from './fixtures-coachhelm-coach-player';
import type { PlayerStanding } from '@/lib/coachhelm/v3/standing/types';

/** The file on the Jonah fixtures: no invented player. Every state comes through the same shapers the loader uses. */
const ZONE = 'America/New_York';
const FIRST = 'Jonah';
const voice = PREVIEW_COACH_VOICE as Extract<typeof PREVIEW_COACH_VOICE, { role: 'coach' }>;

const LADDER: ChLadder = {
  top: 'approach',
  readsFailed: false,
  rows: [
    { id: 'tee', label: 'Off the tee', strokes: '−0.91', sense: 'loss', pct: 100, missing: null, causes: [] },
    { id: 'approach', label: 'Approach', strokes: '−0.42', sense: 'loss', pct: 46, missing: null, causes: [] },
    { id: 'short_game', label: 'Around the green', strokes: '+0.12', sense: 'gain', pct: 13, missing: null, causes: [] },
    { id: 'putting', label: 'Putting', strokes: '+0.31', sense: 'gain', pct: 34, missing: null, causes: [] },
  ],
};
const row = (metric_id: string, player_value: number, team_avg: number | null, team_n: number) => ({ player_id: voice.playerId, metric_id, player_value, team_avg, team_n, team_pct: null }) as unknown as PlayerStanding;
const STANDING = [row('sg_ott', -0.91, -0.2, 7), row('sg_approach', -0.42, -0.35, 7), row('sg_around_green', 0.12, 0.05, 7), row('sg_putting', 0.31, 0.1, 7)];
const SG: ChFileSg = toChFileSg(LADDER, STANDING, { you: false, first: FIRST }, { window: 'All time', rounds: 21 });
const SG_YOU: ChFileSg = toChFileSg(LADDER, STANDING, { you: true, first: FIRST }, { window: 'All time', rounds: 21 });

const FOCUS = (status: string, from: string | null = 'pv-1') => ({ id: 'fa-1', title: 'Penalty strokes', status, created_at: '2026-10-02T13:00:00Z', started_at: status === 'active' ? '2026-10-05T13:00:00Z' : null, updated_at: '2026-10-05T13:00:00Z', from_insight_id: from });
const GOAL = { id: 'g', title: 'Penalties a round', baseline_value: 1.4, target_value: 0.6, snapshots: [{ date: '2026-10-06', value: 1.3 }, { date: '2026-10-13', value: 1.1 }, { date: '2026-10-20', value: 1.2 }, { date: '2026-10-27', value: 0.9 }] } as never;
const planOf = (state: string): ChFilePlan => {
  const coach = 'Coach Reyes';
  if (state === 'noplan') return toChFilePlan(null, null, null, null, coach, ZONE);
  if (state === 'proposed') return toChFilePlan(FOCUS('proposed'), null, null, null, coach, ZONE);
  if (state === 'seen') return toChFilePlan(FOCUS('proposed'), '2026-10-04T21:12:00Z', null, null, coach, ZONE);
  if (state === 'declined') return toChFilePlan(FOCUS('declined'), '2026-10-04T21:12:00Z', null, null, coach, ZONE);
  return toChFilePlan(FOCUS('active'), '2026-10-04T21:12:00Z', GOAL, { drill: 'Gate putting', count: 2 }, coach, ZONE);
};

const OTHERS = [2.4, 4.1, 5.8, 6.5, 8.2];
const round = { date: '2026-10-26', course: 'Lonnie Poole', score: 74 };
const entry = (n: number) => ({ round_id: 'r', player_id: voice.playerId, field_n: n, field_mean: 6, relative: -2.4 });
const field = (state: string, role: 'coach' | 'player'): ChFileField | null => {
  if (state === 'nofield' || state === 'early' || state === 'empty') return null;
  const n = state === 'fieldfew' ? 4 : 6;
  return role === 'coach' ? toChFileField(entry(n), OTHERS.slice(0, n - 1), { role: 'coach', first: FIRST }, round, ZONE) : toChFileField(entry(n), [], { role: 'player' }, round, ZONE);
};

export const PREVIEW_FILE_ROSTER: ChFileRosterRow[] = [
  { id: voice.playerId, name: voice.name, first: FIRST, line: 'Junior' },
  { id: 'pl-a', name: 'Sam Reid', first: 'Sam', line: 'Senior' },
  { id: 'pl-b', name: 'Theo Marsh', first: 'Theo', line: 'Freshman' },
];

export function previewPlayerFile(state: string): ChPlayerFile {
  const none = state === 'early' || state === 'empty';
  const all = state === 'oneread' ? PREVIEW_COACH_DIVE.list.slice(0, 1) : PREVIEW_COACH_DIVE.list;
  const list: ChDeepInsight[] = none ? [] : state === 'manyreads' ? Array.from({ length: 14 }, (_, i) => ({ ...all[i % all.length]!, base: { ...all[i % all.length]!.base, id: `pv-${i}` } })) : all;
  const plan = planOf(none ? 'noplan' : state);
  const cards: ChFileCards = {
    feat: list[0] ?? null,
    featTeam: state === 'teamsmall' ? null : 0.7,
    reads: list,
    cleared: [],
    dismissed: none || state === 'oneread' ? [] : [{ id: 'pv-dis', title: 'Fairways hit on par 5s', lifecycle: 'detected' }],
    working: [],
    more: 0,
    sg: state === 'sgfailed' ? null : none ? toChFileSg({ ...LADDER, rows: LADDER.rows.map((r) => ({ ...r, strokes: null, sense: null })) }, [], { you: false, first: FIRST }, { window: 'All time', rounds: 2 }) : SG,
    plan,
    field: field(state, 'coach'),
    intent: state === 'nointent' ? null : { aim: 'breakout', alerts: 'balanced', watching: ['course_management'], note: 'Wants to play number one by spring.' },
    track: none ? toChFileTrack([], [], ZONE) : toChFileTrack([{ id: 'fa-0', title: 'Lag putting', outcome_status: 'improved', completed_at: '2026-09-28T00:00:00Z', from_insight_id: null }, { id: 'fa-1', title: 'Penalty strokes', outcome_status: null, completed_at: null, from_insight_id: 'pv-1' }], [], ZONE),
  };
  const strengths = list.filter((d) => d.base.strength);
  const lens: ChFileCards = { ...cards, intent: undefined, track: undefined, dismissed: [], reads: list.filter((d) => !d.base.strength && d !== list[0]).slice(0, 2), working: strengths.slice(0, 1), more: Math.max(0, list.length - 3), sg: cards.sg && SG_YOU, field: field(state, 'player') };
  return {
    head: { playerId: voice.playerId, name: state === 'long' ? 'Maximilian Okonkwo-Vandermeer' : voice.name, first: state === 'long' ? 'Maximilian' : FIRST, line: voice.line },
    cards,
    lens,
    failed: { ...(state === 'sgfailed' ? { sg: true as const } : {}), ...(state === 'intentfailed' ? { intent: true as const } : {}), ...(state === 'fieldfailed' ? { field: true as const } : {}) },
    rounds: state === 'empty' ? 0 : state === 'early' ? 2 : 21,
    roundsToGo: state === 'early' ? 4 : 0,
    readOn: false,
    penalties: [0, 1, 3, 0, 2, 1, 0, 2].map((value, i) => ({ label: `Oct ${i + 1}`, value })),
  };
}

export function previewPlayerWeek(state: string): ChPlayerWeek {
  const f = previewPlayerFile(state);
  const proposed = state === 'proposed' || state === 'seen';
  return {
    cards: f.lens!,
    proposals: { list: proposed ? [{ id: 'fa-1', title: 'Penalty strokes', from: null, coachName: 'Coach Reyes' }] : [], error: false },
    rounds: f.rounds,
    roundsToGo: f.roundsToGo,
    readOn: false,
    penalties: f.penalties,
    refreshed: 'Oct 30',
    failed: {},
  };
}
