import { describe, expect, it } from 'vitest';
import layerJson from '@/test/fixtures/course-geometry/peek-n-peak-upper-context.json';
import reportJson from '@/test/fixtures/course-geometry/peek-n-peak-upper-context-report.json';
import packageJson from '@/test/fixtures/course-geometry/peek-n-peak-upper.json';
import { parseGeometryPackage } from '../schema';
import { CONTEXT_LAYER_MISMATCH, contextZonesForHole, parseContextLayer, summarizeContextZones } from '../context-layer';
import { CONTEXT_CLASSES, CONTEXT_FIDELITY, CONTEXT_RENDER, OSM_CONTEXT_RULES, contextGroup, isContextClass } from '../context-taxonomy';

const pkg = parseGeometryPackage(packageJson);

describe('outside-world taxonomy (player-view spec §5, §33)', () => {
  it('gives every class a group, a fidelity tier and a render treatment', () => {
    expect(CONTEXT_CLASSES.length).toBeGreaterThan(40);
    for (const cls of CONTEXT_CLASSES) {
      expect(isContextClass(cls)).toBe(true);
      expect(CONTEXT_FIDELITY[cls]).toMatch(/^(high|medium|low)$/);
      expect(CONTEXT_RENDER[cls]).toBeDefined();
      expect(contextGroup(cls)).not.toBe(cls === 'uncertain' ? 'playing' : 'unknown');
    }
    // High-precision classes (§33) are only drawn from explicit geometry.
    for (const cls of ['cart_path', 'road', 'building', 'clubhouse', 'stream'] as const) expect(CONTEXT_FIDELITY[cls]).toBe('high');
    for (const rule of OSM_CONTEXT_RULES) expect(isContextClass(rule.class)).toBe(true);
  });
});

describe('context layer contract (§8, §31–34)', () => {
  it('parses the Peek’n Peak layer locked to its package and cites a source for every zone', () => {
    const layer = parseContextLayer(layerJson, pkg);
    expect(layer.packageHash).toBe(pkg.contentHash);
    expect(layer.zones.length).toBeGreaterThan(100);
    expect(layer.review.status).toBe('unreviewed');
    for (const zone of layer.zones) {
      expect(zone.basis).toBe('source');
      expect(zone.reviewed).toBe(false);
      expect(zone.sourceIds.every(id => layer.sources.some(s => s.id === id))).toBe(true);
      // Every default width/height is declared, never silent (§6: nothing invented quietly).
      if (zone.attributes.defaults?.includes('widthM')) expect(zone.attributes.widthM).toBeDefined();
      if (zone.attributes.defaults?.includes('heightM')) expect(zone.attributes.heightM).toBeDefined();
    }
    const counts = summarizeContextZones(layer.zones.map(z => ({ ...z, type: z.geometryWgs84.type, parts: [], render: CONTEXT_RENDER[z.class] })));
    expect(counts.cart_path).toBeGreaterThan(10);
    expect(counts.building).toBeGreaterThan(50);
    expect(reportJson.layerHash).toBe(layer.contentHash);
  });
  it('refuses a layer for another package or site', () => {
    expect(() => parseContextLayer({ ...layerJson, packageHash: 'a'.repeat(64) }, pkg)).toThrow(CONTEXT_LAYER_MISMATCH);
    expect(() => parseContextLayer(layerJson, { ...pkg, siteId: 'other-site' })).toThrow(CONTEXT_LAYER_MISMATCH);
  });
  it('selects each hole’s zones in local metres and clips by the terrain footprint', () => {
    const layer = parseContextLayer(layerJson, pkg);
    const hole = pkg.holes.find(h => h.ordinal === 7)!;
    const zones = contextZonesForHole(layer, pkg, hole.key);
    expect(zones.length).toBeGreaterThan(0);
    expect(zones.every(zone => zone.parts.flat(2).every(([x, y]) => Math.abs(x) < 5000 && Math.abs(y) < 5000))).toBe(true);
    expect(zones.some(zone => zone.render === 'ribbon')).toBe(true);
    // A footprint far from every zone keeps none of them.
    const tiny = { vertices: [9000, 9000, 0, 9001, 9000, 0, 9000, 9001, 0] };
    expect(contextZonesForHole(layer, pkg, hole.key, tiny)).toEqual([]);
  });
});
