'use client';

import { useEffect, useMemo, useRef } from 'react';
import { HoleSceneFrame } from '@/components/golf/course-geometry/HoleSceneFrame';
import { buildHoleScene } from '@/lib/golf/course-geometry/build-scene';
import type { ContextLayer } from '@/lib/golf/course-geometry/context-layer';
import type { ProductionCameraState, TerrainMesh } from '@/lib/golf/course-geometry/terrain';
import type { CourseGeometryPackage } from '@/lib/golf/course-geometry/types';
import type { StorageLike, SyncTransport } from '@/lib/golf/one-tap/anchor-repository';
import type { LocationSource } from '@/lib/golf/one-tap/location-source';
import { OneTapButton } from './OneTapButton';
import { OneTapHud } from './OneTapHud';
import { useOneTap, type OneTapView } from './use-one-tap';

export interface OneTapPlayerScreenProps {
  roundId: string;
  pkg: CourseGeometryPackage;
  holeKey: string;
  terrain: TerrainMesh | null;
  contextLayer?: ContextLayer;
  location: LocationSource | null;
  storage?: StorageLike | null;
  transport?: SyncTransport | null;
  reducedMotion?: boolean;
  now?: () => number;
  /** Lab and tests observe the view model without reaching into the DOM. */
  onView?: (view: OneTapView) => void;
}

/** The course is the screen (One-Tap master plan "Player-facing design"):
 * the production HoleSceneFrame in stage presentation with the marks painted
 * on the terrain, the readout floating over it and MARK BALL beneath. */
export function OneTapPlayerScreen({ roundId, pkg, holeKey, terrain, contextLayer, location, storage, transport, reducedMotion, now, onView }: OneTapPlayerScreenProps) {
  const scene = useMemo(() => {
    try { return buildHoleScene(pkg, holeKey, [], terrain ?? undefined, contextLayer); } catch { return null; }
  }, [pkg, holeKey, terrain, contextLayer]);
  const view = useOneTap({ roundId, pkg, holeKey, terrain, location, storage, transport, reducedMotion, now });
  const cameraRef = useRef<((state: ProductionCameraState) => void) | null>(null);
  const framed = useRef<ProductionCameraState>('tee');
  useEffect(() => {
    if (framed.current === view.cameraState) return;
    framed.current = view.cameraState;
    cameraRef.current?.(view.cameraState);
  }, [view.cameraState]);
  useEffect(() => { onView?.(view); }, [view, onView]);
  return <div className="flex h-full min-h-0 flex-1 flex-col" data-slot="one-tap-screen" data-one-tap-state={view.snapshot.state} data-camera-mode={view.cameraMode} data-camera-state={view.cameraState}>
    <HoleSceneFrame scene={scene} context="entry" presentation="stage" markers={view.markers}
      stageOverlay={<OneTapHud view={view} />} stageFooter={<OneTapButton view={view} />}
      stageCameraRef={cameraRef} onStageGesture={view.onGesture} />
  </div>;
}
