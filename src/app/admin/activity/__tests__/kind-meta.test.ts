import { describe, it, expect } from 'vitest';
import { ACTIVITY_KIND_META, isActivityKind, kindMeta } from '../kind-meta';

describe('ACTIVITY_KIND_META', () => {
  it('declares all 9 kinds in the owner-specified chip order', () => {
    expect(ACTIVITY_KIND_META.map((m) => m.chipLabel)).toEqual([
      'Rounds',
      'Sign-ups',
      'Sign-ins',
      'Insights',
      'Messages',
      'Events',
      'Demos',
      'Documents',
      'Errors',
    ]);
  });

  it('reserves danger tone for errors only, and accent for the demo leader row', () => {
    const byTone = new Map(ACTIVITY_KIND_META.map((m) => [m.kind, m.tone]));
    expect(byTone.get('error')).toBe('danger');
    expect(byTone.get('demo_session')).toBe('accent');
    for (const m of ACTIVITY_KIND_META) {
      if (m.kind !== 'error' && m.kind !== 'demo_session') {
        expect(m.tone).toBe('neutral');
      }
    }
  });

  it('kindMeta resolves every declared kind', () => {
    for (const m of ACTIVITY_KIND_META) {
      expect(kindMeta(m.kind)).toBe(m);
    }
  });
});

describe('isActivityKind', () => {
  it('accepts every declared kind and rejects unknown/undefined values', () => {
    for (const m of ACTIVITY_KIND_META) {
      expect(isActivityKind(m.kind)).toBe(true);
    }
    expect(isActivityKind('not_a_kind')).toBe(false);
    expect(isActivityKind(undefined)).toBe(false);
  });
});
