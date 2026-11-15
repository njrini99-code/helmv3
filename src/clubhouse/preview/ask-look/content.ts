import { formatSG } from '../../lib/format';

/**
 * One turn of the CoachHelm chat, as fixture content for the look preview (docs/clubhouse/coachhelm-chat-v3/LOOK.md).
 * Nothing here is loaded or computed.
 */

export type LookFrame = 'work' | 'answer' | 'task' | 'hold';

export interface LookPart {
  key: 'tee' | 'approach' | 'around' | 'putting';
  name: string;
  /** Strokes gained a round against the team baseline, over the eight rounds. */
  value: number;
  /** The same, round by round (its mean is `value`). */
  rounds: readonly number[];
}

export const LOOK = {
  team: 'Finley University',
  player: 'Jonah Okafor',
  first: 'Jonah',
  coach: 'Maya Reyes',
  question: 'How is Jonah doing, and where is he losing strokes?',
  window: '8 rounds · Sep 1 to Sep 29',
  work: {
    title: 'Reading Jonah’s rounds',
    steps: [
      { state: 'done', label: 'Read his last 8 rounds' },
      { state: 'active', label: 'Comparing his game with the team' },
      { state: 'waiting', label: 'Drawing where the strokes go' },
    ] as const,
    summary: 'Read 8 rounds',
    meta: '3 steps · 4 s',
  },
  lead: 'Jonah is scoring two strokes better than he was a month ago, and approach play is where he still gives them back.',
  figure: { value: -0.9, label: 'strokes a round on approach', note: 'Against the team baseline, over 8 rounds' },
  parts: [
    { key: 'tee', name: 'Off the tee', value: 0.2, rounds: [0.4, 0, 0.3, 0.1, 0.5, -0.1, 0.2, 0.2] },
    { key: 'approach', name: 'Approach', value: -0.9, rounds: [-1.2, -0.8, -1.4, -0.6, -1.0, -0.7, -0.9, -0.6] },
    { key: 'around', name: 'Around the green', value: 0.1, rounds: [0.3, -0.2, 0.1, 0.4, -0.1, 0.2, 0, 0.1] },
    { key: 'putting', name: 'Putting', value: -0.3, rounds: [-0.6, -0.1, -0.5, -0.2, -0.4, 0.1, -0.5, -0.2] },
  ] as readonly LookPart[],
  trend: {
    title: 'Score to par, last 8 rounds',
    scores: [5, 4, 5, 3, 3, 2, 3, 1] as readonly number[],
    dates: ['Sep 1', 'Sep 5', 'Sep 8', 'Sep 12', 'Sep 15', 'Sep 19', 'Sep 22', 'Sep 29'] as readonly string[],
    average: 3.3,
    note: 'Two strokes better across his last four rounds than his first four.',
  },
  table: {
    title: 'Where approach leaks, by distance',
    rows: [
      { range: '150 to 175 yd', shots: 31, value: -0.4 },
      { range: '125 to 150 yd', shots: 27, value: -0.3 },
      { range: '175 to 200 yd', shots: 22, value: -0.2 },
    ] as const,
  },
  sources: [
    { n: 1, title: 'Strokes gained, tee to green', meta: '8 rounds' },
    { n: 2, title: 'Round scores', meta: 'Sep 1 to Sep 29' },
    { n: 3, title: 'Approach shots by distance', meta: '80 shots' },
  ] as const,
  task: {
    question: 'Give Jonah a focus area on downhill putts',
    lead: 'Here is the focus as Jonah will read it. Nothing is saved until you confirm.',
    title: 'Give Jonah a focus area on downhill putts',
    kind: 'New focus',
    fields: [
      { key: 'Player', value: 'Jonah Okafor' },
      { key: 'Focus', value: 'Downhill putts, 4 to 6 feet' },
      { key: 'Goal', value: 'Make 7 of 10 in two practices' },
      { key: 'Review', value: 'Tue, Oct 14' },
      { key: 'Told', value: 'Jonah, when it saves' },
      { key: 'Appears', value: 'His Home, under Focus' },
    ] as const,
    hold: { total: 8, left: 6, line: 'Saves in 6 seconds, then Jonah is told.' },
    /* The focus itself, as Jonah's Home will show it (the leaf draws this, never the fields above as a table). */
    focus: { title: 'Downhill putts, 4 to 6 feet', goal: 'Make 7 of 10 in two practices', review: 'Review Tue, Oct 14', from: 'From Coach Reyes' },
    told: 'Jonah is told when it saves. It appears on his Home, under Focus.',
    lands: 'It appears on his Home, under Focus.',
  },
  foot: 'CoachHelm reads Finley University data only. Check the numbers before you act on them.',
} as const;

/** A strokes-gained figure: a sign always, a true minus, one decimal. */
export function sg(value: number): string {
  return formatSG(value);
}

/** A score to par: E for even, a true minus under par. */
export function toPar(value: number): string {
  if (value === 0) return 'E';
  return (value > 0 ? '+' : '−') + Math.abs(value);
}

export function tone(value: number): 'gain' | 'loss' | 'flat' {
  return value > 0 ? 'gain' : value < 0 ? 'loss' : 'flat';
}
