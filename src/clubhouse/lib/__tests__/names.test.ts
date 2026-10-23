import { describe, expect, it } from 'vitest';
import { hits, ROOT, walk } from '../../__tests__/_scan';
import { firstName, initials, shortName } from '../names';

describe('one name module (CONS-17)', () => {
  it('a first name is the first word, and an empty name stays empty', () => {
    expect(firstName('Theo Marchetti')).toBe('Theo');
    expect(firstName('  Ava   Lee ')).toBe('Ava');
    expect(firstName('Cher')).toBe('Cher');
    expect(firstName('')).toBe('');
    // Compound first names wait on the owner; today the first word is the first name.
    expect(firstName('Mary Ann Lee')).toBe('Mary');
  });

  it('a short name is the first word and the last initial; one name stays as it is', () => {
    expect(shortName('Theo Marchetti')).toBe('Theo M.');
    expect(shortName('Mary Ann Lee')).toBe('Mary L.');
    expect(shortName(' Cher ')).toBe('Cher');
    expect(initials('Theo Marchetti')).toBe('TM');
  });

  it('names are shortened in lib/names only', () => {
    const found = hits(/function (firstName|shortName)\b|const (firstName|shortName)\s*=/, walk(ROOT, /\.tsx?$/)).filter((h) => !/^lib\/(format|names)\.ts$/.test(h.file));
    expect(found).toEqual([]);
  });
});
