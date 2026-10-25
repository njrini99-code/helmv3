import { describe, expect, it } from 'vitest';
import { hits, walk } from './_scan';

/** CONS-10: one "not on a team" state. Every page says it through ui/NoTeam: one icon, one title, one way on. */
describe('not on a team (CONS-10)', () => {
  it('"not on a team" is only ui/NoTeam', () => {
    const found = hits(/aren[’']t on a team/, walk(undefined, /\.tsx?$/)).filter((h) => h.file !== 'ui/NoTeam.tsx');
    expect(found).toEqual([]);
  });
});
