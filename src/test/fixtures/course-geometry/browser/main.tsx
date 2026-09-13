import { createRoot } from 'react-dom/client';
import { useEffect, useState } from 'react';
import '@/app/globals.css';
import '@/styles/design-tokens.css';
import './fonts.css';
import { CapacitorProvider } from '@/components/providers/CapacitorProvider';
import { FairwayDashboardShell } from '@/app/golf/(dashboard)/FairwayDashboardShell';
import FairwayShotTracking from '@/components/fairway/pages/rounds-tracking/FairwayShotTracking';
import { ReviewHero } from '@/components/golf/coachhelm/round-review/ReviewHero';
import type { ReviewShotInput } from '@/components/golf/coachhelm/round-review/round-review-shots';
import type { ShotRecord, RoundHole } from '@/lib/types/golf';
import { addInteractivePreviewTrajectories, pilotPackage, pilotShots } from '../pilot';
import terrainData from '../cacapon-07-terrain.json';
import { parseTerrainMesh } from '@/lib/golf/course-geometry/terrain';
import { normalizeLiveShot } from '@/lib/golf/course-geometry/normalize';
import { TerrainExportFixture } from './terrain-export';
import winchesterData from '../winchester.json';
import winchesterTerrainData from '../winchester-07-terrain.json';
import { parseGeometryPackage } from '@/lib/golf/course-geometry/schema';
import { SourceStudy } from './source-study';
import { CourseMatrixFixture } from './course-matrix';
import { loadCompiledFixture } from './fixture-assets';

const params = new URLSearchParams(location.search);
const winchester = params.get('course') === 'winchester';
const currentPackage = winchester ? parseGeometryPackage(winchesterData) : pilotPackage;
const terrain = parseTerrainMesh(winchester ? winchesterTerrainData : terrainData, currentPackage);
const geometry = { package: currentPackage, holeKeys: currentPackage.holes.map(h => h.key), terrainByHole: { [terrain.physicalHoleKey]: terrain },
  ...(!winchester ? { decorateScene: addInteractivePreviewTrajectories } : {}) };
const holes: RoundHole[] = currentPackage.holes.map(h => {
  if (h.scorecardYards == null) throw new Error('Pilot scorecard yardage required');
  return { number: h.ordinal, par: h.par, yardage: h.scorecardYards, score: null };
});
const ledger: ShotRecord[] = [
  { ...pilotShots[0]!, distanceToHoleBefore: holes[6]!.yardage, distanceToHoleAfter: 158 },
  { ...pilotShots[1]!, distanceToHoleBefore: 158, distanceToHoleAfter: 17, missDirection: 'short_right', approachMissDirection: 'short_right' },
  { shotNumber: 3, shotType: 'around_green', clubType: 'non_driver', lieBefore: 'sand', distanceToHoleBefore: 17, distanceUnitBefore: 'yards', result: 'green', distanceToHoleAfter: 12, distanceUnitAfter: 'feet', shotDistance: 13, isPenalty: false },
  { shotNumber: 4, shotType: 'putting', clubType: 'putter', lieBefore: 'green', distanceToHoleBefore: 12, distanceUnitBefore: 'feet', result: 'green', distanceToHoleAfter: 2, distanceUnitAfter: 'feet', shotDistance: 3.3, isPenalty: false, puttBreak: 'left_to_right', puttSlope: 'level', puttMissTags: ['short', 'low'] },
  { shotNumber: 5, shotType: 'putting', clubType: 'putter', lieBefore: 'green', distanceToHoleBefore: 2, distanceUnitBefore: 'feet', result: 'hole', distanceToHoleAfter: 0, distanceUnitAfter: 'feet', shotDistance: .66, isPenalty: false, puttBreak: 'straight', puttSlope: 'level' },
];
const scenario = params.get('case') ?? 'tee';
const review = location.pathname.endsWith('/review');
const count = scenario === 'tee' ? 0 : scenario === 'approach' ? 1 : scenario === 'putting' ? 3 : 2;
const initial = ledger.slice(0, count);
if (scenario === 'ambiguous') { initial[1] = { ...initial[1]!, missDirection: undefined, approachMissDirection: undefined }; }
if (scenario === 'rolloff') ledger[3] = { ...ledger[3]!, result: 'rough', distanceToHoleAfter: 7, distanceUnitAfter: 'yards' };
if (scenario === 'penalty') initial.push({ shotNumber: 3, shotType: 'penalty', clubType: 'non_driver', lieBefore: 'rough', distanceToHoleBefore: 17, distanceUnitBefore: 'yards', result: 'penalty', distanceToHoleAfter: 22, distanceUnitAfter: 'yards', shotDistance: 0, isPenalty: true, penaltyType: 'water' });
const shotsByHole = new Map<number, ReviewShotInput[]>([[7, ledger.map(s => ({
  shot_number: s.shotNumber, shot_type: s.shotType, lie_before: s.lieBefore, lie_after: s.result,
  result: s.result, distance_to_hole_before: s.distanceToHoleBefore, distance_to_hole_after: s.distanceToHoleAfter,
  distance_unit_before: s.distanceUnitBefore, distance_unit_after: s.distanceUnitAfter,
  shot_distance: s.shotDistance, miss_direction: s.approachMissDirection ?? s.missDirection,
  is_penalty: s.isPenalty, putt_break: s.puttBreak, putt_slope: s.puttSlope, putt_made: s.result === 'hole', miss_tags: s.puttMissTags,
}))]]);
const filmstripHoles = holes.map(h => ({ n: h.number, par: h.par, score: h.number === 7 ? 5 : h.par, note: '' }));
const holeMeta = new Map(holes.map(h => [h.number, { par: h.par, yardage: h.yardage, score: h.number === 7 ? 5 : h.par }]));

