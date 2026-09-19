import { describe, expect, it } from 'vitest';
import { parseGeometryPackage } from '@/lib/golf/course-geometry/schema';
import packageJson from '@/test/fixtures/course-geometry/peek-n-peak-upper.json';
import catalogJson from '@/test/fixtures/course-geometry/peek-n-peak-upper-evidence.json';
import { UNREVIEWED_EDGE_SIGMA_M, accuracyClass, accuracyTierFor, composeEdgeSigma, courseFeatureSchema, courseFeaturesFromPackage, digitizationSigma, evidenceCatalogSchema } from '../evidence';

describe('one-tap evidence and feature records', () => {
  it('validates the Peek’n Peak evidence catalog with Google APIs excluded and unacquired sources UNSPECIFIED', () => {
    const catalog = evidenceCatalogSchema.parse(catalogJson);
    expect(catalog.googleApis).toBe('EXCLUDED');
    expect(catalog.sources.filter(s => s.status === 'RETAINED').map(s => s.provider)).toEqual(['OSM', 'NAIP', 'NAIP', 'USGS_3DEP']);
    expect(catalog.sources.filter(s => s.status === 'UNSPECIFIED').map(s => s.provider)).toEqual(['NYS_ORTHO_2024', 'NYS_ORTHO_2021', 'COURSE_SURVEY', 'RTK']);
    expect(catalog.sources.every(s => s.provider !== ('GOOGLE' as never))).toBe(true);
    expect(catalog.sources.find(s => s.provider === 'USGS_3DEP')?.verticalDatum).toBe('NAVD88');
  });
  it('composes edge sigma under independence and keeps unknown source sigma unknown', () => {
    expect(composeEdgeSigma({ sourceSigmaMeters: .3, registrationSigmaMeters: .4, digitizationSigmaMeters: 0, temporalSigmaMeters: 0 })).toBeCloseTo(.5, 9);
    expect(composeEdgeSigma({ sourceSigmaMeters: null, registrationSigmaMeters: .4, digitizationSigmaMeters: .1, temporalSigmaMeters: 0 })).toBeNull();
    expect(digitizationSigma(.15, 'CRISP')).toBe(.1);
    expect(digitizationSigma(.6, 'CRISP')).toBe(.3);
    expect(digitizationSigma(.15, 'SOFT')).toBe(.25);
    expect(digitizationSigma(.6, 'OCCLUDED')).toBe(.6);
  });
  it('grades accuracy classes per tier', () => {
    expect(accuracyClass(.5, 'hero')).toBe('A');
    expect(accuracyClass(.75, 'hero')).toBe('B');
    expect(accuracyClass(1.2, 'hero')).toBe('C');
    expect(accuracyClass(1.2, 'playing')).toBe('B');
    expect(accuracyClass(2.9, 'context')).toBe('B');
    expect(accuracyTierFor('bunker_lip')).toBe('hero');
    expect(accuracyTierFor('cart_path')).toBe('context');
  });
  it('adapts the retained package into feature records that never claim fringe, apron or a separate lip', () => {
    const pkg = parseGeometryPackage(packageJson);
    const features = courseFeaturesFromPackage(pkg);
    expect(features.length).toBe(pkg.features.filter(f => f.kind !== 'route').length);
    for (const f of features) {
      courseFeatureSchema.parse(f);
      expect(f.evidenceIds.length).toBeGreaterThan(0);
      expect(f.uncertainty.edgeDefaultSigmaMeters).toBeGreaterThan(0);
    }
    expect(features.some(f => f.featureClass === 'fringe' || f.featureClass === 'apron' || f.featureClass === 'bunker_lip')).toBe(false);
    const green15 = features.find(f => f.id === 'osm-way-746383334')!;
    expect(green15).toMatchObject({ featureClass: 'green', holeIds: [15], semantic: { isLieSurface: true, lieClass: 'green', terminalTarget: true } });
    expect(green15.uncertainty).toMatchObject({ edgeDefaultSigmaMeters: UNREVIEWED_EDGE_SIGMA_M, edgeDefaultBasis: 'default_unreviewed' });
    expect(features.find(f => f.id.startsWith('naip-'))?.uncertainty).toMatchObject({ edgeDefaultSigmaMeters: 10, edgeDefaultBasis: 'recorded' });
  });
});
