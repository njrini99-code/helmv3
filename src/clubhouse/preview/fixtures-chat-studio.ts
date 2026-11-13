/**
 * Fixtures for the studio's section of the capabilities gallery (docs/clubhouse/coachhelm-chat-v3/CAPABILITIES.md,
 * "The studio"): every kind in `STUDIO_KINDS`, each drawn from the shape its source emits. The evidence kinds go
 * through the thread's own data layer and `fromEvidence`, the composition goes through `fromBlock`, so what the gallery
 * shows is what a real answer draws. Nothing here reaches a server.
 */
import type { ToolEnvelope } from '@/lib/coachhelm/v3/chat/provenance';
import type { ResolvedBlock } from '@/lib/coachhelm/v3/chat/visuals/composition';
import type { StudioKindName } from '@/lib/coachhelm/v3/chat/visuals/studio-kinds';
import { evidenceBlocks, type AskEvidence, type AskTeamTable } from '../data/coachhelm-chat-thread';
import { fromBlock, fromEvidence, fromRead as thingOf, type StudioData, type StudioHole } from '../screens/coachhelm/chat/studio';
import { ASK_COMPOSITION, ASK_EV_JONAH_SG, ASK_EV_JONAH_TREND, ASK_EV_SLOPE, ASK_EV_TEAM_SG } from './fixtures-ask-thread';
import { CAP_ROSTER, capTask } from './fixtures-chat-capabilities';
import { PP_PLAN_PART } from './fixtures-practice-plan';
import { formatFixed, formatSigned } from '../lib/format';

export interface StudioSpecimen {
  /** The deep link's `form`. */
  id: string;
  kind: StudioKindName;
  title: string;
  /** What to look at, or what stands in for something the engine does not send yet. */
  note?: string;
  /** The read it would have come from. */
  read: string;
  part: { kind: string; data: unknown };
  /** Drawn with the Miss Compass on (its team flag), as Ask's page draws it for a team the flag lists. */
  compass?: boolean;
}

const make = <K extends StudioKindName>(id: string, kind: K, title: string, read: string, data: StudioData[K], note?: string): StudioSpecimen => ({ id, kind, title, read, part: { kind, data }, note });

/** The first block of a kind a read's evidence gives, through the studio's adapter. */
function fromRead(envelope: ToolEnvelope, want: AskEvidence['kind']): { kind: string; data: unknown } {
  const block = evidenceBlocks(envelope).find((b) => b.kind === want);
  const part = block ? fromEvidence(block) : null;
  // A fixture that stopped producing its form is drawn as the table it fell back to, and the studio test names it.
  return part ?? { kind: 'table', data: { table: { caption: `No ${want} in this read`, columns: ['What', 'Value'], rows: [['Form', want]] } } };
}

const PAR = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 3, 4, 5, 4, 4, 3, 4, 5];

/**
 * The Miss Compass's specimen (Studio Phase 1): the shots behind each direction, as the compiler copies them from a read's
 * `detail.ui_only` (newest round first, at most 40 a direction with the true count). Right holds 46, so its list says it is
 * capped. Synthetic rounds and shots only.
 */
