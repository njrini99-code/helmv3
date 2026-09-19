import { describe, expect, it } from 'vitest';
import { COMPETITION_POLICY_VERSION, LOCAL_RULE_CAVEAT, NO_ADVICE, competitionPolicy, permittedAdvice, playModeForRound } from '../competition-policy';

describe('competition policy (task 16)', () => {
  it('allows distance and direction in both modes and hides elevation, plays-like, club and line in competition', () => {
    const competition = competitionPolicy('competition'), practice = competitionPolicy('practice');
    for (const policy of [competition, practice]) { expect(policy.distances).toBe(true); expect(policy.direction).toBe(true); expect(policy.version).toBe(COMPETITION_POLICY_VERSION); }
    expect(competition).toMatchObject({ elevationDelta: false, playsLike: false, slopeAdjustment: false, clubRecommendation: false, rollRecommendation: false, targetLineAdvice: false });
    expect(practice).toMatchObject({ elevationDelta: true, clubRecommendation: true, targetLineAdvice: true });
    // No calibrated carry or roll model exists: neither mode markets one.
    expect(practice.playsLike).toBe(false);
    expect(practice.rollRecommendation).toBe(false);
  });

  it('locks Competition Mode on for tournament and qualifier rounds and lets a practice round opt in', () => {
    expect(playModeForRound('tournament')).toEqual({ mode: 'competition', locked: true, basis: 'round_type' });
    expect(playModeForRound('qualifier', 'practice')).toEqual({ mode: 'competition', locked: true, basis: 'round_type' });
    expect(playModeForRound('practice')).toEqual({ mode: 'practice', locked: false, basis: 'default' });
    expect(playModeForRound('practice', 'competition')).toEqual({ mode: 'competition', locked: false, basis: 'player_choice' });
    expect(playModeForRound(undefined)).toEqual({ mode: 'practice', locked: false, basis: 'default' });
    expect(playModeForRound('something-new')).toEqual({ mode: 'practice', locked: false, basis: 'default' });
  });

  it('nulls forbidden advice before it can reach a component, and states the Local Rule caveat', () => {
    const advice = { elevationDeltaM: 4.2, playsLikeM: 150, club: '7i', line: 'left edge' };
    expect(permittedAdvice(advice, competitionPolicy('competition'))).toEqual(NO_ADVICE);
    expect(permittedAdvice(advice, competitionPolicy('practice'))).toEqual({ elevationDeltaM: 4.2, playsLikeM: null, club: '7i', line: 'left edge' });
    expect(LOCAL_RULE_CAVEAT.body).toMatch(/Local Rule/);
    expect(LOCAL_RULE_CAVEAT.body).toMatch(/Committee/);
  });
});
