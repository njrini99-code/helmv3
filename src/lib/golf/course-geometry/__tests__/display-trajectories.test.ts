import { describe, expect, it } from 'vitest';
import { illustrativeScene } from '@/test/fixtures/course-geometry/pilot';
import { decorateSceneWithDisplayTrajectories } from '../display-trajectories';

describe('display trajectory adapter', () => {
  it('draws a deterministic estimated flight from the route reference to the first compatible landing', () => {
    const scene = illustrativeScene();
    const route = scene.features.find(feature => feature.id === scene.hole.routeFeatureId)!;
    const decorated = decorateSceneWithDisplayTrajectories(scene);

    const flight = decorated.illustrativePreviewTrajectories?.find(item => item.shotNumber === 1);
    expect(flight).toEqual(expect.objectContaining({
      source: 'reconstruction_display_estimate',
      anchorBasis: 'route_reference',
    }));
    expect(flight?.pointsM[0]).toEqual(route.parts[0]![0]![0]);
    expect(flight?.pointsM.at(-1)).toEqual(scene.events[0]!.anchorM);
    expect(decorated).not.toBe(scene);
    expect(scene.illustrativePreviewTrajectories).toBeUndefined();
  });

  it('continues only an unbroken compatible-estimate sequence and never makes a flight for ambiguous or penalty evidence', () => {
    const scene = illustrativeScene();
    scene.events[1] = { ...scene.events[1]!, placement: 'ambiguous', anchorM: null };
    scene.events.push({
      ...scene.events[1]!,
      evidence: { ...scene.events[1]!.evidence, shotNumber: 3, penalty: { type: 'water', nextLie: 'fairway', nextDistance: scene.events[1]!.evidence.after } },
    });

    const trajectories = decorateSceneWithDisplayTrajectories(scene).illustrativePreviewTrajectories ?? [];
    expect(trajectories.map(item => item.shotNumber)).toEqual([1]);
  });
});
