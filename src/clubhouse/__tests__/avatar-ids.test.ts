import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT } from './_scan';

/**
 * B19 (review of #2361): a player's coin takes its tone from their player id, as Roster and Messages draw it, so one
 * player keeps one colour across the app. Stats and Qualifiers draw only players, and every row there carries the
 * player's id, so none of their coins may fall back to the name.
 */
const SCREENS = ['stats', 'qualifiers'];

describe('Stats and Qualifiers coins are keyed by the player id', () => {
  for (const dir of SCREENS) {
    it(`screens/${dir}`, () => {
      const base = join(ROOT, 'screens', dir);
      const files = readdirSync(base).filter((f) => f.endsWith('.tsx'));
      const bare: string[] = [];
      for (const f of files) {
        const src = readFileSync(join(base, f), 'utf8');
        for (const m of src.matchAll(/<Avatar\b[^>]*\/>/g)) if (!/\bid=/.test(m[0])) bare.push(`${f}: ${m[0]}`);
      }
      expect(bare).toEqual([]);
    });
  }
});
