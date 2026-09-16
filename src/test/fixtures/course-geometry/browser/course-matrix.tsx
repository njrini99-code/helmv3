/** Real-course verification only. Never shipped as an authenticated route. */
import { useEffect, useState } from 'react';
import { HoleSceneFrame } from '@/components/golf/course-geometry/HoleSceneFrame';
import { TERRAIN_DEBUG_VIEWS } from '@/components/golf/course-geometry/terrain-debug';
import { buildHoleScene } from '@/lib/golf/course-geometry/build-scene';
import type { TerrainMesh } from '@/lib/golf/course-geometry/terrain';
import { compiledCourses, loadCompiledFixture, type CompiledCourse } from './fixture-assets';

export function CourseMatrixFixture({ course, holeNumber }: { course: CompiledCourse; holeNumber: number }) {
  const [mesh, setMesh] = useState<TerrainMesh | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const pkg = compiledCourses[course].pkg;
  const hole = pkg.holes.find(h => h.ordinal === holeNumber);
  useEffect(() => {
    const controller = new AbortController();
    if (!hole) return;
    loadCompiledFixture(hole.key, controller.signal, course).then(value => { if (!controller.signal.aborted) setMesh(value); })
      .catch(error => { if (!controller.signal.aborted) setFailure(String(error)); });
    return () => controller.abort();
  }, [hole, course]);
  if (!hole || failure) return <p role="alert">{failure ?? 'Unknown hole'}</p>;
  if (!mesh) return <p role="status">Loading source terrain</p>;
  const scene = buildHoleScene(pkg, hole.key, [], mesh);
  // `debug=<view>` swaps in a faceting diagnostic (Meridian §14) for captures.
  const debugView = TERRAIN_DEBUG_VIEWS.find(mode => mode === new URLSearchParams(location.search).get('debug'));
  return <main className="font-fw-sans" data-matrix-course={course} data-matrix-hole={holeNumber} data-source-quality={JSON.stringify(mesh.renderProfile)}>
    <HoleSceneFrame key={hole.key} scene={scene} context="review" debugView={debugView} />
  </main>;
}
