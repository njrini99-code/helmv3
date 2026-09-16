// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MARKER_MOTION, PLAYER_LABEL_CLEARANCE, SHOT_PATH_OPACITY, createSceneMarkerOverlayController, playerLabelPlacement, sigmaScreenRadius, type SceneMarkers } from '../scene-markers';
import { fitTerrainCamera, parseTerrainMesh, projectTerrainPoint, terrainHeight, TERRAIN_PRESETS } from '../terrain';
import { illustrativeScene, pilotPackage } from '@/test/fixtures/course-geometry/pilot';
import source from '@/test/fixtures/course-geometry/cacapon-07-terrain.json';

const mesh = parseTerrainMesh(source, pilotPackage);
const svg = () => document.createElementNS('http://www.w3.org/2000/svg', 'svg');
const scene = illustrativeScene();
const a = scene.events[0]!.anchorM!, b = scene.events[1]!.anchorM!;
/** The screen points a drawn shot is made of, read back off its `d`. */
const pathPoints = (node: Element | null): [number, number][] =>
  (node?.getAttribute('d') ?? '').trim().split(' ').filter(Boolean)
    .map(step => { const [x, y] = step.replace(/^[ML]/, '').split(',').map(Number); return [x!, y!]; });
const markers: SceneMarkers = {
  markers: [{ key: 'm1', pointM: a, kind: 'anchor', sigmaM: 3, label: '1' }, { key: 'm2', pointM: b, kind: 'ball', sigmaM: 0, label: 'BALL' }],
  links: [{ key: 'm1>m2', fromM: a, toM: b }],
  rippleKey: 'm2',
};

