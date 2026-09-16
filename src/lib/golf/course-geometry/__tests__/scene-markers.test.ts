// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createSceneMarkerOverlayController, sigmaScreenRadius, type SceneMarkers } from '../scene-markers';
import { fitTerrainCamera, parseTerrainMesh, projectTerrainPoint, terrainHeight, TERRAIN_PRESETS } from '../terrain';
import { illustrativeScene, pilotPackage } from '@/test/fixtures/course-geometry/pilot';
import source from '@/test/fixtures/course-geometry/cacapon-07-terrain.json';

const mesh = parseTerrainMesh(source, pilotPackage);
const svg = () => document.createElementNS('http://www.w3.org/2000/svg', 'svg');
const scene = illustrativeScene();
const a = scene.events[0]!.anchorM!, b = scene.events[1]!.anchorM!;
const markers: SceneMarkers = {
  markers: [{ key: 'm1', pointM: a, kind: 'anchor', sigmaM: 3, label: '1' }, { key: 'm2', pointM: b, kind: 'you', sigmaM: 0, label: 'YOU' }],
  links: [{ key: 'm1>m2', fromM: a, toM: b }],
  rippleKey: 'm2',
};

describe('scene marker overlay', () => {
  it('projects marks, σ rings and links through the terrain camera and retains its nodes across frames', () => {
    const drawing = svg(), controller = createSceneMarkerOverlayController(drawing, mesh);
    try {
      controller.setMarkers(markers);
      const root = drawing.querySelector('[data-annotation="marked-positions"]')!;
      expect(root).not.toBeNull();
      const first = drawing.querySelector('[data-marked-position="m1"]')!;
      expect(first.getAttribute('data-marker-kind')).toBe('anchor');
      expect(drawing.querySelector('[data-marker-label="m1"]')!.textContent).toBe('1');
      for (const pose of [TERRAIN_PRESETS.top, TERRAIN_PRESETS.terrain, TERRAIN_PRESETS.green]) {
        const camera = fitTerrainCamera(scene, mesh, 'hole', 600, 800, pose);
        controller.setCamera(camera, 600, 800);
        expect(drawing.querySelector('[data-marked-position="m1"]')).toBe(first);
        const world = [a[0], a[1], terrainHeight(mesh, a)!] as const;
        const [x, y] = projectTerrainPoint(world, camera);
        expect(Number(first.getAttribute('cx'))).toBeCloseTo(x, 2);
        expect(Number(first.getAttribute('cy'))).toBeCloseTo(y, 2);
        const ring = drawing.querySelector('[data-marked-sigma="m1"]')!;
        expect(Number(ring.getAttribute('r'))).toBeCloseTo(sigmaScreenRadius(world, 3, camera), 2);
        expect(ring.getAttribute('display')).toBe('inline');
        // A zero σ never draws a ring: uncertainty is shown, never invented.
        expect(drawing.querySelector('[data-marked-sigma="m2"]')!.getAttribute('display')).toBe('none');
        const line = drawing.querySelector('[data-marked-link="m1>m2"]')!;
        expect(Number(line.getAttribute('x1'))).toBeCloseTo(x, 2);
        const [bx, by] = projectTerrainPoint([b[0], b[1], terrainHeight(mesh, b)!], camera);
        expect(Number(line.getAttribute('x2'))).toBeCloseTo(bx, 2);
        expect(Number(line.getAttribute('y2'))).toBeCloseTo(by, 2);
      }
      // The viewBox belongs to the evidence overlay sharing this SVG.
      expect(drawing.getAttribute('viewBox')).toBeNull();
    } finally { controller.dispose(); }
    expect(drawing.querySelector('[data-annotation="marked-positions"]')).toBeNull();
  });

  it('ripples once around a fresh mark, never under Reduced Motion, and clears on null', () => {
    const drawing = svg(), animated = createSceneMarkerOverlayController(drawing, mesh, undefined, false);
    animated.setMarkers(markers);
    expect(drawing.querySelector('[data-marker-ripple="m2"] animate')).not.toBeNull();
    expect(drawing.querySelector('[data-marker-ripple="m1"]')).toBeNull();
    animated.setMarkers(null);
    expect(drawing.querySelectorAll('[data-marked-position]').length).toBe(0);
    animated.dispose();
    const calm = svg(), reduced = createSceneMarkerOverlayController(calm, mesh, undefined, true);
    reduced.setMarkers(markers);
    expect(calm.querySelector('[data-marker-ripple]')).toBeNull();
    reduced.dispose();
  });

  it('hides a mark that has no terrain under it instead of guessing a height', () => {
    const drawing = svg(), controller = createSceneMarkerOverlayController(drawing, mesh);
    controller.setMarkers({ markers: [{ key: 'off', pointM: [1e6, 1e6], kind: 'anchor', sigmaM: 2 }], links: [] });
    controller.setCamera(fitTerrainCamera(scene, mesh, 'hole', 600, 800, TERRAIN_PRESETS.top), 600, 800);
    expect(drawing.querySelector('[data-marked-position="off"]')!.getAttribute('display')).toBe('none');
    controller.dispose();
  });

  it('draws marks on the visual surface when a sampler is supplied (bunker bowls, §33–34)', () => {
    const drawing = svg(), controller = createSceneMarkerOverlayController(drawing, mesh, () => 999);
    controller.setMarkers({ markers: [{ key: 'm', pointM: a, kind: 'anchor', sigmaM: 0 }], links: [] });
    const camera = fitTerrainCamera(scene, mesh, 'hole', 600, 800, TERRAIN_PRESETS.terrain);
    controller.setCamera(camera, 600, 800);
    const [, y] = projectTerrainPoint([a[0], a[1], 999], camera);
    expect(Number(drawing.querySelector('[data-marked-position="m"]')!.getAttribute('cy'))).toBeCloseTo(y, 2);
    controller.dispose();
  });
});
