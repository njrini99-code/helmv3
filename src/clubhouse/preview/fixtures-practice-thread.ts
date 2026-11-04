import type { UIMessage } from 'ai';
import type { PlanCardPreview, PlanPartData } from '../screens/coachhelm/plan/PlanCard';
import type { ReadPictureData } from '../screens/coachhelm/plan/ReadPicture';
import type { ActionProposal, ActionReceipt } from '@/lib/coachhelm/v3/chat/action-types';
import { PP_COACHES, PP_NAMES } from './fixtures-practice-plan';

/** The design page's plan (practice-plan 03): Demo University Golf, Thu Nov 5 2026, 2:00 to 5:00 PM at Lakeside, groups A, B, C of three. */
const SOURCES: Record<string, Array<{ ref: string; label: string }>> = {
  b1: [{ ref: 'classes', label: 'Classes' }],
  b2: [{ ref: 'stats', label: 'Stats · Last 10 rounds' }, { ref: 'putting', label: 'Putting by distance' }],
  b4: [{ ref: 'calendar', label: 'Calendar · Mon, Nov 9' }],
  b5: [{ ref: 'putting', label: 'Putting by distance' }],
};
const ids = [...PP_NAMES.keys()];
export const PT_PLAN: PlanPartData = {
  version: 1,
  eventId: '00000000-0000-4000-8000-0000000000e1',
  title: 'Thursday practice',
  saveOn: true,
  when: 'Thu, Nov 5 · 2:00 to 5:00 PM',
  start: '14:00',
  sources: SOURCES,
  sheet: { team: 'Demo University Golf', start: '2026-11-05T19:00:00Z', end: '2026-11-05T22:00:00Z', zone: 'America/New_York', coaches: PP_COACHES, names: Object.fromEntries(PP_NAMES) },
  drills: {
    'team:clock': { name: 'Clock drill, 3 to 5 ft', kind: 'skill' },
    'team:lag': { name: 'Lag ladder, 20 to 40 ft', kind: 'skill' },
    'team:updown': { name: 'Up and down from 20 yards', kind: 'random' },
    'team:make7': { name: 'Make 7 from 5 feet', kind: 'pressure' },
  },
  alternatives: {
    s1: [
      { ref: 'team:make7', name: 'Make 7 from 5 feet', kind: 'pressure', min: 20, line: 'Same 3 to 5 ft gap, practised under pressure. Your bank, used twice.' },
      { ref: 'lib:gate', name: 'Gate drill, 4 feet', kind: 'skill', min: 15, line: 'Same gap; starts the ball on line. GolfHelm library.' },
      { ref: 'team:circle', name: 'Circle of tees, 3 to 5 ft', kind: 'skill', min: 20, line: 'Same gap, every direction of break. Your bank.' },
    ],
  },
  evidence: {
    putting: {
      label: 'Putting by distance',
      line: 'Team, last 10 rounds · 86 player-rounds · 412 putts from 3 to 5 ft',
      rows: [
        { label: '3 to 5 ft', value: '78%', pct: 78, tour: 90.5 },
        { label: '5 to 10 ft', value: '55%', pct: 55, tour: 62.2 },
        { label: '10 to 15 ft', value: '31%', pct: 31, tour: 35.7 },
        { label: '15 to 25 ft', value: '13%', pct: 13, tour: 15.4 },
      ],
    },
  },
  draft: {
    version: 1,
    why: {
      b1: { aim: '', because: null, sources: [], lean: false, routine: true },
      b2: { aim: 'More makes from 3 to 5 feet, better speed from long range.', because: 'Putting costs the team 0.9 strokes a round against the scoring baseline, the most of any part of the game. Last 10 team rounds.', sources: [], lean: false, routine: false },
      b3: { aim: '', because: null, sources: [], lean: false, routine: true },
      b4: { aim: 'Putt for score on real greens.', because: 'The Hargrove Invitational starts Monday, four days later.', sources: [], lean: false, routine: false },
      b5: { aim: 'Hole the short ones when it counts.', because: 'The team makes 78% from 3 to 5 feet across 412 putts; the Tour line is 90.5%.', sources: [], lean: false, routine: false },
      b6: { aim: '', because: null, sources: [], lean: false, routine: true },
    },
    body: {
      v: 2,
      focus: 'Putts inside 6 feet and speed from long range. Finish under pressure.',
      notes: '',
      place: 'Lakeside Golf Club',
      arrivalBufferMin: 15,
      bring: [],
      players: ids,
      groups: [
        { id: 'A', name: 'A', players: ids.slice(0, 3), savedGroupId: null },
        { id: 'B', name: 'B', players: ids.slice(3, 6), savedGroupId: null },
        { id: 'C', name: 'C', players: ids.slice(6, 9), savedGroupId: null },
      ],
      variants: {
        rain: null,
        main: {
          blocks: [
            { id: 'b1', kind: 'team', title: 'Warm-up', len: 30, coach: null, note: 'Runs to 2:30 so Ava and Jade, in class until 2:15, make every turn.', place: 'Range', drill: null },
            {
              id: 'b2', kind: 'stations', title: 'Putting rotation', len: 60, coach: null, note: '', groupIds: ['A', 'B', 'C'], turnMin: 20, moveMin: 0, turns: 3, grid: [['A', 'B', 'C'], ['C', 'A', 'B'], ['B', 'C', 'A']],
              stations: [
                { id: 's1', place: 'Putting green', coach: 'Coach Lin', drill: { src: 'team', id: 'clock' }, note: '' },
                { id: 's2', place: 'Green, back', coach: 'Coach Rivera', drill: { src: 'team', id: 'lag' }, note: '' },
                { id: 's3', place: 'Chipping green', coach: null, drill: { src: 'team', id: 'updown' }, note: '' },
              ],
            },
            { id: 'b3', kind: 'break', title: 'Move to the course', len: 10, coach: null, note: '', place: 'Water at the cart barn' },
            { id: 'b4', kind: 'course', title: 'Holes 1 to 6, putt everything out', len: 60, coach: null, note: '', holeFrom: 1, holeTo: 6, format: 'stroke', pairings: [], qualifierId: null },
            { id: 'b5', kind: 'team', title: 'Pressure finish: 25 in a row from 3 feet', len: 15, coach: null, note: '', place: 'Putting green', drill: { src: 'team', id: 'make7' } },
            { id: 'b6', kind: 'team', title: 'Wrap', len: 5, coach: null, note: '', place: 'Clubhouse patio', drill: null },
          ],
        },
      },
    },
  },
};

