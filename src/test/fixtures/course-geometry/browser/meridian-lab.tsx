/** Meridian render-quality lab (master plan §94–95). Internal harness route
 * only (`?lab=1&course=…&hole=…`); never an authenticated player screen.
 * Every control changes the camera, a diagnostic material or the viewport.
 * None of them edits geometry, evidence or the geometry package. */
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/fairway/controls/button';
import { NativeSelect } from '@/components/ui/native-select';
import { CourseTerrainCanvas } from '@/components/golf/course-geometry/CourseTerrainCanvas';
import { TERRAIN_DEBUG_LABELS, TERRAIN_DEBUG_VIEWS, type TerrainDebugView } from '@/components/golf/course-geometry/terrain-debug';
import { buildHoleScene } from '@/lib/golf/course-geometry/build-scene';
import { compileVisualArtifact, serializeVisualArtifact } from '@/lib/golf/course-geometry/visual-artifact';
import type { MeridianStyleOverrides } from '@/lib/golf/course-geometry/visual-style';

const STYLE_LAYERS = ['macro', 'micro', 'mowing', 'boundary', 'context', 'crowns', 'mass', 'water', 'haze', 'shade'] as const;
import type { CourseView } from '@/lib/golf/course-geometry/camera';
import { PERSPECTIVE_FOV, TERRAIN_PRESETS, type TerrainMesh, type TerrainPose, type TerrainPreset } from '@/lib/golf/course-geometry/terrain';
import { fitTerrainViewportCamera } from '@/lib/golf/course-geometry/terrain-viewport';
import { compiledCourses, loadCompiledFixture, type CompiledCourse } from './fixture-assets';

const VIEWPORTS: Record<string, readonly [number, number]> = { phone: [390, 844], 'phone-large': [430, 932], tablet: [768, 1024], desktop: [1440, 1000] };
const AREAS: readonly CourseView[] = ['hole', 'approach', 'green'];
const PRESETS: readonly TerrainPreset[] = ['top', 'terrain', 'side'];
const number = (value: string | null, fallback: number, min: number, max: number) => {
  const parsed = Number(value);
  return value != null && Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
};

