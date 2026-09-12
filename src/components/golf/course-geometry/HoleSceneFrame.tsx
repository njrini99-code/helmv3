'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Maximize2 } from 'lucide-react';
import { ModalShell } from '@/components/fairway/overlays/ModalShell';
import { Button } from '@/components/fairway/controls/button';
import { PuttingZoom } from '@/components/golf/coachhelm/v3/HoleShotPath/PuttingZoom';
import { UnavailableCourseContext } from '@/components/golf/coachhelm/v3/HoleShotPath/turf';
import type { HoleScene, ShotEvidence } from '@/lib/golf/course-geometry/types';
import type { SceneView } from '@/lib/golf/course-geometry/camera';
import { CourseHoleScene, sceneCamera } from './CourseHoleScene';

const LABELS: Record<SceneView, string> = { hole: 'Whole hole', approach: 'Approach', green: 'Green', putting: 'Putting' };
interface FrameProps {
  scene?: HoleScene | null;
  context: 'entry' | 'review';
  defaultView?: SceneView;
  selectedShotNumber?: number;
  evidence?: readonly ShotEvidence[];
  currentPuttingDistanceM?: number | null;
  header?: ReactNode;
  children?: ReactNode;
}

/** One reusable viewing container. Its caller keys by hole identity; a manual
 * view persists through typing and committed shots, until a different hole. */
export function HoleSceneFrame({ scene, context, defaultView = 'hole', selectedShotNumber, evidence, currentPuttingDistanceM, header, children }: FrameProps) {
  const [choice, setChoice] = useState<SceneView | null>(null);
  const [expanded, setExpanded] = useState(false);
  const view = choice ?? defaultView;
  const events = evidence ?? scene?.events.map(e => e.evidence) ?? [];
  const putting = currentPuttingDistanceM != null || events.some(e => e.shotType === 'putting');
  const views: SceneView[] = ['hole', 'green', ...(defaultView === 'approach' ? ['approach' as const] : []), ...(putting ? ['putting' as const] : [])];
  const expand = <ModalShell open={expanded} onOpenChange={setExpanded} size="full" title="Course detail"
    description="Course context does not locate the ball. Surround shading and tree crowns are illustrative; source details are listed below."
    trigger={<Button variant="ghost" aria-label="Expand course view" className="h-11 min-w-11 shrink-0 px-2"><Maximize2 size={17} aria-hidden /></Button>}>
    <ModalShell.Body>
      <div className="mb-2 flex flex-wrap gap-1" role="group" aria-label="Expanded course views">
        {views.map(v => <Button variant={view === v ? 'secondary' : 'ghost'} size="sm" key={v} aria-pressed={view === v} onClick={() => setChoice(v)}>{LABELS[v]}</Button>)}
      </div>
      <Drawing key={view} scene={scene} view={view} context={context} events={events} selectedShotNumber={selectedShotNumber}
        currentPuttingDistanceM={currentPuttingDistanceM} expanded />
      <p className="mt-2 text-caption text-text-secondary">{scene?.attribution ?? 'Course geometry unavailable.'}</p>
    </ModalShell.Body>
  </ModalShell>;
  return <div className="min-w-0" data-scene-context={context} data-current-view={view}>
    <div className="flex min-h-14 items-center justify-between gap-1 px-3 py-1" data-slot="scene-header">
      {context === 'review' ? <div className="flex min-w-0 flex-wrap gap-1" role="group" aria-label="Course views">
        {views.map(v => <Button size="sm" className="h-11 px-3" variant={view === v ? 'secondary' : 'ghost'} key={v} aria-pressed={view === v} onClick={() => setChoice(v)}>{v === 'hole' ? 'Hole' : LABELS[v]}</Button>)}
      </div> : header}
      {context === 'entry' ? <div className="flex shrink-0 items-center">
        <Button variant="ghost" size="sm" className="h-11 px-2 text-caption" onClick={() => setChoice(view === 'hole' ? (defaultView === 'hole' ? 'green' : defaultView) : 'hole')}>
          {view === 'hole' ? (defaultView === 'hole' ? 'Green' : LABELS[defaultView]) : 'Whole hole'}
        </Button>{expand}
      </div> : expand}
    </div>
    <Drawing scene={scene} view={view} context={context} events={events} selectedShotNumber={selectedShotNumber} currentPuttingDistanceM={currentPuttingDistanceM} />
    <p className="px-3 py-[3px] font-fw-sans text-eyebrow leading-4 text-text-secondary">
      {view === 'putting' ? 'Abstract cup · distances only' : scene ? `${scene.hole.completeness === 'reviewed_surfaces' ? 'Reviewed' : 'Partial'} outline · ${scene.attribution.split(' · ')[0]}` : 'Schematic context · no mapped position'}
    </p>
    {children}
  </div>;
}

