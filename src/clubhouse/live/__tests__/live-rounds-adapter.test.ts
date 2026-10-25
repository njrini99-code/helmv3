import { describe, expect, it } from 'vitest';
import { laneFromLiveRow, laneFromPollRow, type GolfRoundLiveRow, type PollRoundRow } from '../live-rounds-adapter';

const ROSTER = { p1: 'Sofia Reyes' };

const liveRow = (over: Partial<GolfRoundLiveRow> = {}): GolfRoundLiveRow => ({
  round_id: 'r1',
  team_id: 't1',
  player_id: 'p1',
  round_type: 'qualifier',
  qualifier_id: 'q1',
  qualifier_round: 2,
  round_date: '2026-10-14',
  course_id: null,
  course_name: 'Pine Hollow GC',
  holes_planned: 18,
  start_position: 1,
  current_hole: 4,
  share: 'coaches',
  phase: 'on_course',
  thru: 3,
  to_par: -1,
  strokes: 12,
  holes: [
    { n: 1, p: 4, y: 388, s: 4, at: '2026-10-14T17:00:00Z' },
    { n: 2, p: 5, y: 512, s: 4, at: '2026-10-14T17:14:00Z' },
    { n: 3, p: 4, y: 401, s: 4, at: '2026-10-14T17:30:00Z' },
    { n: 4, p: 3, y: 176, s: null, at: null },
  ],
  last_hole_at: '2026-10-14T17:30:00Z',
  heard_at: '2026-10-14T17:31:00Z',
  started_at: '2026-10-14T16:40:00Z',
  ended_at: null,
  seq: '17',
  ...over,
});

describe('laneFromLiveRow', () => {
  it('turns a live row into a lane, the name coming from the roster', () => {
    const lane = laneFromLiveRow(liveRow(), ROSTER)!;
    expect(lane).toMatchObject({ roundId: 'r1', playerId: 'p1', name: 'Sofia Reyes', initials: 'SR', roundType: 'qualifier', qualifierRound: 2, thru: 3, toPar: -1, strokes: 12, currentHole: 4, seq: 17, source: 'live' });
    expect(lane.holes[0]).toEqual({ n: 1, par: 4, yds: 388, score: 4, at: '2026-10-14T17:00:00Z' });
    expect(lane.holes[3]).toEqual({ n: 4, par: 3, yds: 176, score: null, at: null });
  });
  it('current_hole is a hole number: a value outside 1 to 18 is unknown', () => {
    expect(laneFromLiveRow(liveRow({ current_hole: 0 }), ROSTER)!.currentHole).toBeNull();
    expect(laneFromLiveRow(liveRow({ current_hole: 19 }), ROSTER)!.currentHole).toBeNull();
    expect(laneFromLiveRow(liveRow({ current_hole: 18 }), ROSTER)!.currentHole).toBe(18);
  });
  it('normalises the legacy qualifying type, a nine-hole plan and a shotgun start', () => {
    const lane = laneFromLiveRow(liveRow({ round_type: 'qualifying', holes_planned: 9, start_position: 6 }), ROSTER)!;
    expect(lane).toMatchObject({ roundType: 'qualifier', holesPlanned: 9, startPosition: 6 });
  });
  it('drops a row with an unknown phase or share instead of drawing it', () => {
    expect(laneFromLiveRow(liveRow({ phase: 'weird' }), ROSTER)).toBeNull();
    expect(laneFromLiveRow(liveRow({ share: 'everyone' }), ROSTER)).toBeNull();
  });
  it('a player the roster does not know has no name rather than a wrong one', () => {
    expect(laneFromLiveRow(liveRow({ player_id: 'p9' }), ROSTER)!.name).toBe('');
  });
});

