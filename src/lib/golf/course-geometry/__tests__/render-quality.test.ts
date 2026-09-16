import { describe, expect, it } from 'vitest';
import {
  budgetViewFor, detectRenderQuality, percentile, profilePixelRatio, qualityOverrides, RENDER_BUDGETS, RENDER_QUALITY_PROFILES,
} from '../render-quality';

const caps = (over: Partial<Parameters<typeof detectRenderQuality>[0]> = {}) => ({ devicePixelRatio: 2, coarsePointer: true, screenPixels: 390 * 844, ...over });

describe('Meridian render quality tiers (§64–68)', () => {
  it('orders the three profiles so every budget grows from low to high', () => {
    const { low, standard, high } = RENDER_QUALITY_PROFILES;
    expect(low.dprCap).toBeLessThan(standard.dprCap); expect(standard.dprCap).toBeLessThan(high.dprCap);
    expect(low.pixelBudget).toBeLessThan(standard.pixelBudget); expect(standard.pixelBudget).toBeLessThan(high.pixelBudget);
    expect(low.shadowMapSize).toBeLessThan(standard.shadowMapSize); expect(standard.shadowMapSize).toBeLessThan(high.shadowMapSize);
    expect(low.nearCrowns).toBe(false); expect(standard.nearCrowns).toBe(true);
    expect(low.batchTiles).toBeGreaterThan(standard.batchTiles); expect(standard.batchTiles).toBeGreaterThan(high.batchTiles);
    expect(low.massScale).toBeGreaterThan(low.crownScale); // §65: forest is mass dominant
    expect(low.targetFrameMs).toBe(33); expect(standard.targetFrameMs).toBeCloseTo(16.7);
  });
  it('detects low for small or data-saving devices, high only for a capable desktop, standard otherwise', () => {
    expect(detectRenderQuality(caps())).toBe('standard');
    expect(detectRenderQuality(caps({ hardwareConcurrency: 6, deviceMemoryGb: 4 }))).toBe('standard');
    expect(detectRenderQuality(caps({ saveData: true }))).toBe('low');
    expect(detectRenderQuality(caps({ deviceMemoryGb: 2 }))).toBe('low');
    expect(detectRenderQuality(caps({ hardwareConcurrency: 4 }))).toBe('low');
    expect(detectRenderQuality(caps({ maxTextureSize: 2048 }))).toBe('low');
    expect(detectRenderQuality(caps({ coarsePointer: false, hardwareConcurrency: 10, deviceMemoryGb: 16, screenPixels: 2560 * 1440 }))).toBe('high');
    // Safari never reports deviceMemory; a fine pointer with many cores and a big screen still counts as high.
    expect(detectRenderQuality(caps({ coarsePointer: false, hardwareConcurrency: 8, screenPixels: 1920 * 1080 }))).toBe('high');
    // A big desktop screen with a coarse pointer (touch laptop) stays standard: high is never assumed from screen size alone.
    expect(detectRenderQuality(caps({ hardwareConcurrency: 8, deviceMemoryGb: 8, screenPixels: 2560 * 1440 }))).toBe('standard');
  });
  it('caps the pixel ratio by tier and by the total pixel budget', () => {
    const phone = [390, 844] as const;
    expect(profilePixelRatio(RENDER_QUALITY_PROFILES.low, 3, ...phone)).toBe(1.5);
    expect(profilePixelRatio(RENDER_QUALITY_PROFILES.standard, 3, ...phone)).toBe(2);
    expect(profilePixelRatio(RENDER_QUALITY_PROFILES.standard, 2, 1440, 1000)).toBeCloseTo(Math.sqrt(4_000_000 / 1_440_000), 4);
    expect(profilePixelRatio(RENDER_QUALITY_PROFILES.high, 2, 1440, 1000)).toBe(2);
    expect(profilePixelRatio(RENDER_QUALITY_PROFILES.low, .5, ...phone)).toBe(1);
  });
  it('folds a profile into the landscape multipliers without discarding lab overrides', () => {
    expect(qualityOverrides(RENDER_QUALITY_PROFILES.low, { crowns: 2, macro: 0 })).toMatchObject({ crowns: 1.4, mass: 1.25, water: .6, shade: 0, macro: 0, batchTiles: 3 });
    expect(qualityOverrides(RENDER_QUALITY_PROFILES.standard, { batchTiles: 1 })).toMatchObject({ batchTiles: 1 });
    expect(qualityOverrides(RENDER_QUALITY_PROFILES.standard)).toMatchObject({ crowns: 1, mass: 1, water: 1, shade: 1 });
    expect(qualityOverrides(RENDER_QUALITY_PROFILES.high, { shade: .5 })).toMatchObject({ crowns: 1.25, shade: .5 });
  });
  it('maps a camera pitch to its draw-call budget and computes P95 frame times', () => {
    expect(budgetViewFor(90)).toBe('top'); expect(budgetViewFor(58)).toBe('terrain'); expect(budgetViewFor(30)).toBe('side');
    expect(RENDER_BUDGETS.drawCalls).toEqual({ top: 140, terrain: 180, side: 160 });
    expect(RENDER_BUDGETS.canaryHole).toBe(9);
    expect(percentile([], 95)).toBe(0);
    expect(percentile([5, 1, 9, 3, 7, 2, 8, 4, 6, 10], 95)).toBe(10);
    expect(percentile([5, 1, 9, 3, 7, 2, 8, 4, 6, 10], 50)).toBe(5);
  });
});
