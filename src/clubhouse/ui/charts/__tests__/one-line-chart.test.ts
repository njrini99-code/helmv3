import { describe, expect, it } from 'vitest';
import { hits, walk } from '../../../__tests__/_scan';

/**
 * B5: Clubhouse draws its trends with ui/charts/Line, so every line reads the same way (better up, gaps not bridges,
 * straight segments, one scrub). TeamTrendChart was the last Recharts chart; nothing in Clubhouse imports it again.
 */
describe('one line chart (B5)', () => {
  it('no Clubhouse source imports Recharts', () => {
    expect(hits(/['"]recharts['"]/, walk(undefined, /\.tsx?$/))).toEqual([]);
  });
});
