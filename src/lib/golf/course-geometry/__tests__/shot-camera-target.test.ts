import { describe, expect, it } from 'vitest';
import { addInteractivePreviewTrajectories, illustrativeScene, pilotPackage, pilotShots } from '@/test/fixtures/course-geometry/pilot';
import { buildHoleScene } from '../build-scene';
import { normalizeLiveShot } from '../normalize';
import { derivePositionCameraTarget, deriveShotCameraTarget } from '../shot-camera-target';
import { inFeature } from '../spatial';
import type { PointM } from '../types';

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

describe('player-position camera target (One-Tap follow, §62 rules on a known mark)', () => {
  const scene = buildHoleScene(pilotPackage, 'cacapon-07', []);
  const green = scene.features.find(feature => feature.kind === 'green' && feature.reviewed)!;
  const ring = green.parts[0]![0]!;
  const xs = ring.map(point => point[0]);
  const centre: PointM = [ring.reduce((n, p) => n + p[0], 0) / ring.length, ring.reduce((n, p) => n + p[1], 0) / ring.length];
  const tee = scene.features.find(feature => feature.id === scene.hole.routeFeatureId)!.parts[0]![0]![0]!;
  it('frames a fairway mark with the green complex and keeps both in the fit', () => {
    const snapshot = structuredClone(scene);
    const target = derivePositionCameraTarget(scene, tee)!;
    expect(target.framing).toBe('ball_to_green');
    expect(target.targetM).toEqual(tee);
    expect(target.fitPointsM).toContainEqual(tee);
    expect(target.fitPointsM.some(point => point[0] === Math.min(...xs))).toBe(true);
    expect(target.fitPointsM.some(point => point[0] === Math.max(...xs))).toBe(true);
    expect(scene).toEqual(snapshot);
  });
  it('frames the whole green once the mark is on it, and the greenside band just off it', () => {
    expect(inFeature(centre, green)).toBe(true);
    const on = derivePositionCameraTarget(scene, centre)!;
    expect(on.framing).toBe('whole_green');
    expect(on.fitPointsM).not.toContainEqual(centre);
    const edge = ring[0]!, away = Math.hypot(edge[0] - centre[0], edge[1] - centre[1]) || 1;
    const beside: PointM = [edge[0] + ((edge[0] - centre[0]) / away) * 15, edge[1] + ((edge[1] - centre[1]) / away) * 15];
    const near = derivePositionCameraTarget(scene, beside)!;
    expect(near.framing).toBe('around_green');
    expect(near.fitPointsM).toContainEqual(beside);
  });
  it('returns null without a reviewed green or with a non-finite position', () => {
    expect(derivePositionCameraTarget({ ...scene, features: scene.features.filter(feature => feature.kind !== 'green') }, tee)).toBeNull();
    expect(derivePositionCameraTarget(scene, [Number.NaN, 0])).toBeNull();
  });
});
