/**
 * Bridge Premium Phase 3 — Evidence Braid for `/admin/reliability`.
 *
 * One lane per evidence source, bucketed over time, for the selected
 * feature. A bucket where several lanes read ✓ together is the brief's
 * "converging signals become a correlation cluster" — highlighted, not
 * computed further; the correlation IS the corroboration already present in
 * `buildEvidenceCoverage`'s per-bucket cells.
 *
 * `to be replaced by premium/<name>` — no shared `src/components/admin/
 * premium/*` timeline-lanes primitive existed on `agent/bridge-premium-p1`
 * as of this PR (branch not yet pushed).
 */
import { EVIDENCE_COVERAGE_SOURCE_LABEL, type CoverageMark } from '@/lib/admin/incidents/coverage';
import type { EvidenceBraidView } from '@/lib/admin/triage/evidence-braid';
import { LocalTime } from '@/app/admin/_components/LocalTime';

const MARK_CLASS: Record<CoverageMark, string> = {
  check: 'bg-fw-success-ink',
  question: 'bg-fw-warning-ink',
  blind: 'bg-fw-danger-ink',
};

const MARK_TITLE: Record<CoverageMark, string> = {
  check: 'read cleanly',
  question: 'partial or never attempted',
  blind: 'could not be read',
};

export function EvidenceBraidTimeline({ view }: { view: EvidenceBraidView }) {
  if (view.points.length === 0) return null;

  return (
    <div>
      <div className="space-y-1.5">
        {Object.keys(EVIDENCE_COVERAGE_SOURCE_LABEL).map((source) => (
          <div key={source} className="flex items-center gap-2">
            <span className="w-28 shrink-0 truncate text-caption text-warm-500">
              {EVIDENCE_COVERAGE_SOURCE_LABEL[source as keyof typeof EVIDENCE_COVERAGE_SOURCE_LABEL]}
            </span>
            <div className="flex min-w-0 flex-1 gap-0.5">
              {view.points.map((point, i) => {
                const cell = point.cells.find((c) => c.source === source)!;
                const converging = point.present >= 3;
                return (
                  <span
                    key={i}
                    title={`${MARK_TITLE[cell.mark]}${cell.reason ? ` — ${cell.reason}` : ''}${
                      converging ? ' — correlation cluster' : ''
                    }`}
                    className={`h-4 flex-1 rounded-sm ${MARK_CLASS[cell.mark]} ${
                      converging ? 'ring-2 ring-fw-accent-ink ring-offset-1' : 'opacity-70'
                    }`}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between text-caption text-warm-400">
        <span>
          <LocalTime iso={new Date(view.windowStartMs).toISOString()} variant="datetime" />
        </span>
        <span>
          <LocalTime iso={new Date(view.windowEndMs).toISOString()} variant="datetime" />
        </span>
      </div>
      {view.flightRecorderBlind ? (
        <p className="mt-2 text-caption text-fw-danger-ink">
          Flight Recorder could not be read this refresh — its lane reads blind board-wide, not zero.
        </p>
      ) : null}
    </div>
  );
}
