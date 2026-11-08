import { describe, expect, it } from 'vitest';
import type { Measurement } from '../provenance';
import { auditRankClaims, rankClaimsIn } from '../rank-claims';

// A place or a superlative is recomputed from the per-player values the turn read, never from a place field. Staging 2026-11-08
// (message 6a787fb4): "7th of the 7 players … the weakest on the team" was accepted beside Ethan at -4.40 under Owen at -4.16.

const people = ['Dylan Brooks', 'Mason Rivers', 'Jackson Hale', 'Tyler Hayes', 'Cole Bennett', 'Owen Carter', 'Ethan Park'].map((name) => ({ id: name.split(' ')[0]!.toLowerCase(), name }));
const m = (metric_id: string, id: string, value: number | null, direction: Measurement['direction'] = 'higher_better', unit: Measurement['unit'] = 'strokes', label = people.find((p) => p.id === id)?.name ?? id): Measurement => ({
  metric_id, metric_label: metric_id, unit, value, entity: { kind: 'player', id, label }, window_start: '2026-06-09', window_end: '2026-09-26', sample_size: 8, sample_unit: 'rounds',
  as_of: '2026-11-08T00:00:00.000Z', coverage: 'complete', coverage_note: null, source: 'rounds', method: 'm', denominator: null, benchmark: null, direction,
});
const approach = [['dylan', -2.03], ['mason', -2.28], ['jackson', -2.43], ['tyler', -2.72], ['cole', -3.6], ['owen', -4.16], ['ethan', -4.4]].map(([id, v]) => m('sg_approach', id as string, v as number));
const reads = [approach];
const flagged = (text: string, r = reads) => auditRankClaims(text, r, people).map((c) => c.text);

describe('the claims it finds', () => {
  it('reads places and superlatives about the team, and nothing else', () => {
    expect(rankClaimsIn('He is 7th of the 7 players and the weakest on the team.').map((c) => c.text)).toEqual(['7th of the 7', 'weakest on the team']);
    expect(rankClaimsIn('Ranked 3 of 7 on approach.').map((c) => c.text)).toEqual(['Ranked 3 of 7']);
    expect(rankClaimsIn('9th of June, his best round on the team, the last of the rounds.')).toEqual([]);
  });
});

describe('the staging wrong-accept', () => {
  const text = "Owen's approach play is the weakest on the team and well behind the Tour. His strokes gained on approach is -4.16 per round. That puts him 7th of the 7 players with data, so his place in the team is 0%.";
  it('is flagged: Ethan is below Owen', () => {
    expect(flagged(text)).toEqual(['weakest on the team', '7th of the 7']);
  });
  it('the true statements are not: Owen is 6th of 7 and Ethan is the weakest', () => {
    expect(flagged("Owen's approach play is 6th of the 7 players. Only Ethan Park is lower.")).toEqual([]);
    expect(flagged('Ethan Park is the weakest on the team on approach, 7th of 7.')).toEqual([]);
    expect(flagged('Dylan is the best on the team on approach strokes gained, 1st of the 7.')).toEqual([]);
  });
  it('a generic strokes-gained sentence is checked against the areas read, and passes when any area agrees', () => {
    expect(flagged('Owen is 7th of the 7 players on strokes gained.')).toEqual(['7th of the 7']);
    expect(flagged('Ethan is 7th of the 7 players on strokes gained.')).toEqual([]);
  });
});

