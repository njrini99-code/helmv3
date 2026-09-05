import { describe, it, expect } from 'vitest';

import {
  computeCommonFreeTime,
  mergeSpans,
  type PlayerBusy,
} from '@/lib/golf/common-free-time';

/**
 * EVERY INSTANT IN THIS FILE IS A HAND-WRITTEN LITERAL, NOT A ROUND TRIP.
 *
 * That is the whole point. The one bug this module can carry and still pass a
 * plausible-looking suite is an inverted offset sign: build the fixtures with
 * the module's own zone helper and every assertion agrees with a uniformly
 * wrong answer. `Date.getTimezoneOffset()` is minutes WEST of UTC, so
 * `local = utc - offset` — and the tests below pin that against absolute
 * literals derived by hand.
 *
 * The 2026 DST transition dates and the offsets on either side were confirmed
 * against `Intl.DateTimeFormat` independently of this module:
 *
 *   2026-03-08  spring forward   01:00 EST -> 03:00 EDT   local day = 23h
 *   2026-11-01  fall back        01:00 EDT -> 01:00 EST   local day = 25h
 *   2026-03-15  ordinary EDT     06:00 local = 10:00Z
 *
 * ZONE 300 is used for the algorithm tests (a fixed UTC-5, no DST), so the
 * mapping stays readable: on 2026-01-15, local HH:00 is (HH+5):00Z.
 *
 *   06:00 -> 11:00Z    12:00 -> 17:00Z    18:00 -> 23:00Z
 *   09:00 -> 14:00Z    13:00 -> 18:00Z    21:00 -> 2026-01-16T02:00:00Z
 *   10:00 -> 15:00Z    15:00 -> 20:00Z
 *   11:00 -> 16:00Z    16:00 -> 21:00Z
 */

const EST = 300;
const DAY = '2026-01-15';
const NEXT = '2026-01-16';

/** Local 06:00–21:00, the axis the availability tracks render. */
const WORK = { startMinute: 6 * 60, endMinute: 21 * 60 };

function player(playerId: string, ...busy: [string, string][]): PlayerBusy {
  return { playerId, busy: busy.map(([start, end]) => ({ start, end })) };
}

describe('computeCommonFreeTime — degenerate inputs', () => {
  it('returns nothing for zero players rather than "everyone is free"', () => {
    // "All 0 players are free 6am-9pm" is vacuously true, and a UI that
    // rendered it would announce a team-wide opening for a team nobody
    // selected. Empty is the only honest answer.
    const result = computeCommonFreeTime({ days: [DAY], zone: EST, players: [] });

    expect(result.totalPlayers).toBe(0);
    expect(result.allFreeWindows).toEqual([]);
    expect(result.rankedWindows).toEqual([]);
    expect(result.unresolvedDays).toEqual([]);
  });

  it('returns nothing for zero days', () => {
    const result = computeCommonFreeTime({ days: [], zone: EST, players: [player('p1')] });

    expect(result.totalPlayers).toBe(1);
    expect(result.rankedWindows).toEqual([]);
  });

  it('returns nothing for an inverted working window', () => {
    const result = computeCommonFreeTime({
      days: [DAY],
      zone: EST,
      players: [player('p1')],
      workingWindow: { startMinute: 21 * 60, endMinute: 6 * 60 },
    });

    expect(result.rankedWindows).toEqual([]);
  });
});

