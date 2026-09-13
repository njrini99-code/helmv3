import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { CourseShotOverlay } from './CourseShotOverlay';
import { featurePath } from './CourseHoleScene';
import { prepareShotOverlay } from '@/lib/golf/course-geometry/shot-overlay-layout';
import { addInteractivePreviewTrajectories, illustrativeScene, pilotPackage, pilotShots } from '@/test/fixtures/course-geometry/pilot';
import { buildHoleScene } from '@/lib/golf/course-geometry/build-scene';
import { normalizeLiveShot } from '@/lib/golf/course-geometry/normalize';
import { toScreen, type SimilarityTransform } from '@/lib/golf/course-geometry/project';
import type { HoleScene, LocalFeature, PointM } from '@/lib/golf/course-geometry/types';

const camera: SimilarityTransform = { scale: .6, angle: .4, translation: [220, 400] };
function render(scene: HoleScene, transform = camera) {
  return new DOMParser().parseFromString(renderToStaticMarkup(<svg xmlns="http://www.w3.org/2000/svg">
    <CourseShotOverlay scene={scene} width={600} height={700} selectedShotNumber={2}
      project={point => toScreen(point, transform)} pathForFeature={feature => featurePath(feature, transform)} />
  </svg>), 'image/svg+xml');
}

