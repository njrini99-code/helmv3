/** Fixed export camera: comparison harness, never a player route. */
import { CourseHoleScene } from '@/components/golf/course-geometry/CourseHoleScene';
import { buildHoleScene } from '@/lib/golf/course-geometry/build-scene';
import { fitTerrainCamera, parseTerrainMesh, TERRAIN_PRESETS, type TerrainPreset } from '@/lib/golf/course-geometry/terrain';
import { pilotPackage } from '../pilot';
import terrainData from '../cacapon-07-terrain.json';

export function TerrainExportFixture({ preset }: { preset: TerrainPreset }) {
  const mesh = parseTerrainMesh(terrainData, pilotPackage);
  const scene = buildHoleScene(pilotPackage, 'cacapon-07', [], mesh);
  return <div style={{ width: 620, height: 480 }}>
    <CourseHoleScene scene={scene} width={620} height={480}
      terrainCamera={fitTerrainCamera(scene, mesh, 'hole', 620, 480, TERRAIN_PRESETS[preset])} />
  </div>;
}
