import { describe, expect, it } from 'vitest';
import { namesWithheldArm, playerSeesCause, playerTitle, withoutGuessedCause } from '../player-cause';

const LIKELY = {
  metric_label: 'Greens from the fairway',
  cause: { state: 'inferred_hypothesis', alternatives: [{ label: 'From 175+ yards', arm_a: { n: 28, failures: 16 }, arm_b: { n: 40, failures: 10 } }] },
  diagnosis: { causality_level: 'inferred_hypothesis', root_cause: 'Long irons look like the cause.' },
};
const COUNTED = { cause: { state: 'observed_sequence', path: ['Long approach'] }, diagnosis: { causality_level: 'observed_sequence', root_cause: 'Long approach, then short side.' } };

describe('what a player may read of a cause', () => {
  it('only a counted sequence is theirs', () => {
    expect(playerSeesCause(COUNTED)).toBe(true);
    expect(playerSeesCause(LIKELY)).toBe(false);
    expect(playerSeesCause(null)).toBe(false);
    expect(playerSeesCause({ diagnosis: { causality_level: 'observed_sequence', root_cause: 'X.' }, cause: { state: 'inferred_hypothesis' } })).toBe(false);
    expect(playerSeesCause({ diagnosis: { causality_level: 'observed_sequence', root_cause: 'X.' }, cause: { state: 'not_traced' } })).toBe(false);
  });

  it('drops a causal sentence, a named arm, an arm’s count and the guess itself, and keeps the rest', () => {
    const text = 'You hit 36% of greens. That is driven by your irons. From 175+ yards it drops. You missed 16 of 28 there. Long irons look like the cause. Keep at it.';
    expect(withoutGuessedCause(text, LIKELY)).toBe('You hit 36% of greens. Keep at it.');
  });

  it('a counted cause keeps the text whole, and nothing left is null', () => {
    expect(withoutGuessedCause('That is driven by your irons.', COUNTED)).toBe('That is driven by your irons.');
    expect(withoutGuessedCause('That is driven by your irons.', LIKELY)).toBeNull();
    expect(withoutGuessedCause(null, LIKELY)).toBeNull();
  });

  it('a figure of points is a measure, and "points to" a cause is not', () => {
    expect(withoutGuessedCause('You are 23 points to the Tour.', {})).toBe('You are 23 points to the Tour.');
    expect(withoutGuessedCause('That points to pace control.', {})).toBeNull();
  });

  it('a title that is the guess reads as what it measures', () => {
    expect(playerTitle('Misses driven by long irons', LIKELY)).toBe('Greens from the fairway');
    expect(playerTitle('Trouble from 175+ yards', LIKELY)).toBe('Greens from the fairway');
    expect(playerTitle('Downhill putts', LIKELY)).toBe('Downhill putts');
    expect(playerTitle('Misses driven by long irons', {})).toBe('A read on your game');
  });

  it('no arm to hide on a counted cause or a row without one', () => {
    expect(namesWithheldArm('From 175+ yards', COUNTED)).toBe(false);
    expect(namesWithheldArm('From 175+ yards', {})).toBe(false);
    expect(namesWithheldArm('from 175+ yards', LIKELY)).toBe(true);
  });
});