export function MeridianLabFixture({ course }: { course: CompiledCourse }) {
  const params = new URLSearchParams(location.search);
  const pkg = compiledCourses[course].pkg;
  const [holeNumber, setHoleNumber] = useState(number(params.get('hole'), 7, 1, 18));
  const [area, setArea] = useState<CourseView>(AREAS.find(a => a === params.get('area')) ?? 'hole');
  const initialPreset = PRESETS.find(p => p === params.get('preset')) ?? 'terrain';
  const [preset, setPreset] = useState<TerrainPreset>(initialPreset);
  const [pose, setPose] = useState<Required<TerrainPose>>(() => {
    const base = TERRAIN_PRESETS[initialPreset];
    return { pitch: number(params.get('pitch'), base.pitch, 20, 90), yawOffset: number(params.get('yaw'), base.yawOffset, -45, 45),
      exaggeration: number(params.get('relief'), base.exaggeration, 1, 1.5),
      projection: params.get('projection') === 'orthographic' ? 'orthographic' : params.get('projection') === 'perspective' ? 'perspective' : base.projection ?? 'orthographic',
      fovDegrees: number(params.get('fov'), base.fovDegrees ?? 32, PERSPECTIVE_FOV.min, PERSPECTIVE_FOV.max) };
  });
  const [zoom, setZoom] = useState(number(params.get('zoom'), 1, .5, 4));
  const [debugView, setDebugView] = useState<TerrainDebugView>(TERRAIN_DEBUG_VIEWS.find(mode => mode === params.get('debug')) ?? 'final');
  const [viewport, setViewport] = useState(Object.keys(VIEWPORTS).find(key => key === params.get('viewport')) ?? 'phone');
  // Material amplitude multipliers (§95): 0 isolates a layer away, >1 exaggerates it for review.
  const [overrides, setOverrides] = useState<Required<MeridianStyleOverrides>>(() => Object.fromEntries(STYLE_LAYERS.map(layer =>
    [layer, number(params.get(layer), 1, 0, 4)])) as Required<MeridianStyleOverrides>);
  const [mesh, setMesh] = useState<TerrainMesh | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [telemetry, setTelemetry] = useState<Record<string, string>>({});
  const hole = pkg.holes.find(h => h.ordinal === holeNumber);
  useEffect(() => {
    if (!hole) return;
    const controller = new AbortController();
    setMesh(null);
    loadCompiledFixture(hole.key, controller.signal, course).then(value => { if (!controller.signal.aborted) setMesh(value); })
      .catch(error => { if (!controller.signal.aborted) setFailure(String(error)); });
    return () => controller.abort();
  }, [hole, course]);
  useEffect(() => {
    // Keep the URL scriptable: a capture can reproduce any lab state by link.
    const next = new URLSearchParams({ lab: '1', course, hole: String(holeNumber), area, preset, pitch: String(pose.pitch), yaw: String(pose.yawOffset),
      relief: String(pose.exaggeration), projection: pose.projection, fov: String(pose.fovDegrees), zoom: String(zoom), debug: debugView, viewport,
      ...Object.fromEntries(STYLE_LAYERS.filter(layer => overrides[layer] !== 1).map(layer => [layer, String(overrides[layer])])) });
    history.replaceState(null, '', `?${next}`);
  }, [course, holeNumber, area, preset, pose, zoom, debugView, viewport, overrides]);
  useEffect(() => {
    const timer = setInterval(() => {
      const canvas = document.querySelector<HTMLCanvasElement>('[data-slot=lab-stage] canvas');
      if (!canvas) return;
      const next = { ...canvas.dataset } as Record<string, string>;
      setTelemetry(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
    }, 250);
    return () => clearInterval(timer);
  }, []);
  const [width, height] = VIEWPORTS[viewport]!;
  const scene = useMemo(() => hole && mesh ? buildHoleScene(pkg, hole.key, [], mesh) : null, [pkg, hole, mesh]);
  useEffect(() => {
    // Lab-only: expose the compiled visual world so a capture script can diff
    // it against the Node compiler (§96 determinism across engines).
    if (!scene || !mesh) return;
    (window as unknown as { meridianArtifact?: string }).meridianArtifact = serializeVisualArtifact(compileVisualArtifact(scene, mesh));
  }, [scene, mesh]);
  let camera = null, cameraError: string | null = null;
  if (scene && mesh) {
    try { camera = fitTerrainViewportCamera(scene, mesh, area, width, height, pose, zoom, [0, 0], preset); }
    catch (error) { cameraError = String(error); }
  }
  const applyPreset = (next: TerrainPreset) => {
    const base = TERRAIN_PRESETS[next];
    setPreset(next);
    setPose({ pitch: base.pitch, yawOffset: base.yawOffset, exaggeration: base.exaggeration, projection: base.projection ?? 'orthographic', fovDegrees: base.fovDegrees ?? 32 });
    setZoom(1);
  };
  const stageScale = Math.min(1, (window.innerWidth - 360) / width, (window.innerHeight - 24) / height);
  const field = (label: string, control: React.ReactNode) => <label className="flex items-center justify-between gap-2 text-caption"><span>{label}</span>{control}</label>;
  const range = (label: string, value: number, min: number, max: number, step: number, onChange: (value: number) => void) =>
    field(`${label} ${value}`, <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))} aria-label={label} />);
  return <main className="flex min-h-screen font-fw-sans text-text-primary" data-slot="meridian-lab" style={{ background: '#1E2420', color: '#E8EDE6' }}>
    <aside className="flex w-[340px] shrink-0 flex-col gap-2 overflow-y-auto p-3" aria-label="Meridian inspector">
      <h1 className="font-fw-display text-body-lg font-semibold">Meridian lab</h1>
      <p className="text-eyebrow">{pkg.name} · package {pkg.contentHash.slice(0, 8)}</p>
      {field('Hole', <NativeSelect value={holeNumber} onChange={e => setHoleNumber(Number(e.target.value))} aria-label="Hole">{pkg.holes.map(h => <option key={h.key} value={h.ordinal}>{h.ordinal}</option>)}</NativeSelect>)}
      {field('Area', <NativeSelect value={area} onChange={e => setArea(e.target.value as CourseView)} aria-label="Area">{AREAS.map(a => <option key={a} value={a}>{a}</option>)}</NativeSelect>)}
      {field('Preset', <span className="flex gap-1">{PRESETS.map(p => <Button key={p} size="sm" variant={preset === p ? 'secondary' : 'ghost'} aria-pressed={preset === p} onClick={() => applyPreset(p)}>{p}</Button>)}</span>)}
      {field('Projection', <NativeSelect value={pose.projection} onChange={e => setPose({ ...pose, projection: e.target.value as 'orthographic' | 'perspective' })} aria-label="Projection"><option value="orthographic">orthographic</option><option value="perspective">perspective</option></NativeSelect>)}
      {range('FOV', pose.fovDegrees, PERSPECTIVE_FOV.min, PERSPECTIVE_FOV.max, .5, v => setPose({ ...pose, fovDegrees: v }))}
      {range('Pitch', pose.pitch, 20, 90, 1, v => setPose({ ...pose, pitch: v }))}
      {range('Yaw', pose.yawOffset, -45, 45, 1, v => setPose({ ...pose, yawOffset: v }))}
      {range('Relief', pose.exaggeration, 1, 1.5, .05, v => setPose({ ...pose, exaggeration: v }))}
      {range('Zoom', zoom, .5, 4, .1, setZoom)}
      {field('Debug view', <NativeSelect value={debugView} onChange={e => setDebugView(e.target.value as TerrainDebugView)} aria-label="Debug view">{TERRAIN_DEBUG_VIEWS.map(mode => <option key={mode} value={mode}>{TERRAIN_DEBUG_LABELS[mode]} ({mode})</option>)}</NativeSelect>)}
      {field('Viewport', <NativeSelect value={viewport} onChange={e => setViewport(e.target.value)} aria-label="Viewport">{Object.entries(VIEWPORTS).map(([key, [w, h]]) => <option key={key} value={key}>{key} {w}×{h}</option>)}</NativeSelect>)}
      <h2 className="mt-2 text-caption font-semibold">Material / vegetation layers ×</h2>
      {STYLE_LAYERS.map(layer => range(layer, overrides[layer], 0, 4, .25, v => setOverrides({ ...overrides, [layer]: v })))}
      <h2 className="mt-2 text-caption font-semibold">Telemetry</h2>
      <dl className="grid grid-cols-[auto_1fr] gap-x-2 text-eyebrow" data-slot="lab-telemetry">
        {Object.entries(telemetry).sort().map(([key, value]) => <div key={key} className="contents"><dt className="opacity-70">{key}</dt><dd className="truncate">{value}</dd></div>)}
      </dl>
      {camera?.framing && <p className="text-eyebrow opacity-70">fit {camera.framing.projection} · fov {camera.framing.fovDegrees?.toFixed(1) ?? '—'} · eye {camera.framing.eyeDistanceM?.toFixed(0) ?? '—'} m · target {camera.framing.targetBasis} · occupancy {(camera.framing.occupancy.area * 100).toFixed(0)}%</p>}
      {(failure || cameraError) && <p role="alert" className="text-caption" style={{ color: '#F4B183' }}>{failure ?? cameraError}</p>}
    </aside>
    <section className="flex-1 overflow-hidden p-3" aria-label="Lab stage">
      <div data-slot="lab-stage" style={{ width, height, transform: `scale(${stageScale})`, transformOrigin: 'top left', position: 'relative', background: '#607D3D' }}>
        {scene && mesh && camera && <CourseTerrainCanvas key={`${hole?.key}:${debugView}`} scene={scene} mesh={mesh} camera={camera} width={width} height={height} debugView={debugView} styleOverrides={overrides}
          fallback={<p role="status" className="p-3">Loading terrain</p>} />}
        {!mesh && !failure && <p role="status" className="p-3">Loading source terrain</p>}
      </div>
    </section>
  </main>;
}
