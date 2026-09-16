import { describe, expect, it } from 'vitest';
import {
  defaultResidentBudgetBytes, NOMINAL_RESIDENT_WINDOW, planArtifactResidency,
  type HeroFocalRegion, type HoleArtifactBytes,
} from '../artifact-residency';
import { computeArtifactResidency } from '../runtime-controller';
import { V2_BUDGETS } from '../v2-budgets';

const HOLES = Array.from({ length: 18 }, (_, i) => `h${String(i + 1).padStart(2, '0')}`);
const bytes = (lod2Bytes: number, fullExtraBytes = 0): HoleArtifactBytes => ({ lod2Bytes, fullExtraBytes });
const heroBytes = (fullExtraBytes: number, heroFieldBytes: Partial<Record<HeroFocalRegion, number>>): HoleArtifactBytes =>
  ({ lod2Bytes: 0, fullExtraBytes, heroFieldBytes });
const NO_PRESSURE = { maxResidentBytes: Number.POSITIVE_INFINITY };

describe('planArtifactResidency (V2 plan §86-89, Task 19)', () => {
  it('keeps current + next fully resident and disposes previous to LOD2-only by default (§89 "previous resources disposed")', () => {
    const bytesPerHole = Object.fromEntries(HOLES.map(h => [h, bytes(1_000, 500)]));
    const plan = planArtifactResidency('h07', HOLES, bytesPerHole, 'phone', NO_PRESSURE);
    expect(plan.fullyResident).toEqual(['h07', 'h08']);
    expect(plan.lod2Only).toContain('h06'); // previous: disposed by default, not kept alongside current+next
    expect(plan.lod2Only).toEqual(HOLES.filter(h => !['h07', 'h08'].includes(h)));
    expect(plan.lod2Only).toHaveLength(16);
    expect(plan.prefetchOrder).toEqual(['h08']);
    expect(plan.evictionOrder).toEqual(['h08']);
  });

  it('keepPreviousResident widens the window to current + next + previous (§86 "previous hole if review likely")', () => {
    const bytesPerHole = Object.fromEntries(HOLES.map(h => [h, bytes(1_000, 500)]));
    const plan = planArtifactResidency('h07', HOLES, bytesPerHole, 'phone', { ...NO_PRESSURE, keepPreviousResident: true });
    expect(plan.fullyResident).toEqual(['h07', 'h08', 'h06']);
    expect(plan.lod2Only).toEqual(HOLES.filter(h => !['h06', 'h07', 'h08'].includes(h)));
    expect(plan.lod2Only).toHaveLength(15);
  });

  it('edge hole 1 has no previous, regardless of keepPreviousResident', () => {
    const bytesPerHole = Object.fromEntries(HOLES.map(h => [h, bytes(1_000, 500)]));
    const plan = planArtifactResidency('h01', HOLES, bytesPerHole, 'phone', NO_PRESSURE);
    expect(plan.fullyResident).toEqual(['h01', 'h02']);
    expect(plan.prefetchOrder).toEqual(['h02']);
    expect(plan.evictionOrder).toEqual(['h02']);
    expect(plan.lod2Only).toEqual(HOLES.slice(2));

    const withReview = planArtifactResidency('h01', HOLES, bytesPerHole, 'phone', { ...NO_PRESSURE, keepPreviousResident: true });
    expect(withReview.fullyResident).toEqual(['h01', 'h02']); // no previous exists to keep, flag or not
  });

  it('edge hole 18 has no next; previous is also disposed by default, leaving only current resident', () => {
    const bytesPerHole = Object.fromEntries(HOLES.map(h => [h, bytes(1_000, 500)]));
    const plan = planArtifactResidency('h18', HOLES, bytesPerHole, 'phone', NO_PRESSURE);
    expect(plan.fullyResident).toEqual(['h18']);
    expect(plan.prefetchOrder).toEqual([]);
    expect(plan.evictionOrder).toEqual([]);
    expect(plan.lod2Only).toEqual(HOLES.slice(0, 17));
  });

  it('edge hole 18 with keepPreviousResident keeps the previous hole resident, since there is no next to prefer', () => {
    const bytesPerHole = Object.fromEntries(HOLES.map(h => [h, bytes(1_000, 500)]));
    const plan = planArtifactResidency('h18', HOLES, bytesPerHole, 'phone', { ...NO_PRESSURE, keepPreviousResident: true });
    expect(plan.fullyResident).toEqual(['h18', 'h17']);
    expect(plan.prefetchOrder).toEqual(['h17']);
    expect(plan.evictionOrder).toEqual(['h17']);
    expect(plan.lod2Only).toEqual(HOLES.slice(0, 16));
  });

  it('a single-hole round has neither next nor previous', () => {
    const plan = planArtifactResidency('only', ['only'], {}, 'phone');
    expect(plan.fullyResident).toEqual(['only']);
    expect(plan.lod2Only).toEqual([]);
    expect(plan.prefetchOrder).toEqual([]);
    expect(plan.evictionOrder).toEqual([]);
    expect(plan.totalBytes).toBe(0);
    expect(plan.withinBudget).toBe(true);
  });

  it('prefetches next before previous, the reverse of eviction priority (keepPreviousResident)', () => {
    const bytesPerHole = Object.fromEntries(HOLES.map(h => [h, bytes(100, 100)]));
    const plan = planArtifactResidency('h07', HOLES, bytesPerHole, 'phone', { ...NO_PRESSURE, keepPreviousResident: true });
    expect(plan.prefetchOrder).toEqual(['h08', 'h06']); // next first: forward progress outranks review.
    expect(plan.evictionOrder).toEqual(['h06', 'h08']); // previous demoted first under pressure.
  });

  it('demotes previous before next when the plan would otherwise exceed budget, and reports the new total (keepPreviousResident)', () => {
    const bytesPerHole: Record<string, HoleArtifactBytes> = Object.fromEntries(HOLES.map(h => [h, bytes(1_000)]));
    bytesPerHole.h06 = bytes(1_000, 5_000); // previous
    bytesPerHole.h07 = bytes(1_000, 4_000); // current
    bytesPerHole.h08 = bytes(1_000, 3_000); // next
    const lod2Total = 18 * 1_000;
    const maxResidentBytes = lod2Total + 4_000 + 3_000; // room for current + next, not previous.
    const plan = planArtifactResidency('h07', HOLES, bytesPerHole, 'phone', { keepPreviousResident: true, maxResidentBytes });
    expect(plan.fullyResident).toEqual(['h07', 'h08']); // previous evicted, current and next survive.
    expect(plan.lod2Only).toContain('h06');
    expect(plan.prefetchOrder).toEqual(['h08']);
    expect(plan.evictionOrder).toEqual(['h08']); // only what's left can still be demoted further.
    expect(plan.totalBytes).toBe(maxResidentBytes);
    expect(plan.withinBudget).toBe(true);
  });

  it('eviction priority is fixed (previous before next), not byte-optimal — it can evict a cheap previous AND a costlier next even when dropping next alone would fit', () => {
    // Regression for a withdrawn claim: an earlier version of this module's
    // report asserted the demotion loop "never drops more than necessary".
    // That was false. Here previous=1, current=10, next=20, budget=12:
    // keeping current+previous (10+1=11) fits the budget and costs less to
    // reach (evict only next, -20) than evicting both neighbors (-21). The
    // fixed priority order (previous first, §86) evicts previous anyway,
    // then still has to evict next too, because it never reconsiders after
    // the first demotion. That is the intended, documented behavior (§86
    // ranks next over previous), not a bug — this test pins it.
    const bytesPerHole: Record<string, HoleArtifactBytes> = Object.fromEntries(HOLES.map(h => [h, bytes(0)]));
    bytesPerHole.h06 = bytes(0, 1); // previous — cheap
    bytesPerHole.h07 = bytes(0, 10); // current
    bytesPerHole.h08 = bytes(0, 20); // next — expensive
    const plan = planArtifactResidency('h07', HOLES, bytesPerHole, 'phone', { keepPreviousResident: true, maxResidentBytes: 12 });
    expect(plan.fullyResident).toEqual(['h07']); // both neighbors evicted, not just the expensive one.
    expect(plan.totalBytes).toBe(10);
    expect(plan.withinBudget).toBe(true);
  });

  it('never evicts the current hole, and reports withinBudget honestly false when even that overflows', () => {
    const bytesPerHole = Object.fromEntries(HOLES.map(h => [h, bytes(100)])); // lod2 alone already exceeds the budget below.
    const plan = planArtifactResidency('h07', HOLES, bytesPerHole, 'phone', { maxResidentBytes: 10 });
    expect(plan.fullyResident).toEqual(['h07']); // both neighbors demoted, current never touched.
    expect(plan.totalBytes).toBe(18 * 100);
    expect(plan.budgetBytes).toBe(10);
    expect(plan.withinBudget).toBe(false);
  });

  it('the phone default budget is v2-budgets.ts\'s per-hole texture target times the nominal window, desktop has none', () => {
    const phoneTexture = V2_BUDGETS.phone.textureBytes!;
    expect(NOMINAL_RESIDENT_WINDOW).toBe(3);
    expect(defaultResidentBudgetBytes('phone')).toBe((phoneTexture.fieldTargetBytes + phoneTexture.assetTargetMaxBytes) * 3);
    expect(defaultResidentBudgetBytes('desktop')).toBeNull();
    const plan = planArtifactResidency('h07', HOLES, {}, 'desktop');
    expect(plan.budgetBytes).toBeNull();
    expect(plan.withinBudget).toBe(true);
  });

  it('an explicit maxResidentBytes overrides the tier default on either tier', () => {
    const plan = planArtifactResidency('h07', HOLES, {}, 'desktop', { maxResidentBytes: 5 });
    expect(plan.budgetBytes).toBe(5);
  });

  it('is deterministic: identical inputs produce an identical plan, independent of bytesPerHole key order', () => {
    const inOrder: Record<string, HoleArtifactBytes> = {};
    for (const h of HOLES) inOrder[h] = bytes(1_000 + h.length, 500);
    const scrambled: Record<string, HoleArtifactBytes> = {};
    for (const h of [...HOLES].reverse()) scrambled[h] = bytes(1_000 + h.length, 500);

    const a = planArtifactResidency('h07', HOLES, inOrder, 'phone');
    const b = planArtifactResidency('h07', HOLES, inOrder, 'phone');
    const c = planArtifactResidency('h07', HOLES, scrambled, 'phone');
    expect(a).toEqual(b);
    expect(a).toEqual(c);
  });

  it('throws when currentHole is not in holesInOrder', () => {
    expect(() => planArtifactResidency('nope', HOLES, {}, 'phone')).toThrow(/currentHole/);
  });

  it('missing bytesPerHole entries are treated as zero, not a crash', () => {
    const plan = planArtifactResidency('h07', HOLES, { h07: bytes(2_000, 1_000) }, 'phone');
    expect(plan.totalBytes).toBe(2_000 + 1_000); // every other hole (including next, h08) contributes 0.
    expect(plan.withinBudget).toBe(true);
  });

  it('§87 activeFocalRegion charges the current hole for its base field plus only the active hero region', () => {
    const bytesPerHole: Record<string, HoleArtifactBytes> = Object.fromEntries(HOLES.map(h => [h, bytes(0)]));
    bytesPerHole.h07 = heroBytes(9_000, { 'tee-landing': 1_000, approach: 2_000, green: 5_000 }); // base field remainder = 1,000
    bytesPerHole.h08 = bytes(0, 500); // next, no breakdown — always charged its whole lump

    const noRegion = planArtifactResidency('h07', HOLES, bytesPerHole, 'phone', NO_PRESSURE);
    expect(noRegion.activeHeroField).toBeNull();
    expect(noRegion.totalBytes).toBe(9_000 + 500); // whole hero lump, unrestricted

    const green = planArtifactResidency('h07', HOLES, bytesPerHole, 'phone', { ...NO_PRESSURE, activeFocalRegion: 'green' });
    expect(green.activeHeroField).toBe('green');
    expect(green.totalBytes).toBe((9_000 - 8_000 + 5_000) + 500); // base field (1,000) + green (5,000) + next (500)

    const teeLanding = planArtifactResidency('h07', HOLES, bytesPerHole, 'phone', { ...NO_PRESSURE, activeFocalRegion: 'tee-landing' });
    expect(teeLanding.activeHeroField).toBe('tee-landing');
    expect(teeLanding.totalBytes).toBe((9_000 - 8_000 + 1_000) + 500); // base field (1,000) + tee-landing (1,000) + next (500)
  });

  it('§87 activeFocalRegion falls back to the whole lump when the current hole has no matching heroFieldBytes entry', () => {
    const bytesPerHole: Record<string, HoleArtifactBytes> = Object.fromEntries(HOLES.map(h => [h, bytes(0)]));
    bytesPerHole.h07 = heroBytes(9_000, { 'tee-landing': 1_000, green: 5_000 }); // no 'approach' entry
    bytesPerHole.h08 = bytes(0, 500);

    const plan = planArtifactResidency('h07', HOLES, bytesPerHole, 'phone', { ...NO_PRESSURE, activeFocalRegion: 'approach' });
    expect(plan.activeHeroField).toBeNull();
    expect(plan.totalBytes).toBe(9_000 + 500); // unchanged from the no-region case
  });

  it('§87 activeFocalRegion never affects a fully-resident next/previous hole — those are always charged their whole lump', () => {
    const bytesPerHole: Record<string, HoleArtifactBytes> = Object.fromEntries(HOLES.map(h => [h, bytes(0)]));
    bytesPerHole.h06 = heroBytes(700, { green: 100 }); // previous — has its own breakdown, must be ignored
    bytesPerHole.h07 = heroBytes(9_000, { 'tee-landing': 1_000, approach: 2_000, green: 5_000 }); // current
    bytesPerHole.h08 = bytes(0, 500); // next

    const plan = planArtifactResidency('h07', HOLES, bytesPerHole, 'phone', { ...NO_PRESSURE, keepPreviousResident: true, activeFocalRegion: 'green' });
    expect(plan.activeHeroField).toBe('green');
    // current: base(1,000) + green(5,000) = 6,000; next: whole lump 500; previous: whole lump 700 (its own 'green' entry ignored).
    expect(plan.totalBytes).toBe(6_000 + 500 + 700);
  });

  it('throws when the active region\'s heroFieldBytes sum to more than the hole\'s own fullExtraBytes', () => {
    const bytesPerHole: Record<string, HoleArtifactBytes> = { h07: heroBytes(100, { 'tee-landing': 60, approach: 70 }) }; // sums to 130 > 100
    expect(() => planArtifactResidency('h07', HOLES, bytesPerHole, 'phone', { activeFocalRegion: 'tee-landing' })).toThrow(/heroFieldBytes/);
  });

  it('does not throw when the REQUESTED region has no entry, even if the tracked entries already sum over fullExtraBytes', () => {
    const bytesPerHole: Record<string, HoleArtifactBytes> = { h07: heroBytes(100, { 'tee-landing': 60, approach: 70 }) }; // sums to 130 > 100, but...
    const plan = planArtifactResidency('h07', HOLES, bytesPerHole, 'phone', { activeFocalRegion: 'green' }); // ...'green' itself is untracked
    expect(plan.activeHeroField).toBeNull();
    expect(plan.totalBytes).toBe(100); // falls back to the whole lump, the inconsistent breakdown is never read
  });

  it('is reachable from runtime-controller.ts as the same pure call, with default options (Task 19 wiring)', () => {
    const bytesPerHole = Object.fromEntries(HOLES.map(h => [h, bytes(1_000, 500)]));
    const direct = planArtifactResidency('h07', HOLES, bytesPerHole, 'phone');
    const wired = computeArtifactResidency('h07', HOLES, bytesPerHole, 'phone');
    expect(wired).toEqual(direct);
  });

  it('is reachable from runtime-controller.ts with options forwarded unchanged (keepPreviousResident, activeFocalRegion)', () => {
    const bytesPerHole: Record<string, HoleArtifactBytes> = Object.fromEntries(HOLES.map(h => [h, bytes(1_000, 500)]));
    bytesPerHole.h07 = heroBytes(1_000, { green: 400 });
    const options = { keepPreviousResident: true, activeFocalRegion: 'green' as const };
    const direct = planArtifactResidency('h07', HOLES, bytesPerHole, 'phone', options);
    const wired = computeArtifactResidency('h07', HOLES, bytesPerHole, 'phone', options);
    expect(wired).toEqual(direct);
    expect(wired.fullyResident).toEqual(['h07', 'h08', 'h06']);
    expect(wired.activeHeroField).toBe('green');
  });
});
