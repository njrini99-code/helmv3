import { describe, expect, it } from 'vitest';
import { hits, ROOT, walk } from './_scan';

/**
 * CONS-26: a page's title is its nav label (Roster, Rounds), and no title ends in a full stop; Home's greeting is
 * "Good morning, Maya". Qualifiers' title against its nav waits on the owner.
 */
describe('page titles (CONS-26)', () => {
  it('no literal title ends in a full stop', () => {
    expect(hits(/<h1[^>]*>[^<{]*\.<\/h1>/, walk(ROOT, /\.tsx$/))).toEqual([]);
  });

  it('Roster and Rounds are titled by their nav labels', () => {
    const titles = hits(/<h1[^>]*>(Roster|Rounds)<\/h1>/, walk(ROOT, /\.tsx$/)).map((h) => h.file).sort();
    expect(titles).toEqual(expect.arrayContaining(['screens/roster/Roster.tsx', 'screens/roster/TeamRoster.tsx', 'screens/rounds/RoundsLibrary.tsx']));
  });
});
