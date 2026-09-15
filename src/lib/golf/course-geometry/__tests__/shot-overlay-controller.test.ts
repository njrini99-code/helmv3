// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createShotOverlayController } from '../shot-overlay-controller';
import { buildHoleScene } from '../build-scene';
import { normalizeLiveShot } from '../normalize';
import { parseTerrainMesh, fitTerrainCamera, projectTerrainPoint, terrainHeight, TERRAIN_PRESETS } from '../terrain';
import { addInteractivePreviewTrajectories, illustrativeScene, pilotPackage, pilotShots } from '@/test/fixtures/course-geometry/pilot';
import source from '@/test/fixtures/course-geometry/cacapon-07-terrain.json';
import type { ShotRecord } from '@/lib/types/golf';

const mesh = parseTerrainMesh(source, pilotPackage);
const svg = () => document.createElementNS('http://www.w3.org/2000/svg', 'svg');

describe('imperative evidence camera', () => {
  it('retains nodes while projecting anchors and validated segments through the same terrain camera', () => {
    const scene = illustrativeScene(), drawing = svg();
    const a = scene.events[0]!.anchorM!, b = scene.events[1]!.anchorM!;
    scene.events[1]!.connection = { fromM: a, toM: b, distanceM: Math.hypot(a[0] - b[0], a[1] - b[1]),
      basis: 'inferred_endpoint_separation' };
    const snapshot = structuredClone(scene), controller = createShotOverlayController(drawing, 'test-overlay', mesh, scene, 2);
    let previousAnchor: Element | null = null;
    try {
      for (const pose of [TERRAIN_PRESETS.top, TERRAIN_PRESETS.terrain, { ...TERRAIN_PRESETS.side, yawOffset: -35 }]) {
        const camera = fitTerrainCamera(scene, mesh, 'hole', 600, 800, pose);
        controller.setCamera(camera, 600, 800);
        const markers = drawing.querySelectorAll('[data-anchor="estimated"]');
        expect(markers.length).toBe(2);
        if (previousAnchor) expect(markers[0]).toBe(previousAnchor);
        previousAnchor = markers[0]!;
        for (const [index, marker] of [...markers].entries()) {
          const world = scene.events[index]!.anchorM!;
          const expected = projectTerrainPoint([world[0], world[1], terrainHeight(mesh, world)!], camera);
          expect(Number(marker.getAttribute('cx'))).toBeCloseTo(expected[0], 9);
          expect(Number(marker.getAttribute('cy'))).toBeCloseTo(expected[1], 9);
          expect(marker.getAttribute('r')).toBe('2.5');
        }
        const line = drawing.querySelector('[data-shot-segment="2"] line:last-child')!;
        expect(Number(line.getAttribute('x1'))).toBeCloseTo(Number(markers[0]!.getAttribute('cx')), 9);
        expect(Number(line.getAttribute('y2'))).toBeCloseTo(Number(markers[1]!.getAttribute('cy')), 9);
        expect(line.getAttribute('stroke-dasharray')).toBe('5 6');
        expect(drawing.getAttribute('viewBox')).toBe('0 0 600 800');
      }
      expect(scene).toEqual(snapshot);
    } finally { controller.dispose(); }
    expect(drawing.childElementCount).toBe(0);
  });

  it('withdraws geographic annotations when surviving evidence becomes ambiguous, without moving original events', () => {
    const scene = illustrativeScene(), drawing = svg();
    const controller = createShotOverlayController(drawing, 'withdrawal', mesh, scene, 2);
    try {
      controller.setCamera(fitTerrainCamera(scene, mesh, 'hole', 600, 800, TERRAIN_PRESETS.top), 600, 800);
      expect(drawing.querySelectorAll('[data-anchor="estimated"][display="inline"]')).toHaveLength(2);
      const unknown = { ...scene, events: scene.events.map(event => ({ ...event, anchorM: null, placement: 'ambiguous' as const })) };
      controller.setEvidence(unknown, 2);
      expect(drawing.querySelectorAll('[data-anchor="estimated"][display="inline"]')).toHaveLength(0);
      expect(drawing.querySelectorAll('[data-shot-segment][display="inline"]')).toHaveLength(0);
      expect(scene.events.every(event => event.anchorM != null)).toBe(true);
    } finally { controller.dispose(); }
  });

  it('draws the same refined preview flight over the Three terrain and hides fairway uncertainty outlines', () => {
    const shot = { ...pilotShots[0]!, distanceToHoleBefore: 431, distanceToHoleAfter: 135 };
    const scene = addInteractivePreviewTrajectories(
      buildHoleScene(pilotPackage, 'cacapon-07', [normalizeLiveShot(shot)], mesh), [shot],
    );
    const drawing = svg(), camera = fitTerrainCamera(scene, mesh, 'approach', 600, 800, TERRAIN_PRESETS.terrain);
    const controller = createShotOverlayController(drawing, 'preview', mesh, scene, 1);
    try {
      controller.setCamera(camera, 600, 800);
      const trail = drawing.querySelector('[data-illustrative-preview-trajectory="1"][display="inline"]')!;
      expect(trail).toBeTruthy();
      expect(trail.querySelectorAll('polyline')).toHaveLength(2);
      expect(trail.querySelector('polyline:last-of-type')!.getAttribute('stroke-width')).toBe('1.65');
      expect(drawing.querySelectorAll('[data-possible-area][display="inline"], [data-candidate-outline][display="inline"]')).toHaveLength(0);
      const start = trail.querySelector('[data-preview-flight-start="1"]')!, source = scene.illustrativePreviewTrajectories![0]!.pointsM[0]!;
      const expected = projectTerrainPoint([source[0], source[1], terrainHeight(mesh, source)!], camera);
      expect(Number(start.getAttribute('cx'))).toBeCloseTo(expected[0], 9);
      expect(Number(start.getAttribute('cy'))).toBeCloseTo(expected[1], 9);
    } finally { controller.dispose(); }
  });

  it('keeps a distance-derived putting ball and white surface roll above the cup annotation in the Three view', () => {
    const shots: ShotRecord[] = [
      { ...pilotShots[0]!, distanceToHoleBefore: 431, distanceToHoleAfter: 158 },
      { ...pilotShots[1]!, distanceToHoleBefore: 158, distanceToHoleAfter: 17 },
      { shotNumber: 3, shotType: 'around_green', clubType: 'non_driver', lieBefore: 'sand', distanceToHoleBefore: 17,
        distanceUnitBefore: 'yards', result: 'green', distanceToHoleAfter: 12, distanceUnitAfter: 'feet', shotDistance: 13, isPenalty: false },
      { shotNumber: 4, shotType: 'putting', clubType: 'putter', lieBefore: 'green', distanceToHoleBefore: 12,
        distanceUnitBefore: 'feet', result: 'green', distanceToHoleAfter: 2, distanceUnitAfter: 'feet', shotDistance: 3.3, isPenalty: false, puttBreak: 'left_to_right' },
    ];
    const scene = addInteractivePreviewTrajectories(
      buildHoleScene(pilotPackage, 'cacapon-07', shots.map(normalizeLiveShot), mesh), shots,
    );
    const drawing = svg(), camera = fitTerrainCamera(scene, mesh, 'green', 600, 800, TERRAIN_PRESETS.top);
    // The Three world owns depth-tested paths; this retained SVG provides the
    // screen-readable ball/roll annotation without duplicating a flight arc.
    const controller = createShotOverlayController(drawing, 'putting', mesh, scene, 4, false);
    try {
      controller.setCamera(camera, 600, 800);
      expect(drawing.querySelectorAll('[data-illustrative-preview-trajectory][display="inline"]')).toHaveLength(0);
      const roll = drawing.querySelector('[data-illustrative-putting-track="4"][display="inline"]')!;
      expect(roll.getAttribute('data-selected')).toBe('true');
      expect(roll.querySelector('polyline:last-of-type')!.getAttribute('stroke')).toBe('#FFFDF7');
      expect(roll.querySelectorAll('[data-putting-ball]')).toHaveLength(2);
      expect(roll.compareDocumentPosition(drawing.querySelector('[data-target="estimated-pin"]')!) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
    } finally { controller.dispose(); }
  });
});
