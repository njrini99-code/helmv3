import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { zoneShortName } from '../../../lib/dates';
import { kickerDay } from '../labels';
import { buildCard } from '../card/card-model';
import type { ChRoundReview } from '../../../data/round-review-shape';

/**
 * F-0010: the round review's and the card's "Tue Oct 14" kicker, and a zone's short name ("CT", on a class line shown in another
 * zone than the team's), build their formatters once, not per review, per card or per player.
 */

const Real = Intl.DateTimeFormat;
let built = 0;
beforeEach(() => {
  built = 0;
  class Counting extends Real {
    constructor(...args: ConstructorParameters<typeof Real>) {
      super(...args);
      built += 1;
    }
  }
  Intl.DateTimeFormat = Counting as unknown as typeof Intl.DateTimeFormat;
});
afterEach(() => {
  Intl.DateTimeFormat = Real;
});

const review = (date: string) => ({ date, course: 'Finley', playerName: 'Cole Bennett', type: 'practice', holes: [], holesPlayed: 18, score: 80, toPar: 8 }) as unknown as ChRoundReview;

describe('F-0010 the round kicker reuses its formatters', () => {
  it('builds none after the first, however many reviews and cards follow', () => {
    kickerDay('2026-10-14');
    const afterFirst = built;
    expect(afterFirst).toBeGreaterThan(0);
    for (let i = 0; i < 200; i++) {
      kickerDay(`2026-10-${String((i % 28) + 1).padStart(2, '0')}`);
      buildCard(review('2026-10-14'));
    }
    expect(built).toBe(afterFirst);
  });

  it('says what it always said, read in UTC', () => {
    expect(kickerDay('2026-10-14')).toBe('Wed Oct 14');
    expect(kickerDay('2026-10-14T23:59:00Z')).toBe('Wed Oct 14');
    expect(buildCard(review('2026-10-14')).kicker).toBe('Cole Bennett · Wed Oct 14 · Practice');
  });
});

describe('F-0010 a zone’s short name is built once per zone', () => {
  it('builds none after the first call for a zone', () => {
    expect(zoneShortName('America/Chicago', Date.parse('2026-11-13T15:00:00Z'))).toBe('CT');
    const afterFirst = built;
    for (let i = 0; i < 200; i++) zoneShortName('America/Chicago', Date.parse('2026-11-13T15:00:00Z') + i * 60_000);
    expect(built).toBe(afterFirst);
  });

  it('is null for a zone that does not resolve, as before', () => {
    expect(zoneShortName('Not/AZone', Date.now())).toBeNull();
    expect(zoneShortName('Not/AZone', Date.now())).toBeNull();
  });
});
