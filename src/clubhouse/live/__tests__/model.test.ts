import { describe, expect, it } from 'vitest';
import {
  beadOrder,
  gainedHoles,
  groupLanes,
  holeKind,
  homeLanes,
  isLate,
  isOnCourse,
  laneAria,
  laneFreshness,
  laneSubline,
  momentsFrom,
  momentum,
  nextHole,
  sortLanes,
  thruText,
  toActivityState,
  toParWords,
  viewerWithheld,
  washOf,
  type LiveHole,
  type LiveLane,
} from '../model';

const NOW = Date.parse('2026-10-14T18:40:00Z');
const MIN = 60_000;
const iso = (minAgo: number) => new Date(NOW - minAgo * MIN).toISOString();
const PARS = [4, 5, 4, 3, 4, 4, 5, 3, 4, 4, 4, 3, 5, 4, 4, 3, 5, 4];

function holes(scores: Array<number | null>, planned = 18): LiveHole[] {
  return Array.from({ length: planned }, (_, i) => ({ n: i + 1, par: PARS[i]!, yds: 400, score: scores[i] ?? null, at: scores[i] != null ? iso(5) : null }));
}

function lane(over: Partial<LiveLane> = {}): LiveLane {
  const hs = over.holes ?? holes([4, 5, 4]);
  return {
    roundId: 'r1',
    playerId: 'p1',
    name: 'Sofia Reyes',
    initials: 'SR',
    roundType: 'qualifier',
    qualifierId: 'q1',
    qualifierRound: 2,
    courseId: null,
    courseName: 'Pine Hollow GC',
    roundDate: '2026-10-14',
    holesPlanned: 18,
    startPosition: 1,
    currentHole: 4,
    share: 'coaches',
    phase: 'on_course',
    thru: hs.filter((h) => h.score != null).length,
    toPar: 0,
    strokes: null,
    holes: hs,
    lastHoleAt: iso(5),
    heardAt: iso(1),
    startedAt: iso(120),
    endedAt: null,
    seq: 1,
    source: 'live',
    ...over,
  };
}

describe('laneFreshness (4.1)', () => {
  const at = (heardMin: number, holeMin: number | null) => laneFreshness(lane({ heardAt: iso(heardMin), lastHoleAt: holeMin == null ? null : iso(holeMin) }), NOW);
  it('is fresh under ten minutes, whatever the last hole', () => {
    expect(at(9.98, 80)).toEqual({ kind: 'fresh' });
  });
  it('says stale from ten minutes of silence once the last hole is also ten minutes old', () => {
    expect(at(10, 10)).toEqual({ kind: 'stale', minutes: 10 });
    expect(at(14, 30)).toEqual({ kind: 'stale', minutes: 14 });
  });
  it('stays fresh when they scored a hole under ten minutes ago even if the phone was not heard', () => {
    expect(at(12, 3)).toEqual({ kind: 'fresh' });
  });
  it('is stale at 89:59 and quiet at 90:00 of silence on both clocks', () => {
    expect(at(89.98, 89.98)).toMatchObject({ kind: 'stale' });
    expect(at(90, 90)).toEqual({ kind: 'quiet', since: iso(90) });
  });
  it('is only stale (not quiet) when the last hole is newer than 90 minutes', () => {
    expect(at(95, 60)).toMatchObject({ kind: 'stale' });
  });
  it('is gone at four hours of silence on both clocks, and quiet before', () => {
    expect(at(239.98, 239.98)).toMatchObject({ kind: 'quiet' });
    expect(at(240, 240)).toEqual({ kind: 'gone' });
  });
  it('falls back to the start when no hole has a time', () => {
    expect(laneFreshness(lane({ heardAt: iso(30), lastHoleAt: null, startedAt: iso(31) }), NOW)).toMatchObject({ kind: 'stale' });
  });
  it('a posted lane is final and a stopped lane says so', () => {
    expect(laneFreshness(lane({ phase: 'posted', heardAt: iso(500) }), NOW)).toEqual({ kind: 'fresh' });
    expect(laneFreshness(lane({ phase: 'stopped', thru: 9, heardAt: iso(5) }), NOW)).toEqual({ kind: 'stopped', thru: 9 });
  });
});