describe('shared geographic annotation layer', () => {
  it('projects the disclosed estimated pin with the course camera without promoting it to a known cup', () => {
    const scene = illustrativeScene();
    const green: LocalFeature = { id: 'test-green', kind: 'green', reviewed: true, type: 'Polygon',
      parts: [[[[0, 0], [30, 0], [30, 30], [0, 30], [0, 0]]]] };
    scene.features = [green];
    scene.events = [];
    scene.target = { kind: 'unknown_pin', greenFeatureId: green.id,
      estimate: { positionM: [15, 15], basis: 'nominal_green_reference' } };
    const snapshot = structuredClone(scene);
    for (const scale of [.4, 1, 2, 4]) {
      const transform = { ...camera, angle: .3, scale }, drawing = render(scene, transform);
      const anchor = drawing.querySelector('[data-pin-anchor="estimated"]')!;
      const expected = toScreen([15, 15], transform);
      expect(Number(anchor.getAttribute('cx'))).toBeCloseTo(expected[0], 8);
      expect(Number(anchor.getAttribute('cy'))).toBeCloseTo(expected[1], 8);
      expect(drawing.querySelector('[data-target="estimated-pin"] text')!.textContent).toBe('Estimated pin');
      expect(drawing.querySelectorAll('[data-shot-segment]')).toHaveLength(0);
    }
    expect(scene).toEqual(snapshot);
    expect(render(scene, { ...camera, translation: [900, 400] }).querySelector('[data-target="estimated-pin"]')).toBeNull();
  });

  it('does not render a pin outside a reviewed green, in its cutout, or on overlapping sand', () => {
    const scene = illustrativeScene();
    const square = (min: number, max: number): PointM[] => [[min, min], [max, min], [max, max], [min, max], [min, min]];
    const green: LocalFeature = { id: 'test-green', kind: 'green', reviewed: true, type: 'Polygon', parts: [[square(0, 30), square(12, 18)]] };
    scene.features = [green];
    scene.events = [];
    scene.target = { kind: 'unknown_pin', greenFeatureId: green.id,
      estimate: { positionM: [15, 15], basis: 'nominal_green_reference' } };
    expect(render(scene).querySelector('[data-target="estimated-pin"]')).toBeNull();
    scene.target.estimate!.positionM = [35, 15];
    expect(render(scene).querySelector('[data-target="estimated-pin"]')).toBeNull();
    scene.target.estimate!.positionM = [5, 5];
    green.reviewed = false;
    expect(render(scene).querySelector('[data-target="estimated-pin"]')).toBeNull();
    green.reviewed = true;
    scene.features.push({ id: 'overlapping-sand', kind: 'bunker', reviewed: true, type: 'Polygon', parts: [[square(3, 8)]] });
    expect(render(scene).querySelector('[data-target="estimated-pin"]')).toBeNull();
  });

  it('does not join supplied adjacent anchors without a coherent sequence connection', () => {
    const scene = illustrativeScene(), snapshot = structuredClone(scene);
    const drawing = render(scene);
    expect(drawing.querySelectorAll('[data-anchor="estimated"]')).toHaveLength(2);
    expect(drawing.querySelectorAll('[data-shot-segment]')).toHaveLength(0);
    expect(scene).toEqual(snapshot);
  });

  it('renders a labeled estimated fixture flight without turning it into a measured anchor or inferred segment', () => {
    const scene = addInteractivePreviewTrajectories(
      buildHoleScene(pilotPackage, 'cacapon-07', [pilotShots[0]!].map(normalizeLiveShot)),
      [pilotShots[0]!],
    );
    const drawing = render(scene);
    const trail = drawing.querySelector('[data-illustrative-preview-trajectory="1"]')!;
    expect(prepareShotOverlay(scene).regions).not.toHaveLength(0);
    expect(trail.getAttribute('data-trajectory-source')).toBe('interactive-preview-fixture');
    const strokes = trail.querySelectorAll('polyline');
    expect(strokes).toHaveLength(2);
    // render() selects Shot 2, so this first-stroke trail uses its quieter
    // historical weight while retaining the same crisp non-scaling treatment.
    expect(strokes[1]!.getAttribute('stroke-width')).toBe('1.05');
    expect(strokes[1]!.getAttribute('vector-effect')).toBe('non-scaling-stroke');
    expect(trail.querySelector('title')!.textContent).toContain('not a GPS-recorded ball location');
    expect(trail.querySelectorAll('[data-preview-flight-start], [data-preview-flight-end]')).toHaveLength(2);
    expect(trail.querySelectorAll('[data-preview-flight-estimate]')).toHaveLength(0);
    expect(drawing.querySelectorAll('[data-shot-segment], [data-anchor="estimated"]')).toHaveLength(0);
    expect(drawing.querySelectorAll('[data-possible-area], [data-candidate-outline]')).toHaveLength(0);
  });

  it('uses the refined preview flight instead of layering a generic inferred segment beneath it', () => {
    const scene = addInteractivePreviewTrajectories(
      buildHoleScene(pilotPackage, 'cacapon-07', pilotShots.map(normalizeLiveShot)),
      pilotShots,
    );
    const second = scene.events[1]!;
    scene.events[1] = { ...second, connection: { fromM: [1, 1], toM: [2, 2], distanceM: Math.SQRT2,
      basis: 'inferred_endpoint_separation' } };
    const drawing = render(scene);
    expect(drawing.querySelectorAll('[data-illustrative-preview-trajectory]')).toHaveLength(2);
    expect(drawing.querySelectorAll('[data-shot-segment]')).toHaveLength(0);
  });

  it('keeps a validated connection at the physical scale while badges remain readable', () => {
    const scene = illustrativeScene();
    const fromM = scene.events[0]!.anchorM!, toM = scene.events[1]!.anchorM!;
    const distanceM = Math.hypot(fromM[0] - toM[0], fromM[1] - toM[1]);
    scene.events[1]!.connection = { fromM, toM, distanceM, basis: 'inferred_endpoint_separation' };
    for (const scale of [.25, .6, 1.1]) {
      const transform = { ...camera, scale }, drawing = render(scene, transform);
      const segment = drawing.querySelector('[data-shot-segment="2"] line:last-child')!;
      const length = Math.hypot(Number(segment.getAttribute('x2')) - Number(segment.getAttribute('x1')),
        Number(segment.getAttribute('y2')) - Number(segment.getAttribute('y1')));
      expect(length).toBeCloseTo(distanceM * scale, 8);
      const anchors = drawing.querySelectorAll('[data-anchor="estimated"]');
      for (const [index, anchor] of [...anchors].entries()) {
        const point = toScreen(scene.events[index]!.anchorM!, transform);
        expect(Number(anchor.getAttribute('cx'))).toBeCloseTo(point[0], 8);
        expect(Number(anchor.getAttribute('cy'))).toBeCloseTo(point[1], 8);
        expect(Number(anchor.getAttribute('r'))).toBe(2.5);
      }
      for (const label of drawing.querySelectorAll('[data-event] text')) expect(label.getAttribute('font-size')).toBe('13');
    }
    scene.events[0]!.placement = 'ambiguous';
    expect(render(scene).querySelectorAll('[data-shot-segment]')).toHaveLength(0);
  });

  it('clips a possible area to the complete canonical surface, including holes, without a centroid badge', () => {
    const scene = illustrativeScene();
    const square = (min: number, max: number): PointM[] => [[min, min], [max, min], [max, max], [min, max], [min, min]];
    const bunker: LocalFeature = { id: 'test-sand', kind: 'bunker', reviewed: true, type: 'Polygon', parts: [[square(0, 10), square(4, 6)]] };
    scene.features = [bunker];
    scene.events = [{ ...scene.events[1]!, anchorM: null, placement: 'ambiguous', inferredSurfaceFeatureId: null,
      candidateFeatureIds: [bunker.id], regions: [{ featureId: bunker.id, basis: 'sampled_feasible_region',
        cells: [{ centerM: [3.5, 5], radiusM: 1 }] }] }];
    const closeCamera = { ...camera, scale: 8 };
    const drawing = render(scene, closeCamera);
    const clip = drawing.querySelector('clipPath path')!;
    expect(clip.getAttribute('clip-rule')).toBe('evenodd');
    expect(clip.getAttribute('d')).toBe(featurePath(bunker, closeCamera));
    expect(clip.getAttribute('d')!.match(/Z/g)).toHaveLength(2);
    expect(drawing.querySelectorAll('[data-possible-area="2"]')).toHaveLength(1);
    expect(drawing.querySelectorAll('[data-anchor], [data-event], [data-shot-segment]')).toHaveLength(0);
    const overview = render(scene);
    expect(overview.querySelectorAll('[data-possible-area]')).toHaveLength(1);
    expect(overview.querySelector('[data-candidate-outline="boundary"]')!.getAttribute('d')).toBe(featurePath(bunker, camera));
    expect(overview.querySelector('[data-feasible-region]')!.getAttribute('data-feasible-region')).toBe('false');
    // The isolated phone fixture preserves ambiguity in its inspector, but
    // deliberately does not paint its fairway/bunker boundary as white dashes.
    scene.illustrativePreviewTrajectories = [];
    expect(render(scene).querySelectorAll('[data-possible-area], [data-candidate-outline]')).toHaveLength(0);
    scene.illustrativePreviewTrajectories = undefined;
    scene.events[0]!.evidence.result = 'rough';
    expect(render(scene).querySelectorAll('[data-possible-area]')).toHaveLength(0);
  });
});