describe('scene marker overlay', () => {
  afterEach(() => { vi.useRealTimers(); });

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
        const drawn = pathPoints(drawing.querySelector('[data-marked-link="m1>m2"]'));
        expect(drawn[0]![0]).toBeCloseTo(x, 2);
        expect(drawn[0]![1]).toBeCloseTo(y, 2);
        const [bx, by] = projectTerrainPoint([b[0], b[1], terrainHeight(mesh, b)!], camera);
        expect(drawn.at(-1)![0]).toBeCloseTo(bx, 2);
        expect(drawn.at(-1)![1]).toBeCloseTo(by, 2);
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

  it('draws YOU as a ring with an accuracy halo that moves without reallocating, dims when stale, and never links (§5, §37)', () => {
    const drawing = svg(), controller = createSceneMarkerOverlayController(drawing, mesh);
    const camera = fitTerrainCamera(scene, mesh, 'hole', 600, 800, TERRAIN_PRESETS.terrain);
    controller.setCamera(camera, 600, 800);
    const ball = { key: 'b', pointM: a, kind: 'ball' as const, sigmaM: 2, label: 'BALL' };
    controller.setMarkers({ markers: [ball, { key: 'player', pointM: a, kind: 'player', sigmaM: 4, label: 'YOU' }], links: [] });
    const you = drawing.querySelector('[data-marked-position="player"]')!, core = drawing.querySelector('[data-marker-core="player"]')!;
    const haloRing = drawing.querySelector('[data-marked-sigma="player"]')!;
    expect(you.getAttribute('data-marker-kind')).toBe('player');
    expect(haloRing.getAttribute('data-marker-halo')).toBe('accuracy');
    expect(haloRing.getAttribute('stroke-dasharray')).toBeNull();
    const worldA = [a[0], a[1], terrainHeight(mesh, a)!] as const;
    expect(Number(haloRing.getAttribute('r'))).toBeCloseTo(sigmaScreenRadius(worldA, 4, camera), 2);
    expect(drawing.querySelector('[data-marker-label="player"]')!.textContent).toBe('YOU');
    // The phone walks away: same nodes, new position, the BALL does not move.
    controller.setMarkers({ markers: [ball, { key: 'player', pointM: b, kind: 'player', sigmaM: 6, label: 'YOU', dimmed: true }], links: [] });
    expect(drawing.querySelector('[data-marked-position="player"]')).toBe(you);
    expect(drawing.querySelector('[data-marker-core="player"]')).toBe(core);
    const [bx] = projectTerrainPoint([b[0], b[1], terrainHeight(mesh, b)!], camera), [ax] = projectTerrainPoint(worldA, camera);
    expect(Number(you.getAttribute('cx'))).toBeCloseTo(bx, 2);
    expect(Number(drawing.querySelector('[data-marked-position="b"]')!.getAttribute('cx'))).toBeCloseTo(ax, 2);
    expect(you.getAttribute('opacity')).toBe(String(MARKER_MOTION.dimmedOpacity));
    expect(drawing.querySelector('[data-marker-settle], [data-marker-crossfade], [data-marker-ghost]')).toBeNull();
    expect(drawing.querySelectorAll('[data-marked-link]').length).toBe(0);
    // The player is painted above the marks.
    const positions = [...drawing.querySelectorAll('[data-marked-position]')].map(n => n.getAttribute('data-marked-position'));
    expect(positions).toEqual(['b', 'player']);
    // Far from the ball YOU's label sits above; standing on the ball it yields to BALL; a few metres off it goes by screen distance.
    const youLabel = drawing.querySelector('[data-marker-label="player"]')!;
    expect(youLabel.getAttribute('data-label-placement')).toBe('above');
    controller.setMarkers({ markers: [ball, { key: 'player', pointM: a, kind: 'player', sigmaM: 4, label: 'YOU' }], links: [] });
    expect(youLabel.getAttribute('display')).toBe('none');
    expect(youLabel.getAttribute('data-label-placement')).toBe('hidden');
    expect(drawing.querySelector('[data-marker-label="b"]')!.getAttribute('display')).toBe('inline');
    const step: [number, number] = [a[0] + 6, a[1]];
    const [sx, sy] = projectTerrainPoint([step[0], step[1], terrainHeight(mesh, step)!], camera), [, ay] = projectTerrainPoint(worldA, camera);
    controller.setMarkers({ markers: [ball, { key: 'player', pointM: step, kind: 'player', sigmaM: 4, label: 'YOU' }], links: [] });
    const expected = playerLabelPlacement([sx, sy], [[ax, ay]]);
    expect(youLabel.getAttribute('data-label-placement')).toBe(expected);
    if (expected === 'below') expect(Number(youLabel.getAttribute('y'))).toBeGreaterThan(sy);
    if (expected === 'above') expect(Number(youLabel.getAttribute('y'))).toBeLessThan(sy);
    expect(Math.hypot(sx - ax, sy - ay)).toBeGreaterThanOrEqual(PLAYER_LABEL_CLEARANCE.hidePx);
    controller.dispose();
  });
  it('places the player label by screen distance to the nearest mark', () => {
    expect(playerLabelPlacement([100, 100], [])).toBe('above');
    expect(playerLabelPlacement([100, 100], [[104, 103]])).toBe('hidden');
    expect(playerLabelPlacement([100, 100], [[115, 100]])).toBe('below');
    expect(playerLabelPlacement([100, 100], [[140, 100], [100, 60]])).toBe('above');
  });

  it('keeps unchanged nodes across a reconcile, rebuilds a changed kind and removes dropped keys', () => {
    const drawing = svg(), controller = createSceneMarkerOverlayController(drawing, mesh);
    controller.setMarkers(markers);
    const first = drawing.querySelector('[data-marked-position="m1"]')!, second = drawing.querySelector('[data-marked-position="m2"]')!;
    controller.setMarkers({ markers: [{ key: 'm1', pointM: a, kind: 'anchor', sigmaM: 3, label: '1' }, { key: 'm2', pointM: b, kind: 'terminal', sigmaM: 0, label: 'HOLED' }], links: [] });
    expect(drawing.querySelector('[data-marked-position="m1"]')).toBe(first);
    expect(drawing.querySelector('[data-marked-position="m2"]')).not.toBe(second);
    expect(drawing.querySelector('[data-marked-position="m2"]')!.getAttribute('data-marker-kind')).toBe('terminal');
    expect(drawing.querySelector('[data-marked-link="m1>m2"]')).toBeNull();
    controller.setMarkers({ markers: [{ key: 'm2', pointM: b, kind: 'terminal', sigmaM: 0, label: 'HOLED' }], links: [] });
    expect(drawing.querySelector('[data-marked-position="m1"]')).toBeNull();
    expect(drawing.querySelectorAll('[data-marked-sigma], [data-marker-label]').length).toBe(2);
    controller.dispose();
  });

  it('settles a finalized mark in place for a small shift and crossfades a large one, instantly under Reduced Motion (§38)', () => {
    const camera = fitTerrainCamera(scene, mesh, 'hole', 600, 800, TERRAIN_PRESETS.terrain);
    const near: [number, number] = [a[0] + 1, a[1] + .5], far: [number, number] = [a[0] + 30, a[1]];
    const drawing = svg(), controller = createSceneMarkerOverlayController(drawing, mesh);
    controller.setCamera(camera, 600, 800);
    controller.setMarkers({ markers: [{ key: 'p', pointM: a, kind: 'provisional', sigmaM: 3 }], links: [] });
    const hollow = drawing.querySelector('[data-marked-position="p"]')!;
    expect(hollow.getAttribute('data-marker-kind')).toBe('provisional');
    // ○ → ● one metre away: the new dot eases from the old screen position.
    controller.setMarkers({ markers: [{ key: 'p', pointM: near, kind: 'ball', sigmaM: 2, label: 'BALL' }], links: [] });
    const settled = drawing.querySelector('[data-marked-position="p"]')!;
    expect(settled).not.toBe(hollow);
    const settle = settled.querySelector('[data-marker-settle="p"]')!;
    expect(settle).not.toBeNull();
    expect(settle.getAttribute('to')).toBe('0 0');
    expect(settle.getAttribute('from')).not.toBe('0.00 0.00');
    expect(drawing.querySelector('[data-marker-ghost]')).toBeNull();
    // A 30 m shift crossfades: the new dot fades in and a ghost fades out where the old one was.
    controller.setMarkers({ markers: [{ key: 'p', pointM: far, kind: 'ball', sigmaM: 2, label: 'BALL' }], links: [] });
    expect(drawing.querySelector('[data-marked-position="p"] [data-marker-crossfade="p"]')).not.toBeNull();
    expect(drawing.querySelector('[data-marked-position="p"] [data-marker-settle="p"]')).toBeNull();
    const ghost = drawing.querySelector('[data-marker-ghost="p"]')!;
    const [nx] = projectTerrainPoint([near[0], near[1], terrainHeight(mesh, near)!], camera);
    expect(Number(ghost.getAttribute('cx'))).toBeCloseTo(nx, 2);
    controller.dispose();
    const calm = svg(), reduced = createSceneMarkerOverlayController(calm, mesh, undefined, true);
    reduced.setCamera(camera, 600, 800);
    reduced.setMarkers({ markers: [{ key: 'p', pointM: a, kind: 'provisional', sigmaM: 3 }], links: [] });
    reduced.setMarkers({ markers: [{ key: 'p', pointM: far, kind: 'ball', sigmaM: 2, label: 'BALL' }], links: [] });
    expect(calm.querySelector('[data-marker-settle], [data-marker-crossfade], [data-marker-ghost]')).toBeNull();
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

  it('flies the illustrative arc over the chord and rolls the putt along the ground (§62)', () => {
    const camera = fitTerrainCamera(scene, mesh, 'hole', 600, 800, TERRAIN_PRESETS.terrain);
    const za = terrainHeight(mesh, a)!, zb = terrainHeight(mesh, b)!;
    const mid: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], apexM = 16;
    const drawing = svg(), controller = createSceneMarkerOverlayController(drawing, mesh);
    controller.setCamera(camera, 600, 800);
    controller.setMarkers({ markers: markers.markers, links: [{ key: 'm1>m2', fromM: a, toM: b, basis: 'illustrative_endpoint_arc', apexM }] });
    const arc = drawing.querySelector('[data-marked-link="m1>m2"]')!;
    // The DOM says what it is wherever it is read: art, and named as art.
    expect(arc.getAttribute('data-trajectory-basis')).toBe('illustrative_endpoint_arc');
    expect(arc.getAttribute('data-illustrative')).toBe('endpoint_arc');
    const drawn = pathPoints(arc), middle = drawn[(drawn.length - 1) / 2]!;
    // p(0.5) = midpoint(A, B) + ẑ·4H·(0.5)(0.5) = midpoint + H, exactly.
    const [ex, ey] = projectTerrainPoint([mid[0], mid[1], (za + zb) / 2 + apexM], camera);
    expect(middle[0]).toBeCloseTo(ex, 2);
    expect(middle[1]).toBeCloseTo(ey, 2);
    // And it visibly leaves the ground: higher on screen than the chord itself.
    const [, chordY] = projectTerrainPoint([mid[0], mid[1], (za + zb) / 2], camera);
    expect(middle[1]).toBeLessThan(chordY - 1);
    // The ends stay on the two marks; the arc never moves where the ball was.
    expect(drawn[0]![0]).toBeCloseTo(projectTerrainPoint([a[0], a[1], za], camera)[0], 2);
    expect(drawn.at(-1)![1]).toBeCloseTo(projectTerrainPoint([b[0], b[1], zb], camera)[1], 2);
    // The putt keeps the same chord and takes its height from the ground under it.
    controller.setMarkers({ markers: markers.markers, links: [{ key: 'm1>m2', fromM: a, toM: b, basis: 'surface_connector', apexM: 0 }] });
    const rolled = pathPoints(arc), onGround = rolled[(rolled.length - 1) / 2]!;
    const [gx, gy] = projectTerrainPoint([mid[0], mid[1], terrainHeight(mesh, mid)!], camera);
    expect(onGround[0]).toBeCloseTo(gx, 2);
    expect(onGround[1]).toBeCloseTo(gy, 2);
    expect(arc.getAttribute('data-trajectory-basis')).toBe('surface_connector');
    expect(arc.getAttribute('data-illustrative')).toBeNull();
    // No ground under an end: the shot is not drawn rather than guessed at.
    controller.setMarkers({ markers: [], links: [{ key: 'off', fromM: a, toM: [1e6, 1e6], basis: 'surface_connector' }] });
    expect(drawing.querySelector('[data-marked-link="off"]')!.getAttribute('display')).toBe('none');
    controller.dispose();
  });

  it('draws a completed shot on over 520 ms, once, and never under Reduced Motion (§64)', () => {
    vi.useFakeTimers();
    const camera = fitTerrainCamera(scene, mesh, 'hole', 600, 800, TERRAIN_PRESETS.terrain);
    const shot = { key: 'm1>m2', fromM: a, toM: b, basis: 'illustrative_endpoint_arc' as const, apexM: 16 };
    const drawing = svg(), controller = createSceneMarkerOverlayController(drawing, mesh);
    controller.setCamera(camera, 600, 800);
    controller.setMarkers({ markers: markers.markers, links: [{ ...shot, reveal: true }] });
    const path = drawing.querySelector('[data-marked-link="m1>m2"]')!;
    const animate = path.querySelector('[data-shot-reveal="m1>m2"]')!;
    expect(animate.getAttribute('attributeName')).toBe('stroke-dashoffset');
    expect(animate.getAttribute('dur')).toBe('0.52s');
    expect([animate.getAttribute('from'), animate.getAttribute('to')]).toEqual(['1', '0']);
    // The dash is written against pathLength 1, so a camera frame may rewrite
    // the shape mid-reveal without the stroke jumping, and no length is measured.
    expect(path.getAttribute('pathLength')).toBe('1');
    expect(path.getAttribute('stroke-dasharray')).toBe('1 1');
    // Ink and shadow draw on together: nothing previews where the shot goes.
    expect(drawing.querySelectorAll('[data-shot-reveal]').length).toBe(2);
    // The reveal outlives the fresh-mark flag that started it and finishes itself.
    controller.setMarkers({ markers: markers.markers, links: [{ ...shot, reveal: false }] });
    expect(drawing.querySelectorAll('[data-shot-reveal]').length).toBe(2);
    vi.advanceTimersByTime(MARKER_MOTION.revealMs + 40);
    expect(drawing.querySelectorAll('[data-shot-reveal]').length).toBe(0);
    expect(path.getAttribute('stroke-dasharray')).toBeNull();
    expect(path.getAttribute('stroke-dashoffset')).toBeNull();
    expect(pathPoints(path).length).toBeGreaterThan(2);
    // A shot draws itself on once; asking again does not replay the hole.
    controller.setMarkers({ markers: markers.markers, links: [{ ...shot, reveal: true }] });
    expect(drawing.querySelectorAll('[data-shot-reveal]').length).toBe(0);
    controller.dispose();
    // Reduced Motion: the finished shot is simply there, whole, immediately.
    const calm = svg(), reduced = createSceneMarkerOverlayController(calm, mesh, undefined, true);
    reduced.setCamera(camera, 600, 800);
    reduced.setMarkers({ markers: markers.markers, links: [{ ...shot, reveal: true }] });
    const still = calm.querySelector('[data-marked-link="m1>m2"]')!;
    expect(calm.querySelector('[data-shot-reveal]')).toBeNull();
    expect(still.getAttribute('stroke-dasharray')).toBeNull();
    expect(still.getAttribute('pathLength')).toBeNull();
    expect(pathPoints(still).length).toBe(pathPoints(path).length);
    reduced.dispose();
  });

  it('re-lights the hierarchy every pass, so a shot falls back when the next is played (§63)', () => {
    const camera = fitTerrainCamera(scene, mesh, 'hole', 600, 800, TERRAIN_PRESETS.terrain);
    const first = { key: 'm1>m2', fromM: a, toM: b, basis: 'illustrative_endpoint_arc' as const, apexM: 12 };
    const drawing = svg(), controller = createSceneMarkerOverlayController(drawing, mesh);
    controller.setCamera(camera, 600, 800);
    controller.setMarkers({ markers: markers.markers, links: [{ ...first, opacity: SHOT_PATH_OPACITY.current }] });
    const node = drawing.querySelector('[data-marked-link="m1>m2"]')!;
    expect(node.getAttribute('opacity')).toBe(String(SHOT_PATH_OPACITY.current));
    controller.setMarkers({ markers: markers.markers, links: [
      { ...first, opacity: SHOT_PATH_OPACITY.previous },
      { key: 'm2>m1', fromM: b, toM: a, basis: 'surface_connector', apexM: 0, opacity: SHOT_PATH_OPACITY.current },
    ] });
    // The same node, dimmer: the hierarchy is data re-read, not a first paint.
    expect(drawing.querySelector('[data-marked-link="m1>m2"]')).toBe(node);
    expect(node.getAttribute('opacity')).toBe(String(SHOT_PATH_OPACITY.previous));
    // The shot just played is drawn last, so it lies over the older ones.
    expect([...drawing.querySelectorAll('[data-marked-link]')].map(n => n.getAttribute('data-marked-link'))).toEqual(['m1>m2', 'm2>m1']);
    controller.dispose();
  });
});