describe('the on-course rules (S-13)', () => {
  it('on course means on_course or finished and heard within 10 minutes', () => {
    expect(isOnCourse({ phase: 'on_course', heardAt: iso(9) }, NOW)).toBe(true);
    expect(isOnCourse({ phase: 'finished', heardAt: iso(9) }, NOW)).toBe(true);
    expect(isOnCourse({ phase: 'on_course', heardAt: iso(10) }, NOW)).toBe(false);
    expect(isOnCourse({ phase: 'posted', heardAt: iso(1) }, NOW)).toBe(false);
  });
  it('the privacy rule keeps four hours: a player whose phone lost signal still sees no teammates', () => {
    expect(viewerWithheld({ phase: 'on_course', heardAt: iso(60) }, NOW)).toBe(true);
    expect(viewerWithheld({ phase: 'on_course', heardAt: iso(241) }, NOW)).toBe(false);
    expect(viewerWithheld({ phase: 'posted', heardAt: iso(1) }, NOW)).toBe(false);
    expect(viewerWithheld(null, NOW)).toBe(false);
  });
});

describe('holes and the next hole: current_hole is a hole NUMBER', () => {
  it('orders beads from the start hole: 10 to 18 then 1 to 9', () => {
    expect(beadOrder({ holesPlanned: 18, startPosition: 10 })).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(beadOrder({ holesPlanned: 9, startPosition: 1 })).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });
  it('the hole they are on is next when it has no score', () => {
    expect(nextHole(lane({ currentHole: 4 }))).toEqual({ hole: 4, par: 3, yds: 400 });
  });
  it('a scored current hole moves on to the next unscored one in play order', () => {
    expect(nextHole(lane({ currentHole: 2 }))).toEqual({ hole: 4, par: 3, yds: 400 });
  });
  it('a shotgun start on 10 plays 18 then 1: after hole 18 the next is 1', () => {
    const hs = holes([null, null, null, null, null, null, null, null, 5, ...Array(9).fill(null)]).map((h) => (h.n >= 10 ? { ...h, score: 4, at: iso(5) } : h));
    expect(nextHole(lane({ startPosition: 10, holes: hs, currentHole: 18 }))).toEqual({ hole: 1, par: 4, yds: 400 });
  });
  it('with no current hole it is the first unscored in play order, and null once every hole is scored', () => {
    expect(nextHole(lane({ currentHole: null }))?.hole).toBe(4);
    expect(nextHole(lane({ holes: holes(PARS), currentHole: 18 }))).toBeNull();
  });
  it('a nine-hole round wraps inside its nine', () => {
    expect(nextHole(lane({ holesPlanned: 9, holes: holes([4, 5, 4, 3], 9), currentHole: null }))?.hole).toBe(5);
  });
  it('classes a hole by its score against par', () => {
    expect([2, 3, 4, 5, 6, null].map((s) => holeKind(s, 4))).toEqual(['eagle', 'birdie', 'par', 'bogey', 'double', 'unplayed']);
    expect(holeKind(4, null)).toBe('unknown');
  });
  it('draws the momentum as cumulative to-par over the holes played', () => {
    expect(momentum(lane({ holes: holes([3, 5, 5]) }))).toEqual([-1, -1, 0]);
  });
});

