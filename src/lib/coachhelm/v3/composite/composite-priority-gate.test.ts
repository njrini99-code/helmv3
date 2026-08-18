import { describe, it, expect } from 'vitest';
import { gatedCompositePriority } from './synthesis';
import { MIN_CONF_FOR_HIGH } from '@/lib/coachhelm/v3/engine/generator-base';

/**
 * A composite insight may not be written 'high'/'urgent' on low confidence.
 *
 * `enforcePriorityConfidenceGate` exists because this exact thing already
 * happened once. Its docblock in engine/generator-base.ts records it:
 *
 *     "a generator that COMPOSES 'high'/'urgent' directly
 *      (course_management's anchoredPriority) bypassed the confidence gate
 *      entirely — 7 live sub-0.5-confidence 'high' rows auto-surfaced in the
 *      Alert Center. Every written priority must clear the same gate
 *      regardless of which path produced it."
 *
 * That was closed for GENERATORS. The COMPOSITE path still has the hole:
 * synthesis.ts writes `priority: rule.priority` — a STATIC property on the rule
 * object, typed `'high' | 'urgent'` (composite/types.ts:135), so every composite
 * is high-or-urgent by construction — while `confidence` comes separately from
 * the rule's own `compose()`. Nothing compares the two.
 *
 * Measured in production 2026-08-18, `golf_coach_insights`:
 *
 *   priority  rows  below 0.5 conf  min conf
 *   urgent      13        0           0.654
 *   high        54        5           0.333
 *
 * All five offenders are `insight_type = 'composite'`, and one was created
 * 2026-08-18 02:49 UTC — hours before this test was written, so this is live
 * behaviour and not historical residue from before the generator fix.
 *
 * A coach's Alert Center ranks on priority. A 0.333-confidence row sitting at
 * 'high' is the engine saying "act on this" about something it barely believes.
 */

describe('gatedCompositePriority', () => {
  it('fixture guard: the floor is the one the generators use', () => {
    // If these two ever diverge, composites and generators would disagree about
    // what "confident enough to be high" means, which is the whole bug.
    expect(MIN_CONF_FOR_HIGH).toBe(0.5);
  });

  it('downgrades a high-priority rule that is not confident enough', () => {
    // 0.3333… is the exact confidence of the live row created 2026-08-18.
    expect(gatedCompositePriority('high', 0.3333333333333333)).toBe('medium');
  });

  it('downgrades an urgent rule that is not confident enough', () => {
    expect(gatedCompositePriority('urgent', 0.4)).toBe('medium');
  });

  it('leaves a confident rule at its declared priority', () => {
    expect(gatedCompositePriority('high', 0.65)).toBe('high');
    expect(gatedCompositePriority('urgent', 0.9)).toBe('urgent');
  });

  it('treats the floor itself as confident enough (>=, not >)', () => {
    // The generator gate downgrades on `confidence < MIN_CONF_FOR_HIGH`, so
    // exactly 0.5 must survive. Pinned so the two paths cannot drift apart on
    // the boundary.
    expect(gatedCompositePriority('high', MIN_CONF_FOR_HIGH)).toBe('high');
  });

  it('never downgrades below medium', () => {
    // The floor is a cap, not a demotion to 'low' — a matched composite still
    // happened, it just is not an act-now claim.
    expect(gatedCompositePriority('high', 0)).toBe('medium');
  });
});
