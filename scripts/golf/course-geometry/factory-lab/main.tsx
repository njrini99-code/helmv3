import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@/app/globals.css';
import '@/styles/design-tokens.css';
import { CourseHoleScene } from '@/components/golf/course-geometry/CourseHoleScene';
import { buildHoleScene } from '@/lib/golf/course-geometry/build-scene';
import { fitTerrainCamera, TERRAIN_PRESETS, type TerrainPreset } from '@/lib/golf/course-geometry/terrain';
import { loadFactoryHole } from './loader';

const params = new URLSearchParams(location.search);
const layout = params.get('layout') ?? '', bundle = params.get('bundle') ?? '', initialHole = params.get('hole') ?? '';
function FactoryLab() {
  const [holeKey, setHoleKey] = useState(initialHole);
  const [loaded, setLoaded] = useState<Awaited<ReturnType<typeof loadFactoryHole>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preset, setPreset] = useState<TerrainPreset>(params.get('view') === 'top' ? 'top' : params.get('view') === 'side' ? 'side' : 'terrain');
  const [size, setSize] = useState({ width: innerWidth, height: Math.max(320, innerHeight - 190) });
  useEffect(() => { const resize = () => setSize({ width: innerWidth, height: Math.max(320, innerHeight - 190) }); addEventListener('resize', resize); return () => removeEventListener('resize', resize); }, []);
  useEffect(() => {
    const controller = new AbortController(); setLoaded(null); setError(null);
    loadFactoryHole(layout, bundle, holeKey, controller.signal).then(value => { if (!controller.signal.aborted) setLoaded(value); })
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause)); });
    return () => controller.abort();
  }, [holeKey]);
  if (error) return <main className="p-6"><h1>Factory bundle unavailable</h1><p role="alert">{error}</p><p>No fallback course has been loaded.</p></main>;
  if (!loaded) return <p role="status" className="p-6">Loading immutable factory bundle…</p>;
  const { manifest, pkg, mesh, context, hole, assetBase } = loaded;
  const scene = buildHoleScene(pkg, holeKey, [], mesh, context);
  const camera = fitTerrainCamera(scene, mesh, 'hole', size.width, size.height, TERRAIN_PRESETS[preset]);
  const updateHole = (value: string) => { const url = new URL(location.href); url.searchParams.set('hole', value); history.replaceState(null, '', url); setHoleKey(value); };
  return <main data-factory-bundle={bundle} data-package-hash={pkg.contentHash} data-mesh-hash={mesh.contentHash}
    data-admission-hash={manifest.admission.report?.sha256 ?? 'unassessed'} data-factory-state="ready" className="font-fw-sans">
    <header className="flex flex-wrap items-center gap-3 p-3"><h1 className="font-semibold">{pkg.name}</h1>
      <label>Hole <select aria-label="Physical hole" value={holeKey} onChange={event => updateHole(event.target.value)}>
        {manifest.holes.map(item => <option key={item.key} value={item.key}>{item.ordinal} · {item.key}</option>)}</select></label>
      <span>Local candidate · physical approval pending</span>
      {hole.glb && <a href={`${assetBase}${hole.glb.sha256}`} download={`${holeKey}.glb`}>Download retained GLB</a>}
    </header>
    <CourseHoleScene key={`${holeKey}:${preset}`} scene={scene} width={size.width} height={size.height}
      terrainCamera={camera} world="v2" showIllustrativeFlightPreviews={false} />
    <footer className="p-3"><div className="flex gap-3">{(['terrain', 'top', 'side'] as const).map(view =>
      <button key={view} type="button" aria-pressed={preset === view} onClick={() => setPreset(view)}>{view}</button>)}</div>
      <details><summary>Exact build evidence · measurement disabled</summary>
        <dl style={{ overflowWrap: 'anywhere', fontSize: 12 }}><dt>Bundle</dt><dd>{bundle}</dd><dt>Package</dt><dd>{pkg.contentHash}</dd>
          <dt>Terrain mesh</dt><dd>{mesh.contentHash}</dd><dt>GLB</dt><dd>{hole.glb?.sha256 ?? (hole.worldRecordStatus === 'different_package' ? 'Unavailable: Blender artifact belongs to another package' : 'Not retained')}</dd>
          <dt>Admission version</dt><dd>{manifest.admission.version ?? 'Unassessed'}</dd><dt>Admission report hash</dt><dd>{manifest.admission.report?.sha256 ?? 'Unassessed'}</dd></dl>
      </details><p className="text-caption">{scene.attribution}</p></footer>
  </main>;
}
createRoot(document.getElementById('root')!).render(<FactoryLab />);