describe('it abstains whenever the text or the evidence leaves it in doubt', () => {
  it('two players in the sentence, none, or no metric', () => {
    expect(flagged('Ethan Park is lower, so Owen is the weakest on the team on approach.')).toEqual([]);
    expect(flagged('The weakest on the team on approach is clear.')).toEqual([]);
    expect(flagged('Owen is the weakest on the team.')).toEqual([]);
  });
  it('fewer than three players, a different group size, or a player the read does not hold', () => {
    expect(flagged('Owen is the weakest on the team on approach.', [approach.slice(5)])).toEqual([]);
    expect(flagged('Owen is 7th of 12 on approach.')).toEqual([]);
    expect(flagged('Audit Testplayer is the weakest on the team on approach.')).toEqual([]);
  });
  it('a round or a score is not the player', () => {
    expect(flagged('Owen had his weakest round on the team on approach.')).toEqual([]);
  });
  it('a player with two different values in one read is not a ranking', () => {
    expect(flagged('Owen is the weakest on the team on approach.', [[...approach, m('sg_approach', 'owen', -1)]])).toEqual([]);
  });
  it('the same figure twice, from two reads, is one figure; reads are never merged', () => {
    expect(flagged('Owen is 7th of the 7 players on approach.', [approach, [m('sg_approach', 'owen', -1)]])).toEqual(['7th of the 7']);
  });
  it('ties share every place they span', () => {
    const tied = [['a', -1], ['b', -2], ['c', -2], ['d', -3]].map(([id, v]) => m('sg_putting', id as string, v as number, 'higher_better', 'strokes', `Pat ${String(id).toUpperCase()}`));
    const roster = tied.map((x) => ({ id: x.entity.id, name: x.entity.label }));
    const a = (t: string) => auditRankClaims(t, [tied], roster).map((c) => c.text);
    expect(a('Pat B is 2nd of the 4 on putting.')).toEqual([]);
    expect(a('Pat B is 3rd of the 4 on putting.')).toEqual([]);
    expect(a('Pat B is 4th of the 4 on putting.')).toEqual(['4th of the 4']);
  });
});

describe('direction and value', () => {
  const putts = [['dylan', 28.5], ['mason', 29.5], ['jackson', 30.1], ['owen', 33.2]].map(([id, v]) => m('putts_per_round', id as string, v as number, 'lower_better', 'count'));
  it('best and worst follow the metric’s direction; lowest and highest are by value', () => {
    expect(flagged('Dylan has the best putts per round on the team.', [putts])).toEqual([]);
    expect(flagged('Owen has the best putts per round on the team.', [putts])).toEqual(['best putts per round on the team']);
    expect(flagged('Owen has the worst putts per round on the team.', [putts])).toEqual([]);
    expect(flagged('Dylan has the lowest putts per round on the team.', [putts])).toEqual([]);
    expect(flagged('Owen has the lowest putts per round on the team.', [putts])).toEqual(['lowest putts per round on the team']);
  });
});

describe('places counted from an end', () => {
  // Staging 368318ea: "By value he has the second-lowest approach figure of the seven players with data. Only Ethan Park is lower" is true.
  it('second-lowest, next-to-last and second from the bottom are the same place, and are checked, not read as the lowest', () => {
    expect(flagged('By value Owen has the second-lowest approach figure of the seven players with data. Only Ethan Park is lower, at -4.40.')).toEqual([]);
    expect(flagged('Owen is next-to-last on the team on approach.')).toEqual([]);
    expect(flagged('Owen is second from the bottom of the seven players on approach.')).toEqual([]);
    expect(flagged('Jackson is the third-highest of the seven players on approach.')).toEqual([]);
  });
  it('and a wrong one is flagged', () => {
    expect(flagged('By value Owen has the third-lowest approach figure of the seven players.')).toEqual(['third-lowest approach figure of the seven players']);
    expect(flagged('Ethan is next-to-last on the team on approach.')).toEqual(['next-to-last on the team']);
    expect(flagged('Owen is second from the top of the seven players on approach.')).toEqual(['second from the top of the seven players']);
    expect(flagged('Owen has the second-best approach figure of the seven players.')).toEqual(['second-best approach figure of the seven players']);
    expect(flagged('Mason is the second-best on the team on approach.')).toEqual([]);
  });
});

describe('what a sentence says he is not', () => {
  // Replay 3f1c1439: "His putts per round (33.13) are not the highest on the team." flagged as a claim that he is the highest.
  it('a negated superlative is not a claim', () => {
    expect(flagged('Owen’s putting is not the best on the team.')).toEqual([]);
    expect(flagged('Owen isn’t the weakest on the team on approach.')).toEqual([]);
    expect(flagged('Owen is never the worst on the team on approach.')).toEqual([]);
  });
  it('and the same sentence without the negation still is', () => {
    expect(flagged('Owen is the weakest on the team on approach.')).toEqual(['weakest on the team']);
  });
});
