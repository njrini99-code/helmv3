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
  heroAlreadyShowsLeadInsight,
  selectCategoryRowInsight,
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

/**
 * Content-dedup audit (W3): the SAME lag-putt paragraph rendered verbatim in
 * BOTH the Brief hero (as the headline support text, or the foot-strip's
 * honest fallback) AND the Brief's own "putting" category-detail row below it
 * — because `CategoryHealthRow` renders `cat.insights[0]` unconditionally,
 * with no awareness of what the hero already showed. `heroAlreadyShowsLeadInsight`
 * + `selectCategoryRowInsight` are the assembly-layer fix: detect the
 * on-page collision, then fall through to the category's next REAL insight
 * (never fabricate one) — or omit, if there is no second insight.
 */
describe('heroAlreadyShowsLeadInsight (content-dedup audit)', () => {
  it('is true when the headline support text already used the lead insight (putting/scoring branch)', () => {
    expect(heroAlreadyShowsLeadInsight('lead-insight', 0, true)).toBe(true);
    expect(heroAlreadyShowsLeadInsight('lead-insight', 3, true)).toBe(true);
  });

  it('is true for a yardage-band category when no player is flagged (foot strip falls back to the lead insight)', () => {
    expect(heroAlreadyShowsLeadInsight('yardage-band', 0, true)).toBe(true);
  });

  it('is false for a yardage-band category WITH flagged players (foot strip shows player chips instead)', () => {
    expect(heroAlreadyShowsLeadInsight('yardage-band', 2, true)).toBe(false);
  });

  it('is false when there is no lead insight to begin with — never a fabricated dedup', () => {
    expect(heroAlreadyShowsLeadInsight('lead-insight', 0, false)).toBe(false);
    expect(heroAlreadyShowsLeadInsight('none', 0, false)).toBe(false);
  });
});

describe('selectCategoryRowInsight (content-dedup audit)', () => {
  const lagPutt = insight('Lag putts (15+ ft) are turning into 3-putts at nearly double the team rate.');
  const trend = { id: 'putting-trend', message: 'Team putting trending up — 4 of 6 players improving', tone: 'positive' as const };

  it('renders the top insight unchanged when it was NOT already shown in the hero', () => {
    expect(selectCategoryRowInsight([lagPutt, trend], null)).toBe(lagPutt);
    expect(selectCategoryRowInsight([lagPutt, trend], 'some-other-id')).toBe(lagPutt);
  });

  it('falls through to the category\'s next REAL insight when the top one collides with the hero (never a repeat, never fabricated)', () => {
    const picked = selectCategoryRowInsight([lagPutt, trend], lagPutt.id);
    expect(picked).toBe(trend);
    expect(picked?.message).not.toBe(lagPutt.message);
  });

  it('omits the row entirely — rather than invent a replacement — when there is no second insight', () => {
    expect(selectCategoryRowInsight([lagPutt], lagPutt.id)).toBeNull();
  });

  it('handles an empty insights array honestly', () => {
    expect(selectCategoryRowInsight([], null)).toBeNull();
  });
});
