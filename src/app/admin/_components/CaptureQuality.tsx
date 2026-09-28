import { cn } from '@/lib/utils';
import {
  CAPTURE_FIELDS,
  CAPTURE_FIELD_LABEL,
  type CaptureFieldCoverage,
  type CaptureQualityReport,
  type CaptureQualityWeakSource,
} from '@/lib/admin/data/capture-quality';

/**
 * Helm Bridge — capture quality panel.
 *
 * Pure presentational: takes a computed `CaptureQualityReport` and renders
 * it, the same split `data/capture-quality.ts` <-> this component that the
 * rest of the Bridge uses (e.g. `SourceCoverage.tsx` / `sources.ts`).
 *
 * This measures how completely errors were CAPTURED, not how healthy
 * production is — a low number here is a backlog item for the call site
 * that logged thin, not an incident in its own right. The panel says that
 * once, plainly, rather than letting the numbers alone imply otherwise.
 */

/** Discrete blocks, not a smooth fill — a bar this coarse reading as
 *  continuously precise would overstate a measurement that is really just
 *  "present or absent" counted up, per row. Same reasoning ProofDots uses
 *  against a progress-bar reading as calibrated. */
const SEGMENTS = 20;

function formatPercent(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

function CaptureFieldRow({ coverage }: { coverage: CaptureFieldCoverage }) {
  const { field, total, ratio } = coverage;
  const filled = ratio === null ? 0 : Math.round(ratio * SEGMENTS);
  // Visible text carries the whole fact already (label + percent + explicit
  // denominator) — the segmented bar underneath is a redundant visual, so it
  // is marked aria-hidden rather than re-announcing the same number via a
  // second `role="img"` label a screen reader would hit twice.
  const detail = ratio === null ? 'no rows in this window' : `${formatPercent(ratio)} of ${total} rows`;

  return (
    <li className="py-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-body-sm font-medium text-warm-800">{CAPTURE_FIELD_LABEL[field]}</span>
        <span className="shrink-0 font-fw-mono text-caption tabular-nums text-warm-500">{detail}</span>
      </div>
      <div aria-hidden className="mt-1.5 flex gap-[2px]">
        {Array.from({ length: SEGMENTS }, (_, i) => (
          <span
            key={i}
            className={cn(
              'h-2 flex-1 rounded-sm',
              ratio !== null && i < filled ? 'bg-accent-600' : 'bg-warm-200',
            )}
          />
        ))}
      </div>
    </li>
  );
}

function WeakestSourceRow({ item }: { item: CaptureQualityWeakSource }) {
  return (
    <li className="py-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="min-w-0 truncate text-body-sm font-medium text-warm-800">{item.source}</span>
        <span className="shrink-0 font-fw-mono text-caption tabular-nums text-warm-500">
          {item.missing} missing · {item.rows} {item.rows === 1 ? 'row' : 'rows'}
        </span>
      </div>
      <p className="mt-0.5 truncate font-fw-mono text-caption text-warm-400" title={item.sampleTitle}>
        {item.sampleTitle}
      </p>
    </li>
  );
}

function summarizeForCaption(report: CaptureQualityReport): string {
  if (report.rows === 0) return `No rows in the last ${report.windowHours}h.`;
  const parts = report.fields.map(
    (f) => `${CAPTURE_FIELD_LABEL[f.field]} ${f.ratio === null ? 'no rows' : formatPercent(f.ratio)}`,
  );
  return `Capture quality over ${report.rows} rows, last ${report.windowHours}h: ${parts.join(', ')}.`;
}

export function CaptureQualityPanel({ report }: { report: CaptureQualityReport }) {
  const caption = summarizeForCaption(report);
  // CAPTURE_FIELDS and report.fields are always the same set, in the same
  // order (analyzeCaptureQuality maps directly over CAPTURE_FIELDS) — this
  // just keys the render off the canonical list so a field added there
  // renders here without a second edit.
  const byField = new Map(report.fields.map((f) => [f.field, f] as const));

  return (
    <section className="min-w-0 rounded-xl border border-warm-200 bg-surface p-4">
      <p className="sr-only">{caption}</p>

      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-body-sm font-semibold text-warm-900">Capture quality</h3>
        <span className="shrink-0 font-fw-mono text-caption tabular-nums text-warm-500">
          {report.rows} {report.rows === 1 ? 'row' : 'rows'} · {report.windowHours}h
        </span>
      </div>

      <ul className="mt-1 divide-y divide-warm-200/60">
        {CAPTURE_FIELDS.map((field) => {
          const coverage = byField.get(field);
          return coverage ? <CaptureFieldRow key={field} coverage={coverage} /> : null;
        })}
      </ul>

      {report.weakestSources.length > 0 ? (
        <div className="mt-4">
          <h4 className="text-eyebrow uppercase tracking-widest text-warm-500">Weakest emitters</h4>
          <ul className="mt-1 divide-y divide-warm-200/60">
            {report.weakestSources.map((item) => (
              <WeakestSourceRow key={item.source} item={item} />
            ))}
          </ul>
        </div>
      ) : null}

      <p className="mt-4 text-caption leading-5 text-warm-500">
        This measures how completely errors were captured on the way in, not how healthy production
        is — a low number is a backlog item for the call site to instrument, not an incident.
      </p>
    </section>
  );
}
