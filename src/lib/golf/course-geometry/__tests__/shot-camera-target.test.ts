import { describe, expect, it } from 'vitest';
import { addInteractivePreviewTrajectories, illustrativeScene, pilotPackage, pilotShots } from '@/test/fixtures/course-geometry/pilot';
import { buildHoleScene } from '../build-scene';
import { normalizeLiveShot } from '../normalize';
import { deriveShotCameraTarget } from '../shot-camera-target';

describe('selected-shot camera target (Meridian §62)', () => {
  const scene = addInteractivePreviewTrajectories(buildHoleScene(pilotPackage, 'cacapon-07', pilotShots.map(normalizeLiveShot)), pilotShots);
  it('frames a tee shot from the tee to its landing area without touching the scene', () => {
    const snapshot = structuredClone(scene);
    const target = deriveShotCameraTarget(scene, 1)!;
    expect(target.framing).toBe('tee_to_landing');
    const path = scene.illustrativePreviewTrajectories!.find(item => item.shotNumber === 1)!;
    expect(target.fitPointsM).toContainEqual(path.pointsM[0]);
    expect(target.fitPointsM).toContainEqual(path.pointsM.at(-1));
    expect(target.inputs).toMatchObject({ start: true, finish: true, green: true });
    expect(target.preferredBearingDeg).not.toBeNull();
    expect(target.basis).toBe('illustrative_preview');
    expect(scene).toEqual(snapshot);
  });
  it('frames an approach from the ball to the green complex (greenside shots add their hazards)', () => {
    const target = deriveShotCameraTarget(scene, 2)!;
    expect(['ball_to_green', 'around_green']).toContain(target.framing);
    const green = scene.features.find(feature => feature.kind === 'green')!;
    const xs = green.parts[0]![0]!.map(point => point[0]);
    expect(target.fitPointsM.some(point => point[0] === Math.min(...xs))).toBe(true);
    expect(target.fitPointsM.some(point => point[0] === Math.max(...xs))).toBe(true);
    if (target.framing === 'around_green') expect(target.inputs.hazards).toBeGreaterThan(0);
  });
  it('refuses to frame an unresolved shot or no selection', () => {
    const plain = illustrativeScene();
    expect(deriveShotCameraTarget(plain, 1)?.basis).toBe('compatible_estimate');
    plain.events[0] = { ...plain.events[0]!, anchorM: null, placement: 'unknown' };
    expect(deriveShotCameraTarget(plain, 1)).toBeNull();
    expect(deriveShotCameraTarget(scene, undefined)).toBeNull();
  });
  it('labels every production display arc as an illustrative chord arc (§60)', async () => {
    const { decorateSceneWithDisplayTrajectories } = await import('../display-trajectories');
    const decorated = decorateSceneWithDisplayTrajectories(illustrativeScene());
    const arcs = (decorated.illustrativePreviewTrajectories ?? []).filter(item => item.source === 'reconstruction_display_estimate');
    expect(arcs.length).toBeGreaterThan(0);
    for (const arc of arcs) expect(arc.trajectoryBasis).toBe('illustrative_chord_arc');
  });
});
