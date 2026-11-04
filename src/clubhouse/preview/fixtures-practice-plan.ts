import type { PlanPartData } from '../screens/coachhelm/plan/PlanCard';

/** The design page's model (03-DATA-CHECKS): Demo University Golf, Thu Nov 5 2026, 2:00 to 5:00 PM, Lakeside Golf Club. */
const P = ['Sofia', 'Maya', 'Lena', 'Eli', 'Jonah', 'Owen', 'Nora', 'Ava', 'Jade'].map((name, i) => ({ id: `00000000-0000-4000-8000-00000000000${i + 1}`, name }));
export const PP_NAMES: ReadonlyMap<string, string> = new Map(P.map((p) => [p.id, p.name]));
export const PP_COACHES = ['Coach Lin', 'Coach Rivera'];
const ids = (from: number, to: number) => P.slice(from, to).map((p) => p.id);

export const PP_PLAN_PART: PlanPartData = {
  version: 1,
  eventId: '00000000-0000-4000-8000-0000000000e1',
  title: 'Short game and pressure',
  draft: {
    version: 1,
    why: {
      warm: { aim: '', because: null, sources: [], lean: false, routine: true },
      rot: { aim: 'Lag and short putts', because: 'The team loses 0.9 a round putting, most of it from 15 to 25 ft.', sources: [], lean: false, routine: false },
      move: { aim: '', because: null, sources: [], lean: false, routine: true },
      holes: { aim: 'Carry it to the course', because: null, sources: [], lean: true, routine: false },
      finish: { aim: 'Finish under pressure', because: 'A made-putt ladder keeps it honest.', sources: [], lean: false, routine: false },
      wrap: { aim: '', because: null, sources: [], lean: false, routine: true },
    },
    body: {
      v: 2,
      focus: 'Make more from 15 to 25 feet, and take it to the course.',
      notes: '',
      place: 'Lakeside Golf Club',
      arrivalBufferMin: 15,
      bring: [{ item: 'Alignment sticks', qty: 2 }, { item: 'Scorecards', qty: 1 }],
      players: P.map((p) => p.id),
      groups: [
        { id: 'A', name: 'A', players: ids(0, 3), savedGroupId: null },
        { id: 'B', name: 'B', players: ids(3, 6), savedGroupId: null },
        { id: 'C', name: 'C', players: ids(6, 9), savedGroupId: null },
      ],
      variants: {
        rain: null,
        main: {
          blocks: [
            { id: 'warm', kind: 'team', title: 'Warm-up', len: 30, coach: null, note: '', place: 'Range', drill: null },
            { id: 'rot', kind: 'stations', title: 'Putting rotation', len: 60, coach: null, note: '', stations: [{ id: 's1', place: 'Green, back', coach: null, drill: null, note: 'Lag ladder' }, { id: 's2', place: 'Green, front', coach: null, drill: null, note: 'Short putts' }, { id: 's3', place: 'Chipping green', coach: null, drill: null, note: 'Up and down' }], groupIds: ['A', 'B', 'C'], turnMin: 20, moveMin: 0, turns: 3, grid: [['A', 'B', 'C'], ['C', 'A', 'B'], ['B', 'C', 'A']] },
            { id: 'move', kind: 'break', title: 'Move', len: 10, coach: null, note: '', place: '' },
            { id: 'holes', kind: 'course', title: 'Holes 1 to 6', len: 60, coach: null, note: '', holeFrom: 1, holeTo: 6, format: 'stroke', pairings: [], qualifierId: null },
            { id: 'finish', kind: 'team', title: 'Pressure finish', len: 15, coach: null, note: 'Ladder, make to move on', place: 'Practice green', drill: null },
            { id: 'wrap', kind: 'team', title: 'Wrap', len: 5, coach: null, note: '', place: 'Practice green', drill: null },
          ],
        },
      },
    },
  },
};
