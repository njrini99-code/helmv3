/**
 * ============================================================================
 * initialsFromName — strip punctuation before tokenizing a display name (#950)
 * ----------------------------------------------------------------------------
 * Same bug/fix as src/components/ui/avatar.tsx's getInitials: a display name
 * like "Coach (Demo)" tokenized to ["Coach", "(Demo)"] on whitespace alone,
 * and the last token's first character — "(" — leaked into the initials as
 * "C(". Fix: strip anything that isn't a letter/space/apostrophe/hyphen
 * before splitting into words.
 * ========================================================================== */
import { describe, expect, it } from 'vitest';
import { initialsFromName } from './avatar';

describe('initialsFromName', () => {
  it('never lets a parenthetical suffix leak a punctuation initial (the #950 case)', () => {
    expect(initialsFromName('Coach (Demo)')).toBe('CD');
  });

  it('handles a plain two-word name', () => {
    expect(initialsFromName('Nick Rini')).toBe('NR');
  });

  it('takes the first two letters of a single-word name', () => {
    expect(initialsFromName('Cher')).toBe('CH');
  });

  it('keeps apostrophes and hyphens as legitimate name characters', () => {
    expect(initialsFromName("Mary-Jane O'Brien")).toBe('MO');
  });

  it('returns an empty string for a null/undefined/blank name', () => {
    expect(initialsFromName(null)).toBe('');
    expect(initialsFromName(undefined)).toBe('');
    expect(initialsFromName('   ')).toBe('');
  });
});
