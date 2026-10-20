import { describe, expect, it } from 'vitest';
import { PREVIEW_PLAYER } from '../preview/fixtures-stats';

// P005-D2: the Last-10 hero said 74.1 while Game detail and the chart said 73.6. All three read one round set.
describe('the player stats preview reads one round set (P005-D2)', () => {
  it('has the hero, Game detail and the chart agree on the scoring average', () => {
    const scores = PREVIEW_PLAYER.rounds.map((r) => r.score);
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    expect(PREVIEW_PLAYER.win.avg).toBeCloseTo(mean, 1);
    expect(PREVIEW_PLAYER.stats?.scoringAverage18).toBeCloseTo(mean, 1);
    const chart = PREVIEW_PLAYER.extra.series.score.map((p) => p.value);
    expect(chart.reduce((a, b) => a + b, 0) / chart.length).toBeCloseTo(mean, 1);
  });
});

import { worstLeg } from '../screens/stats/StatsTeamIslands';
import { meanLabelSpot } from '../screens/stats/detail';

describe('the ledger grid (P004-A1)', () => {
  it('washes only the leg a player loses most in', () => {
    expect(worstLeg([0.3, -1.2, -0.1, 0.2])).toBe(1);
    expect(worstLeg([0.3, 0.1, null, 0.2])).toBeNull();
    expect(worstLeg([null, null, null, null])).toBeNull();
  });
});

describe('the mean label keeps off the values (P005-D1)', () => {
  it('leaves the right end when the last value label sits there', () => {
    // A 690-wide chart whose last point ("74") sits right on the average line, where "avg 74" would go.
    const pts = [
      { x: 26, y: 120, text: '72', shown: true },
      { x: 664, y: 60, text: '74', shown: true },
    ];
    const spot = meanLabelSpot(pts, 64, 'avg 74', 690, 26);
    expect(spot).not.toMatchObject({ anchor: 'end', y: 59 });
  });

  it('takes the right end above the line when it is clear', () => {
    const pts = [
      { x: 26, y: 140, text: '72', shown: true },
      { x: 664, y: 140, text: '73', shown: true },
    ];
    expect(meanLabelSpot(pts, 60, 'avg 73', 690, 26)).toMatchObject({ anchor: 'end', y: 55 });
  });
});

import { bestCardFields } from '../screens/stats/best-card-fields';

describe('the personal-best card (P005-C2)', () => {
  const bests = {
    score: { value: 72, course: 'Pinehurst No. 8', date: 'Sep 9' },
    toPar: { value: 0, course: 'Pinehurst No. 8', date: 'Sep 9' },
    gir: null,
    putts: null,
  };
  it('names a player by first name and last initial on a coach’s card, and in full on their own', () => {
    expect(bestCardFields({ viewer: 'coach', name: 'Jonah Okafor', bests, coach: 'Maya Reyes' })).toEqual({
      who: 'Jonah O.',
      score: 72,
      toPar: 'E',
      course: 'Pinehurst No. 8',
      date: 'Sep 9',
      attest: 'Attested by Coach Reyes',
    });
    expect(bestCardFields({ viewer: 'player', name: 'Jonah Okafor', bests, coach: null })?.who).toBe('Jonah Okafor');
  });
  it('carries no school or team field, and leaves the attesting line out when the coach is unknown', () => {
    const card = bestCardFields({ viewer: 'coach', name: 'Jonah Okafor', bests, coach: null })!;
    expect(Object.keys(card).sort()).toEqual(['attest', 'course', 'date', 'score', 'toPar', 'who']);
    expect(card.attest).toBeNull();
    expect(bestCardFields({ viewer: 'coach', name: 'Jonah Okafor', bests: { ...bests, score: null }, coach: null })).toBeNull();
  });
});
