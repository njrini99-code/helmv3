import type { ReactNode } from 'react';
import { Surface } from '@/components/fairway/surfaces/surface';
import type { DiagramDistance, HoleScene } from '@/lib/golf/course-geometry/types';
import { CourseHoleScene } from './CourseHoleScene';

function unit(value: string | null) {
  return ({ yards: 'yd', feet: 'ft', meters: 'm' })[value ?? ''] ?? '(unit unknown)';
}
function recorded(distance: DiagramDistance): string {
  if (distance.originalValue == null || !Number.isFinite(distance.originalValue)) return '—';
  return `${distance.originalValue} ${unit(distance.originalUnit)}`;
}
/** Optional composition boundary for the fixture proof. App resolution is
 * Stage 4. All original controls are supplied through children unchanged. */
export function HoleSceneFrame({ scene, context, children }: {
  scene: HoleScene; context: 'review' | 'entry'; children?: ReactNode;
}) {
  const selected = scene.events.at(-1);
  const demo = scene.overlayKind === 'analytic_fixture';
  const nextType = selected?.evidence.result === 'green' ? 'Putting' : selected?.evidence.after.valueM != null && selected.evidence.after.valueM < 45.72 ? 'Around green' : 'Approach';
  const height = context === 'entry' ? 320 : 380;
  return <div className="min-w-0 space-y-3" data-scene-context={context}>
    <Surface padding="sm">
      <header className="mb-3 flex items-center justify-between gap-3 px-1 pt-1">
        <div>
          <h2 className="font-fw-display text-h2 font-semibold">{context === 'review' ? `Hole ${scene.hole.ordinal}` : `Shot ${(selected?.evidence.shotNumber ?? 0) + 1} · ${nextType}`}</h2>
          <p className="mt-1 font-fw-sans text-body-sm text-text-secondary">{context === 'review' ? `Par ${scene.hole.par} · ${scene.hole.scorecardYards ?? '—'} yd` : (selected?.evidence.result ?? 'Lie unknown').replace(/^./, c => c.toUpperCase())}</p>
        </div>
        {context === 'entry' && selected && <div className="text-right">
          <div className="font-fw-sans text-h1 font-semibold leading-none">{selected.evidence.after.originalValue ?? '—'}<span className="ml-1 text-body-sm font-normal">{unit(selected.evidence.after.originalUnit)}</span></div>
          <div className="mt-1 text-label-sm uppercase tracking-wider text-text-secondary">remaining</div>
        </div>}
      </header>
      <div className="overflow-hidden rounded-fw-md" style={{ aspectRatio: `320 / ${height}` }}>
        <CourseHoleScene scene={scene} width={320} mode={context === 'entry' ? 'compact' : 'review'} height={height} />
      </div>
      <p className="mt-2 text-center font-fw-sans text-label-sm text-text-secondary">{demo ? 'Illustrative shot positions' : 'Shot positions unresolved'} · Pin unknown</p>
    </Surface>
    {context === 'review' && selected && <Surface padding="sm">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-text-primary font-fw-sans text-h3 font-semibold">{selected.evidence.shotNumber}</span>
        <div><p className="font-fw-sans text-h3 font-semibold capitalize">{selected.evidence.result ?? 'Result unknown'}</p>
          <p className="font-fw-sans text-body-sm text-text-secondary">{recorded(selected.evidence.after)} remaining{selected.evidence.rawMiss ? ` · ${selected.evidence.rawMiss.replaceAll('_', ' ')}` : ''}</p></div>
      </div>
    </Surface>}
    {children}
    <details className="px-1 font-fw-sans text-label-sm text-text-secondary">
      <summary className="cursor-pointer py-2">Course sources &amp; shot details</summary>
      <p className="mb-2">Partial course outline. {scene.attribution}</p>
      <ol className="space-y-2" aria-label="Recorded shot evidence">
        {scene.events.map(({ evidence: e }) => <li key={e.eventKey}>
          <strong>Shot {e.shotNumber} · {e.result ?? 'Result unknown'}</strong>
          <p>{recorded(e.before)} before · {recorded(e.after)} remaining{e.rawMiss ? ` · ${e.rawMiss.replaceAll('_', ' ')}` : ''}</p>
          {e.shotType === 'putting' && <p>{[e.putt.break, e.putt.slope, ...e.putt.tags].filter(Boolean).join(' · ').replaceAll('_', ' ')}</p>}
          <p>{e.penalty ? 'Penalty stroke · origin follows the recorded event' : demo ? 'Demonstration coordinates · no player location claim' : 'Position unresolved'}</p>
        </li>)}
      </ol>
    </details>
  </div>;
}