describe('computeCommonFreeTime — the offset sign convention', () => {
  it('places a fixed-offset day at hand-derived absolute instants', () => {
    // zone 300 = five hours WEST of UTC. Local 06:00 is 11:00Z, NOT 01:00Z.
    // An inverted sign produces exactly that second answer and nothing else
    // in this suite would notice.
    const result = computeCommonFreeTime({
      days: [DAY],
      zone: EST,
      players: [player('p1')],
      workingWindow: WORK,
    });

    expect(result.rankedWindows).toHaveLength(1);
    expect(result.rankedWindows[0]!.startIso).toBe('2026-01-15T11:00:00.000Z');
    expect(result.rankedWindows[0]!.endIso).toBe('2026-01-16T02:00:00.000Z');
    expect(result.rankedWindows[0]!.durationMinutes).toBe(900);
    expect(result.rankedWindows[0]!.startMinute).toBe(360);
    expect(result.rankedWindows[0]!.endMinute).toBe(1260);
  });

  it('places an IANA day at hand-derived absolute instants', () => {
    // 2026-03-15 is an ordinary EDT day: 06:00 local is 10:00Z, 21:00 local
    // is 01:00Z the following morning.
    const result = computeCommonFreeTime({
      days: ['2026-03-15'],
      zone: 'America/New_York',
      players: [player('p1')],
      workingWindow: WORK,
    });

    expect(result.rankedWindows).toHaveLength(1);
    expect(result.rankedWindows[0]!.startIso).toBe('2026-03-15T10:00:00.000Z');
    expect(result.rankedWindows[0]!.endIso).toBe('2026-03-16T01:00:00.000Z');
  });

  it('handles a zone EAST of UTC (negative offset) and UTC itself', () => {
    const east = computeCommonFreeTime({
      days: [DAY],
      zone: -60,
      players: [player('p1')],
      workingWindow: WORK,
    });
    expect(east.rankedWindows[0]!.startIso).toBe('2026-01-15T05:00:00.000Z');
    expect(east.rankedWindows[0]!.endIso).toBe('2026-01-15T20:00:00.000Z');

    const utc = computeCommonFreeTime({
      days: [DAY],
      zone: 0,
      players: [player('p1')],
      workingWindow: WORK,
    });
    expect(utc.rankedWindows[0]!.startIso).toBe('2026-01-15T06:00:00.000Z');
    expect(utc.rankedWindows[0]!.endIso).toBe('2026-01-15T21:00:00.000Z');
  });
});

describe('computeCommonFreeTime — inversion and intersection', () => {
  it('inverts one player: busy 09:00-11:00 leaves the morning and the rest of the day', () => {
    const result = computeCommonFreeTime({
      days: [DAY],
      zone: EST,
      players: [player('p1', ['2026-01-15T14:00:00.000Z', '2026-01-15T16:00:00.000Z'])],
      workingWindow: WORK,
    });

    expect(result.allFreeWindows).toHaveLength(2);
    expect(result.allFreeWindows.map((w) => [w.startIso, w.endIso])).toEqual([
      ['2026-01-15T11:00:00.000Z', '2026-01-15T14:00:00.000Z'],
      ['2026-01-15T16:00:00.000Z', '2026-01-16T02:00:00.000Z'],
    ]);
    // allFreeWindows is chronological; rankedWindows is longest-first.
    expect(result.rankedWindows[0]!.durationMinutes).toBe(600);
    expect(result.rankedWindows[1]!.durationMinutes).toBe(180);
  });

  it('collapses fully-overlapping busy across two players into one gap', () => {
    // Identical blocks: the intersection must not double-count them into two
    // narrower windows.
    const identical: [string, string] = [
      '2026-01-15T14:00:00.000Z',
      '2026-01-15T16:00:00.000Z',
    ];
    const result = computeCommonFreeTime({
      days: [DAY],
      zone: EST,
      players: [player('p1', identical), player('p2', identical)],
      workingWindow: WORK,
    });

    expect(result.allFreeWindows.map((w) => [w.startIso, w.endIso])).toEqual([
      ['2026-01-15T11:00:00.000Z', '2026-01-15T14:00:00.000Z'],
      ['2026-01-15T16:00:00.000Z', '2026-01-16T02:00:00.000Z'],
    ]);
    expect(result.allFreeWindows.every((w) => w.freeCount === 2)).toBe(true);
  });

  it("merges one player's own overlapping blocks before inverting", () => {
    // 09:00-11:00 and 10:00-12:00 overlap. Inverting them separately would
    // manufacture a free window inside 10:00-11:00 where the player is busy.
    const result = computeCommonFreeTime({
      days: [DAY],
      zone: EST,
      players: [
        player(
          'p1',
          ['2026-01-15T14:00:00.000Z', '2026-01-15T16:00:00.000Z'],
          ['2026-01-15T15:00:00.000Z', '2026-01-15T17:00:00.000Z'],
        ),
      ],
      workingWindow: WORK,
    });

    expect(result.rankedWindows.map((w) => [w.startIso, w.endIso])).toEqual([
      ['2026-01-15T17:00:00.000Z', '2026-01-16T02:00:00.000Z'],
      ['2026-01-15T11:00:00.000Z', '2026-01-15T14:00:00.000Z'],
    ]);
  });

  it('intersects disjoint busy: the common window is narrower than either player alone', () => {
    // p1 busy 09:00-11:00, p2 busy 13:00-15:00. Neither is busy 11:00-13:00,
    // and that is the only midday slot they share.
    const result = computeCommonFreeTime({
      days: [DAY],
      zone: EST,
      players: [
        player('p1', ['2026-01-15T14:00:00.000Z', '2026-01-15T16:00:00.000Z']),
        player('p2', ['2026-01-15T18:00:00.000Z', '2026-01-15T20:00:00.000Z']),
      ],
      workingWindow: WORK,
    });

    expect(result.allFreeWindows.map((w) => [w.startIso, w.endIso])).toEqual([
      ['2026-01-15T11:00:00.000Z', '2026-01-15T14:00:00.000Z'],
      ['2026-01-15T16:00:00.000Z', '2026-01-15T18:00:00.000Z'],
      ['2026-01-15T20:00:00.000Z', '2026-01-16T02:00:00.000Z'],
    ]);
    // Longest shared window is the evening, 15:00-21:00 local.
    expect(result.rankedWindows[0]!.startIso).toBe('2026-01-15T20:00:00.000Z');
    expect(result.rankedWindows[0]!.durationMinutes).toBe(360);
  });

  it('reports an unbroken free stretch as ONE window, not several', () => {
    // Two players' blocks end at different times in the morning. The
    // afternoon is free for everyone and must come back as a single window
    // rather than fragments split at those unrelated boundaries.
    const result = computeCommonFreeTime({
      days: [DAY],
      zone: EST,
      players: [
        player('p1', ['2026-01-15T11:00:00.000Z', '2026-01-15T14:00:00.000Z']),
        player('p2', ['2026-01-15T11:00:00.000Z', '2026-01-15T16:00:00.000Z']),
        player('p3', ['2026-01-15T11:00:00.000Z', '2026-01-15T15:00:00.000Z']),
      ],
      workingWindow: WORK,
    });

    expect(result.allFreeWindows).toHaveLength(1);
    expect(result.allFreeWindows[0]!.startIso).toBe('2026-01-15T16:00:00.000Z');
    expect(result.allFreeWindows[0]!.endIso).toBe('2026-01-16T02:00:00.000Z');
    expect(result.allFreeWindows[0]!.durationMinutes).toBe(600);
  });
});