const PICS: Record<string, ReadPictureData> = {
  cal: { kind: 'cal', days: [{ day: 'Thu', date: '5', event: 'Practice 2 to 5', on: true }, { day: 'Fri', date: '6' }, { day: 'Sat', date: '7' }, { day: 'Sun', date: '8' }, { day: 'Mon', date: '9', event: 'Hargrove', other: true }] },
  sg: { kind: 'sg', title: 'Strokes gained a round, last 10 team rounds', rows: [{ label: 'Off the tee', value: 0.2 }, { label: 'Approach', value: -0.4 }, { label: 'Around the green', value: -0.3 }, { label: 'Putting', value: -0.9 }] },
  pd: { kind: 'pd', title: 'Made, team against the Tour line (tick)', rows: [{ label: '3 to 5 ft', pct: 78, tour: 90.5 }, { label: '5 to 10 ft', pct: 55, tour: 62.2 }, { label: '10 to 15 ft', pct: 31, tour: 35.7 }, { label: '15 to 25 ft', pct: 13, tour: 15.4 }] },
  cls: { kind: 'cls', lines: [{ label: 'Ava, Jade', tag: 'Class', from: 0, to: 25, tone: 'class' }, { label: 'Putting', tag: 'Rotation', from: 50, to: 100, tone: 'plan' }], axis: [{ at: 0, label: '2:00' }, { at: 25, label: '2:15' }, { at: 50, label: '2:30' }, { at: 100, label: '3:00' }] },
  dr: { kind: 'dr', cards: [{ name: 'Clock drill', kind: 'skill' }, { name: 'Lag ladder', kind: 'skill' }, { name: '25 in a row', kind: 'pressure' }], more: 13 },
};
const user = (id: string, text: string) => ({ id, role: 'user', parts: [{ type: 'text', text }] }) as unknown as UIMessage;
const assistant = (id: string, parts: unknown[]) => ({ id, role: 'assistant', parts }) as unknown as UIMessage;
const step = (i: number, label: string, detail: string, pic?: string, active = false) => ({ type: 'data-progress', id: `p${i}`, data: { label, tool: 'read', ...(active ? { state: 'active' } : { state: 'done', done: label, detail, ...(pic ? { picture: PICS[pic] } : {}) }) } });
const STEPS = (pics: boolean) => [
  step(1, 'Checking Thursday on the calendar', 'Thu, Nov 5 · 2:00 to 5:00 PM · Lakeside · Hargrove starts Monday', pics ? 'cal' : undefined),
  step(2, 'Reading the last 10 team rounds', 'Putting loses the most: −0.9 a round against the scoring baseline', pics ? 'sg' : undefined),
  step(3, 'Comparing putting by distance', '3 to 5 ft: 78% made, Tour line 90.5%. 0.8 three-putts a round', pics ? 'pd' : undefined),
  step(4, 'Checking class times', 'Ava and Jade are in class until 2:15', pics ? 'cls' : undefined),
  step(5, 'Reading your drill bank', '12 putting drills, 4 short game', pics ? 'dr' : undefined),
];
const ASK = 'Build Thursday’s practice around putting';
const BRIEF = '3 h · short putts, lag, up and down, holes 1 to 6 · everyone';
const PROSE = { type: 'text', text: 'Built around where the team loses most: short putts and speed from long range. The rotation starts at 2:30 so Ava and Jade make every turn.\n\nIt’s a draft. Nothing reaches players until you publish.', state: 'done' };
const INTAKE = {
  type: 'data-brief',
  id: 'brief-1',
  data: {
    title: 'What should Thursday cover?',
    intake: { line: 'Best guesses are picked. Change any.', format: 'Fall practice sheet' },
    questions: [
      { id: 'len', title: 'How long', why: 'Your calendar has 2:00 to 5:00', pick: ['3 h'], options: ['2 h', '2 h 30', '3 h'].map((o) => ({ id: o, label: o })) },
      { id: 'work', title: 'Work on · pick any', multi: true, why: 'Your stats point at the first two. Hargrove starts Monday.', pick: ['Short putts, 3 to 5 ft', 'Lag, 20 to 40 ft'], options: ['Short putts, 3 to 5 ft', 'Lag, 20 to 40 ft', 'Up and down', 'On course, holes 1 to 6'].map((o) => ({ id: o, label: o })) },
      { id: 'who', title: 'Who', why: '9 going, 1 can’t', pick: ['Everyone, Tuesday’s groups'], options: ['Everyone, Tuesday’s groups', 'Travel squad', 'Pick players'].map((o) => ({ id: o, label: o })) },
    ],
  },
};
const planPart = (plan: PlanPartData = PT_PLAN) => ({ type: 'data-practice-plan', id: 'plan-1', data: plan });
const built = (extra: unknown[] = []): UIMessage[] => [
  user('u1', ASK),
  assistant('a1', [...STEPS(false), INTAKE]),
  user('u2', BRIEF),
  assistant('a2', [planPart(), PROSE, ...extra]),
];
const PUBLISH: ActionProposal & { tool: string } = {
  tool: 'publish_practice_plan',
  action: 'Publish to 11 people',
  summary: 'Players get the plan and where they start. It files in Documents, shared with players.',
  idempotency_key: 'key-plan',
  affects: [],
  missing: [],
  facts: [{ label: 'When', value: 'Thu, Nov 5 · 2:00 to 5:00 PM' }, { label: 'Where', value: 'Lakeside Golf Club' }, { label: 'Tells', value: '9 players and 2 coaches, push and bell' }, { label: 'Files to', value: 'Documents › Practice plans' }, { label: 'What they get', value: 'You start on the putting green with Group B' }],
  notifications: ['it files in Documents now. The 11 people hear once Undo closes, 8 seconds later.'],
  publish: {
    heading: 'Publish Thursday’s plan?',
    tellsLine: '9 players and 2 coaches, push and bell',
    folder: 'Practice plans',
    coins: ['Sam Moore', 'Jonah Okafor', 'Eli Brandt', 'Theo Marchetti', 'Ava Lindqvist', 'Priya Natarajan', 'Sofia Alvarez', 'Dan Whitfield', 'Owen Park'].map((name) => ({ name })),
    sample: { player: 'Jonah', title: 'Practice plan for Thursday', body: '2:00 PM · You start on the putting green with Group B' },
  },
};
const approval = (state: 'approval-requested' | 'approval-responded', approved?: boolean) => ({ type: 'tool-publish_practice_plan', toolCallId: 'call-1', input: {}, state, approval: approved === undefined ? { id: 'approval-1' } : { id: 'approval-1', approved } });
const proposalParts = (extra: unknown[]) => [{ type: 'data-action-proposal', id: 'proposal-key-plan', data: PUBLISH }, ...extra];
const receipt = (status: 'held' | 'completed'): ActionReceipt =>
  ({ status, ...(status === 'held' ? { held_until: '2099-01-01T00:00:00Z' } : {}), action: PUBLISH.action, summary: 'Published · Thu, Nov 5, 2:00 PM', created: [{ kind: 'practice_plan', label: 'Thursday practice', href: '/golf/dashboard/practice/plan/preview' }], notifications: status === 'held' ? [] : [{ channel: 'push', recipients: 11, status: 'sent', summary: 'Told 11 · push and bell' }], idempotency_key: 'key-plan' }) as unknown as ActionReceipt;