const pollRow = (over: Partial<PollRoundRow> = {}): PollRoundRow => ({
  id: 'r1',
  player_id: 'p1',
  team_id: 't1',
  round_type: 'qualifying',
  qualifier_id: 'q1',
  qualifier_round_number: 2,
  round_date: '2026-10-14',
  course_id: null,
  course_name: 'Pine Hollow GC',
  holes_played: 18,
  current_hole: 3,
  status: 'in_progress',
  created_at: '2026-10-14T16:40:00Z',
  updated_at: '2026-10-14T17:31:00Z',
  // The save writes a row for every planned hole with score null until it is scored (round-partial.ts).
  plan: [
    { number: 1, par: 4, yardage: 388 },
    { number: 2, par: 5, yardage: 512 },
    { number: 3, par: 4, yardage: 401 },
    { number: 4, par: 3, yardage: 176 },
  ],
  start_hole: null,
  golf_holes: [
    { hole_number: 1, par: 4, score: 4, yardage: 388 },
    { hole_number: 2, par: 5, score: 4, yardage: 512 },
    { hole_number: 3, par: 4, score: null, yardage: 401 },
  ],
  ...over,
});

describe('laneFromPollRow (v0)', () => {
  it('merges the hole plan with the scored holes; a hole row with no score is unplayed', () => {
    const lane = laneFromPollRow(pollRow(), ROSTER)!;
    expect(lane.holes.map((h) => [h.n, h.par, h.score])).toEqual([[1, 4, 4], [2, 5, 4], [3, 4, null], [4, 3, null]]);
    expect(lane).toMatchObject({ thru: 2, toPar: -1, strokes: 8, phase: 'on_course', roundType: 'qualifier', share: 'coaches', source: 'poll', seq: 0, currentHole: 3 });
  });
  it('derives the phase from the status and the holes: completed is posted, abandoned is stopped, all scored is finished', () => {
    expect(laneFromPollRow(pollRow({ status: 'completed' }), ROSTER)!.phase).toBe('posted');
    expect(laneFromPollRow(pollRow({ status: 'abandoned' }), ROSTER)!.phase).toBe('stopped');
    const all = pollRow({ holes_played: 9, plan: null, golf_holes: Array.from({ length: 9 }, (_, i) => ({ hole_number: i + 1, par: 4, score: 4, yardage: null })) });
    expect(laneFromPollRow(all, ROSTER)!.phase).toBe('finished');
  });
  it('reads the shotgun start from the plan', () => {
    expect(laneFromPollRow(pollRow({ start_hole: '10' }), ROSTER)!.startPosition).toBe(10);
    expect(laneFromPollRow(pollRow({ start_hole: 99 }), ROSTER)!.startPosition).toBe(1);
  });
  it('a first read has no hole times; a later read stamps a new score with the time it was seen and keeps an unchanged one', () => {
    const first = laneFromPollRow(pollRow(), ROSTER)!;
    expect(first.holes.every((h) => h.at === null)).toBe(true);
    const nextRow = pollRow({ golf_holes: [...pollRow().golf_holes!.slice(0, 2), { hole_number: 3, par: 4, score: 3, yardage: 401 }] });
    const next = laneFromPollRow(nextRow, ROSTER, first, '2026-10-14T17:40:00Z')!;
    expect(next.holes.find((h) => h.n === 3)!.at).toBe('2026-10-14T17:40:00Z');
    const again = laneFromPollRow(nextRow, ROSTER, next, '2026-10-14T17:41:00Z')!;
    expect(again.holes.find((h) => h.n === 3)!.at).toBe('2026-10-14T17:40:00Z');
    expect(again.holes.find((h) => h.n === 1)!.at).toBeNull();
  });
  it('uses the last save as the lane’s freshness: the round’s updated_at is when the phone was heard', () => {
    const lane = laneFromPollRow(pollRow(), ROSTER)!;
    expect(lane.heardAt).toBe('2026-10-14T17:31:00Z');
    expect(lane.lastHoleAt).toBe('2026-10-14T17:31:00Z');
  });
  it('ignores a score of zero and a par out of range', () => {
    const lane = laneFromPollRow(pollRow({ plan: [{ number: 1, par: 12 }], golf_holes: [{ hole_number: 1, par: null, score: 0, yardage: 0 }] }), ROSTER)!;
    expect(lane.holes).toEqual([{ n: 1, par: null, yds: null, score: null, at: null }]);
  });
});
