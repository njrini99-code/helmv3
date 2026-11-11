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
import { fromBlock, fromEvidence, type StudioData, type StudioHole } from '../screens/coachhelm/chat/studio';
import { ASK_COMPOSITION, ASK_EV_JONAH_SG, ASK_EV_JONAH_TREND, ASK_EV_SLOPE, ASK_EV_TEAM_SG } from './fixtures-ask-thread';
import { CAP_ROSTER, capTask } from './fixtures-chat-capabilities';
import { PP_PLAN_PART } from './fixtures-practice-plan';

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
const SHOT = [4, 5, 3, 4, 4, 4, 5, 4, 5, 4, 2, 6, 5, 4, 4, 3, 5, 4];
const HOLES: StudioHole[] = PAR.map((par, i) => ({ n: i + 1, par, score: SHOT[i]! }));

const TWELVE = ['Eli Brandt', 'Jonah Okafor', 'Priya Natarajan', 'Theo Marchetti', 'Sam Whitfield', 'Sofia Alvarez', 'Ava Lindqvist', 'Owen Park', 'Marcus Delacroix-Whitmore', 'Leo Tanaka', 'Noor Haddad', 'Wes Callahan'];
const figure = (display: string, tone: 'good' | 'loss' | 'plain' = 'plain') => ({ display, tone });
const sg = (v: number) => figure(`${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(2)}`, v > 0.05 ? 'good' : v < -0.05 ? 'loss' : 'plain');
const TEAM_TABLE: AskTeamTable = {
  players: TWELVE.map((label, i) => ({ id: CAP_ROSTER[i]?.id ?? `p-${i}`, label, sample: i === 9 ? 'over 2 rounds' : `over ${6 + (i % 3)} rounds` })),
  metrics: [
    { id: 'avg', label: 'Scoring average', short: 'Average', unit: 'score', strokes: false },
    { id: 'sg_putt', label: 'Strokes gained putting', short: 'Putting', unit: 'strokes', strokes: true },
    { id: 'gir', label: 'Greens in regulation', short: 'Greens', unit: 'percent', strokes: false },
    { id: 'putts', label: 'Putts per round', short: 'Putts', unit: 'count', strokes: false },
  ],
  cells: TWELVE.map((_, i) => [figure((71.2 + i * 0.45).toFixed(1)), sg(0.62 - i * 0.11), figure(`${68 - i * 2}%`), i === 10 ? null : figure((29.1 + i * 0.3).toFixed(1))]),
  best: [CAP_ROSTER[0]!.id, CAP_ROSTER[0]!.id, CAP_ROSTER[0]!.id, CAP_ROSTER[0]!.id],
  playersAsRows: true,
};

const event = capTask('create_event');

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
  make('practice_plan', 'practice_plan', 'A practice plan, as a run sheet', 'r10', { form: 'plan', plan: PP_PLAN_PART }, 'The practice lane’s own plan card, mounted as it is.'),
  make('practice_brief', 'practice_plan', 'The questions asked before a plan is drafted', 'r10', { form: 'brief', brief: { title: 'Thursday’s practice', questions: [{ id: 'focus', title: 'What should it work on?', why: 'The team lost most strokes here over the last 8 rounds.', options: [{ id: 'putt', label: 'Putting inside 8 feet', hint: 'from the read' }, { id: 'app', label: 'Approach, 150 to 175 yards' }], pick: ['putt'] }] } }),
  make('document', 'document', 'A long piece kept beside the chat', 'r11', { form: 'document', doc: { kind: 'player_report', title: 'Eli Brandt: fall review', at: '2026-11-10T21:04:00.000Z', body: 'Eli played 9 rounds this fall and averaged 71.2.\n\nHis putting inside 8 feet is the best on the team. His approach play from 150 to 175 yards cost him the most.' } }),
  make('handoff', 'document', 'A draft handed to Messages', 'r11', { form: 'handoff', handoff: { kind: 'message', players: [CAP_ROSTER[0]!.id, CAP_ROSTER[1]!.id, CAP_ROSTER[2]!.id], title: 'Draft for 3 players', draft: 'Nice work at Ridgeline. Post your cards hole by hole tonight and I will set the tee times in the morning.' } }),
  make('app_link', 'app_link', 'A way into a screen of the app', 'r12', { link: { label: 'Open Roster requests', href: '#app_link', purpose: 'Players who asked to join, waiting for you.' } }),
  make('note', 'note', 'A sentence about a visual, said as what it is', 'r13', { form: 'visual', claim: 'hypothesis', text: 'The drop inside 8 feet lines up with the two rounds on the slower greens.' }),
  make('note_kept', 'note', 'A note the coach asked to keep', 'r13', { form: 'kept', note: { op: 'saved', note_id: 'n1', text: 'Qualifying is 54 holes and the low four count.' } }),
  make('on_record', 'note', 'What is on record', 'r13', { form: 'record', title: 'What CoachHelm keeps for you', rows: [{ label: 'Qualifying', value: '54 holes, the low four count' }, { label: 'Home course', value: 'Ridgeline, back tees' }, { label: 'Usual practice', value: '2.5 hours, Tuesday and Thursday' }] }),
  make('action_preview', 'action_preview', 'What a task will do', 'r14', { tool: event.tool, proposal: event.proposal }, 'The body only: the frame, the keys and the ring are the task card’s, shown in the first section.'),
  make('receipt', 'receipt', 'What a task did', 'r14', { tool: event.tool, proposal: event.proposal, receipt: event.saved }),
  make('table', 'table', 'The fallback: rows and columns', 'r15', { table: { caption: 'Open tasks, by player', columns: ['Player', 'Task', 'Due'], rows: [['Eli Brandt', 'Post the Ridgeline card', 'Thu, Nov 12'], ['Jonah Okafor', 'Putting ladder, 4 to 8 feet', 'Fri, Nov 13'], ['Priya Natarajan', 'Book the range slot', 'Mon, Nov 16']] } }),
  { id: 'unknown', kind: 'table', title: 'A kind this build does not know', read: 'r16', note: 'A newer engine sent “heat_map”. It is drawn as a table from its rows, never as nothing.', part: { kind: 'heat_map', data: { cells: [{ zone: 'Front left', shots: 14, average_feet_left: 21 }, { zone: 'Front right', shots: 9, average_feet_left: 17 }, { zone: 'Back', shots: 6, average_feet_left: 28 }] } } },
];

/** The composition fixture's blocks, each through `fromBlock`: what a model-designed visual draws when its blocks go to the studio. */
export const STUDIO_COMPOSED: ReadonlyArray<{ type: ResolvedBlock['type']; part: { kind: string; data: unknown } }> = (ASK_COMPOSITION.blocks as ResolvedBlock[]).map((b) => ({ type: b.type, part: fromBlock(b) }));

export const studioSpecimen = (id: string | null | undefined): StudioSpecimen | undefined => STUDIO_SPECIMENS.find((s) => s.id === id);