describe('mergeSpans — touching, zero-length, and unparseable', () => {
  it('merges spans that TOUCH but do not overlap', () => {
    // [9,10) and [10,11) share an endpoint. A merge written with `<` instead
    // of `<=` leaves two spans with a zero-width gap at 10:00 between them.
    expect(mergeSpans([
      { startMs: 9, endMs: 10 },
      { startMs: 10, endMs: 11 },
    ])).toEqual([{ startMs: 9, endMs: 11 }]);
  });

  it('merges out of order and keeps genuinely disjoint spans apart', () => {
    expect(mergeSpans([
      { startMs: 30, endMs: 40 },
      { startMs: 0, endMs: 10 },
      { startMs: 5, endMs: 8 },
    ])).toEqual([
      { startMs: 0, endMs: 10 },
      { startMs: 30, endMs: 40 },
    ]);
  });

  it('drops zero-length, reversed, and NaN spans at the door', () => {
    // Each degenerate span sits OUTSIDE every real one. An earlier version of
    // this test put them inside `[0, 10)`, where a surviving zero-length span
    // is absorbed by the merge and the assertion passes either way — it did
    // not fail when the filter was loosened to `>=`. Isolating them is what
    // makes the filter observable.
    expect(mergeSpans([
      { startMs: 20, endMs: 20 },
      { startMs: 39, endMs: 34 },
      { startMs: NaN, endMs: 25 },
      { startMs: 50, endMs: NaN },
      { startMs: 0, endMs: 10 },
    ])).toEqual([{ startMs: 0, endMs: 10 }]);
  });

  it('drops a lone zero-length span rather than emitting it', () => {
    expect(mergeSpans([{ startMs: 5, endMs: 5 }])).toEqual([]);
  });

  it('is a no-op on an empty list', () => {
    expect(mergeSpans([])).toEqual([]);
  });

  it('does not mutate the array or the objects it is given', () => {
    // mergeSpans is exported, so the track renderer will call it with rows it
    // does not own — `availByPlayer.get(id)` is React state. Widening a span
    // in place there would corrupt the state behind the caller's back, and
    // the merge does widen spans (`last.endMs = span.endMs`); it is the copy
    // on push that keeps that off the input.
    const input = [
      { startMs: 0, endMs: 10 },
      { startMs: 5, endMs: 20 },
    ];
    const snapshot = structuredClone(input);

    expect(mergeSpans(input)).toEqual([{ startMs: 0, endMs: 20 }]);
    expect(input).toEqual(snapshot);
  });
});

