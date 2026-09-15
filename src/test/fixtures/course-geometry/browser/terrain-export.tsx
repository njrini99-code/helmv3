/** Fixed export camera: comparison harness, never a player route. */
import { useEffect, useState } from 'react';
import { CourseTerrainCanvas } from '@/components/golf/course-geometry/CourseTerrainCanvas';
import { TERRAIN_DEBUG_VIEWS } from '@/components/golf/course-geometry/terrain-debug';
import frozenCamera from '../diagnostic-camera.json';
import { CourseHoleScene } from '@/components/golf/course-geometry/CourseHoleScene';
import { buildHoleScene } from '@/lib/golf/course-geometry/build-scene';
import { fitTerrainCamera, parseTerrainMesh, TERRAIN_PRESETS, type TerrainMesh, type TerrainPreset } from '@/lib/golf/course-geometry/terrain';
import { pilotPackage } from '../pilot';
import terrainData from '../cacapon-07-terrain.json';
import sourceNormalDiagnostic from '../diagnostic-source-normals.json';
import { loadCompiledFixture } from './fixture-assets';

export function TerrainExportFixture({ preset }: { preset: TerrainPreset }) {
  const query = new URLSearchParams(location.search);
  const compiledRequested = query.get('asset') === 'compiled';
  const [compiled, setCompiled] = useState<TerrainMesh | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  useEffect(() => {
    if (!compiledRequested) return;
    const controller = new AbortController();
    loadCompiledFixture('cacapon-07', controller.signal).then(mesh => { if (!controller.signal.aborted) setCompiled(mesh); })
      .catch(error => { if (!controller.signal.aborted) setFailure(String(error)); });
    return () => controller.abort();
  }, [compiledRequested]);
  if (failure) return <p role="alert">{failure}</p>;
  if (compiledRequested && !compiled) return <p role="status">Loading compiled scene</p>;
  const sourceMesh = parseTerrainMesh(terrainData, pilotPackage);
  // A controlled diagnostic changes normals alone; every source vertex and
  // the frozen camera remain identical to the old Hole 7 package.
  const mesh = compiled ?? (query.get('normals') === 'source' ? { ...sourceMesh, sourceNormals: sourceNormalDiagnostic.sourceNormals } : sourceMesh);
  const scene = buildHoleScene(pilotPackage, 'cacapon-07', [], mesh);
  const debugView = TERRAIN_DEBUG_VIEWS.find(mode => mode === query.get('debug'));
  if (debugView) return <div style={{ width: frozenCamera.width, height: frozenCamera.height }}>
    <CourseTerrainCanvas key={debugView} scene={scene} mesh={mesh} width={frozenCamera.width} height={frozenCamera.height}
      camera={frozenCamera.camera as unknown as ReturnType<typeof fitTerrainCamera>} debugView={debugView} fallback={null} />
  </div>;
  return <div style={{ width: 620, height: 480 }}>
    <CourseHoleScene scene={scene} width={620} height={480}
      terrainCamera={fitTerrainCamera(scene, mesh, 'hole', 620, 480, TERRAIN_PRESETS[preset])} />
  </div>;
}
