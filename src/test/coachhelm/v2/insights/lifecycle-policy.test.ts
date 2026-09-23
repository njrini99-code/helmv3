/**
 * Pure lifecycle evaluator shared by upsertInsight's refresh + movement
 * branches. Pins two transitions production got wrong:
 *
 *  - A `tentative` row whose recomputed confidence clears the floor becomes
 *    `detected`. Production held 326 tentative v3 rows on 2026-09-12 (167
 *    with real sample support) because neither write branch re-evaluated
 *    lifecycle after the insert.
 *  - Maturation counts DISTINCT evidence revisions recorded while the row is
 *    `detected`, not raw >=5% movement writes. Before this fix a movement
 *    counter that reached 3 while the row was still `tentative` (invisible)
 *    carried over and matured the row on its FIRST post-promotion write —
 *    "matured" without the coach ever having seen it move.
 */
import { describe, expect, it } from 'vitest';
import {
  MATURATION_CONFIRMATIONS,
  TENTATIVE_CONFIDENCE_FLOOR,
  resolveLifecycleOnInsert,
  resolveLifecycleOnWrite,
} from '@/lib/coachhelm/v2/insights/lifecycle-policy';

const base = {
  movedThisWrite: false,
  promotionEnabled: true,
  evidenceRevisionKey: 'n/a',
  priorMaturationKeys: [] as readonly string[],
};

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
    expect(d).toEqual({ next: 'detected', transition: 'promoted', becomesVisible: true, maturationKeys: [] });
  });

  it('promotes tentative → detected on a movement write too', () => {
    const d = resolveLifecycleOnWrite({
      ...base, existing: 'tentative', confidence: 1, movedThisWrite: true, evidenceRevisionKey: 'rev-8',
    });
    expect(d.next).toBe('detected');
    expect(d.transition).toBe('promoted');
  });

  it('does NOT jump tentative → matured because an old movement counter reached 3 — the ' +
     'counter accumulated while the row was invisible must not count toward maturity', () => {
    const d = resolveLifecycleOnWrite({
      ...base,
      existing: 'tentative',
      confidence: 1,
      movedThisWrite: true,
      evidenceRevisionKey: 'rev-new',
      // Simulates the OLD bug's setup: as if 3 confirmations had already
      // accumulated pre-promotion. The tentative branch must ignore this
      // entirely and always reset to [] on promotion.
      priorMaturationKeys: ['rev-1', 'rev-2', 'rev-3'],
    });
    expect(d.next).toBe('detected');
    expect(d.transition).toBe('promoted');
    // The reset is explicit, not merely "unspecified" — a caller that reads
    // `maturationKeys` and finds it `undefined` would wrongly keep the old
    // (pre-promotion) list.
    expect(d.maturationKeys).toEqual([]);
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

describe('resolveLifecycleOnWrite — maturation requires independent new-round confirmations', () => {
  it('matures detected only after MATURATION_CONFIRMATIONS DISTINCT evidence revisions', () => {
    let keys: readonly string[] = [];
    for (let i = 0; i < MATURATION_CONFIRMATIONS - 1; i++) {
      const d = resolveLifecycleOnWrite({
        ...base, existing: 'detected', confidence: 0.9, movedThisWrite: true,
        evidenceRevisionKey: `round-${i}`, priorMaturationKeys: keys,
      });
      expect(d.transition).toBe('none');
      expect(d.next).toBe('detected');
      keys = d.maturationKeys!;
      expect(keys.length).toBe(i + 1);
    }
    const final = resolveLifecycleOnWrite({
      ...base, existing: 'detected', confidence: 0.9, movedThisWrite: true,
      evidenceRevisionKey: `round-final`, priorMaturationKeys: keys,
    });
    expect(final).toEqual({
      next: 'matured', transition: 'matured', becomesVisible: false,
      maturationKeys: [...keys, 'round-final'],
    });
  });

  it('does NOT count the same evidence revision twice — a re-evaluation of unchanged ' +
     'data (e.g. the same round re-emitted by a different generator run) is one ' +
     'confirmation, not two', () => {
    const afterFirst = resolveLifecycleOnWrite({
      ...base, existing: 'detected', confidence: 0.9, movedThisWrite: true,
      evidenceRevisionKey: 'round-A', priorMaturationKeys: [],
    });
    expect(afterFirst.maturationKeys).toEqual(['round-A']);

    // Same revision key re-submitted (e.g. cron + trigger both firing on the
    // same underlying round data). Must not grow the list.
    const repeated = resolveLifecycleOnWrite({
      ...base, existing: 'detected', confidence: 0.9, movedThisWrite: true,
      evidenceRevisionKey: 'round-A', priorMaturationKeys: afterFirst.maturationKeys!,
    });
    expect(repeated.transition).toBe('none');
    expect(repeated.maturationKeys).toBeUndefined(); // no metadata change needed
  });

  it('a refresh write (movedThisWrite=false) never advances the confirmation count', () => {
    const d = resolveLifecycleOnWrite({
      ...base, existing: 'detected', confidence: 0.9, movedThisWrite: false,
      evidenceRevisionKey: 'round-B', priorMaturationKeys: ['round-A'],
    });
    expect(d).toEqual({ next: 'detected', transition: 'none', becomesVisible: false });
  });
});

describe('resolveLifecycleOnWrite — existing transitions preserved', () => {
  it('resurrects archived rows through the same confidence gate and resets maturation', () => {
    expect(resolveLifecycleOnWrite({
      ...base, existing: 'archived', confidence: 0.9, priorMaturationKeys: ['stale-1', 'stale-2'],
    })).toEqual({ next: 'detected', transition: 'resurrected', becomesVisible: true, maturationKeys: [] });
    expect(resolveLifecycleOnWrite({ ...base, existing: 'archived', confidence: 0.2 }))
      .toEqual({ next: 'tentative', transition: 'resurrected', becomesVisible: false, maturationKeys: [] });
  });

  it('never touches matured / addressed / resolved', () => {
    for (const s of ['matured', 'addressed', 'resolved'] as const) {
      const d = resolveLifecycleOnWrite({
        ...base, existing: s, confidence: 1, movedThisWrite: true,
        evidenceRevisionKey: 'x', priorMaturationKeys: ['a', 'b', 'c', 'd'],
      });
      expect(d).toEqual({ next: s, transition: 'none', becomesVisible: false });
    }
  });

  it('treats a null lifecycle as detected (legacy rows)', () => {
    expect(resolveLifecycleOnWrite({ ...base, existing: null, confidence: 0.1 }).next).toBe('detected');
  });
});