describe('computeCommonFreeTime — real data hazards', () => {
  it('two touching busy blocks leave no zero-length free window between them', () => {
    // 09:00-10:00 followed by 10:00-11:00. With minWindowMinutes 0 nothing
    // filters a degenerate window out, so if one were produced it would be
    // visible here.
    const result = computeCommonFreeTime({
      days: [DAY],
      zone: EST,
      players: [
        player(
          'p1',
          ['2026-01-15T14:00:00.000Z', '2026-01-15T15:00:00.000Z'],
          ['2026-01-15T15:00:00.000Z', '2026-01-15T16:00:00.000Z'],
        ),
      ],
      workingWindow: WORK,
      minWindowMinutes: 0,
    });

    expect(result.rankedWindows).toHaveLength(2);
    expect(result.rankedWindows.every((w) => w.durationMinutes > 0)).toBe(true);
    expect(result.allFreeWindows.map((w) => [w.startIso, w.endIso])).toEqual([
      ['2026-01-15T11:00:00.000Z', '2026-01-15T14:00:00.000Z'],
      ['2026-01-15T16:00:00.000Z', '2026-01-16T02:00:00.000Z'],
    ]);
  });

  it('a zero-length busy period does not split the day in two', () => {
    // src/lib/calendar/availability.ts records production rows where a
    // single-day all-day event serialised to a zero-length busy period.
    // Unfiltered, its instant becomes a sweep boundary and one free day
    // becomes two adjacent windows.
    const result = computeCommonFreeTime({
      days: [DAY],
      zone: EST,
      players: [player('p1', ['2026-01-15T17:00:00.000Z', '2026-01-15T17:00:00.000Z'])],
      workingWindow: WORK,
    });

    expect(result.rankedWindows).toHaveLength(1);
    expect(result.rankedWindows[0]!.durationMinutes).toBe(900);
  });

  it('a busy block covering the whole window yields no free time that day', () => {
    // The multi-day all-day tournament shape: one interval spanning the
    // entire working window. The answer is "no window", never a phantom one.
    const result = computeCommonFreeTime({
      days: [DAY],
      zone: EST,
      players: [player('p1', ['2026-01-15T00:00:00.000Z', '2026-01-17T00:00:00.000Z'])],
      workingWindow: WORK,
    });

    expect(result.rankedWindows).toEqual([]);
    expect(result.allFreeWindows).toEqual([]);
    expect(result.unresolvedDays).toEqual([]);
  });

  it('an unparseable instant is dropped without poisoning the result', () => {
    // A NaN boundary reaching the sort corrupts every comparison it touches,
    // so the output must be identical to the same input without the bad row.
    const withGarbage = computeCommonFreeTime({
      days: [DAY],
      zone: EST,
      players: [
        player(
          'p1',
          ['not-an-instant', 'also-not-an-instant'],
          ['2026-01-15T14:00:00.000Z', '2026-01-15T16:00:00.000Z'],
        ),
      ],
      workingWindow: WORK,
    });
    const clean = computeCommonFreeTime({
      days: [DAY],
      zone: EST,
      players: [player('p1', ['2026-01-15T14:00:00.000Z', '2026-01-15T16:00:00.000Z'])],
      workingWindow: WORK,
    });

    expect(withGarbage).toEqual(clean);
  });

  it('accepts a player with no busy blocks alongside players who have them', () => {
    const result = computeCommonFreeTime({
      days: [DAY],
      zone: EST,
      players: [
        player('p1', ['2026-01-15T14:00:00.000Z', '2026-01-15T16:00:00.000Z']),
        player('p2'),
      ],
      workingWindow: WORK,
    });

    expect(result.totalPlayers).toBe(2);
    // 09:00-11:00 is p1's block; p2 alone is free there.
    const nearMiss = result.rankedWindows.find((w) => w.freeCount === 1);
    expect(nearMiss?.freePlayerIds).toEqual(['p2']);
    expect(nearMiss?.busyPlayerIds).toEqual(['p1']);
  });

  it('de-duplicates a repeated playerId and unions its busy lists', () => {
    // Without this a duplicated selection inflates freeCount and every
    // "3 of 4 free" badge is wrong.
    const result = computeCommonFreeTime({
      days: [DAY],
      zone: EST,
      players: [
        player('p1', ['2026-01-15T14:00:00.000Z', '2026-01-15T15:00:00.000Z']),
        player('p1', ['2026-01-15T18:00:00.000Z', '2026-01-15T19:00:00.000Z']),
      ],
      workingWindow: WORK,
    });

    expect(result.totalPlayers).toBe(1);
    // Both blocks apply: free 06:00-09:00, 10:00-13:00, 14:00-21:00.
    expect(result.allFreeWindows.map((w) => [w.startIso, w.endIso])).toEqual([
      ['2026-01-15T11:00:00.000Z', '2026-01-15T14:00:00.000Z'],
      ['2026-01-15T15:00:00.000Z', '2026-01-15T18:00:00.000Z'],
      ['2026-01-15T19:00:00.000Z', '2026-01-16T02:00:00.000Z'],
    ]);
  });

  it('accepts SerializedBusyPeriod rows unchanged, ignoring type and title', () => {
    // The call site holds `{ start, end, type, title?, eventId? }[]` straight
    // from getPlayerAvailability and must pass it in with no mapping.
    //
    // The fixture is a VARIABLE, not an inline literal, and that is the
    // point: TypeScript's excess-property check only fires on a fresh object
    // literal, so a literal here would fail to compile while the real call
    // site — which passes `availByPlayer.get(id)` — compiles fine. Testing
    // with a literal would have tested the wrong assignment.
    //
    // Declared locally rather than imported because golf.ts is a 'use server'
    // module and this stays a pure unit test. If the action's row shape
    // changes, this is the declaration to update.
    type SerializedBusyPeriodLike = {
      start: string;
      end: string;
      type: 'event' | 'class' | 'blocked';
      title?: string;
      eventId?: string;
    };
    const fromAction: SerializedBusyPeriodLike[] = [
      {
        start: '2026-01-15T14:00:00.000Z',
        end: '2026-01-15T16:00:00.000Z',
        type: 'class',
        title: 'ORGB 320',
        eventId: 'evt-1',
      },
    ];

    const result = computeCommonFreeTime({
      days: [DAY],
      zone: EST,
      players: [{ playerId: 'p1', busy: fromAction }],
      workingWindow: WORK,
    });

    // The kind of busy must not change the intersection: busy is busy.
    expect(result.rankedWindows).toHaveLength(2);
    expect(result.allFreeWindows.map((w) => [w.startIso, w.endIso])).toEqual([
      ['2026-01-15T11:00:00.000Z', '2026-01-15T14:00:00.000Z'],
      ['2026-01-15T16:00:00.000Z', '2026-01-16T02:00:00.000Z'],
    ]);
  });
});

