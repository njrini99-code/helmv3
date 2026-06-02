import { describe, it, expect } from 'vitest';

import { sanitizeProse } from './assemble';

/**
 * Read-time prose hygiene. The v3 generators bake internal authoring artifacts
 * into insight copy — "(Research doc §N)" / "Per Research doc §N …" citations
 * and a dangling "The standing card below shows …" sentence (the themes UI
 * renders no standing card). These must never reach a user. The strings below
 * are taken from the real generator templates (pressure-gap / par-type /
 * putt-distance / scrambling / course-mgmt).
 */
describe('sanitizeProse', () => {
  it('strips a parenthetical "(Research doc §N)" citation', () => {
    const input =
      'PGA Tour gap is ~0.5 strokes; college typical is 2-5 (Research doc §9).';
    expect(sanitizeProse(input)).toBe(
      'PGA Tour gap is ~0.5 strokes; college typical is 2-5.',
    );
  });

  it('removes the dangling "The standing card below shows …" sentence', () => {
    const input =
      "You're making 48% of putts from 10-15 ft. The standing card below shows how that compares to your team and the PGA Tour baseline.";
    expect(sanitizeProse(input)).toBe(
      "You're making 48% of putts from 10-15 ft.",
    );
  });

  it('handles the combined citation + standing-card case (pressure-gap)', () => {
    const input =
      'You play worse when it counts. PGA Tour gap is ~0.5 strokes; college typical is 2-5 (Research doc §9). The standing card below shows where you sit vs PGA + your team.';
    expect(sanitizeProse(input)).toBe(
      'You play worse when it counts. PGA Tour gap is ~0.5 strokes; college typical is 2-5.',
    );
  });

  it('removes an inline "Per Research doc §N …" sentence (course-mgmt)', () => {
    const input =
      'Roughly 6% of holes ended in double bogey or worse. PGA Tour is ~2%. Per Research doc §4 the leak is compounding errors; the card below shows your position relative to Tour and your team.';
    expect(sanitizeProse(input)).toBe(
      'Roughly 6% of holes ended in double bogey or worse. PGA Tour is ~2%.',
    );
  });

  it('leaves clean prose untouched', () => {
    const clean =
      'Across your last 28 rounds you average 5.04 on par 5s — +0.04 versus par.';
    expect(sanitizeProse(clean)).toBe(clean);
  });

  it('is idempotent', () => {
    const input =
      'Tour average is ~50% (Research doc §2). The standing card below shows where you sit.';
    const once = sanitizeProse(input);
    expect(sanitizeProse(once)).toBe(once);
  });

  it('returns an empty string for null/undefined/empty', () => {
    expect(sanitizeProse(null)).toBe('');
    expect(sanitizeProse(undefined)).toBe('');
    expect(sanitizeProse('')).toBe('');
  });

  it('does not strip a legitimate parenthetical that is not a citation', () => {
    const input = 'Your miss bias is left (12 of 14 misses).';
    expect(sanitizeProse(input)).toBe('Your miss bias is left (12 of 14 misses).');
  });
});
