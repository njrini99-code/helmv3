/**
 * Bridge Premium Phase 3 — Execution Waterfall for `/admin/jobs`.
 *
 * One row per registered cron/Inngest job; each recorded run renders as a
 * positioned bar (start offset + real duration) against one shared timeline,
 * so a 5-minute cron and a weekly one land on an axis an operator can compare
 * by eye. The existing `CronBoardTable`/`RecentRunsStrip` on this page show
 * the SAME data as a status table and a sparse tick row respectively — this
 * is deliberately not a second data model, just a third, comparable
 * projection of the one board `fetchJobsTab()` already reads.
 *
 * `to be replaced by premium/<name>` — no shared `src/components/admin/
 * premium/*` timeline/waterfall primitive existed on `agent/bridge-premium-p1`
 * as of this PR (branch not yet pushed).
 */
import { StatusPill, type FwStatusTone } from '@/components/fairway';
import type { CronBoardStatus } from '@/lib/admin/cron-registry';
import type { JobWaterfallRow, JobWaterfallView } from '@/lib/admin/triage/job-waterfall';

// Mirrors CRON_STATUS_TONE in src/app/admin/jobs/page.tsx — kept as a local
// copy rather than an import from a page module (components do not import
// from the pages that render them); see that file's comment for why
// 'never-ran' is neutral and 'degraded' is warning, not danger.
const CHECK_IN_TONE: Record<CronBoardStatus, FwStatusTone> = {
  ok: 'success',
  overdue: 'danger',
  failed: 'danger',
  'never-ran': 'neutral',
  degraded: 'warning',
};

const RUN_BAR_TONE: Record<string, string> = {
  completed: 'bg-fw-success-ink/70',
  failed: 'bg-fw-danger-ink/80',
};

function runBarClass(status: string): string {
  return RUN_BAR_TONE[status] ?? 'bg-warm-400';
}

function formatDuration(ms: number | null): string {
  if (ms === null) return 'unknown duration';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function WaterfallRow({ row, windowMs }: { row: JobWaterfallRow; windowMs: number }) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <div className="w-40 shrink-0 truncate font-fw-mono text-caption text-warm-700" title={row.jobType}>
        {row.jobType}
      </div>
      <StatusPill tone={CHECK_IN_TONE[row.checkInState]} dot size="sm" className="w-24 shrink-0 justify-center">
        {row.checkInState}
      </StatusPill>
      <div className="relative h-4 min-w-0 flex-1 rounded-full bg-surface-sunken">
        {row.unreadable ? (
          <span className="absolute inset-0 flex items-center px-2 text-caption text-fw-warning-ink">unreadable</span>
        ) : row.runs.length === 0 ? (
          <span className="absolute inset-0 flex items-center px-2 text-caption text-warm-400">no runs recorded</span>
        ) : (
          row.runs.map((run, i) => {
            const leftPct = windowMs > 0 ? (run.offsetMs / windowMs) * 100 : 0;
            // A run with no recorded duration still gets a visible mark (2px)
            // rather than disappearing — a zero-width bar would silently
            // read as "did not run".
            const widthPct = run.durationMs !== null && windowMs > 0 ? Math.max((run.durationMs / windowMs) * 100, 0.4) : 0.4;
            return (
              <span
                key={`${run.startedAt}-${i}`}
                title={`${run.startedAt} — ${run.status} — ${formatDuration(run.durationMs)}`}
                className={`absolute top-0.5 h-3 rounded-sm ${runBarClass(run.status)}`}
                style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
              />
            );
          })
        )}
      </div>
    </div>
  );
}

export function JobExecutionWaterfall({ view }: { view: JobWaterfallView }) {
  if (view.windowStartMs === null) {
    return <p className="text-sm text-warm-500">No job in the board has ever recorded a run.</p>;
  }

  const windowMs = Math.max(1, view.windowEndMs - view.windowStartMs);

  return (
    <div>
      <p className="mb-2 text-caption text-warm-500">
        Each bar is one recorded run, positioned by real start time and sized by real duration — window covers every
        run currently on record, oldest first.
      </p>
      <div>
        {view.rows.map((row) => (
          <WaterfallRow key={row.jobType} row={row} windowMs={windowMs} />
        ))}
      </div>
    </div>
  );
}