describe('computeCommonFreeTime — minimum window length', () => {
  const twentyMinuteGap: PlayerBusy[] = [
    player(
      'p1',
      ['2026-01-15T11:00:00.000Z', '2026-01-15T14:00:00.000Z'],
      ['2026-01-15T14:20:00.000Z', '2026-01-16T02:00:00.000Z'],
    ),
  ];

  it('drops a window shorter than any usable practice by default', () => {
    const result = computeCommonFreeTime({
      days: [DAY],
      zone: EST,
      players: twentyMinuteGap,
      workingWindow: WORK,
    });

    expect(result.rankedWindows).toEqual([]);
  });

  it('keeps that same window when minWindowMinutes is lowered', () => {
    // Pins the threshold as a PARAMETER, not just a default — the 20-minute
    // gap is real, and a caller who wants it can have it.
    const result = computeCommonFreeTime({
      days: [DAY],
      zone: EST,
      players: twentyMinuteGap,
      workingWindow: WORK,
      minWindowMinutes: 0,
    });

    expect(result.rankedWindows).toHaveLength(1);
    expect(result.rankedWindows[0]!.durationMinutes).toBe(20);
    expect(result.rankedWindows[0]!.startIso).toBe('2026-01-15T14:00:00.000Z');
  });

  it('drops it at exactly the threshold boundary and keeps it one minute below', () => {
    const atThreshold = computeCommonFreeTime({
      days: [DAY],
      zone: EST,
      players: twentyMinuteGap,
      workingWindow: WORK,
      minWindowMinutes: 21,
    });
    expect(atThreshold.rankedWindows).toEqual([]);

    const justUnder = computeCommonFreeTime({
      days: [DAY],
      zone: EST,
      players: twentyMinuteGap,
      workingWindow: WORK,
      minWindowMinutes: 20,
    });
    expect(justUnder.rankedWindows).toHaveLength(1);
  });
});