export const PT_FOLDERS = [{ name: 'Practice plans', count: 4 }, { name: 'Hargrove Invitational', count: 2 }, { name: 'Fall 2026 season', count: 11 }, { name: 'Wedges and chipping', count: 3 }];
const WITH = { folders: PT_FOLDERS };
const running = [user('u1', ASK), assistant('a1', [step(1, 'Checking Thursday on the calendar', '', undefined, true)])];

export const PT_STATES: Record<string, { messages: UIMessage[]; busy?: boolean; plan?: PlanCardPreview }> = {
  thread: { messages: built(), plan: WITH },
  steps: { messages: running, busy: true },
  stopped: { messages: [user('u1', ASK), assistant('a1', [step(1, 'Checking Thursday on the calendar', 'Thu, Nov 5 · 2:00 to 5:00 PM · Lakeside · Hargrove starts Monday', 'cal')])] },
  reads: { messages: [user('u1', ASK), assistant('a1', STEPS(true)), user('u2', BRIEF)], plan: { stepsOpen: true } },
  intake: { messages: [user('u1', ASK), assistant('a1', [...STEPS(false).slice(0, 1), INTAKE])] },
  writing: { messages: built(), plan: { ...WITH, phase: 'writing', writingAt: 1 }, busy: true },
  card: { messages: built(), plan: WITH },
  lean: { messages: [user('u1', ASK), assistant('a2', [planPart({ ...PT_PLAN, draft: { ...PT_PLAN.draft, why: { ...PT_PLAN.draft.why, b2: { aim: 'More makes from 3 to 5 feet.', because: null, sources: [], lean: true, routine: false } } } })])], plan: WITH },
  'empty-bank': { messages: [user('u1', ASK), assistant('a2', [planPart({ ...PT_PLAN, drills: {}, alternatives: {} })])], plan: { ...WITH, sheet: { kind: 'swap', id: 's1' } } },
  long: { messages: built(), plan: WITH },
  evidence: { messages: built(), plan: { ...WITH, sheet: { kind: 'evidence', ref: 'putting' } } },
  edit: { messages: built(), plan: { ...WITH, sheet: { kind: 'block', id: 'b5' } } },
  swap: { messages: built(), plan: { ...WITH, sheet: { kind: 'swap', id: 's1' } } },
  swapped: { messages: built(), plan: { ...WITH, swapped: true } },
  full: { messages: built(), plan: { ...WITH, full: true } },
  folders: { messages: built(), plan: { ...WITH, menu: 'open' } },
  newfolder: { messages: built(), plan: { ...WITH, menu: 'new' } },
  saving: { messages: built(), plan: { folders: [{ name: 'Hargrove week', count: 0 }, ...PT_FOLDERS], phase: 'saving' } },
  saved: { messages: built(), plan: { folders: PT_FOLDERS, phase: 'saved', menu: 'open' } },
  failed: { messages: built(), plan: { ...WITH, phase: 'failed' } },
  undone: { messages: built(), plan: { ...WITH, phase: 'undone' } },
  cancelled: { messages: built(proposalParts([approval('approval-responded', false)])), plan: WITH },
  confirm: { messages: built(proposalParts([approval('approval-requested')])), plan: WITH },
  publishing: { messages: built(proposalParts([approval('approval-responded', true)])), plan: WITH },
  published: { messages: built(proposalParts([approval('approval-responded', true), { type: 'data-action-receipt', id: 'receipt-key-plan', data: receipt('held') }])), plan: WITH },
  told: { messages: built(proposalParts([approval('approval-responded', true), { type: 'data-action-receipt', id: 'receipt-key-plan', data: receipt('completed') }])), plan: WITH },
  v2: { messages: built(), plan: { ...WITH, swapped: true, full: true } },
};
