import { toChFileField, toChFilePlan, toChFileSgOver, toChFileTrack, type ChFileCards, type ChFileField, type ChFilePlan, type ChFileRosterRow, type ChFileSg, type ChPlayerFile, type ChPlayerWeek } from '../data/coachhelm-file-shape';
import type { ChFigures } from '../data/figure-window';
import { STATIONS, type ChStation } from '../data/coachhelm-team-shape';
import { PREVIEW_TEAM_BOARD } from './fixtures-coachhelm-team';
import type { ChDeepInsight } from '../data/coachhelm-dive-shape';
import { PREVIEW_FILE_DIVE as PREVIEW_COACH_DIVE, PREVIEW_COACH_VOICE } from './fixtures-coachhelm-coach-player';
import { CAST } from './cast';

/**
 * The coach's file, on the shared cast's focus player: Eli Brandt, whose penalty read this is on every screen (preview/cast.ts). The
 * reads come from the coach-player fixtures, written about their own player, so every string is re-voiced to Eli here. Every state
 * comes through the same shapers the loader uses.
 */
const ZONE = 'America/New_York';
const WHO = CAST.eli;
const FIRST = WHO.first;
const voice = PREVIEW_COACH_VOICE as Extract<typeof PREVIEW_COACH_VOICE, { role: 'coach' }>;

/**
 * Eli's legs are the ones the Team board's fixture stands him on the hole with, and the team's tick is that board's station figure:
 * one number in every preview, as the loaders now give one (the file reads `toChFileSgOver`, the rounds' own last ten).
 */
const BOARD_ELI = PREVIEW_TEAM_BOARD.players.list.find((p) => p.first === FIRST);
const legOf = (s: ChStation) => BOARD_ELI?.legs[s].strokes ?? null;
const FIGURES: ChFigures = { rounds: 10, holeRounds: 10, legs: { tee: legOf('tee'), approach: legOf('approach'), around: legOf('short_game'), putting: legOf('putting') }, total: BOARD_ELI?.total ?? null };
const NO_FIGURES: ChFigures = { rounds: 2, holeRounds: 2, legs: { tee: null, approach: null, around: null, putting: null }, total: null };
const TEAM_SG = { legs: STATIONS.map((s) => PREVIEW_TEAM_BOARD.stations[s].team), ready: { size: PREVIEW_TEAM_BOARD.roster.count } };
const SG: ChFileSg = toChFileSgOver(FIGURES, TEAM_SG, { you: false, first: FIRST });
// The player's own page carries no team figure.
const SG_YOU: ChFileSg = toChFileSgOver(FIGURES, null, { you: true, first: FIRST });

const FOCUS = (status: string, from: string | null = 'pv-1') => ({ id: 'fa-1', title: 'Penalty strokes', status, created_at: '2026-10-02T13:00:00Z', started_at: status === 'active' ? '2026-10-05T13:00:00Z' : null, updated_at: '2026-10-05T13:00:00Z', from_insight_id: from });
const GOAL = { id: 'g', title: 'Penalties a round', baseline_value: 1.4, target_value: 0.6, snapshots: [{ date: '2026-10-06', value: 1.3 }, { date: '2026-10-13', value: 1.1 }, { date: '2026-10-20', value: 1.2 }, { date: '2026-10-27', value: 0.9 }] } as never;
const planOf = (state: string): ChFilePlan => {
  const coach = 'Coach Reyes';
  if (state === 'noplan') return toChFilePlan(null, null, null, null, coach, ZONE);
  if (state === 'proposed') return toChFilePlan(FOCUS('proposed'), null, null, null, coach, ZONE);
  if (state === 'seen') return toChFilePlan(FOCUS('proposed'), '2026-10-04T21:12:00Z', null, null, coach, ZONE);
  if (state === 'declined') return toChFilePlan(FOCUS('declined'), '2026-10-04T21:12:00Z', null, null, coach, ZONE);
  return toChFilePlan(FOCUS('active'), '2026-10-04T21:12:00Z', GOAL, { drill: 'Fairway gate', count: 2 }, coach, ZONE);
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
  { id: voice.playerId, name: WHO.name, first: FIRST, line: WHO.classYear },
  { id: 'pl-a', name: CAST.jonah.name, first: CAST.jonah.first, line: CAST.jonah.classYear },
  { id: 'pl-b', name: CAST.theo.name, first: CAST.theo.first, line: CAST.theo.classYear },
];

/** The same reads in Eli's name: every string in them that names the fixtures' own player. */
function voiced<T>(v: T): T {
  if (typeof v === 'string') return v.split(voice.name).join(WHO.name).split(voice.first).join(FIRST) as T;
  if (Array.isArray(v)) return v.map((x) => voiced(x)) as T;
  if (v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, voiced(x)])) as T;
  return v;
}
const READS: ChDeepInsight[] = voiced(PREVIEW_COACH_DIVE.list);

export function previewPlayerFile(state: string): ChPlayerFile {
  const none = state === 'early' || state === 'empty';
  const all = state === 'oneread' ? READS.slice(0, 1) : READS;
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
    sg: state === 'sgfailed' ? null : none ? toChFileSgOver(NO_FIGURES, null, { you: false, first: FIRST }) : SG,
    plan,
    field: field(state, 'coach'),
    intent: state === 'nointent' ? null : { aim: 'breakout', alerts: 'balanced', watching: ['course_management'], note: 'Wants to play number one by spring.' },
    track: none ? toChFileTrack([], [], ZONE) : toChFileTrack([{ id: 'fa-0', title: 'Lag putting', outcome_status: 'improved', completed_at: '2026-09-28T00:00:00Z', from_insight_id: null }, { id: 'fa-1', title: 'Penalty strokes', outcome_status: null, completed_at: null, from_insight_id: 'pv-1' }], [], ZONE),
  };
  const strengths = list.filter((d) => d.base.strength);
  // The loader asks for the read in the player's own voice (lens: true); the fixture's reads are written for the coach.
  const inYourVoice = cards.feat ? { ...cards.feat, base: { ...cards.feat.base, lede: cards.feat.base.lede.replace(/^Across all (\d+) rounds on file \w+ is averaging ([\d.]+) penalty strokes per round\./, 'You’re averaging $2 penalty strokes a round across all $1 rounds.') } } : null;
  const lens: ChFileCards = { ...cards, feat: inYourVoice, intent: undefined, track: undefined, dismissed: [], reads: list.filter((d) => !d.base.strength && d !== list[0]).slice(0, 2), working: strengths.slice(0, 1), more: Math.max(0, list.length - 3), sg: cards.sg && SG_YOU, field: field(state, 'player') };
  return {
    head: { playerId: voice.playerId, name: state === 'long' ? 'Maximilian Okonkwo-Vandermeer' : WHO.name, first: state === 'long' ? 'Maximilian' : FIRST, line: voice.line },
    cards,
    lens,
    failed: { ...(state === 'sgfailed' ? { sg: true as const } : {}), ...(state === 'intentfailed' ? { intent: true as const } : {}), ...(state === 'fieldfailed' ? { field: true as const } : {}) },
    rounds: state === 'empty' ? 0 : state === 'early' ? 2 : WHO.rounds,
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
