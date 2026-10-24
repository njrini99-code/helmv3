import { describe, expect, it } from 'vitest';
import { hits, ratchet, ROOT, walk } from '../../__tests__/_scan';
import { plural, pluralWord } from '../plural';

/** CONS-14: one plural rule. The inline `n === 1 ? 'x' : 'xs'` ternaries below may only fall, toward none. */
const ALLOW_TERNARY: Record<string, number> = {
  'data/classes-shape.ts': 1,
  'data/coachhelm-monday-brief-shape.ts': 1,
  'data/shell.ts': 1,
  'data/stats-filter.ts': 1,
  'screens/classes/ImportSchedule.tsx': 1,
  'screens/coachhelm/PlayerBoard.tsx': 1,
};

describe('one plural helper (CONS-14)', () => {
  it('English plurals, with the count or without', () => {
    expect(plural(1, 'round')).toBe('1 round');
    expect(plural(0, 'round')).toBe('0 rounds');
    expect(plural(2, 'match', 'matches')).toBe('2 matches');
    expect(pluralWord(1, 'player')).toBe('player');
    expect(pluralWord(3, 'player')).toBe('players');
  });

  it('one plural helper', () => {
    expect(hits(/function plural\b|const plural\s*=/, walk(ROOT, /\.tsx?$/)).filter((h) => h.file !== 'lib/plural.ts')).toEqual([]);
    const r = ratchet(hits(/===\s*1\s*\?\s*['"`][^'"`]*['"`]\s*:\s*['"`][^'"`]*s['"`]/, walk(ROOT, /\.tsx?$/)), ALLOW_TERNARY);
    expect(r.over).toEqual([]);
    expect(r.stale).toEqual([]);
  });
});
