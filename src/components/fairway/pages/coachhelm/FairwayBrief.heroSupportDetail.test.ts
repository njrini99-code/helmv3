/**
 * Regression test for #946 (Team Brief hero, fix 3/5): the hero's headline
 * support sentence used to unconditionally render the yardage-band
 * `worstZone` sentence ("Toughest from 275–300 yds…") regardless of which
 * category the headline had just named. `teamShotAnalysis.deadZones` is
 * sourced from `buildYardageCurve`, which explicitly SKIPS every putt
 * (`lieBefore === 'green'`) — so a yardage-band sentence is only ever true
 * evidence for driving/approach/short-game, never for Putting or Scoring.
 * Live prod showed exactly this: a driving/approach distance band cited as
 * the supporting detail under "Putting · 20/100".
 *
 * `selectHeroSupportDetail` must constrain the supporting detail to the SAME
 * category as the headline metric — falling back to that category's OWN
 * lead insight (already category-scoped via `getTeamCategoryInsights`), and
 * to nothing (never an invented detail) when neither is available.
 */
import { describe, it, expect } from 'vitest';
import {
  isYardageBandCategory,
  selectHeroSupportDetail,
  type HeroSupportDetail,
} from './FairwayBrief';
import type { CategoryInsight } from '@/app/golf/actions/team-category-insights';

const WORST_ZONE = { rangeStart: 275, rangeEnd: 300, deficit: -0.52 };

function insight(message: string): CategoryInsight {
  return { id: 'i1', message, tone: 'negative' };
}

describe('isYardageBandCategory (#946)', () => {
  it('is true only for the full-swing categories the yardage curve actually covers', () => {
    expect(isYardageBandCategory('driving')).toBe(true);
    expect(isYardageBandCategory('approach')).toBe(true);
    expect(isYardageBandCategory('short_game')).toBe(true);
  });

  it('is false for putting and scoring — the yardage curve excludes every putt', () => {
    expect(isYardageBandCategory('putting')).toBe(false);
    expect(isYardageBandCategory('scoring')).toBe(false);
  });
});

describe('selectHeroSupportDetail — category-matched selection (#946)', () => {
  it('cites the yardage-band sentence for a full-swing category (driving)', () => {
    const detail = selectHeroSupportDetail('driving', WORST_ZONE, null);
    expect(detail.kind).toBe('yardage-band');
    expect(detail.text).toContain('275–300 yds');
  });

  it('cites the yardage-band sentence for approach', () => {
    const detail = selectHeroSupportDetail('approach', WORST_ZONE, insight('Approach lead insight'));
    // Both are available — the yardage-band evidence still wins for a
    // full-swing category (it's the richer, quantified evidence).
    expect(detail.kind).toBe('yardage-band');
  });

  it('NEVER cites the yardage-band sentence under Putting — falls back to the category lead insight', () => {
    const puttingInsight = insight('Team is missing short putts under 6 feet.');
    const detail = selectHeroSupportDetail('putting', WORST_ZONE, puttingInsight);
    expect(detail.kind).toBe('lead-insight');
    expect(detail.text).toBe(puttingInsight.message);
    expect(detail.text).not.toContain('yds');
  });

  it('NEVER cites the yardage-band sentence under Scoring either', () => {
    const detail = selectHeroSupportDetail('scoring', WORST_ZONE, insight('Scoring lead insight'));
    expect(detail.kind).toBe('lead-insight');
    expect(detail.text).not.toContain('yds');
  });

  it('drops the detail entirely (no invented text) when putting/scoring has no lead insight', () => {
    const detail: HeroSupportDetail = selectHeroSupportDetail('putting', WORST_ZONE, null);
    expect(detail.kind).toBe('none');
    expect(detail.text).toBeNull();
  });

  it('drops the detail for a full-swing category when there is no worstZone (no invented band)', () => {
    const detail = selectHeroSupportDetail('driving', null, insight('unrelated'));
    expect(detail.kind).toBe('none');
    expect(detail.text).toBeNull();
  });
});
