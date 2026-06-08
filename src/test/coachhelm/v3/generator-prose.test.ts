import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * G7 regression lock. No Tier-1 v3 generator should AUTHOR the dangling
 * "standing card below shows…" sentence. `sanitizeProse` already strips it at
 * read-time, but re-generated prod rows must be clean at the SOURCE (the themes
 * UI renders no standing card, so the sentence is a dangling reference).
 *
 * This forbids the exact user-facing phrase only — the architectural comments
 * that legitimately describe a generator's role ("descriptive standing card",
 * "keep this off the feed rank") are intentionally NOT matched.
 *
 * The generators already carry rich driver+action prose from phases B/C/D, so
 * G7 does NOT flatten that voice — it only removes the dangling sentence.
 */
describe('generator prose — no dangling "standing card below" authored at source', () => {
  const GENERATORS = [
    'approach-miss',
    'course-mgmt',
    'par-type',
    'pressure-gap',
    'putt-bias',
    'putt-distance',
    'scrambling',
    'tee-strategy',
    'warmup-hole',
  ];

  for (const g of GENERATORS) {
    it(`${g} does not author "standing card below"`, () => {
      const src = readFileSync(
        join(process.cwd(), 'src/lib/coachhelm/v3/generators', `${g}.ts`),
        'utf8',
      );
      expect(src.toLowerCase()).not.toContain('standing card below');
    });
  }
});
