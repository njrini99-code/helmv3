import { FairwayDashboardShell } from '@/app/golf/(dashboard)/FairwayDashboardShell';
import { HoleSceneFrame } from '@/components/golf/course-geometry/HoleSceneFrame';
import { buildHoleScene } from '@/lib/golf/course-geometry/build-scene';
import { parseGeometryPackage } from '@/lib/golf/course-geometry/schema';
import bryan from '../bryan-study.json';
import cardinal from '../cardinal-study.json';

/** Internal source acceptance view, never a playable course or round binding. */
export function SourceStudy({ course }: { course: 'bryan' | 'cardinal' }) {
  const pkg = parseGeometryPackage(course === 'bryan' ? bryan : cardinal);
  const scene = buildHoleScene(pkg, pkg.holes[0]!.key);
  return <FairwayDashboardShell userData={{ role: 'player', userId: 'local-fixture', name: 'Local review', teamId: 'local-team', teamName: 'GolfHelm' }}>
    <main className="mx-auto max-w-3xl px-4 py-5 font-fw-sans">
      <p className="text-caption text-text-secondary">Local source review</p>
      <h1 className="mb-2 font-fw-display text-h2 font-semibold">{course === 'bryan' ? 'Bryan Park' : 'The Cardinal'}</h1>
      <p className="mb-4 text-body-sm text-text-secondary">Unassigned green complex. Hole routing and current boundaries need review.</p>
      <div className="overflow-hidden rounded-card border border-border bg-surface">
        <HoleSceneFrame scene={scene} context="review" defaultView="green" />
      </div>
      <p className="mt-4 text-caption text-text-secondary">Compared with native six-inch NC imagery, February 2022. {course === 'bryan' ? 'The course reports bunker renovations; this outline is not accepted as current.' : 'Fairway, tee and hole numbering are unresolved.'}</p>
      <p className="mt-3 text-caption text-text-secondary">No ball or pin placement. No terrain inferred from the photograph.</p>
    </main>
  </FairwayDashboardShell>;
}
