import { describe, expect, it } from 'vitest';
import type { ChRoundReview } from '../../../../data/round-review-shape';
import { PREVIEW_REVIEW, PREVIEW_REVIEW_COACH, PREVIEW_REVIEW_HOLE_BY_HOLE, PREVIEW_REVIEW_NO_HOLES, PREVIEW_REVIEW_NO_SG, PREVIEW_REVIEW_NO_SHOTS, PREVIEW_REVIEW_TOTAL_ONLY } from '../../../../preview/fixtures-round-review';
import { buildCard, countText, hasCard, holesLine, markOf, storyLine } from '../card-model';

/** P011 round card: the model both the page's card and the exported picture are drawn from. */

describe('markOf: the scorecard notation', () => {
  it('maps strokes against par to the mark a golfer reads', () => {
    expect(markOf(2, 4)).toBe('eagle');
    expect(markOf(1, 5)).toBe('eagle'); // eagle or better: an albatross is still the double circle
    expect(markOf(3, 4)).toBe('birdie');
    expect(markOf(4, 4)).toBeNull();
    expect(markOf(5, 4)).toBe('bogey');
    expect(markOf(6, 4)).toBe('double');
    expect(markOf(9, 4)).toBe('double'); // a double bogey or worse
  });
  it('draws nothing for a hole with no score or no par', () => {
    expect(markOf(null, 4)).toBeNull();
    expect(markOf(4, null)).toBeNull();
  });
});

const nineHole = (over: Partial<ChRoundReview> = {}): ChRoundReview => ({
  ...PREVIEW_REVIEW,
  holesPlayed: 9,
  holes: PREVIEW_REVIEW.holes.slice(0, 9),
  front: PREVIEW_REVIEW.front,
  back: { score: null, toPar: null },
  score: PREVIEW_REVIEW.front.score,
  toPar: PREVIEW_REVIEW.front.toPar,
  ...over,
});