describe('computeCommonFreeTime — field invariants', () => {
  it('never emits a non-finite wall minute, across fixed, IANA, and DST days', () => {
    // FreeWindow.startMinute is typed `number` and documents that it is
    // always finite. A consumer will divide it to position a block, and
    // `NaN%` is not an error — it is a block that silently does not render.
    for (const zone of [EST, -60, 0, 'America/New_York', 'Asia/Kathmandu']) {
      const result = computeCommonFreeTime({
        days: [DAY, '2026-03-08', '2026-11-01'],
        zone,
        players: [
          player('p1', ['2026-01-15T14:00:00.000Z', '2026-01-15T16:00:00.000Z']),
          player('p2'),
        ],
        workingWindow: { startMinute: 0, endMinute: 1440 },
        minWindowMinutes: 0,
      });

      expect(result.rankedWindows.length).toBeGreaterThan(0);
      for (const window of result.rankedWindows) {
        expect(Number.isFinite(window.startMinute)).toBe(true);
        expect(Number.isFinite(window.endMinute)).toBe(true);
        expect(Number.isFinite(window.durationMinutes)).toBe(true);
        expect(window.durationMinutes).toBeGreaterThan(0);
        expect(window.endMinute).toBeGreaterThan(window.startMinute);
        // freeCount and the two id arrays must always agree with each other.
        expect(window.freeCount).toBe(window.freePlayerIds.length);
        expect(window.freePlayerIds.length + window.busyPlayerIds.length).toBe(
          window.totalPlayers,
        );
      }
    }
  });
});

describe('computeCommonFreeTime — the near miss', () => {
  it('names the one player who blocks an otherwise-complete window', () => {
    // The whole reason the blocking ids exist: S4 says "Maya has class"
    // instead of rendering fourteen avatars.
    const result = computeCommonFreeTime({
      days: [DAY],
      zone: EST,
      players: [
        player('maya', ['2026-01-15T18:00:00.000Z', '2026-01-15T20:00:00.000Z']),
        player('devon'),
        player('kai'),
      ],
      workingWindow: WORK,
    });

    expect(result.totalPlayers).toBe(3);

    const nearMiss = result.rankedWindows.filter((w) => w.busyPlayerIds.length > 0);
    expect(nearMiss).toHaveLength(1);
    expect(nearMiss[0]!.busyPlayerIds).toEqual(['maya']);
    expect(nearMiss[0]!.freePlayerIds).toEqual(['devon', 'kai']);
    expect(nearMiss[0]!.freeCount).toBe(2);
    expect(nearMiss[0]!.totalPlayers).toBe(3);
    expect(nearMiss[0]!.startIso).toBe('2026-01-15T18:00:00.000Z');
    expect(nearMiss[0]!.endIso).toBe('2026-01-15T20:00:00.000Z');

    // The near miss ranks BELOW both complete windows, however long it is.
    expect(result.rankedWindows.map((w) => w.freeCount)).toEqual([3, 3, 2]);
    expect(result.allFreeWindows).toHaveLength(2);
    expect(result.allFreeWindows.every((w) => w.busyPlayerIds.length === 0)).toBe(true);
  });

  it('orders the id arrays by INPUT order, not alphabetically', () => {
    // The call site colours by selection index
    // (selectedPlayerIds.forEach((id, idx) => PLAYER_COLORS[idx])), so input
    // order is the useful one. Lexicographic here would read alpha/mid/zed.
    const result = computeCommonFreeTime({
      days: [DAY],
      zone: EST,
      players: [
        player('zed'),
        player('alpha', ['2026-01-15T18:00:00.000Z', '2026-01-15T20:00:00.000Z']),
        player('mid'),
      ],
      workingWindow: WORK,
    });

    expect(result.allFreeWindows[0]!.freePlayerIds).toEqual(['zed', 'alpha', 'mid']);

    const nearMiss = result.rankedWindows.find((w) => w.freeCount === 2);
    expect(nearMiss?.freePlayerIds).toEqual(['zed', 'mid']);
    expect(nearMiss?.busyPlayerIds).toEqual(['alpha']);
  });
});

