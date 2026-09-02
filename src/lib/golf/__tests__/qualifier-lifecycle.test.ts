import { describe, expect, it } from 'vitest';
import { getQualifierAutomaticTransition } from '../qualifier-lifecycle';

describe('getQualifierAutomaticTransition', () => {
  it('starts an upcoming qualifier only when its first round is submitted', () => {
    expect(getQualifierAutomaticTransition('upcoming')).toBe('in_progress');
  });

  it('never closes a qualifier automatically, regardless of player progress or schedule dates', () => {
    expect(getQualifierAutomaticTransition('in_progress')).toBeNull();
    expect(getQualifierAutomaticTransition('completed')).toBeNull();
    expect(getQualifierAutomaticTransition('cancelled')).toBeNull();
    expect(getQualifierAutomaticTransition(null)).toBeNull();
  });
});
