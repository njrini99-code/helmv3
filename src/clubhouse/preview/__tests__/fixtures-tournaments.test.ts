import { describe, expect, it } from 'vitest';
import { TOUR_PREVIEW_STATES, parseTourPreviewState, tourFixture } from '../fixtures-tournaments';

/**
 * The Tournaments preview fixture carries its team math precomputed, so the views never compute it. These pin the
 * design's golden numbers (plan 16, step 1.1 rule 2: Oakmont 287, 286, 285, total 858, −6) and the shapes every
 * parallel builder reads, so a fixture edit that breaks them fails here, not in seven views.
 */
const ready = tourFixture('ready');
const oakmont = ready.desks.e33!.event;

describe('Tournaments fixture: Oakmont (e33)', () => {
  it('scores 287, 286 and 285, 858 in all, 6 under', () => {
    expect(oakmont.team.rounds.map((r) => r.total)).toEqual([287, 286, 285]);
    expect(oakmont.team.result).toMatchObject({ kind: 'complete', total: 858, toPar: -6 });
    expect(oakmont.team.rounds.map((r) => r.par)).toEqual([288, 288, 288]);
  });

  it('drops Jonah in rounds 1 and 2 and Sofia in round 3, by whole-round score', () => {
    expect(oakmont.team.rounds.map((r) => r.dropped)).toEqual([['jonah'], ['jonah'], ['sofia']]);
    expect(oakmont.team.rounds[2]!.counting.sort()).toEqual(['ava', 'eli', 'jonah', 'theo']);
    expect(oakmont.team.result!.droppedTotal).toBe(75 + 76 + 74);
  });

  it('keeps Priya an individual: her rounds never count', () => {
    const priya = oakmont.playerRounds.filter((p) => p.playerId === 'priya');
    expect(priya.map((p) => p.count)).toEqual(['individual', 'individual', 'individual']);
    expect(oakmont.team.rounds.every((r) => !r.counting.includes('priya') && !r.dropped.includes('priya'))).toBe(true);
  });

  it('has 11 of 15 team rounds with shot data, a field of 14 and a third-place finish', () => {
    expect(oakmont.coverage).toEqual({ scorecards: 15, withShots: 11 });
    expect(oakmont.field?.size).toBe(14);
    expect(oakmont.field?.teams.find((t) => t.us)).toMatchObject({ total: 858, place: '3' });
    expect(oakmont.field?.teams.filter((t) => t.place === 'T6')).toHaveLength(2);
    // Bayside College is outside the division, so it is not in the record.
    expect(oakmont.record).toEqual({ w: 10, l: 2, t: 0 });
  });

  it('has hole-by-hole cards that add up to each round', () => {
    const holes = ready.desks.e33!.holes!;
    for (const card of holes.cards) {
      const total = oakmont.playerRounds.find((p) => p.playerId === card.playerId && p.roundNumber === card.roundNumber)!.total;
      expect(card.holes.reduce((s, h) => s + (h.strokes ?? 0), 0)).toBe(total);
    }
  });
});

describe('Tournaments fixture: the other events', () => {
  it('scores Dogwood (e32) as 6 count 5', () => {
    const dogwood = ready.desks.e32!.event;
    expect(dogwood.format).toMatchObject({ kind: '6c5', players: 6, counting: 5 });
    expect(dogwood.team.rounds.every((r) => r.counting.length === 5 && r.dropped.length === 1)).toBe(true);
  });

  it('marks a tie at the line on last season’s conference final round, counting the lower slot', () => {
    const conf = ready.desks.e24!.event;
    const r3 = conf.team.rounds[2]!;
    expect(r3.tiedAtBoundary.sort()).toEqual(['jonah', 'sofia']);
    expect(r3.counting).toContain('sofia');
    expect(conf.playerRounds.find((p) => p.playerId === 'jonah' && p.roundNumber === 3)!.count).toBe('tie');
  });

  it('has e34 and e35 upcoming, with Pinehurst’s lineup 4 of 5 set', () => {
    expect(ready.home.events.filter((e) => e.status === 'upcoming').map((e) => e.id)).toEqual(['e34', 'e35']);
    expect(ready.lineup.lineup).toMatchObject({ status: 'draft', set: 4, of: 5 });
  });
});

describe('Tournaments fixture: preview states', () => {
  it('parses unknown states to ready', () => {
    expect(parseTourPreviewState(undefined)).toBe('ready');
    expect(parseTourPreviewState('nonsense')).toBe('ready');
    expect(parseTourPreviewState('live')).toBe('live');
  });

  it.each(TOUR_PREVIEW_STATES)('%s is plain JSON', (state) => {
    const fx = tourFixture(state);
    expect(JSON.parse(JSON.stringify(fx))).toEqual(fx);
  });

  it('maps loading and failed to the load, and the rest to ready', () => {
    expect(tourFixture('loading').load).toBe('loading');
    expect(tourFixture('failed').load).toBe('failed');
    expect(tourFixture('partial').load).toBe('ready');
  });

  it('empties the season for empty, and keeps one result for thin', () => {
    expect(tourFixture('empty').home.events).toEqual([]);
    expect(tourFixture('empty').home.next).toBeNull();
    const thin = tourFixture('thin').home.events.filter((e) => e.seasonId === '2026-27' && e.status === 'complete');
    expect(thin.map((e) => e.id)).toEqual(['e31']);
    expect(tourFixture('thin').home.ladder.every((r) => r.early)).toBe(true);
  });

  it('shows the card against the official total on provisional', () => {
    const e33 = tourFixture('provisional').desks.e33!.event;
    expect(e33.trust).toBe('final');
    expect(e33.playerRounds.find((p) => p.playerId === 'sofia' && p.roundNumber === 3)).toMatchObject({ total: 74, officialTotal: 73 });
  });

  it('puts Pinehurst round 1 on the course for live, with a live team round that counts four', () => {
    const fx = tourFixture('live');
    expect(fx.home.next?.action).toBe('follow');
    expect(fx.live.team).toMatchObject({ kind: 'live', toPar: -1, short: 0, dropped: ['eli'] });
    expect(fx.live.lanes.filter((l) => l.count === 'counted')).toHaveLength(4);
    for (const lane of fx.live.lanes) {
      const played = lane.holes.filter((h) => h.strokes != null);
      expect(played).toHaveLength(lane.thru ?? 0);
      expect(played.reduce((s, h) => s + (h.strokes! - h.par), 0)).toBe(lane.toPar);
    }
    expect(fx.player.list.window.in).toBe(true);
  });

  it('flags sections for partial without failing the page', () => {
    const fx = tourFixture('partial');
    expect(fx.home.errors).toEqual({ path: true, heatmap: true });
    expect(fx.desks.e33!.errors).toMatchObject({ holes: true });
  });
});