describe('computeCommonFreeTime — ranking', () => {
  it('ranks by players free DESC, then duration DESC, then start ASC', () => {
    // p1 busy 09:00-10:00 (so 06:00-09:00 is a 2-free window of 180m),
    // p2 busy 10:00-11:00 (so 09:00-10:00 is 1-free, 10:00-11:00 is 1-free).
    // Everyone is free 11:00-21:00, 600 minutes.
    const result = computeCommonFreeTime({
      days: [DAY],
      zone: EST,
      players: [
        player('p1', ['2026-01-15T14:00:00.000Z', '2026-01-15T15:00:00.000Z']),
        player('p2', ['2026-01-15T15:00:00.000Z', '2026-01-15T16:00:00.000Z']),
      ],
      workingWindow: WORK,
    });

    expect(
      result.rankedWindows.map((w) => [w.freeCount, w.durationMinutes, w.startIso]),
    ).toEqual([
      [2, 600, '2026-01-15T16:00:00.000Z'],
      [2, 180, '2026-01-15T11:00:00.000Z'],
      [1, 60, '2026-01-15T14:00:00.000Z'],
      [1, 60, '2026-01-15T15:00:00.000Z'],
    ]);
  });

  it('breaks a full tie on start ASC so the ordering is total', () => {
    // Two identical free days. Without the start tiebreak their order is
    // whatever the sort implementation happens to do, and the "best window"
    // a coach taps moves between renders.
    const result = computeCommonFreeTime({
      days: [NEXT, DAY],
      zone: EST,
      players: [player('p1')],
      workingWindow: WORK,
    });

    expect(result.rankedWindows.map((w) => w.dayIso)).toEqual([DAY, NEXT]);
    expect(result.allFreeWindows.map((w) => w.dayIso)).toEqual([DAY, NEXT]);
  });

  it('de-duplicates repeated days', () => {
    const result = computeCommonFreeTime({
      days: [DAY, DAY],
      zone: EST,
      players: [player('p1')],
      workingWindow: WORK,
    });

    expect(result.rankedWindows).toHaveLength(1);
  });
});

describe('computeCommonFreeTime — unresolvable days are reported, never guessed', () => {
  it('records a day whose IANA zone cannot be resolved', () => {
    // A silent fallback to UTC — or to DEFAULT_TIMEZONE, which is what
    // getValidTimezone would do — IS audit P237. The reader must be able to
    // tell "no free windows" from "we could not compute this day".
    const result = computeCommonFreeTime({
      days: [DAY],
      zone: 'Not/AZone',
      players: [player('p1')],
      workingWindow: WORK,
    });

    expect(result.unresolvedDays).toEqual([DAY]);
    expect(result.rankedWindows).toEqual([]);
  });

  it('records a malformed day and still computes the well-formed ones', () => {
    const result = computeCommonFreeTime({
      days: ['2026-1-5', DAY],
      zone: EST,
      players: [player('p1')],
      workingWindow: WORK,
    });

    expect(result.unresolvedDays).toEqual(['2026-1-5']);
    expect(result.rankedWindows).toHaveLength(1);
    expect(result.rankedWindows[0]!.dayIso).toBe(DAY);
  });
});

