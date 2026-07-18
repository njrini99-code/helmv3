/**
 * ============================================================================
 * getInitials — strip punctuation before tokenizing a display name (#950)
 * ----------------------------------------------------------------------------
 * Bug: the golf demo coach's display name "Coach (Demo)" produced "C(" —
 * splitting on whitespace alone tokenizes to ["Coach", "(Demo)"], and the
 * last token's first character is "(". Fix: strip anything that isn't a
 * letter/space/apostrophe/hyphen before splitting into words.
 * ========================================================================== */
import { describe, expect, it } from 'vitest';
import { getInitials } from './avatar';

describe('getInitials', () => {
  it('never lets a parenthetical suffix leak a punctuation initial (the #950 case)', () => {
    expect(getInitials('Coach (Demo)')).toBe('CD');
  });

  it('handles a plain two-word name', () => {
    expect(getInitials('Nick Rini')).toBe('NR');
  });

  it('takes the first two letters of a single-word name', () => {
    expect(getInitials('Cher')).toBe('CH');
  });

  it('keeps apostrophes and hyphens as legitimate name characters', () => {
    expect(getInitials("Mary-Jane O'Brien")).toBe('MO');
  });

  it('falls back to "?" for an empty/whitespace-only name', () => {
    expect(getInitials('')).toBe('?');
    expect(getInitials('   ')).toBe('?');
  });

  it('falls back to "?" when the name is pure punctuation (nothing letter-like left)', () => {
    expect(getInitials('(((')).toBe('?');
  });
});
