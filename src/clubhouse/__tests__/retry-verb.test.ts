import { describe, expect, it } from 'vitest';
import { hits, walk } from './_scan';

/** CONS-6: one retry verb. Every failure's action says "Try again", as the notices' own key does. */
describe('the retry verb (CONS-6)', () => {
  it('the retry verb is "Try again"', () => {
    expect(hits(/['"`>]\s*Retry\s*['"`<]/, walk(undefined, /\.tsx?$/))).toEqual([]);
  });
});
