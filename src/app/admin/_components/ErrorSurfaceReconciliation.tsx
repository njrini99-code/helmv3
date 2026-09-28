import type { Reconciliation } from '@/lib/admin/incidents/reconciliation';
import { RECONCILIATION_ROW_LABEL, OVERALL_HEALTH_LABEL } from '@/lib/admin/incidents/reconciliation';

/**
 * Two surfaces, rendered separately, and an overall verdict that is allowed to
 * say "partial".
 *
 * The board previously showed one surface's zero as production health. On
 * 2026-08-30 `admin_events` reported 0 errors in 48h while Sentry held 12
 * unresolved issues, several last seen hours earlier — and the screen said
 * everything was fine. Both numbers were correct; the single verdict was not.
 *
 * So this renders three rows, never one, and it renders even when everything
 * agrees. That is a deliberate departure from `BlindnessBeacon`, which returns
 * null when nothing is wrong: silence is the right healthy state for a WARNING,
 * and the wrong one for a RECONCILIATION — a reader has to be able to see that
 * the two surfaces were compared at all, or "no warning" and "never checked"
 * look identical again.
 *
 * Contract: docs/OBSERVABILITY_AUTHORITY.md. Verdict logic and its tests:
 * src/lib/admin/incidents/reconciliation.ts.
 */
const OVERALL_TONE: Record<Reconciliation['overall'], string> = {
  healthy: 'text-fw-success-ink',
  degraded: 'text-fw-danger-ink',
  partial: 'text-fw-warning-ink',
  blind: 'text-fw-warning-ink',
  unknown: 'text-warm-500',
};

const ROW_TONE: Record<'healthy' | 'degraded' | 'unknown', string> = {
  healthy: 'text-fw-success-ink',
  degraded: 'text-fw-danger-ink',
  unknown: 'text-warm-500',
};

function count(n: number | null): string {
  // An em-dash, not a zero. Rendering an unread surface as 0 is the defect.
  return n === null ? '—' : String(n);
}

export function ErrorSurfaceReconciliation({ verdict }: { verdict: Reconciliation }) {
  const rows = [
    { label: RECONCILIATION_ROW_LABEL.application, ...verdict.application, source: 'admin_events' },
    { label: RECONCILIATION_ROW_LABEL.runtime, ...verdict.runtime, source: 'Sentry' },
  ];

  return (
    <section
      aria-label="Error surface reconciliation"
      className="w-full rounded-xl border border-warm-200 bg-warm-50 px-3 py-2.5"
    >
      <dl className="grid gap-1">
        {rows.map((row) => (
          <div key={row.label} className="flex flex-wrap items-baseline gap-x-2 font-fw-mono text-caption">
            <dt className="w-52 shrink-0 text-warm-500">{row.label}</dt>
            <dd className={`font-medium ${ROW_TONE[row.state]}`}>{row.state}</dd>
            <dd className="tabular-nums text-warm-500">
              ({row.source}, {count(row.count)})
            </dd>
          </div>
        ))}
        <div className="flex flex-wrap items-baseline gap-x-2 border-t border-warm-200 pt-1 font-fw-mono text-caption">
          <dt className="w-52 shrink-0 text-warm-500">{RECONCILIATION_ROW_LABEL.overall}</dt>
          <dd className={`font-semibold ${OVERALL_TONE[verdict.overall]}`}>
            {OVERALL_HEALTH_LABEL[verdict.overall]}
          </dd>
        </div>
      </dl>
      <p className="mt-1.5 break-words text-caption leading-5 text-warm-700 [overflow-wrap:anywhere]">
        {verdict.note}
      </p>
    </section>
  );
}