describe('computeCommonFreeTime — daylight saving', () => {
  const NY = 'America/New_York';
  const WHOLE_DAY = { startMinute: 0, endMinute: 1440 };

  it('spring forward: the local day is 23 real hours, midnight to midnight', () => {
    // 2026-03-08, 01:00 EST -> 03:00 EDT. Confirmed against Intl separately.
    const result = computeCommonFreeTime({
      days: ['2026-03-08'],
      zone: NY,
      players: [player('p1')],
      workingWindow: WHOLE_DAY,
    });

    expect(result.rankedWindows).toHaveLength(1);
    const window = result.rankedWindows[0]!;
    expect(window.startIso).toBe('2026-03-08T05:00:00.000Z');
    expect(window.endIso).toBe('2026-03-09T04:00:00.000Z');
    expect(window.durationMinutes).toBe(23 * 60);
    expect(window.startMinute).toBe(0);
    expect(window.endMinute).toBe(1440);
  });

  it('fall back: the local day is 25 real hours, and wall minutes disagree with duration', () => {
    // 2026-11-01, 01:00 EDT -> 01:00 EST. This is the documented invariant:
    // the axis is drawn in wall clock (1440 minutes wide either way) while
    // the ranking compares real elapsed time (1500 minutes here). A renderer
    // that used endMinute - startMinute as a duration would under-report this
    // day by an hour, and a ranker that used durationMinutes to position a
    // block would draw it off the end of the axis.
    const result = computeCommonFreeTime({
      days: ['2026-11-01'],
      zone: NY,
      players: [player('p1')],
      workingWindow: WHOLE_DAY,
    });

    const window = result.rankedWindows[0]!;
    expect(window.startIso).toBe('2026-11-01T04:00:00.000Z');
    expect(window.endIso).toBe('2026-11-02T05:00:00.000Z');
    expect(window.durationMinutes).toBe(25 * 60);
    expect(window.endMinute - window.startMinute).toBe(1440);
    expect(window.durationMinutes - (window.endMinute - window.startMinute)).toBe(60);
  });

  it('intersects correctly across the repeated hour', () => {
    // Busy exactly 2026-11-01T05:00Z-06:00Z: the hour that reads 01:00 twice,
    // once EDT and once EST. Both free windows land on real instants, and
    // both boundaries map to wall minute 60 — which is precisely why a
    // wall-clock axis alone cannot represent this hour.
    const result = computeCommonFreeTime({
      days: ['2026-11-01'],
      zone: NY,
      players: [player('p1', ['2026-11-01T05:00:00.000Z', '2026-11-01T06:00:00.000Z'])],
      workingWindow: WHOLE_DAY,
    });

    expect(result.allFreeWindows.map((w) => [w.startIso, w.endIso])).toEqual([
      ['2026-11-01T04:00:00.000Z', '2026-11-01T05:00:00.000Z'],
      ['2026-11-01T06:00:00.000Z', '2026-11-02T05:00:00.000Z'],
    ]);
    expect(result.allFreeWindows[0]!.endMinute).toBe(60);
    expect(result.allFreeWindows[1]!.startMinute).toBe(60);
    expect(result.allFreeWindows[0]!.durationMinutes).toBe(60);
    expect(result.allFreeWindows[1]!.durationMinutes).toBe(23 * 60);
  });

  it('a fixed offset sampled on one side of a transition is wrong on the other', () => {
    // Not a defect in the fixed-offset path — a demonstration of why the
    // IANA form exists. A month view sampling getTimezoneOffset() in late
    // October gets 240, and every November day it then computes is an hour
    // off from what the coach's clock says.
    const sampledInOctober = computeCommonFreeTime({
      days: ['2026-11-02'],
      zone: 240,
      players: [player('p1')],
      workingWindow: { startMinute: 6 * 60, endMinute: 7 * 60 },
    });
    const zoneAware = computeCommonFreeTime({
      days: ['2026-11-02'],
      zone: NY,
      players: [player('p1')],
      workingWindow: { startMinute: 6 * 60, endMinute: 7 * 60 },
    });

    expect(sampledInOctober.rankedWindows[0]!.startIso).toBe('2026-11-02T10:00:00.000Z');
    expect(zoneAware.rankedWindows[0]!.startIso).toBe('2026-11-02T11:00:00.000Z');
  });
});