function Screens() {
  const [saved, setSaved] = useState<ShotRecord[]>(initial);
  const [activeGeometry, setActiveGeometry] = useState(geometry);
  const [compiledState, setCompiledState] = useState(winchester ? 'not-applicable' : 'loading');
  useEffect(() => {
    if (winchester) return;
    const controller = new AbortController();
    loadCompiledFixture('cacapon-07', controller.signal).then(mesh => {
      if (!controller.signal.aborted) {
        setActiveGeometry({ ...geometry, terrainByHole: { [mesh.physicalHoleKey]: mesh } });
        setCompiledState('ready');
      }
    }).catch(() => { if (!controller.signal.aborted) setCompiledState('unavailable'); });
    return () => controller.abort();
  }, []);
  return <FairwayDashboardShell userData={{ role: 'player', userId: 'local-fixture', name: 'Local review', teamId: 'local-team', teamName: 'GolfHelm' }}>
    {review ? <main className="mx-auto max-w-5xl px-4 py-5 font-fw-sans">
      <h1 className="mb-4 font-fw-display text-h2 font-semibold">Round Review</h1>
      <ReviewHero geometry={scenario === 'missing' ? undefined : activeGeometry} totalScore={73} scoreToPar={1} courseDateLine={`${currentPackage.name} · Local example`} grade={{ score: 4, label: 'Solid round' }} mixLine="13 pars · 2 birdies · 3 bogeys" filmstripHoles={filmstripHoles} holeMeta={holeMeta} shotsByHole={shotsByHole} />
      <p className="mt-6 text-caption text-text-secondary">Local fixture. Course and event accuracy review is still pending.</p>
    </main> : <><p role="status" data-interactive-preview-notice className="mx-4 mt-3 rounded-control border border-border-subtle bg-surface px-3 py-2 font-fw-sans text-caption text-text-secondary">
      Interactive preview only. Flight trails are illustrative and this page saves nothing.
    </p><FairwayShotTracking holes={holes} currentHoleIndex={6} initialShots={initial} initialShotNumber={initial.length + 1}
      geometry={scenario === 'missing' ? undefined : activeGeometry} autoSaveDisabled onHoleComplete={async () => true}
      onSaveShot={s => setSaved(list => [...list, s])} onAutoSave={async s => setSaved(s)} onExit={() => {}} /></>}
    <CapacitorProvider />
    <output hidden data-compiled-state={compiledState} data-fixture-ledger={JSON.stringify(saved.map(normalizeLiveShot))} />
  </FairwayDashboardShell>;
}
const exportPreset = params.get('export');
const sourceStudy = params.get('study');
createRoot(document.getElementById('root')!).render(params.has('matrix') ? <CourseMatrixFixture holeNumber={Number(params.get('hole') ?? 7)} /> : sourceStudy === 'bryan' || sourceStudy === 'cardinal'
  ? <SourceStudy course={sourceStudy} /> : exportPreset === 'top' || exportPreset === 'terrain' || exportPreset === 'side'
    ? <TerrainExportFixture preset={exportPreset} /> : <Screens />);