function Drawing({ scene, view, context, events, selectedShotNumber, currentPuttingDistanceM, expanded = false }: {
  scene?: HoleScene | null; view: SceneView; context: 'entry' | 'review'; events: readonly ShotEvidence[];
  selectedShotNumber?: number; currentPuttingDistanceM?: number | null; expanded?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 320, height: context === 'entry' ? 160 : 310 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(entries => {
      const r = entries[0]?.contentRect;
      if (r && r.width > 32 && r.height > 32) setSize({ width: r.width, height: r.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const camera = scene && view !== 'putting' ? sceneCamera(scene, size.width, size.height, context === 'entry' ? 'compact' : 'review', view) : null;
  const transformed = camera && expanded ? { ...camera, scale: camera.scale * zoom,
    translation: [size.width / 2 + (camera.translation[0] - size.width / 2) * zoom + pan.x,
      size.height / 2 + (camera.translation[1] - size.height / 2) * zoom + pan.y] as const } : camera;
  const putt = events.find(e => e.shotNumber === selectedShotNumber && e.shotType === 'putting') ?? events.find(e => e.shotType === 'putting');
  const before = currentPuttingDistanceM ?? putt?.before.valueM ?? null;
  const after = currentPuttingDistanceM != null ? null : putt?.after.valueM ?? null;
  return <>
    <div ref={ref} data-slot="course-drawing" className="relative w-full overflow-clip" style={{ height: expanded ? 'min(56dvh, 560px)' : context === 'entry' ? 160 : 310 }}>
      {view === 'putting' ? <PuttingZoom width={size.width} height={size.height} distanceView={{
        beforeFeet: before == null ? null : before / .3048, afterFeet: after == null ? null : after / .3048,
        made: currentPuttingDistanceM == null && putt?.putt.made === true,
        rolledOff: putt != null && putt.result !== 'green' && putt.result !== 'hole',
      }} /> : scene && transformed ? <CourseHoleScene scene={scene} width={size.width} height={size.height}
        mode={context === 'entry' ? 'compact' : 'review'} view={view} selectedShotNumber={selectedShotNumber} camera={transformed} /> : <UnavailableCourseContext />}
    </div>
    {expanded && view !== 'putting' && scene && <div className="mt-2 flex flex-wrap items-center gap-1" role="group" aria-label="Zoom and pan">
      <Button size="sm" variant="secondary" aria-label="Zoom in" disabled={zoom >= 4} onClick={() => setZoom(z => Math.min(4, z * 1.4))}>+</Button>
      <Button size="sm" variant="secondary" aria-label="Zoom out" disabled={zoom <= 1} onClick={() => setZoom(z => Math.max(1, z / 1.4))}>−</Button>
      {(['left', 'up', 'down', 'right'] as const).map(direction => <Button size="sm" variant="ghost" key={direction} aria-label={`Pan ${direction}`}
        onClick={() => setPan(p => ({ x: p.x + (direction === 'left' ? 40 : direction === 'right' ? -40 : 0), y: p.y + (direction === 'up' ? 40 : direction === 'down' ? -40 : 0) }))}>
        {{ left: '←', up: '↑', down: '↓', right: '→' }[direction]}
      </Button>)}
      <Button size="sm" variant="ghost" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}>Reset view</Button>
    </div>}
  </>;
}
