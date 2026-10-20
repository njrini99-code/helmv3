import { describe, expect, it } from 'vitest';
import { causeStateOf, isNotTracedCause } from '../cause-state';

describe('causeStateOf', () => {
  it('reads the three Slice 2 states', () => {
    expect(causeStateOf({ cause: { state: 'observed_sequence' } as never })).toBe('observed_sequence');
    expect(causeStateOf({ cause: { state: 'inferred_hypothesis' } as never })).toBe('inferred_hypothesis');
    expect(causeStateOf({ cause: { state: 'not_traced' } as never })).toBe('not_traced');
  });

  it('is null for a row written without the root-cause flag, or an unknown state', () => {
    expect(causeStateOf({})).toBeNull();
    expect(causeStateOf(null)).toBeNull();
    expect(causeStateOf(undefined)).toBeNull();
    expect(causeStateOf({ cause: { state: 'guessed' } as never })).toBeNull();
  });

  it('isNotTracedCause is true only for not_traced', () => {
    expect(isNotTracedCause({ cause: { state: 'not_traced' } as never })).toBe(true);
    expect(isNotTracedCause({ cause: { state: 'inferred_hypothesis' } as never })).toBe(false);
    expect(isNotTracedCause({})).toBe(false);
  });
});
