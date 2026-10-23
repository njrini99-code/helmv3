import { describe, expect, it } from 'vitest';
import {
  countingRate,
  formatOf,
  gapToDrop,
  hasTeamScore,
  teamEvent,
  teamRound,
  type ChTourPlayerScore,
  type ChTourScoredRound,
} from '../scoring';

const F54 = formatOf('5c4');
const PAR = 72;

/** A lineup player in slot order a..e unless a slot is given. */
function lp(playerId: string, slot: number, total: number | null, status: ChTourPlayerScore['status'] = 'ok'): ChTourPlayerScore {
  return { playerId, role: 'lineup', slot, total, status };
}

/** The design's contribution fixture (tour.jsx): Alex, Ben, Chris, Drew, Evan over three rounds, team 858 (−6). */
const DESIGN = {
  r1: [lp('alex', 1, 70), lp('ben', 2, 72), lp('chris', 3, 74), lp('drew', 4, 75), lp('evan', 5, 71)],
  r2: [lp('alex', 1, 73), lp('ben', 2, 71), lp('chris', 3, 70), lp('drew', 4, 76), lp('evan', 5, 72)],
  r3: [lp('alex', 1, 71), lp('ben', 2, 74), lp('chris', 3, 72), lp('drew', 4, 69), lp('evan', 5, 73)],
};

describe('formatOf', () => {
  it('fixes the NCAA stroke formats and keeps custom counts', () => {
    expect(formatOf('5c4')).toEqual({ kind: '5c4', players: 5, counting: 4, holes: 18 });
    expect(formatOf('6c5', 9, 9)).toEqual({ kind: '6c5', players: 6, counting: 5, holes: 18 });
    expect(formatOf('6c4')).toMatchObject({ players: 6, counting: 4 });
    expect(formatOf('custom', 4, 3, 9)).toEqual({ kind: 'custom', players: 4, counting: 3, holes: 9 });
    expect(formatOf('custom', 3, 5).counting).toBe(3);
  });

  it('only stroke formats have a team score', () => {
    expect(hasTeamScore(formatOf('5c4'))).toBe(true);
    expect(hasTeamScore(formatOf('custom', 4, 3))).toBe(true);
    expect(hasTeamScore(formatOf('individual'))).toBe(false);
    expect(hasTeamScore(formatOf('match'))).toBe(false);
    expect(hasTeamScore(formatOf('medal_match'))).toBe(false);
  });
});

