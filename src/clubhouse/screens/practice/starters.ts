import { TERMS } from '../../lib/glossary';
import type { PlanArea, PlanBlock, PlanBodyV2 } from '@/lib/coachhelm/v3/practice-plan/model';

/**
 * The six "From GolfHelm" templates (N-00 4.16). Code, not rows. Each body has no date, coaches, players or pairings,
 * and its drills are plain block names and goals: a coach adds real drills after Use.
 */
export interface PlanStarter {
  id: string;
  name: string;
  minutes: number;
  line: string;
  body: PlanBodyV2;
}

let n = 0;
const id = (p: string) => `${p}${(n += 1)}`;
const team = (title: string, len: number, place: string, note = ''): PlanBlock => ({ id: id('b'), kind: 'team', title, len, coach: null, note, place, drill: null });
const own = (title: string, len: number, place: string): PlanBlock => ({ id: id('b'), kind: 'own', title, len, coach: null, note: '', place, lines: {} });
const groups = () => ['Group A', 'Group B', 'Group C'].map((name, i) => ({ id: `g${i + 1}`, name, players: [], savedGroupId: null }));
const body = (blocks: PlanBlock[], withGroups = false): PlanBodyV2 => ({ v: 2, focus: '', notes: '', place: '', arrivalBufferMin: 15, bring: [], players: [], groups: withGroups ? groups() : [], variants: { main: { blocks }, rain: null } });
const stations = (title: string, turnMin: number, places: string[]): PlanBlock => ({
  id: id('b'),
  kind: 'stations',
  title,
  len: turnMin * places.length,
  coach: null,
  note: '',
  stations: places.map((place) => ({ id: id('s'), place, coach: null, drill: null, note: '' })),
  groupIds: places.map((_, i) => `g${i + 1}`),
  turnMin,
  moveMin: 0,
  turns: places.length,
  grid: null,
});
const thirds = (area: string, place: string) => ['Skill', 'Random', 'Pressure'].map((k) => team(`${area}: ${k.toLowerCase()}`, 20, place));

export const PLAN_STARTERS: readonly PlanStarter[] = [
  { id: 'rule-of-thirds', name: 'Short game rule of thirds', minutes: 180, line: 'Putting, chipping and pitching, each as skill, random, then pressure', body: body([...thirds('Putting', 'Putting green'), ...thirds('Chipping', 'Short game area'), ...thirds('Pitching', 'Short game area')]) },
  { id: 'three-stations', name: 'Three-station rotation', minutes: 75, line: 'Warm-up, then three groups through three stations', body: body([team('Warm-up', 15, 'Range'), stations('Rotation', 20, ['Putting green', 'Short game area', 'Range'])], true) },
  {
    id: 'qualifier-day',
    name: 'Qualifier day',
    minutes: 315,
    line: 'Warm-up, 18 holes of stroke play, a short debrief',
    body: body([team('Warm-up', 30, 'Range'), { id: id('b'), kind: 'course', title: '18 holes, stroke play', len: 270, coach: null, note: 'Link it to a qualifier if it counts.', holeFrom: 1, holeTo: 18, format: 'stroke', pairings: [], qualifierId: null }, team('Debrief', 15, 'Clubhouse')]),
  },
  { id: 'tournament-prep', name: 'Tournament prep', minutes: 180, line: 'Play the course on the range, short game and putting to its speed', body: body([team('Warm-up', 20, 'Range'), team('Play the course on the range', 50, 'Range', 'One club per shot, as the card says.'), team('Short game to its green sizes', 40, 'Short game area'), team('Putting at its speed', 40, 'Putting green'), own('Own work', 30, 'Your choice')]) },
  { id: 'skills-test', name: 'Skills test', minutes: 120, line: 'A scored block for each part of the game', body: body([team('Lag putting', 30, 'Putting green', 'Holed 3, inside 3 ft 2, 3 to 6 ft 1, 6 to 9 ft 0, beyond 9 ft minus 1.'), team(TERMS.shortGame.long, 30, 'Short game area'), team('Approach', 30, 'Range'), team('Tee', 30, 'Range')]) },
  { id: 'class-day-75', name: 'Class-day 75', minutes: 75, line: 'A tight window: warm-up, two stations, a pressure finisher', body: body([team('Warm-up', 10, 'Range'), stations('Two stations', 25, ['Putting green', 'Short game area']), team('Pressure finisher', 15, 'Putting green')], true) },
];

export const AREA_WORDS: Record<PlanArea, string> = { putting: 'Putting', short_game: TERMS.shortGame.long, bunker: 'Bunker', approach: 'Approach', tee: 'Tee', course: 'Course', fitness: 'Fitness', mental: 'Mental' };