const COMPASS_COUNTS: Record<string, number> = { long: 4, long_right: 6, right: 46, short_right: 11, short: 9, short_left: 5, left: 4, long_left: 2 };
const COMPASS_ROUNDS = [
  ['cr-1', '2026-11-04', 'Hilltop Golf Club'],
  ['cr-2', '2026-10-28', 'Pine Ridge'],
  ['cr-3', '2026-10-14', 'Hilltop Golf Club'],
  ['cr-4', '2026-09-30', 'Cedar Lakes'],
  ['cr-5', '2026-09-16', 'Pine Ridge'],
] as const;
const COMPASS_SHOTS = Object.fromEntries(
  Object.entries(COMPASS_COUNTS).map(([dir, count], d) => [
    dir,
    {
      count,
      shots: Array.from({ length: Math.min(count, 40) }, (_, i) => {
        const [round_id, round_date, course] = COMPASS_ROUNDS[Math.min(COMPASS_ROUNDS.length - 1, Math.floor((i * COMPASS_ROUNDS.length) / Math.max(1, Math.min(count, 40))))]!;
        return { id: `cs-${d}-${i}`, round_id: `${round_id}-${i % 5}`, hole_id: `ch-${(i % 18) + 1}`, round_date, course, from_ft: (125 + ((i * 7 + d * 5) % 50)) * 3, left_ft: 12 + ((i * 11 + d * 3) % 40), lie_before: i % 4 === 3 ? 'rough' : 'fairway', player: CAP_ROSTER[(i + d) % 5]!.name };
      }),
    },
  ]),
);
const COMPASS_TOTAL = Object.values(COMPASS_COUNTS).reduce((a, b) => a + b, 0) + 6;
const SHOT = [4, 5, 3, 4, 4, 4, 5, 4, 5, 4, 2, 6, 5, 4, 4, 3, 5, 4];
const HOLES: StudioHole[] = PAR.map((par, i) => ({ n: i + 1, par, score: SHOT[i]! }));

const TWELVE = ['Eli Brandt', 'Jonah Okafor', 'Priya Natarajan', 'Theo Marchetti', 'Sam Whitfield', 'Sofia Alvarez', 'Ava Lindqvist', 'Owen Park', 'Marcus Delacroix-Whitmore', 'Leo Tanaka', 'Noor Haddad', 'Wes Callahan'];
const figure = (display: string, tone: 'good' | 'loss' | 'plain' = 'plain') => ({ display, tone });
const sg = (v: number) => figure(formatSigned(v, 2), v > 0.05 ? 'good' : v < -0.05 ? 'loss' : 'plain');
const TEAM_TABLE: AskTeamTable = {
  players: TWELVE.map((label, i) => ({ id: CAP_ROSTER[i]?.id ?? `p-${i}`, label, sample: i === 9 ? 'over 2 rounds' : `over ${6 + (i % 3)} rounds` })),
  metrics: [
    { id: 'avg', label: 'Scoring average', short: 'Average', unit: 'score', strokes: false },
    { id: 'sg_putt', label: 'Strokes gained putting', short: 'Putting', unit: 'strokes', strokes: true },
    { id: 'gir', label: 'Greens in regulation', short: 'Greens', unit: 'percent', strokes: false },
    { id: 'putts', label: 'Putts per round', short: 'Putts', unit: 'count', strokes: false },
  ],
  cells: TWELVE.map((_, i) => [figure(formatFixed(71.2 + i * 0.45, 1)), sg(0.62 - i * 0.11), figure(`${68 - i * 2}%`), i === 10 ? null : figure(formatFixed(29.1 + i * 0.3, 1))]),
  best: [CAP_ROSTER[0]!.id, CAP_ROSTER[0]!.id, CAP_ROSTER[0]!.id, CAP_ROSTER[0]!.id],
  playersAsRows: true,
};

/* The three reads whose detail is a thing the app has a screen for, each in the shape its tool emits (engine-reads.ts
   `getCalendar`, readers.ts `runQualifiers`, readers-direct.ts `getRound`), so the gallery draws what `fromRead` makes of a
   real answer and not a hand-built part. The ids are shaped as the database's are, since a link is only drawn to a
   page the Clubhouse has (shell/nav `rebuiltHref`). */