describe('teamRound, 5 count 4', () => {
  it('counts the lowest four and drops the highest', () => {
    const r = teamRound(DESIGN.r1, F54, PAR);
    expect(r.kind).toBe('complete');
    expect(r.counting).toEqual(['alex', 'evan', 'ben', 'chris']);
    expect(r.dropped).toEqual(['drew']);
    expect(r.total).toBe(287);
    expect(r.toPar).toBe(-1);
    expect(r.droppedTotal).toBe(75);
    expect(r.tiedAtBoundary).toEqual([]);
  });

  it('matches the design fixture: 287, 286, 285, total 858, −6', () => {
    const rounds = [teamRound(DESIGN.r1, F54, PAR), teamRound(DESIGN.r2, F54, PAR), teamRound(DESIGN.r3, F54, PAR)];
    expect(rounds.map((r) => r.total)).toEqual([287, 286, 285]);
    expect(rounds[1].dropped).toEqual(['drew']);
    expect(rounds[2].dropped).toEqual(['ben']);
    const event = teamEvent(rounds);
    expect(event).toMatchObject({ kind: 'complete', total: 858, toPar: -6, droppedTotal: 75 + 76 + 74 });
  });

  it('does not depend on the order the scores arrive in', () => {
    const shuffled = [...DESIGN.r3].reverse();
    expect(teamRound(shuffled, F54, PAR)).toEqual(teamRound(DESIGN.r3, F54, PAR));
  });

  it('marks a tie at the counting boundary and counts the lower slot', () => {
    const r = teamRound([lp('a', 1, 70), lp('b', 2, 71), lp('c', 3, 72), lp('d', 5, 74), lp('e', 4, 74)], F54, PAR);
    expect(r.total).toBe(70 + 71 + 72 + 74);
    expect(r.counting).toEqual(['a', 'b', 'c', 'e']);
    expect(r.dropped).toEqual(['d']);
    expect(r.tiedAtBoundary.sort()).toEqual(['d', 'e']);
  });

  it('counts whole rounds, never best holes', () => {
    // Per hole, the best four of five on each hole could add up to less than any four players' whole rounds.
    // The engine only ever sees whole-round totals, so the team total is the four lowest totals: 70+71+72+73.
    const r = teamRound([lp('a', 1, 70), lp('b', 2, 71), lp('c', 3, 72), lp('d', 4, 73), lp('e', 5, 80)], F54, PAR);
    expect(r.total).toBe(286);
  });

  it('never counts individuals or alternates, even with the lowest score', () => {
    const r = teamRound(
      [
        ...DESIGN.r1,
        { playerId: 'ind', role: 'individual', slot: null, total: 64, status: 'ok' },
        { playerId: 'alt', role: 'alternate', slot: null, total: 65, status: 'ok' },
      ],
      F54,
      PAR,
    );
    expect(r.total).toBe(287);
    expect(r.counting).not.toContain('ind');
    expect(r.dropped).not.toContain('alt');
  });

  it('counts the other four when one player withdraws', () => {
    const r = teamRound([lp('a', 1, 70), lp('b', 2, 71), lp('c', 3, 72), lp('d', 4, 73), lp('e', 5, null, 'wd')], F54, PAR);
    expect(r).toMatchObject({ kind: 'complete', total: 286, dropped: ['e'], droppedTotal: null });
  });

  it('has no team score with fewer than four valid scores', () => {
    const r = teamRound([lp('a', 1, 70), lp('b', 2, 71), lp('c', 3, 72), lp('d', 4, null, 'wd'), lp('e', 5, 75, 'dq')], F54, PAR);
    expect(r.kind).toBe('incomplete');
    expect(r.total).toBeNull();
    expect(r.toPar).toBeNull();
    expect(r.reason).toBe('too_few_scores');
    expect(r.missing).toEqual(['d', 'e']);
  });

  it('swaps in the dropped score when a counting score is disqualified', () => {
    const r = teamRound([lp('a', 1, 70), lp('b', 2, 71, 'dq'), lp('c', 3, 72), lp('d', 4, 73), lp('e', 5, 75)], F54, PAR);
    expect(r.total).toBe(70 + 72 + 73 + 75);
    expect(r.counting).toContain('e');
    expect(r.dropped).toEqual(['b']);
  });

  it('previews a pending disqualification without changing the total', () => {
    const r = teamRound([lp('a', 1, 70), lp('b', 2, 71, 'dq_pending'), lp('c', 3, 72), lp('d', 4, 73), lp('e', 5, 75)], F54, PAR);
    expect(r.total).toBe(286);
    expect(r.dqSwapPreview).toEqual({ ifDq: 'b', nowCounts: 'e', total: 290, toPar: 2 });
  });

  it('previews a pending disqualification that would leave no team score', () => {
    const r = teamRound([lp('a', 1, 70), lp('b', 2, 71, 'dq_pending'), lp('c', 3, 72), lp('d', 4, 73), lp('e', 5, null, 'wd')], F54, PAR);
    expect(r.dqSwapPreview).toEqual({ ifDq: 'b', nowCounts: null, total: null, toPar: null });
  });
});

describe('teamRound, other formats', () => {
  it('6 count 5 and 6 count 4', () => {
    const six = [lp('a', 1, 70), lp('b', 2, 71), lp('c', 3, 72), lp('d', 4, 73), lp('e', 5, 74), lp('f', 6, 80)];
    expect(teamRound(six, formatOf('6c5'), PAR)).toMatchObject({ total: 360, toPar: 0, dropped: ['f'] });
    expect(teamRound(six, formatOf('6c4'), PAR)).toMatchObject({ total: 286, toPar: -2, dropped: ['e', 'f'] });
  });

  it('keeps nine-hole rounds as nine', () => {
    const r = teamRound([lp('a', 1, 35), lp('b', 2, 36), lp('c', 3, 37), lp('d', 4, 38), lp('e', 5, 40)], formatOf('5c4', 5, 4, 9), 36);
    expect(r).toMatchObject({ total: 146, toPar: 2 });
  });

  it('gives no stroke total for individual, match and medal match formats', () => {
    for (const kind of ['individual', 'match', 'medal_match'] as const) {
      expect(teamRound(DESIGN.r1, formatOf(kind), PAR).kind).toBe('none');
    }
  });
});