describe('sorting and groups', () => {
  const a = lane({ roundId: 'a', name: 'Ava', toPar: -2, thru: 9, startedAt: iso(100) });
  const b = lane({ roundId: 'b', name: 'Ben', toPar: -2, thru: 12, startedAt: iso(90) });
  const c = lane({ roundId: 'c', name: 'Cy', toPar: null, thru: 0, startedAt: iso(120) });
  it('sorts by to-par, ties by thru descending, then name; no score last', () => {
    expect(sortLanes([c, a, b], 'to_par').map((l) => l.roundId)).toEqual(['b', 'a', 'c']);
  });
  it('sorts by thru, name and tee time', () => {
    expect(sortLanes([a, b, c], 'thru').map((l) => l.roundId)).toEqual(['b', 'a', 'c']);
    expect(sortLanes([c, b, a], 'name').map((l) => l.name)).toEqual(['Ava', 'Ben', 'Cy']);
    expect(sortLanes([a, b, c], 'tee').map((l) => l.roundId)).toEqual(['c', 'a', 'b']);
  });
  it('groups on the course, finished today and not heard from; a lane gone past four hours is dropped', () => {
    const quiet = lane({ roundId: 'q', heardAt: iso(100), lastHoleAt: iso(100) });
    const gone = lane({ roundId: 'g', heardAt: iso(300), lastHoleAt: iso(300) });
    const posted = lane({ roundId: 'p', phase: 'posted', endedAt: iso(200) });
    const g = groupLanes([a, quiet, gone, posted], NOW);
    expect(g.onCourse.map((l) => l.roundId)).toEqual(['a']);
    expect(g.quiet.map((l) => l.roundId)).toEqual(['q']);
    expect(g.finished.map((l) => l.roundId)).toEqual(['p']);
  });
  it('a stopped lane leaves 30 minutes after it stopped', () => {
    expect(groupLanes([lane({ phase: 'stopped', endedAt: iso(29) })], NOW).finished).toHaveLength(1);
    expect(groupLanes([lane({ phase: 'stopped', endedAt: iso(31) })], NOW).finished).toHaveLength(0);
  });
  it('Home keeps a posted lane for 30 minutes and leaves quiet lanes to the live view', () => {
    const quiet = lane({ roundId: 'q', heardAt: iso(100), lastHoleAt: iso(100) });
    const recent = lane({ roundId: 'r', phase: 'posted', endedAt: iso(20) });
    const old = lane({ roundId: 'o', phase: 'posted', endedAt: iso(45) });
    const h = homeLanes([a, quiet, recent, old], NOW);
    expect(h.live.map((l) => l.roundId)).toEqual(['a']);
    expect(h.finished.map((l) => l.roundId)).toEqual(['r']);
  });
});

describe('words', () => {
  it('writes the sub line with the round and the next hole (CH-16670, CH-16671)', () => {
    expect(laneSubline(lane({ currentHole: 4 }))).toEqual({ code: 'CH-16670', text: 'Qualifier · R2 · 4 · Par 3' });
    expect(laneSubline(lane({ roundType: 'practice', qualifierRound: null, currentHole: 4 }))).toEqual({ code: 'CH-16671', text: 'Practice · 4 · Par 3' });
  });
  it('writes thru, with F after the last hole', () => {
    expect(thruText(lane({ thru: 9 }))).toBe('thru 9');
    expect(thruText(lane({ thru: 18 }))).toBe('F');
    expect(thruText(lane({ thru: 0 }))).toBe('not started');
  });
  it('says to-par in words, even par included', () => {
    expect([-2, 0, 3, null].map(toParWords)).toEqual(['2 under par', 'even par', '3 over par', 'no score yet']);
  });
  it('reads a lane as one sentence for VoiceOver, stale and quiet lanes included', () => {
    expect(laneAria(lane({ toPar: -2, thru: 3, currentHole: 4 }), NOW)).toBe('Sofia Reyes, 2 under par through 3, playing hole 4, par 3. Qualifier, round 2.');
    expect(laneAria(lane({ toPar: 1, thru: 3, heardAt: iso(14), lastHoleAt: iso(20) }), NOW)).toContain('Last update 14 minutes ago.');
    expect(laneAria(lane({ phase: 'posted', strokes: 70, toPar: -2 }), NOW)).toBe('Sofia Reyes, finished, 70, 2 under par. Qualifier, round 2.');
    expect(laneAria(lane({ phase: 'stopped', thru: 9 }), NOW)).toContain('Stopped through 9.');
  });
});

