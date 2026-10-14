import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The course map is drawn on the server and hydrated in Safari: any figure it renders must come out bit-for-bit the same
 * in Node and JavaScriptCore. +, -, *, / and Math.sqrt are exactly rounded everywhere; Math.hypot and the trig and
 * exponential functions are not, and a last-digit difference in a circle's cy made every tracking screen log a hydration
 * mismatch (Playwright WebKit, 2026-10-14).
 */
describe('the course map renders the same numbers on the server and in Safari', () => {
  const dir = join(process.cwd(), 'src/clubhouse/screens/rounds/track');
  for (const f of ['hole-geometry.ts', 'parts.tsx']) {
    it(`${f} uses only exactly-rounded arithmetic`, () => {
      const src = readFileSync(join(dir, f), 'utf8');
      expect(src).not.toMatch(/Math\.(hypot|sin|cos|tan|atan2?|exp|log|pow|cbrt)\(/);
    });
  }
});
