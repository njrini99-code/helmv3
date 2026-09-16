import { describe, expect, it } from 'vitest';
import { hexToRgb, MERIDIAN_PALETTE, MERIDIAN_STYLE, MERIDIAN_STYLE_HASH, MERIDIAN_STYLE_VERSION, relativeLuminance, styleHash } from '../visual-style';

describe('Meridian visual kit (§112–114)', () => {
  it('keeps the surface hierarchy readable: green → tee → fairway → fringe → surround → rough → woods (§56)', () => {
    const order = ['green', 'tee', 'fairway', 'fringe', 'surround', 'rough', 'woods'] as const;
    const luminance = order.map(key => relativeLuminance(hexToRgb(MERIDIAN_PALETTE[key])));
    for (let i = 1; i < luminance.length; i++) expect(luminance[i]!, `${order[i]} darker than ${order[i - 1]}`).toBeLessThan(luminance[i - 1]!);
    expect(MERIDIAN_PALETTE.ground).toBe(MERIDIAN_PALETTE.rough);
  });
  it('bounds decoration so noise never reads as a surface condition (§21)', () => {
    expect(MERIDIAN_STYLE.turf.macro.amplitude).toBeLessThanOrEqual(.03);
    expect(MERIDIAN_STYLE.turf.micro.amplitude).toBeLessThanOrEqual(.015);
    expect(MERIDIAN_STYLE.mowing.amplitude).toBeLessThanOrEqual(.03);
    expect(MERIDIAN_STYLE.boundary.shade).toBeLessThanOrEqual(.08);
    expect(Math.min(...MERIDIAN_STYLE.turf.macro.wavelengthsM)).toBeGreaterThanOrEqual(25);
    expect(Math.max(...MERIDIAN_STYLE.turf.macro.wavelengthsM)).toBeLessThanOrEqual(70);
    expect(Math.min(...MERIDIAN_STYLE.turf.micro.wavelengthsM)).toBeGreaterThanOrEqual(.25);
    expect(Math.max(...MERIDIAN_STYLE.turf.micro.wavelengthsM)).toBeLessThanOrEqual(1.5);
    expect(MERIDIAN_STYLE.mowing.bandWidthM).toBeGreaterThanOrEqual(5); expect(MERIDIAN_STYLE.mowing.bandWidthM).toBeLessThanOrEqual(8);
  });
  it('hashes the style by value so any taste change re-keys the artifact cache (§100–101, §113)', () => {
    expect(MERIDIAN_STYLE_HASH).toMatch(new RegExp(`^${MERIDIAN_STYLE_VERSION}-[0-9a-f]{8}$`));
    expect(styleHash()).toBe(MERIDIAN_STYLE_HASH);
    expect(styleHash({ ...MERIDIAN_STYLE, light: { ...MERIDIAN_STYLE.light, sunIntensity: 2.1 } })).not.toBe(MERIDIAN_STYLE_HASH);
    // Key order is not part of the identity.
    const reordered = JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(MERIDIAN_STYLE).reverse()))) as typeof MERIDIAN_STYLE;
    expect(styleHash(reordered)).toBe(MERIDIAN_STYLE_HASH);
    expect(Object.isFrozen(MERIDIAN_STYLE)).toBe(true); expect(Object.isFrozen(MERIDIAN_STYLE.turf)).toBe(true);
  });
});
