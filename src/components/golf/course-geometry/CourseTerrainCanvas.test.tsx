import { act, render, screen, waitFor } from '@testing-library/react';
import { createRef } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CourseTerrainCanvas } from './CourseTerrainCanvas';
import { createThreeTerrainRuntime, type ThreeTerrainRuntime } from '@/lib/golf/course-geometry/three-renderer';
import { fitTerrainCamera, parseTerrainMesh, TERRAIN_PRESETS } from '@/lib/golf/course-geometry/terrain';
import type { TerrainRuntimeController } from '@/lib/golf/course-geometry/runtime-controller';
import { illustrativeScene, pilotPackage } from '@/test/fixtures/course-geometry/pilot';
import source from '@/test/fixtures/course-geometry/cacapon-07-terrain.json';

vi.mock('@/lib/golf/course-geometry/three-renderer', () => ({ createThreeTerrainRuntime: vi.fn() }));
const mesh = parseTerrainMesh(source, pilotPackage), scene = illustrativeScene();
const camera = fitTerrainCamera(scene, mesh, 'hole', 390, 640, TERRAIN_PRESETS.top);
type Build = { controller: ThreeTerrainRuntime; complete(): void; fail(): void };
let builds: Build[];
beforeEach(() => {
  builds = [];
  vi.mocked(createThreeTerrainRuntime).mockReset().mockImplementation(options => {
    let resolve!: () => void;
    const ready = new Promise<void>(done => { resolve = done; });
    const controller: ThreeTerrainRuntime = { ready, setCamera: vi.fn(), pick: vi.fn(() => null), setEvidence: vi.fn(), dispose: vi.fn() };
    builds.push({ controller, complete() { options.canvas.dataset.terrainState = 'ready'; resolve(); }, fail: options.onUnavailable });
    return controller;
  });
});

describe('terrain runtime lifecycle', () => {
  it('keeps the schematic during loading and cannot install an abandoned hole controller', async () => {
    const runtimeRef = createRef<TerrainRuntimeController>();
    const props = { scene, mesh, camera, width: 390, height: 640, fallback: <p>Course outline</p>, runtimeRef };
    const ui = render(<CourseTerrainCanvas {...props} />);
    await waitFor(() => expect(builds).toHaveLength(1));
    expect(screen.getByText('Course outline')).toBeVisible();
    const first = builds[0]!;
    ui.rerender(<CourseTerrainCanvas {...props} mesh={{ ...mesh, contentHash: 'b'.repeat(64) }} />);
    await waitFor(() => expect(builds).toHaveLength(2));
    const second = builds[1]!;
    expect(first.controller.dispose).toHaveBeenCalled();
    expect(runtimeRef.current).toBe(second.controller);
    await act(async () => { first.complete(); });
    expect(screen.getByText('Course outline')).toBeVisible();
    expect(runtimeRef.current).toBe(second.controller);
    await act(async () => { second.complete(); });
    expect(screen.queryByText('Course outline')).toBeNull();
    ui.unmount();
    expect(second.controller.dispose).toHaveBeenCalledOnce();
    expect(runtimeRef.current).toBeNull();
  });

  it('returns to the accessible outline and clears the exposed controller after GPU failure', async () => {
    const runtimeRef = createRef<TerrainRuntimeController>(), unavailable = vi.fn();
    const ui = render(<CourseTerrainCanvas scene={scene} mesh={mesh} camera={camera} width={390} height={640}
      fallback={<p>Course outline</p>} runtimeRef={runtimeRef} onUnavailable={unavailable} />);
    await waitFor(() => expect(builds).toHaveLength(1));
    await act(async () => { builds[0]!.complete(); });
    expect(screen.queryByText('Course outline')).toBeNull();
    act(() => { builds[0]!.fail(); });
    expect(screen.getByText('Course outline')).toBeVisible();
    expect(screen.getByText('Terrain unavailable. Showing the top-down course outline.')).toBeInTheDocument();
    expect(unavailable).toHaveBeenCalledOnce();
    expect(runtimeRef.current).toBeNull();
    ui.unmount();
  });

  it('rebuilds when context-only canopy review is revoked under the same source hash', async () => {
    const woods = scene.features.find(feature => feature.kind === 'woods')!;
    expect(woods).toBeDefined();
    const contextScene = { ...scene, features: scene.features.filter(feature => feature !== woods),
      contextFeatures: [{ ...woods, reviewed: true }] };
    const props = { scene: contextScene, mesh, camera, width: 390, height: 640, fallback: <p>Course outline</p> };
    const ui = render(<CourseTerrainCanvas {...props} />);
    await waitFor(() => expect(builds).toHaveLength(1));
    await act(async () => { builds[0]!.complete(); });
    ui.rerender(<CourseTerrainCanvas {...props} scene={{ ...contextScene, contextFeatures: [{ ...woods, reviewed: false }] }} />);
    await waitFor(() => expect(builds).toHaveLength(2));
    expect(builds[0]!.controller.dispose).toHaveBeenCalled();
    expect(vi.mocked(createThreeTerrainRuntime).mock.calls[1]![0].scene.contextFeatures![0]!.reviewed).toBe(false);
    await act(async () => { builds[1]!.complete(); });
    expect(screen.queryByText('Course outline')).toBeNull();
    ui.unmount();
  });
});
