import { describe, it, expect } from 'vitest';
import { escapeLikePattern } from '@/lib/utils/escape-like';

/**
 * The shipped version escaped `%` and `_` but not the escape character itself,
 * so a backslash the user typed survived into the pattern and changed what the
 * NEXT character meant — turning an escaped wildcard back into a live one.
 */
const oldBroken = (q: string) => q.replace(/%/g, '\\%').replace(/_/g, '\\_');

describe('escapeLikePattern', () => {
  it('escapes the backslash first, so an escaped wildcard stays literal', () => {
    // `a\%b`: the old version produced `a\\%b` — literal backslash, then a LIVE
    // `%` wildcard. The whole point of escaping, defeated.
    expect(oldBroken('a\\%b')).toBe('a\\\\%b');
    expect(escapeLikePattern('a\\%b')).toBe('a\\\\\\%b');
  });

  it('does not leave a dangling escape on a trailing backslash', () => {
    // `100\` was passed through untouched — a trailing escape with nothing to
    // escape, i.e. a malformed pattern.
    expect(oldBroken('100\\')).toBe('100\\');
    expect(escapeLikePattern('100\\')).toBe('100\\\\');
  });

  it('still escapes the wildcards themselves', () => {
    expect(escapeLikePattern('50%')).toBe('50\\%');
    expect(escapeLikePattern('a_b')).toBe('a\\_b');
  });

  it('leaves ordinary search text alone', () => {
    expect(escapeLikePattern("Scott O'Hara")).toBe("Scott O'Hara");
    expect(escapeLikePattern('')).toBe('');
  });
});