const read = (summary: string, detail: unknown, over: Partial<ToolEnvelope> = {}): ToolEnvelope => ({ summary, measurements: [], series: [], detail, coverage: 'complete', coverage_note: null, as_of: '2026-11-11T12:00:00.000Z', ...over });
const calendarHref = (id: string) => `/golf/dashboard/calendar?event=${id}`;
export const STUDIO_READ_SCHEDULE = read('4 events on the team calendar.', {
  zone: 'America/Chicago',
  from: '2026-11-12T06:00:00.000Z',
  to: '2026-11-26T06:00:00.000Z',
  events: [
    { id: 'ev-1', title: 'Short game practice', event_type: 'practice', start_time: '2026-11-12T21:00:00.000Z', end_time: '2026-11-12T23:30:00.000Z', location: 'Ridgeline practice green', status: 'scheduled', href: calendarHref('ev-1'), replies: { accepted: 6, maybe: 1, declined: 1, pending: 1, checked_in: 0 }, in_class: ['Eli Brandt', 'Priya Natarajan'] },
    { id: 'ev-2', title: 'Compliance meeting', event_type: 'team_meeting', start_time: '2026-11-12T23:45:00.000Z', end_time: '2026-11-13T00:30:00.000Z', location: 'Field house, room 2', status: 'scheduled', href: calendarHref('ev-2'), in_class: [] },
    { id: 'ev-3', title: 'Fall qualifier, round 3', event_type: 'qualifier', start_time: '2026-11-13T14:10:00.000Z', end_time: null, location: 'Ridgeline, back tees', status: 'scheduled', href: calendarHref('ev-3'), replies: { accepted: 8, maybe: 0, declined: 0, pending: 0, checked_in: 0 }, in_class: [] },
    { id: 'ev-4', title: 'Bus to Sandhills Collegiate', event_type: 'travel', start_time: '2026-11-14T12:30:00.000Z', end_time: null, location: 'Leaves from the field house', status: 'scheduled', href: calendarHref('ev-4'), in_class: [] },
  ],
});
export const STUDIO_READ_BOARD = read('Fall qualifier: the board, 8 with a score.', {
  qualifier_id: '0f0a11e0-0000-4000-8000-00000000a001',
  href: '/golf/dashboard/qualifiers/0f0a11e0-0000-4000-8000-00000000a001',
  name: 'Fall qualifier',
  status: 'in_progress',
  selection: 'open',
  rounds_planned: 3,
  squad: 5,
  coach_picks: 1,
  entrants: 8,
  standings: TWELVE.slice(0, 8).map((player, i) => ({ position: String(i + 1), player_id: CAP_ROSTER[i]?.id ?? `p-${i}`, player, rounds: i === 7 ? 1 : 2, total: i === 7 ? 76 : 139 + i * 2, to_par: i === 7 ? 4 : i * 2 - 5, avg_score: 70 + i, fewer_rounds_than_leaders: i === 7, rounds_not_18_holes: 0, state: null, selected: null, reason: null })),
});
export const STUDIO_READ_ROUND = read('Jonah Okafor, Ridgeline on 2026-11-08.', {
  player_id: 'p-jonah',
  kind: 'hole_strip',
  round: { round_id: '0f0a11e0-0000-4000-8000-00000000b001', href: '/golf/dashboard/rounds/0f0a11e0-0000-4000-8000-00000000b001', date: '2026-11-08', course: 'Ridgeline', type: 'tournament', holes_played: 18, total: 75, to_par: 3, front: 38, back: 37, putts: 31 },
  holes: PAR.map((par, i) => ({ hole_number: i + 1, par, score: SHOT[i]!, putts: 2, penalty_strokes: 0, gir: SHOT[i]! <= par })),
}, { measurements: ASK_EV_JONAH_SG.measurements.slice(0, 1) });
const fromReadOr = (envelope: ToolEnvelope, kind: string): { kind: string; data: unknown } => thingOf(envelope) ?? { kind: 'table', data: { table: { caption: `No ${kind} in this read`, columns: ['What', 'Value'], rows: [['Form', kind]] } } };

const event = capTask('create_event');
if (!event) throw new Error('fixtures-chat-studio: the create_event capability fixture is missing');

