'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import type { TerrainCamera, TerrainMesh } from '@/lib/golf/course-geometry/terrain';
import type { TerrainRuntimeController } from '@/lib/golf/course-geometry/runtime-controller';
import type { ThreeTerrainRuntime } from '@/lib/golf/course-geometry/three-renderer';
import type { TerrainDebugView } from './terrain-debug';
import type { HoleScene } from '@/lib/golf/course-geometry/types';
import type { MeridianVisualArtifact } from '@/lib/golf/course-geometry/visual-artifact';
import type { MeridianStyleOverrides } from '@/lib/golf/course-geometry/visual-style';
import type { MeridianRenderQuality } from '@/lib/golf/course-geometry/render-quality';

/** The Three backend is loaded only for an expanded terrain scene. Static
 * review/filmstrip SVG does not import Three or initialize a GPU context. */
export function CourseTerrainCanvas({ scene, mesh, camera, width, height, fallback, onUnavailable, selectedShotNumber, runtimeRef, debugView, visualArtifact, styleOverrides, quality }: {
  scene: HoleScene; mesh: TerrainMesh; camera: TerrainCamera; width: number; height: number; fallback: ReactNode;
  onUnavailable?: () => void; selectedShotNumber?: number;
  runtimeRef?: RefObject<TerrainRuntimeController | null>;
  debugView?: TerrainDebugView;
  /** Cached Meridian visual world for this hole; compiled at runtime when absent. */
  visualArtifact?: MeridianVisualArtifact;
  /** Lab-only amplitude overrides (§95); production never passes them. */
  styleOverrides?: MeridianStyleOverrides;
  /** §64 rendering tier; production leaves it on `auto` (capability-detected). */
  quality?: MeridianRenderQuality | 'auto';
}) {
  const canvas = useRef<HTMLCanvasElement>(null), overlay = useRef<SVGSVGElement>(null);
  const runtime = useRef<ThreeTerrainRuntime | null>(null);
  const latest = useRef({ scene, camera, width, height, selectedShotNumber });
  const onFailure = useRef(onUnavailable);
  const id = useId();
  // Accepted coordinates are immutable under their hash. Review eligibility
  // also invalidates landscape instances even in internal candidate previews.
  const geometryKey = `${scene.packageHash}:${scene.physicalHoleKey}:${[...scene.features, ...(scene.contextFeatures ?? [])].map(f => `${f.id}:${f.kind}:${f.reviewed}`).join('|')}`;
  const [status, setStatus] = useState<{ key: string; mesh: TerrainMesh; state: 'ready' | 'unavailable' } | null>(null);
  const state = status?.key === geometryKey && status.mesh === mesh ? status.state : 'loading';

  useLayoutEffect(() => {
    latest.current = { scene, camera, width, height, selectedShotNumber };
    onFailure.current = onUnavailable;
    const active = runtime.current;
    if (!active) return;
    active.setEvidence(scene, selectedShotNumber);
    active.setCamera(camera, width, height);
  }, [scene, selectedShotNumber, camera, width, height, onUnavailable]);

  useEffect(() => {
    const element = canvas.current, annotations = overlay.current;
    if (!element || !annotations) return;
    let cancelled = false;
    let owned: ThreeTerrainRuntime | null = null;
    const unavailable = () => {
      if (cancelled) return;
      setStatus({ key: geometryKey, mesh, state: 'unavailable' });
      if (runtimeRef?.current === owned) runtimeRef.current = null;
      onFailure.current?.();
    };
    // The module and shader compilation both have cancellation guards. A late
    // result for a previous hole can never install its scene or controller.
    void import('@/lib/golf/course-geometry/three-renderer').then(async module => {
      if (cancelled) return;
      const input = latest.current;
      owned = module.createThreeTerrainRuntime({ canvas: element, overlay: annotations, overlayId: id,
        mesh, scene: input.scene, camera: input.camera, width: input.width, height: input.height,
        selectedShotNumber: input.selectedShotNumber, debugView, visualArtifact, styleOverrides, quality, onUnavailable: unavailable });
      runtime.current = owned;
      if (runtimeRef) runtimeRef.current = owned;
      await owned.ready;
      if (cancelled) { owned.dispose(); return; }
      if (element.dataset.terrainState === 'ready') setStatus({ key: geometryKey, mesh, state: 'ready' });
    }).catch(unavailable);
    return () => {
      cancelled = true;
      if (runtime.current === owned) runtime.current = null;
      if (runtimeRef?.current === owned) runtimeRef.current = null;
      owned?.dispose();
    };
  }, [geometryKey, mesh, id, runtimeRef, debugView, visualArtifact, styleOverrides, quality]);

  return <div className="relative h-full w-full" data-terrain-view-state={state}>
    <canvas ref={canvas} role="img" aria-label="Course terrain with illustrative trees and estimated shot annotations. Actual pin location unknown."
      data-terrain-hash={mesh.contentHash}
      style={{ width: '100%', height: '100%', display: 'block', visibility: state === 'ready' ? 'visible' : 'hidden' }} />
    <svg ref={overlay} aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full"
      style={{ fontFamily: 'var(--fw-font-sans)', visibility: state === 'ready' ? 'visible' : 'hidden' }} />
    {state !== 'ready' && <div className="absolute inset-0">{fallback}
      {state === 'unavailable' && <span className="sr-only">Terrain unavailable. Showing the top-down course outline.</span>}
    </div>}
  </div>;
}