describe('buildCard: 18, 9 and partial rounds', () => {
  it('an 18-hole round is two bands, Out then In, of nine holes', () => {
    const m = buildCard(PREVIEW_REVIEW);
    expect(m.bands.map((b) => b.label)).toEqual(['Out', 'In']);
    expect(m.bands.map((b) => b.holes.length)).toEqual([9, 9]);
    expect(m.bands[0]!.holes[0]!.n).toBe(1);
    expect(m.bands[1]!.holes[8]!.n).toBe(18);
    expect(m.partial).toBe(false);
    expect(holesLine(m)).toBe('18 holes');
  });

  it('Out, In and Total are the figures the page already shows', () => {
    for (const r of [PREVIEW_REVIEW, PREVIEW_REVIEW_COACH, PREVIEW_REVIEW_NO_SG, PREVIEW_REVIEW_NO_SHOTS, PREVIEW_REVIEW_HOLE_BY_HOLE]) {
      const m = buildCard(r);
      expect(m.bands[0]!.score).toBe(r.front.score);
      expect(m.bands[1]!.score).toBe(r.back.score);
      expect(m.total.score).toBe(r.score);
      expect(m.total.toPar).toBe(r.toPar);
      expect(m.total.putts).toBe(r.putts);
      expect(m.bands[0]!.score! + m.bands[1]!.score!).toBe(r.score);
      // Par sums to the round's par: the strokes less the strokes over.
      expect(m.total.par).toBe((r.score as number) - (r.toPar as number));
    }
  });

  it('fairways and greens are counts of the holes that tracked them', () => {
    const m = buildCard(PREVIEW_REVIEW);
    expect(m.total.fir).toEqual(PREVIEW_REVIEW.fairways);
    expect(m.total.gir).toEqual(PREVIEW_REVIEW.greens);
    expect(countText(m.total.gir)).toBe(`${PREVIEW_REVIEW.greens!.hit}/${PREVIEW_REVIEW.greens!.of}`);
    expect(countText(null)).toBe('—');
  });

  it('a nine-hole round is one band, with its total the nine', () => {
    const r = nineHole();
    const m = buildCard(r);
    expect(m.bands).toHaveLength(1);
    expect(m.bands[0]!.label).toBe('Out');
    expect(m.bands[0]!.score).toBe(r.front.score);
    expect(m.total.score).toBe(r.front.score);
    expect(holesLine(m)).toBe('9 holes');
  });

  it('a nine played on the back runs 10 to 18 and is labelled In', () => {
    const r = nineHole({ holes: PREVIEW_REVIEW.holes.slice(9), score: PREVIEW_REVIEW.back.score, toPar: PREVIEW_REVIEW.back.toPar });
    const m = buildCard(r);
    expect(m.bands).toHaveLength(1);
    expect(m.bands[0]!.label).toBe('In');
    expect(m.bands[0]!.holes.map((h) => h.n)).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18]);
    expect(m.bands[0]!.score).toBe(PREVIEW_REVIEW.back.score);
  });

  it('a partial round says how far it got and gives no short subtotal', () => {
    const r: ChRoundReview = { ...PREVIEW_REVIEW, holes: PREVIEW_REVIEW.holes.map((h) => (h.n > 14 ? { ...h, score: null, putts: null, fairway: null, gir: null } : h)) };
    const m = buildCard(r);
    expect(m.partial).toBe(true);
    expect(m.scored).toBe(14);
    expect(holesLine(m)).toBe('Thru 14 of 18 holes');
    expect(m.bands[0]!.score).toBe(PREVIEW_REVIEW.front.score); // a whole nine keeps its subtotal
    expect(m.bands[1]!.score).toBeNull(); // a short nine does not
    expect(m.bands[1]!.holes.filter((h) => h.score == null).map((h) => h.n)).toEqual([15, 16, 17, 18]);
  });

  it('a hole the round has no row for is an empty slot, not a dropped column', () => {
    const r: ChRoundReview = { ...PREVIEW_REVIEW, holes: PREVIEW_REVIEW.holes.filter((h) => h.n !== 5) };
    const hole = buildCard(r).bands[0]!.holes[4]!;
    expect(hole).toMatchObject({ n: 5, score: null, par: null, mark: null });
  });

  it('marks follow each hole against its par', () => {
    const m = buildCard(PREVIEW_REVIEW);
    const marks = m.bands.flatMap((b) => b.holes).map((h) => h.mark);
    // Finley: a bogey on each par 5 and two birdies (holes 5 and 11).
    expect(marks.filter((x) => x === 'birdie')).toHaveLength(2);
    expect(marks.filter((x) => x === 'bogey')).toHaveLength(4);
    expect(marks.filter((x) => x === 'eagle' || x === 'double')).toHaveLength(0);
  });

  it('strokes gained is the round’s own, by leg; none when the round has none', () => {
    const m = buildCard(PREVIEW_REVIEW);
    expect(m.sg!.total).toBe(PREVIEW_REVIEW.strokesGained!.total);
    expect(m.sg!.legs.map((l) => l.label)).toEqual(['Off the tee', 'Approach', 'Around green', 'Putting']);
    expect(m.sg!.legs[1]!.value).toBe(PREVIEW_REVIEW.strokesGained!.approach);
    expect(buildCard(PREVIEW_REVIEW_NO_SG).sg).toBeNull();
  });

  it('a coach’s card names the player first in its kicker', () => {
    expect(buildCard(PREVIEW_REVIEW_COACH).kicker.startsWith('Jonah Okafor · ')).toBe(true);
    expect(buildCard(PREVIEW_REVIEW).kicker).toBe('Wed Oct 14 · Practice');
  });

  it('a player’s own round names the signed-in player; a coach’s view keeps the player it is about', () => {
    expect(buildCard(PREVIEW_REVIEW, { name: 'Jonah Okafor', team: 'Varsity' })).toMatchObject({ kicker: 'Jonah Okafor · Wed Oct 14 · Practice', team: 'Varsity' });
    expect(buildCard(PREVIEW_REVIEW_COACH, { name: 'Someone Else' }).kicker.startsWith('Jonah Okafor · ')).toBe(true);
    expect(buildCard(PREVIEW_REVIEW).team).toBeNull();
  });

  it('rows with nothing tracked are left off', () => {
    const bare: ChRoundReview = { ...PREVIEW_REVIEW, holes: PREVIEW_REVIEW.holes.map((h) => ({ ...h, putts: null, fairway: null, gir: null })) };
    expect(buildCard(bare).rows).toEqual({ putts: false, fir: false, gir: false });
    expect(buildCard(PREVIEW_REVIEW).rows).toEqual({ putts: true, fir: true, gir: true });
  });
});

describe('hasCard', () => {
  it('there is a card only when the holes loaded and there are some', () => {
    expect(hasCard(PREVIEW_REVIEW)).toBe(true);
    expect(hasCard(PREVIEW_REVIEW_HOLE_BY_HOLE)).toBe(true);
    expect(hasCard(PREVIEW_REVIEW_NO_HOLES)).toBe(false);
    expect(hasCard(PREVIEW_REVIEW_TOTAL_ONLY)).toBe(false);
  });
});

describe('storyLine: only figures the page already shows', () => {
  it('names the best hole and the putts', () => {
    expect(storyLine(PREVIEW_REVIEW)).toBe(`Best on hole 5, a birdie. ${PREVIEW_REVIEW.putts} putts, 1.9 a hole.`);
  });
  it('does not repeat a leg the hero line already names', () => {
    // The hero says "Approach gained +1.3"; the story does not say it a second time.
    expect(storyLine(PREVIEW_REVIEW)).not.toMatch(/approach/i);
  });
  it('names the leg that gained most when the hero line cannot (one leg only)', () => {
    const one: ChRoundReview = { ...PREVIEW_REVIEW, strokesGained: { total: 0.8, tee: null, approach: 0.8, around: null, putting: null } };
    expect(storyLine(one)).toMatch(/approach gained the most, \+0\.8\.$/);
  });
  it('says nothing when there is nothing true to say', () => {
    expect(storyLine({ ...PREVIEW_REVIEW, holes: [], putts: null, strokesGained: null })).toBeNull();
  });
  it('an eagle is called an eagle', () => {
    const r: ChRoundReview = { ...PREVIEW_REVIEW, holes: PREVIEW_REVIEW.holes.map((h) => (h.n === 2 ? { ...h, score: 3 } : h)) };
    expect(storyLine(r)).toMatch(/^Best on hole 2, an eagle or better\./);
  });
});