export const STUDIO_SPECIMENS: readonly StudioSpecimen[] = [
  make('figure', 'figure', 'One figure, set large', 'r1', { title: null, figures: [{ key: 'putts', label: 'Jonah Okafor, putts per round', value: '31.8', sub: 'over 4 rounds', tone: 'plain', refs: ['Team average 30.4', 'Division I average 29.6'], href: '#stats-jonah' }] }),
  make('figure_six', 'figure', 'Six figures beside each other', 'r1', {
    title: 'Jonah Okafor, the last 4 rounds',
    figures: [
      { key: 'avg', label: 'Scoring average', value: '73.5', sub: 'over 4 rounds', tone: 'plain' },
      { key: 'sg', label: 'Strokes gained total', value: '−0.42', sub: 'over 4 rounds', tone: 'loss' },
      { key: 'putt', label: 'Strokes gained putting', value: '−0.81', sub: 'over 4 rounds', tone: 'loss' },
      { key: 'app', label: 'Strokes gained approach', value: '+0.36', sub: 'over 4 rounds', tone: 'gain' },
      { key: 'gir', label: 'Greens in regulation', value: '61%', sub: 'from 72 holes', tone: 'plain' },
      { key: 'make', label: 'Make rate, 4 to 8 feet', value: '47%', sub: 'from 34 attempts', tone: 'plain' },
    ],
  }),
  make('comparison', 'comparison', 'Twelve players across four measures', 'r2', { label: 'The team, this fall', team: TEAM_TABLE, hrefs: Object.fromEntries(TEAM_TABLE.players.map((p) => [p.id, `#stats-${p.id}`])) }, 'A missing figure says “None”; the best in each measure carries the dot.'),
  { id: 'ranking', kind: 'ranking', title: 'The team ranked on strokes gained', read: 'r3', part: fromRead(ASK_EV_TEAM_SG, 'ranking') },
  { id: 'trend', kind: 'trend', title: 'One measure, round by round', read: 'r4', part: fromRead(ASK_EV_JONAH_TREND, 'trend'), note: 'The chart is the thread’s own. The whole trend asks; a single round is read from the table.' },
  make('round', 'round', 'A round, as the scorecard shows it', 'r5', { title: 'Jonah Okafor · Ridgeline Invitational, round 2 · 75, 3 over', holes: HOLES, href: '#round' }),
  { id: 'strokes_gained', kind: 'strokes_gained', title: 'Strokes gained by part of the game', read: 'r6', part: fromRead(ASK_EV_JONAH_SG, 'legs') },
  { id: 'distance_profile', kind: 'distance_profile', title: 'Make rate by distance band', read: 'r7', part: fromRead(ASK_EV_SLOPE, 'bars') },
  make('distance_putts', 'distance_profile', 'Putts by distance, against the season', 'r7', { form: 'putts', putts: { type: 'putt_profile', buckets: [{ id: 'a', label: 'Inside 4 feet', attempts: 41, made: 39, rate: 95, season_rate: 96 }, { id: 'b', label: '4 to 8 feet', attempts: 34, made: 16, rate: 47, season_rate: 58 }, { id: 'c', label: '8 to 15 feet', attempts: 28, made: 6, rate: 21, season_rate: 24 }, { id: 'd', label: 'Outside 15 feet', attempts: 37, made: 2, rate: 5, season_rate: 6 }] } }),
  make('schedule', 'schedule', 'Three days with their events', 'r8', {
    title: 'Thursday to Saturday',
    href: '#calendar',
    days: [
      { date: '2026-11-12', events: [{ id: 'e1', title: 'Short game practice', time: '3 to 5:30 PM', kind: 'practice', place: 'Ridgeline practice green', replies: { going: 6, out: 1, waiting: 1 }, conflicts: 2, href: '#e1' }, { id: 'e2', title: 'Biology lab', time: '2 to 3:50 PM', kind: 'class', place: null }] },
      { date: '2026-11-13', events: [{ id: 'e3', title: 'Fall qualifier, round 3', time: '8:10 AM', kind: 'qualifier', place: 'Ridgeline, back tees', replies: { going: 8, out: 0, waiting: 0 }, href: '#e3' }] },
      { date: '2026-11-14', events: [{ id: 'e4', title: 'Bus to Sandhills Collegiate', time: '6:30 AM', kind: 'travel', place: 'Leaves from the field house', href: '#e4' }] },
    ],
  }),
  make('qualifier_board', 'qualifier_board', 'A qualifier’s board, with the cut', 'r9', {
    title: 'Fall qualifier',
    status: 'Two of three rounds played',
    roundLabels: ['Round 1', 'Round 2'],
    cut: 5,
    href: '#board',
    rows: TWELVE.slice(0, 8).map((name, i) => ({ id: CAP_ROSTER[i]!.id, name, rounds: [String(69 + i), i === 7 ? '' : String(70 + ((i * 3) % 5))].filter(Boolean), total: i === 7 ? String(69 + i) : String(139 + i + ((i * 3) % 5)), toPar: i === 0 ? '−5' : i === 3 ? 'E' : i < 3 ? `−${4 - i}` : `+${i - 2}`, href: `#rounds-${i}` })),
  }),
  { id: 'schedule_read', kind: 'schedule', title: 'The calendar, from the schedule read', read: 'r8', part: fromReadOr(STUDIO_READ_SCHEDULE, 'schedule'), note: 'What a real answer draws: the read’s own events, in the team’s time zone.' },
  { id: 'board_read', kind: 'qualifier_board', title: 'A board, from the qualifier read', read: 'r9', part: fromReadOr(STUDIO_READ_BOARD, 'qualifier_board'), note: 'The read carries each card’s total, not each round, and the cut is the squad less the coach’s picks.' },
  { id: 'round_read', kind: 'round', title: 'A round, from the round read', read: 'r5', part: fromReadOr(STUDIO_READ_ROUND, 'round') },
  make('round_strip', 'round', 'A round hole by hole, to par', 'r5', { title: null, strip: { type: 'hole_strip', holes: PAR.map((par, i) => ({ hole_number: i + 1, to_par: SHOT[i]! - par })) } }),
  make('distance_misses', 'distance_profile', 'Where the misses go', 'r7', { form: 'misses', misses: { type: 'miss_pattern', total: 64, no_direction: 6, inside_15: 14, inside_25: 31, wedges: [{ direction: 'long', count: 4, avg_left_ft: 31 }, { direction: 'long_right', count: 6, avg_left_ft: 34 }, { direction: 'right', count: 17, avg_left_ft: 38 }, { direction: 'short_right', count: 11, avg_left_ft: 42 }, { direction: 'short', count: 9, avg_left_ft: 36 }, { direction: 'short_left', count: 5, avg_left_ft: 29 }, { direction: 'left', count: 4, avg_left_ft: 27 }, { direction: 'long_left', count: 2, avg_left_ft: 24 }] } }),
  {
    ...make('distance_compass', 'distance_profile', 'The Miss Compass: choose a direction, see its shots', 'r7', {
      form: 'misses',
      misses: { type: 'miss_pattern', total: COMPASS_TOTAL, no_direction: 6, inside_15: 19, inside_25: 41, wedges: Object.entries(COMPASS_COUNTS).map(([direction, count]) => ({ direction, count, avg_left_ft: 30 })), shots: { ref: 'e7', cap: 40, directions: COMPASS_SHOTS } },
    }, 'Drawn with its team flag on. A direction opens its shots, newest round first; Right holds 46, so its list says it shows the newest 40.'),
    compass: true,
  },
  make('trend_seasons', 'trend', 'This season against last', 'r4', { form: 'seasons', seasons: { type: 'season_compare', metric: 'Scoring average to par', this_season: { mean: 2.1, lo: 0.4, hi: 3.8, n: 9 }, last_season: { mean: 3.4, lo: 1.6, hi: 5.2, n: 22 }, method: 'Full rounds that count, practice left out.' } }),
  make('practice_plan', 'practice_plan', 'A practice plan, as a run sheet', 'r10', { form: 'plan', plan: PP_PLAN_PART }, 'The practice lane’s own plan card, mounted as it is.'),
  make('practice_brief', 'practice_plan', 'The questions asked before a plan is drafted', 'r10', { form: 'brief', brief: { title: 'Thursday’s practice', questions: [{ id: 'focus', title: 'What should it work on?', why: 'The team lost most strokes here over the last 8 rounds.', options: [{ id: 'putt', label: 'Putting inside 8 feet', hint: 'from the read' }, { id: 'app', label: 'Approach, 150 to 175 yards' }], pick: ['putt'] }] } }),
  make('document', 'document', 'A long piece kept beside the chat', 'r11', { form: 'document', doc: { kind: 'player_report', title: 'Eli Brandt: fall review', at: '2026-11-10T21:04:00.000Z', body: 'Eli played 9 rounds this fall and averaged 71.2.\n\nHis putting inside 8 feet is the best on the team. His approach play from 150 to 175 yards cost him the most.' } }),
  make('handoff', 'document', 'A draft handed to Messages', 'r11', { form: 'handoff', handoff: { kind: 'message', players: [CAP_ROSTER[0]!.id, CAP_ROSTER[1]!.id, CAP_ROSTER[2]!.id], title: 'Draft for 3 players', draft: 'Nice work at Ridgeline. Post your cards hole by hole tonight and I will set the tee times in the morning.' } }),
  make('app_link', 'app_link', 'A way into a screen of the app', 'r12', { link: { label: 'Open Roster requests', href: '#app_link', purpose: 'Players who asked to join, waiting for you.' } }),
  make('note', 'note', 'A sentence about a visual, said as what it is', 'r13', { form: 'visual', claim: 'hypothesis', text: 'The drop inside 8 feet lines up with the two rounds on the slower greens.' }),
  make('note_kept', 'note', 'A note the coach asked to keep', 'r13', { form: 'kept', note: { op: 'saved', note_id: 'n1', text: 'Qualifying is 54 holes and the low four count.' } }),
  make('on_record', 'on_record', 'What is on record', 'r13', { title: 'What CoachHelm keeps for you', rows: [{ label: 'Qualifying', value: '54 holes, the low four count' }, { label: 'Home course', value: 'Ridgeline, back tees' }, { label: 'Usual practice', value: '2.5 hours, Tuesday and Thursday' }] }),
  make('action_preview', 'action', 'What a task will do', 'r14', { tool: event.tool, proposal: event.proposal }, 'The body only: the frame, the keys and the ring are the task card’s, shown in the first section.'),
  make('receipt', 'action', 'What a task did', 'r14', { tool: event.tool, proposal: event.proposal, receipt: event.saved }),
  make('table', 'table', 'The fallback: rows and columns', 'r15', { table: { caption: 'Open tasks, by player', columns: ['Player', 'Task', 'Due'], rows: [['Eli Brandt', 'Post the Ridgeline card', 'Thu, Nov 12'], ['Jonah Okafor', 'Putting ladder, 4 to 8 feet', 'Fri, Nov 13'], ['Priya Natarajan', 'Book the range slot', 'Mon, Nov 16']] } }),
  { id: 'unknown', kind: 'table', title: 'A kind this build does not know', read: 'r16', note: 'A newer engine sent “heat_map”. It is drawn as a table from its rows, never as nothing.', part: { kind: 'heat_map', data: { cells: [{ zone: 'Front left', shots: 14, average_feet_left: 21 }, { zone: 'Front right', shots: 9, average_feet_left: 17 }, { zone: 'Back', shots: 6, average_feet_left: 28 }] } } },
];

/** The composition fixture's blocks, each through `fromBlock`: what a model-designed visual draws when its blocks go to the studio. */
export const STUDIO_COMPOSED: ReadonlyArray<{ type: ResolvedBlock['type']; part: { kind: string; data: unknown } }> = (ASK_COMPOSITION.blocks as ResolvedBlock[]).map((b) => ({ type: b.type, part: fromBlock(b) }));

export const studioSpecimen = (id: string | null | undefined): StudioSpecimen | undefined => STUDIO_SPECIMENS.find((s) => s.id === id);
