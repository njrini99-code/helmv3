/**
 * The Persona card contradicts itself: it says nothing is flagged, and then
 * flags something.
 *
 * Seen in production 2026-08-18 on Larsen Gallimore's genome
 * (`/golf/dashboard/players/…/genome`):
 *
 *     WATCHOUTS        No watchouts flagged yet.
 *     COURSE PROFILE   Mixed off the tee · leaks shots on par-3 holes.
 *
 * Both halves read the same dimension and disagree because they use different
 * vocabularies for it:
 *
 *   - `derivePersona` gates watchouts on the NORMALIZED good-axis,
 *     `norm <= 0.3`. For par-3 that is `linearMap(2, -2, v) <= 0.3`, i.e. a
 *     value of **+0.8 strokes or worse**.
 *   - `buildCourseProfile` narrates from the dimension's own LABEL, whose
 *     else-branch catches everything that is not 'Under par' or 'Even' — and
 *     `par3-proficiency.ts:31` starts 'Bleeds shots' at **+0.2**.
 *
 * That leaves a 0.6-stroke band, [0.2, 0.8), where the card says "leaks shots"
 * while claiming no watchouts. Larsen sits at +0.44, in the middle of it.
 *
 * It is symmetric, so the same thing happens on the good side: 'Under par'
 * starts at -0.1 (norm 0.525) while a STRENGTH needs norm >= 0.7 (value -0.8),
 * so a player can be told they "thrive on par-3 holes" while the strengths
 * list stays empty.
 *
 * The fix is not to move a product threshold — it is to make one card speak
 * one language. The course profile now reads the same normalized axis the
 * strengths and watchouts do, so "leaks" appears exactly when a watchout
 * fires and "thrives" exactly when a strength does.
 */
import { describe, it, expect } from 'vitest';
import { derivePersona } from '@/lib/coachhelm/v3/genome/persona';
import type { GenomeVector } from '@/lib/coachhelm/v3/genome/types';

/** A vector with a live driver dim (course profile requires it) + a par-3 value. */
function vec(par3Value: number | null, par3Label: string): GenomeVector {
  return {
    driver_usage: { value: 0.631, confidence: 1, label: 'Mixed' },
    par3_proficiency: { value: par3Value, confidence: 1, label: par3Label },
  };
}

describe('Persona — the course profile and the watchouts must agree', () => {
  it('does not say "leaks shots" while reporting no watchouts (Larsen, +0.44)', () => {
    const p = derivePersona(vec(0.44, 'Bleeds shots'));

    // The exact production shape: no watchout fired at +0.44.
    expect(p.watchouts.some((w) => w.dim_id === 'par3_proficiency')).toBe(false);
    // ...so the profile must not contradict that.
    expect(p.course_profile).not.toMatch(/leaks shots/i);
  });

  it('DOES say "leaks shots" once the dimension is bad enough to be a watchout', () => {
    const p = derivePersona(vec(1.2, 'Bleeds shots'));

    expect(p.watchouts.some((w) => w.dim_id === 'par3_proficiency')).toBe(true);
    expect(p.course_profile).toMatch(/leaks shots on par-3 holes/i);
  });

  it('does not say "thrives" while reporting no strength (the mirror case)', () => {
    // 'Under par' starts at -0.1 but a STRENGTH needs norm >= 0.7 (value -0.8).
    const p = derivePersona(vec(-0.3, 'Under par'));

    expect(p.strengths.some((s) => s.dim_id === 'par3_proficiency')).toBe(false);
    expect(p.course_profile).not.toMatch(/thrives/i);
  });

  it('DOES say "thrives" once the dimension is good enough to be a strength', () => {
    const p = derivePersona(vec(-1.5, 'Under par'));

    expect(p.strengths.some((s) => s.dim_id === 'par3_proficiency')).toBe(true);
    expect(p.course_profile).toMatch(/thrives on par-3 holes/i);
  });

  it('calls the middle band steady rather than inventing a verdict', () => {
    const p = derivePersona(vec(0.44, 'Bleeds shots'));
    expect(p.course_profile).toMatch(/holds steady on par-3 holes/i);
  });

  it('omits the par-3 clause entirely when the dimension is not computed', () => {
    const p = derivePersona(vec(null, 'Needs more rounds'));
    expect(p.course_profile).not.toMatch(/par-3/i);
    // The tee half still renders.
    expect(p.course_profile).toMatch(/off the tee/i);
  });

  it('still refuses a profile when there is no driver dimension at all', () => {
    expect(derivePersona({}).course_profile).toMatch(/not enough rounds/i);
  });
});
