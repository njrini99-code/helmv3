import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { CourseHoleScene, sceneCamera } from '../CourseHoleScene';
import { addInteractivePreviewTrajectories, pilotScene, pilotShots } from '@/test/fixtures/course-geometry/pilot';
import { toScreen } from '@/lib/golf/course-geometry/project';
import { normalizePersistedShot } from '@/lib/golf/course-geometry/normalize';
import { inFeature } from '@/lib/golf/course-geometry/spatial';

describe('shared SVG proof', () => {
  it('is deterministic and mounts independent accessible IDs across 18 scenes', () => {
    const markup = () => renderToStaticMarkup(<>{Array.from({ length: 18 }, (_, i) => <CourseHoleScene key={i} scene={pilotScene(`cacapon-${String(i + 1).padStart(2, '0')}`, false)} />)}</>);
    const first = markup();
    expect(first).toBe(markup());
    const ids = [...first.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
    expect(ids.length).toBeGreaterThanOrEqual(90);
    const references = [...first.matchAll(/url\(#([^)]*)\)/g)].map(m => m[1]);
    for (const reference of references) expect(ids).toContain(reference);
    expect(new Set(ids).size).toBe(ids.length);
    expect(first.match(/data-geometry-hash=/g)).toHaveLength(18);
    expect(first).toContain('Pin location unknown');
  });
  it('does not invent flight, pin, or endpoint from ordinary evidence', () => {
    const scene = pilotScene();
    const before = structuredClone(scene);
    for (const mode of ['review', 'compact', 'strip'] as const) {
      const svg = renderToStaticMarkup(<CourseHoleScene scene={scene} mode={mode} />);
      expect(svg).not.toContain('data-anchor=');
      expect(svg).not.toContain('data-event=');
      expect(svg).toContain('fill-rule="evenodd"');
    }
    expect(scene).toEqual(before);
  });
  it('puts a supplied analytic sand anchor inside the bunker in both contexts, offsetting only its label', () => {
    const scene = pilotScene();
    const bunker = scene.features.find(f => f.kind === 'bunker')!;
    // The boundary point is a controlled geometry assertion, never inferred from the ledger.
    const anchor = bunker.parts[0]![0]![0]!;
    expect(inFeature(anchor, bunker)).toBe(true);
    scene.events = [{ evidence: normalizePersistedShot({ shot_number: 3, result: 'sand', distance_to_hole_after: 18, distance_unit_after: 'yards' }),
      anchorM: anchor, placement: 'compatible_estimate', inferredSurfaceFeatureId: bunker.id, candidateFeatureIds: [bunker.id], reasons: ['analytic_fixture_only'] }];
    for (const [mode, height] of [['review', 380], ['compact', 168]] as const) {
      const point = toScreen(anchor, sceneCamera(scene, 320, height, mode));
      const svg = renderToStaticMarkup(<CourseHoleScene scene={scene} height={height} mode={mode} />);
      expect(svg).toContain(`data-anchor="estimated" cx="${point[0]}" cy="${point[1]}"`);
      expect(svg).toContain('data-event="3"');
    }
  });
});


it('removes the route guide on surface scenes and never connects across an unresolved event', () => {
  const scene = pilotScene('cacapon-07');
  const svg = renderToStaticMarkup(<CourseHoleScene scene={scene} view="green" selectedShotNumber={2} />);
  expect(svg).not.toContain('data-surface="route"');
  expect(svg).not.toContain('data-shot-segment');
});

it('keeps display-only full-shot arcs out of the canonical putting surface', () => {
  const scene = addInteractivePreviewTrajectories(pilotScene('cacapon-07'), pilotShots);
  const standard = renderToStaticMarkup(<CourseHoleScene scene={scene} view="green" selectedShotNumber={2} />);
  const putting = renderToStaticMarkup(<CourseHoleScene scene={scene} view="green" selectedShotNumber={2} showIllustrativeFlightPreviews={false} />);
  expect(standard).toContain('data-illustrative-preview-trajectory');
  expect(putting).not.toContain('data-illustrative-preview-trajectory');
  expect(putting).toContain('data-surface="green"');
  expect(putting).toContain('data-surface="bunker"');
});

it('renders the compact putting card as a quiet plan of the canonical green complex', () => {
  const scene = addInteractivePreviewTrajectories(pilotScene('cacapon-07'), pilotShots);
  const svg = renderToStaticMarkup(<CourseHoleScene scene={scene} view="green" mode="compact" selectedShotNumber={4}
    showIllustrativeFlightPreviews={false} puttingPlan />);
  expect(svg).toContain('data-putting-plan="true"');
  expect(svg).toContain('data-surface="green"');
  expect(svg).toContain('data-surface="bunker"');
  expect(svg).toContain('data-appearance="putting-plan"');
  expect(svg).not.toContain('data-annotation="illustrative-tree-crowns"');
  expect(svg).not.toContain('data-annotation="surface-rim-light"');
});
