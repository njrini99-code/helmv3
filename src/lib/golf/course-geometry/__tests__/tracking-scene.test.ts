import { describe, expect, it } from 'vitest';
import { pilotPackage, pilotShots } from '@/test/fixtures/course-geometry/pilot';
import { buildTrackingHoleScene } from '../tracking-scene';

describe('tracking scene composition', () => {
  it('adds production display trajectories to a reviewed course scene without a fixture decorator', () => {
    const packageWithReviewedSurfaces = structuredClone(pilotPackage);
    packageWithReviewedSurfaces.holes = packageWithReviewedSurfaces.holes.map(hole =>
      hole.key === 'cacapon-07' ? { ...hole, completeness: 'reviewed_surfaces' } : hole);
    const scene = buildTrackingHoleScene({ package: packageWithReviewedSurfaces, holeKeys: ['cacapon-07'] }, 0, pilotShots);

    expect(scene?.illustrativePreviewTrajectories?.[0]).toEqual(expect.objectContaining({
      source: 'reconstruction_display_estimate',
      shotNumber: 1,
    }));
  });
});
