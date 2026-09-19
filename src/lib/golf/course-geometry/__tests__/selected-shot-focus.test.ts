import { describe, expect, it } from 'vitest';
import { addInteractivePreviewTrajectories, illustrativeScene, pilotPackage, pilotShots } from '@/test/fixtures/course-geometry/pilot';
import { buildHoleScene } from '../build-scene';
import { normalizeLiveShot } from '../normalize';
import { selectedShotFocus } from '../selected-shot-focus';

describe('selected shot camera focus', () => {
  it('moves progressively along each declared preview trajectory without changing its source points', () => {
    const scene = addInteractivePreviewTrajectories(buildHoleScene(pilotPackage, 'cacapon-07', pilotShots.map(normalizeLiveShot)), pilotShots);
    const snapshot = structuredClone(scene);
    const first = selectedShotFocus(scene, 1)!;
    const second = selectedShotFocus(scene, 2)!;
    expect(first.basis).toBe('illustrative_preview');
    expect(second.basis).toBe('illustrative_preview');
    expect(second.zoom).toBeGreaterThan(first.zoom);
    expect(first.pointM).toEqual(scene.illustrativePreviewTrajectories![0]!.pointsM[4]);
    expect(second.pointM).toEqual(scene.illustrativePreviewTrajectories![1]!.pointsM[4]);
    expect(scene).toEqual(snapshot);
  });

  it('uses a reviewed compatible estimate but refuses an unresolved shot', () => {
    const scene = illustrativeScene();
    expect(selectedShotFocus(scene, 1)).toEqual(expect.objectContaining({ basis: 'compatible_estimate' }));
    scene.events[0] = { ...scene.events[0]!, anchorM: null, placement: 'unknown' };
    expect(selectedShotFocus(scene, 1)).toBeNull();
  });

  it('does not treat a distance-only putt as an airborne trajectory or a precise location', () => {
    const putting = { ...pilotShots[1]!, shotNumber: 3, shotType: 'putting' as const, clubType: 'putter' as const,
      lieBefore: 'green' as const, result: 'green' as const, distanceToHoleBefore: 12, distanceUnitBefore: 'feet' as const,
      distanceToHoleAfter: 2, distanceUnitAfter: 'feet' as const };
    const scene = addInteractivePreviewTrajectories(illustrativeScene(), [...pilotShots, putting]);
    expect(scene.illustrativePreviewTrajectories?.some(path => path.shotNumber === 3)).toBe(false);
    expect(selectedShotFocus(scene, 3)).toBeNull();
  });
});

describe('production display focus', () => {
  it('moves toward each reconstruction display trajectory while retaining an estimated source label', async () => {
    const { decorateSceneWithDisplayTrajectories } = await import('../display-trajectories');
    const scene = decorateSceneWithDisplayTrajectories(illustrativeScene());
    const first = selectedShotFocus(scene, 1)!;
    const second = selectedShotFocus(scene, 2)!;

    expect(first.basis).toBe('reconstruction_display_estimate');
    expect(second.basis).toBe('reconstruction_display_estimate');
    expect(second.zoom).toBeGreaterThan(first.zoom);
  });
});