describe('moments, late and the wash', () => {
  // Holes 1 to 4 played in par (4, 5, 4, 3); hole 5 is a par 4.
  const before = lane({ holes: holes([4, 5, 4, 3]), thru: 4, toPar: 0 });
  const after = (scores: Array<number | null>, over: Partial<LiveLane> = {}) => lane({ holes: holes(scores), thru: scores.filter((s) => s != null).length, toPar: scores.reduce<number>((t, s, i) => (s == null ? t : t + (s - PARS[i]!)), 0), ...over });
  const kinds = (score: number) => momentsFrom(before, after([4, 5, 4, 3, score]), iso(0)).map((m) => m.kind);

  it('is no news on the first read', () => {
    expect(momentsFrom(undefined, after([4, 5, 4, 3, 2]), iso(0))).toEqual([]);
  });
  it('writes an eagle, a birdie, a double and a triple, and nothing for par or bogey', () => {
    expect([2, 3, 4, 5, 6, 7].map(kinds)).toEqual([['eagle'], ['birdie'], [], [], ['double'], ['triple']]);
    const [eagle] = momentsFrom(before, after([4, 5, 4, 3, 2]), iso(0));
    expect(eagle).toMatchObject({ kind: 'eagle', text: 'Eagle on 5', id: 'r1:5:2', hole: 5 });
    expect(eagle!.announce).toBe('Sofia Reyes, eagle on 5, now 2 under par.');
  });
  it('the same hole scored the same way is one moment by id, however often it is read', () => {
    const a = momentsFrom(before, after([4, 5, 4, 3, 3]), iso(0));
    const b = momentsFrom(before, after([4, 5, 4, 3, 3], { seq: 9 }), iso(1));
    expect(a.map((m) => m.id)).toEqual(b.map((m) => m.id));
  });
  it('two holes in one read is a late sync: one Caught up line, and no wash', () => {
    const next = after([4, 5, 4, 3, 4, 3]);
    expect(isLate(before, next)).toBe(true);
    expect(gainedHoles(before, next).map((h) => h.n)).toEqual([5, 6]);
    expect(momentsFrom(before, next, iso(0)).map((m) => m.text)).toContain('Caught up · thru 6');
    expect(washOf(before, next)).toBeNull();
  });
  it('one hole in a read is not late and gets a wash by its result', () => {
    expect(isLate(before, after([4, 5, 4, 3, 3]))).toBe(false);
    expect([2, 3, 4, 5, 6].map((s) => washOf(before, after([4, 5, 4, 3, s])))).toEqual(['under', 'under', 'plain', 'plain', 'over']);
  });
  it('a correction writes a line only when it becomes a result worth one', () => {
    const scored = after([4, 5, 5]);
    expect(momentsFrom(scored, after([4, 5, 4]), iso(0))).toEqual([]);
    expect(momentsFrom(scored, after([4, 5, 3]), iso(0)).map((m) => m.kind)).toEqual(['birdie']);
    // Still the same kind of result: no second line.
    expect(momentsFrom(after([4, 5, 7]), after([4, 5, 8]), iso(0))).toEqual([]);
  });
  it('writes the posted line once', () => {
    const live = after([4, 5, 4]);
    const posted = after([4, 5, 4], { phase: 'posted', strokes: 70, toPar: -2, endedAt: iso(0) });
    expect(momentsFrom(live, posted, iso(0)).map((m) => m.text)).toEqual(['Sofia Reyes posted 70 (−2)']);
    expect(momentsFrom(posted, posted, iso(0))).toEqual([]);
  });
  it('gives the Lock Screen contract: to-par, thru, the last three holes, the next hole and the phase', () => {
    const s = toActivityState(lane({ holes: holes([4, 5, 4, 3, 4]), thru: 5, toPar: 0, currentHole: 6 }));
    expect(s.lastHoles).toEqual([{ n: 3, score: 4, par: 4 }, { n: 4, score: 3, par: 3 }, { n: 5, score: 4, par: 4 }]);
    expect(s).toMatchObject({ toPar: 0, thru: 5, phase: 'on_course', next: { hole: 6 } });
  });
});
