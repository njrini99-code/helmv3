import { describe, it, expect } from 'vitest';
import { splitDisplayName, safeInitial } from '../calendar';

/**
 * `splitDisplayName` + `safeInitial` — the fix for a coach's placeholder
 * name rendering as "Coach (." in the calendar event editor's invite grid.
 *
 * Root cause: `calendar/page.tsx` builds `TeamMember.first_name`/`last_name`
 * by splitting a single `full_name` column on spaces. For "Coach (Demo)"
 * that produces `last_name: '(Demo)'` — a faithful, reconstructable split,
 * but not a clean surname. A consumer that abbreviated to a first initial by
 * indexing `last_name[0]` printed the literal "(" character.
 *
 * `splitDisplayName` documents and centralizes the split (previously
 * inlined in `page.tsx`); `safeInitial` is the fix for the actual
 * abbreviation bug — it refuses to turn a leading punctuation character into
 * an initial, instead of blindly indexing `[0]`.
 */
describe('splitDisplayName', () => {
  it('splits a normal "First Last" name', () => {
    expect(splitDisplayName('Nick Rini')).toEqual({ first_name: 'Nick', last_name: 'Rini' });
  });

  it('handles a single-word name with an empty last_name', () => {
    expect(splitDisplayName('Madonna')).toEqual({ first_name: 'Madonna', last_name: '' });
  });

  it('preserves a parenthetical annotation as part of last_name (reconstructable)', () => {
    const result = splitDisplayName('Coach (Demo)');
    expect(result).toEqual({ first_name: 'Coach', last_name: '(Demo)' });
    // The split must be reconstructable — this is what lets a full-name
    // render (e.g. FairwayEventEditor's invite grid) show the complete,
    // correct name instead of a mangled fragment.
    expect(`${result.first_name} ${result.last_name}`.trim()).toBe('Coach (Demo)');
  });

  it('keeps a compound surname together', () => {
    expect(splitDisplayName('Anna van der Berg')).toEqual({
      first_name: 'Anna',
      last_name: 'van der Berg',
    });
  });

  it('falls back to empty strings for null/undefined/blank input', () => {
    expect(splitDisplayName(null)).toEqual({ first_name: '', last_name: '' });
    expect(splitDisplayName(undefined)).toEqual({ first_name: '', last_name: '' });
    expect(splitDisplayName('   ')).toEqual({ first_name: '', last_name: '' });
  });

  it('collapses repeated whitespace between name parts', () => {
    expect(splitDisplayName('Nick   Rini')).toEqual({ first_name: 'Nick', last_name: 'Rini' });
  });
});

describe('safeInitial', () => {
  it('returns the uppercased leading letter for a normal name part', () => {
    expect(safeInitial('Rini')).toBe('R');
    expect(safeInitial('van der Berg')).toBe('V');
  });

  it('returns empty string for a value that starts with punctuation — the "Coach (." fix', () => {
    // This is the exact reproduction of the bug: `last_name[0]` on '(Demo)'
    // is '(', which is what rendered as "Coach (.". safeInitial must not
    // fabricate an initial from it.
    expect(safeInitial('(Demo)')).toBe('');
  });

  it('never lets a punctuation-led last_name produce a broken abbreviation', () => {
    const firstInitial = safeInitial('Coach');
    const lastInitial = safeInitial('(Demo)');
    expect(`${firstInitial}${lastInitial}`).toBe('C');
    expect(`${firstInitial}${lastInitial}`).not.toContain('(');
  });

  it('returns empty string for empty/blank/nullish input', () => {
    expect(safeInitial('')).toBe('');
    expect(safeInitial('   ')).toBe('');
    expect(safeInitial(null)).toBe('');
    expect(safeInitial(undefined)).toBe('');
  });

  it('reproduces the old buggy behaviour when NOT used (regression control)', () => {
    // Sanity check that the bug this fixes is real: naively indexing [0] on
    // the split's own last_name output is what produced "(" in the old code.
    const { last_name } = splitDisplayName('Coach (Demo)');
    expect(last_name[0]).toBe('(');
    // ...and that safeInitial is what prevents it from reaching the UI.
    expect(safeInitial(last_name)).toBe('');
  });
});
