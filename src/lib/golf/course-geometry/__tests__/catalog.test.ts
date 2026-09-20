import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { catalogProblems, parseFacilityManifest, parseLayoutManifest, parseScorecardProfile, type CourseCatalog } from '../catalog';
import { COURSE_GEOMETRY_REGISTRY, PEEK_N_PEAK_UPPER_POLICY } from '../course-registry';

const ROOT = join(process.cwd(), 'course-geometry/catalog');
function readDir<T>(dir: string, parse: (input: unknown) => T): T[] {
  return readdirSync(join(ROOT, dir)).filter(f => f.endsWith('.json')).sort().map(f => {
    const parsed = parse(JSON.parse(readFileSync(join(ROOT, dir, f), 'utf8')));
    // A file is named after the id it declares, so a directory listing is the index.
    const id = (parsed as { facilityId?: string; layoutId?: string; profileId?: string });
    expect(f).toBe(`${dir === 'facilities' ? id.facilityId : dir === 'layouts' ? id.layoutId : id.profileId}.json`);
    return parsed;
  });
}
const catalog: CourseCatalog = {
  facilities: readDir('facilities', parseFacilityManifest),
  layouts: readDir('layouts', parseLayoutManifest),
  scorecards: readDir('scorecards', parseScorecardProfile),
};

describe('course library catalog (Factory v2 PR A)', () => {
  it('parses every checked-in manifest and holds together with the registry', () => {
    expect(catalog.facilities.map(f => f.facilityId)).toEqual(expect.arrayContaining(['cacapon', 'peek-n-peak']));
    expect(catalog.layouts.map(l => l.layoutId)).toEqual(expect.arrayContaining(['cacapon', 'peek-n-peak-upper']));
    expect(catalogProblems(catalog, COURSE_GEOMETRY_REGISTRY)).toEqual([]);
  });
  it('keeps intake layouts at C0 even when source routes have been pinned', () => {
    // The usage-cohort intake (PR B) writes C0 manifests only; the registry still draws Upper alone.
    const intake = catalog.layouts.filter(l => l.layoutId !== 'peek-n-peak-upper');
    expect(intake.length).toBeGreaterThanOrEqual(1);
    for (const layout of intake) {
      expect(layout.capabilityTier).toBe('C0');
      if (layout.routeWayIds) expect(layout.routeWayIds).toHaveLength(layout.holeOrder.length);
      expect(layout.geometry).toBeNull();
      expect(layout.externalBindings.golfCourseIds.length).toBeGreaterThanOrEqual(1);
    }
    expect(COURSE_GEOMETRY_REGISTRY.map(p => p.layoutId)).toEqual(['peek-n-peak-upper']);
  });
  it('carries Upper as the drawn C2 layout and Cacapon as catalogued only', () => {
    const upper = catalog.layouts.find(l => l.layoutId === 'peek-n-peak-upper')!;
    expect(upper.capabilityTier).toBe('C2');
    expect(upper.holeOrder).toHaveLength(18);
    expect(upper.routeWayIds).toHaveLength(18);
    expect(upper.siteIds).toEqual([...PEEK_N_PEAK_UPPER_POLICY.siteIds]);
    const card = catalog.scorecards.find(c => c.profileId === 'peek-n-peak-upper-official')!;
    expect(card.holes.reduce((sum, h) => sum + h.par, 0)).toBe(72);
    expect(card.holes.reduce((sum, h) => sum + h.yards, 0)).toBe(7058);
    const cacapon = catalog.layouts.find(l => l.layoutId === 'cacapon')!;
    expect(cacapon.capabilityTier).toBe('C0');
    expect(cacapon.geometry).toBeNull();
    expect(COURSE_GEOMETRY_REGISTRY.some(p => p.layoutId === 'cacapon')).toBe(false);
  });
  it('rejects a layout whose hole order leaves its segments, and reports registry drift', () => {
    const upper = catalog.layouts.find(l => l.layoutId === 'peek-n-peak-upper')!;
    expect(() => parseLayoutManifest({ ...upper, holeOrder: [...upper.holeOrder.slice(0, 17), 'lower-01'] })).toThrow(/no ordered segment/);
    expect(() => parseLayoutManifest({ ...upper, capabilityTier: 'C1', geometry: null })).toThrow(/geometry package/);
    const drifted = { ...PEEK_N_PEAK_UPPER_POLICY, acceptedCapabilityTier: 'C3' as const, siteIds: new Set(['osm-way-1']) };
    expect(catalogProblems(catalog, [drifted])).toEqual([
      'registry peek-n-peak-upper: site osm-way-1 not in catalog',
      'registry peek-n-peak-upper: tier C3 ≠ catalog C2',
    ]);
    expect(catalogProblems(catalog, [{ ...PEEK_N_PEAK_UPPER_POLICY, layoutId: 'bethpage-black' }])).toEqual(['registry layout bethpage-black is not catalogued']);
  });
});