describe('teamRound, live', () => {
  it('counts the best four to par so far and reports who has not started', () => {
    const r = teamRound(
      [
        { ...lp('a', 1, null), live: { thru: 12, toPar: -2 } },
        { ...lp('b', 2, null), live: { thru: 11, toPar: 1 } },
        { ...lp('c', 3, 71) },
        { ...lp('d', 4, null), live: { thru: 9, toPar: 3 } },
        { ...lp('e', 5, null) },
      ],
      F54,
      PAR,
    );
    expect(r.kind).toBe('live');
    expect(r.total).toBeNull();
    expect(r.toPar).toBe(-2 + -1 + 1 + 3);
    expect(r.counting).toEqual(['a', 'c', 'b', 'd']);
    expect(r.missing).toEqual(['e']);
  });

  it('makes the event live and keeps its to par running', () => {
    const live = teamRound([{ ...lp('a', 1, null), live: { thru: 3, toPar: -1 } }, lp('b', 2, 72), lp('c', 3, 72), lp('d', 4, 72), lp('e', 5, 72)], F54, PAR);
    const event = teamEvent([teamRound(DESIGN.r1, F54, PAR), live]);
    expect(event).toMatchObject({ kind: 'live', total: null, toPar: -1 + -1 });
  });
});

describe('teamEvent', () => {
  it('is incomplete when any round has no team score', () => {
    const bad = teamRound([lp('a', 1, 70), lp('b', 2, null, 'wd'), lp('c', 3, null, 'wd')], F54, PAR);
    const event = teamEvent([teamRound(DESIGN.r1, F54, PAR), bad]);
    expect(event).toMatchObject({ kind: 'incomplete', total: null, toPar: null, droppedTotal: null });
    expect(event.rounds).toHaveLength(2);
  });

  it('is none with no rounds', () => {
    expect(teamEvent([]).kind).toBe('none');
  });
});

describe('countingRate and gapToDrop', () => {
  const rounds: ChTourScoredRound[] = [DESIGN.r1, DESIGN.r2, DESIGN.r3].map((scores) => ({ scores, result: teamRound(scores, F54, PAR) }));

  it('counts rounds counted over rounds played as a lineup player', () => {
    expect(countingRate('drew', rounds)).toEqual({ counted: 1, played: 3, rate: 1 / 3 });
    expect(countingRate('alex', rounds)).toEqual({ counted: 3, played: 3, rate: 1 });
    expect(countingRate('nobody', rounds)).toEqual({ counted: 0, played: 0, rate: null });
  });

  it('leaves incomplete rounds and individuals out of the rate', () => {
    const bad = [lp('alex', 1, 70), lp('ben', 2, null, 'wd'), lp('chris', 3, null, 'wd')];
    const withBad = [...rounds, { scores: bad, result: teamRound(bad, F54, PAR) }];
    expect(countingRate('alex', withBad).played).toBe(3);
    const ind: ChTourPlayerScore = { playerId: 'ind', role: 'individual', slot: null, total: 66, status: 'ok' };
    const withInd = [{ scores: [...DESIGN.r1, ind], result: teamRound([...DESIGN.r1, ind], F54, PAR) }];
    expect(countingRate('ind', withInd).rate).toBeNull();
  });

  it('averages strokes better than the drop, and the gap to the worst counting score when dropped', () => {
    // alex: R1 75−70=5, R2 76−73=3, R3 74−71=3 → 11/3
    expect(gapToDrop('alex', rounds)).toEqual({ value: 11 / 3, n: 3 });
    // drew: R1 dropped, worst counting 74 → 74−75=−1; R2 dropped, 73−76=−3; R3 counting, 74−69=5 → 1/3
    expect(gapToDrop('drew', rounds).value).toBeCloseTo(1 / 3, 10);
  });

  it('skips rounds with no dropped score', () => {
    const four = [lp('a', 1, 70), lp('b', 2, 71), lp('c', 3, 72), lp('d', 4, 73), lp('e', 5, null, 'wd')];
    expect(gapToDrop('a', [{ scores: four, result: teamRound(four, F54, PAR) }])).toEqual({ value: null, n: 0 });
  });
});
