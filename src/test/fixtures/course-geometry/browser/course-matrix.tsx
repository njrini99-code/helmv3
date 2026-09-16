/** Real-course verification only. Never shipped as an authenticated route. */
import { useEffect, useState } from 'react';
import { HoleSceneFrame } from '@/components/golf/course-geometry/HoleSceneFrame';
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
  return <main className="font-fw-sans" data-matrix-course={course} data-matrix-hole={holeNumber} data-source-quality={JSON.stringify(mesh.renderProfile)}>
    <HoleSceneFrame key={hole.key} scene={scene} context="review" />
  </main>;
}
