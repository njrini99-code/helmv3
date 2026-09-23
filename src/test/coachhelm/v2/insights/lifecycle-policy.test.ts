/**
 * Pure lifecycle evaluator shared by upsertInsight's refresh + movement
 * branches. Pins the one transition production never had: a `tentative` row
 * whose recomputed confidence clears the floor becomes `detected`. Production
 * held 326 tentative v3 rows on 2026-09-12 (167 with real sample support)
 * because neither write branch re-evaluated lifecycle after the insert.
 */
import { describe, expect, it } from 'vitest';
import {
  MATURATION_MOVEMENTS,
  TENTATIVE_CONFIDENCE_FLOOR,
  resolveLifecycleOnInsert,
  resolveLifecycleOnWrite,
} from '@/lib/coachhelm/v2/insights/lifecycle-policy';

const base = { nextMovementCount: 0, movedThisWrite: false, promotionEnabled: true };

describe('resolveLifecycleOnInsert', () => {
  it('inserts below the floor as tentative and at/above it as detected', () => {
    expect(resolveLifecycleOnInsert(TENTATIVE_CONFIDENCE_FLOOR - 0.01)).toBe('tentative');
    expect(resolveLifecycleOnInsert(TENTATIVE_CONFIDENCE_FLOOR)).toBe('detected');
    expect(resolveLifecycleOnInsert(1)).toBe('detected');
  });
});

describe('resolveLifecycleOnWrite — tentative promotion', () => {
  it('promotes tentative → detected at the floor on a plain refresh', () => {
    const d = resolveLifecycleOnWrite({ ...base, existing: 'tentative', confidence: 0.4 });
    expect(d).toEqual({ next: 'detected', transition: 'promoted', becomesVisible: true });
  });

  it('promotes tentative → detected on a movement write too', () => {
    const d = resolveLifecycleOnWrite({
      ...base, existing: 'tentative', confidence: 1, nextMovementCount: 8, movedThisWrite: true,
    });
    expect(d.next).toBe('detected');
    expect(d.transition).toBe('promoted');
  });

  it('does NOT jump tentative → matured because an old movement counter reached 3', () => {
    const d = resolveLifecycleOnWrite({
      ...base, existing: 'tentative', confidence: 1, nextMovementCount: 5, movedThisWrite: true,
    });
    expect(d.next).toBe('detected');
  });

  it('stays tentative below the floor', () => {
    const d = resolveLifecycleOnWrite({ ...base, existing: 'tentative', confidence: 0.39 });
    expect(d).toEqual({ next: 'tentative', transition: 'none', becomesVisible: false });
  });

  it('stays tentative when the team has promotion paused (canary gate)', () => {
    const d = resolveLifecycleOnWrite({
      ...base, existing: 'tentative', confidence: 1, promotionEnabled: false,
    });
    expect(d).toEqual({ next: 'tentative', transition: 'none', becomesVisible: false });
  });
});

describe('resolveLifecycleOnWrite — existing transitions preserved', () => {
  it('matures detected only on a movement write that reaches the threshold', () => {
    const moved = resolveLifecycleOnWrite({
      ...base, existing: 'detected', confidence: 0.9,
      nextMovementCount: MATURATION_MOVEMENTS, movedThisWrite: true,
    });
    expect(moved).toEqual({ next: 'matured', transition: 'matured', becomesVisible: false });
    const refreshed = resolveLifecycleOnWrite({
      ...base, existing: 'detected', confidence: 0.9, nextMovementCount: MATURATION_MOVEMENTS,
    });
    expect(refreshed.next).toBe('detected');
    expect(refreshed.transition).toBe('none');
  });

  it('resurrects archived rows through the same confidence gate', () => {
    expect(resolveLifecycleOnWrite({ ...base, existing: 'archived', confidence: 0.9 }))
      .toEqual({ next: 'detected', transition: 'resurrected', becomesVisible: true });
    expect(resolveLifecycleOnWrite({ ...base, existing: 'archived', confidence: 0.2 }))
      .toEqual({ next: 'tentative', transition: 'resurrected', becomesVisible: false });
  });

  it('never touches matured / addressed / resolved', () => {
    for (const s of ['matured', 'addressed', 'resolved'] as const) {
      const d = resolveLifecycleOnWrite({
        ...base, existing: s, confidence: 1, nextMovementCount: 9, movedThisWrite: true,
      });
      expect(d).toEqual({ next: s, transition: 'none', becomesVisible: false });
    }
  });

  it('treats a null lifecycle as detected (legacy rows)', () => {
    expect(resolveLifecycleOnWrite({ ...base, existing: null, confidence: 0.1 }).next).toBe('detected');
  });
});
