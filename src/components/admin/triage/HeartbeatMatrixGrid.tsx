/**
 * Bridge Premium Phase 3 — Heartbeat Matrix for `/admin/health`.
 *
 * `to be replaced by premium/<name>` — no shared `src/components/admin/
 * premium/*` matrix/grid primitive existed on `agent/bridge-premium-p1` as
 * of this PR (branch not yet pushed).
 */
import type { HeartbeatCellState, HeartbeatMatrixView, HeartbeatRow } from '@/lib/admin/triage/heartbeat-matrix';

const CELL_CLASS: Record<HeartbeatCellState, string> = {
  completed: 'bg-fw-success-ink',
  running: 'bg-accent-500',
  failed: 'bg-fw-danger-ink',
  missed: 'bg-fw-warning-ink',
  unknown: 'bg-warm-300',
};

const CELL_TITLE: Record<HeartbeatCellState, string> = {
  completed: 'completed',
  running: 'running',
  failed: 'failed',
  missed: 'missed — window elapsed with no recorded run',
  unknown: 'unknown — window not yet elapsed or job unreadable',
};

function formatDuration(ms: number | null): string {
  if (ms === null) return '';
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

function MatrixRow({ row }: { row: HeartbeatRow }) {
  return (
    <div className="flex items-center gap-3 py-1">
      <div className="w-40 shrink-0 truncate font-fw-mono text-caption text-warm-700" title={row.jobType}>
        {row.jobType}
      </div>
      <div className="flex min-w-0 flex-1 gap-1">
        {row.cells.map((cell, i) => (
          <span
            key={i}
            title={`${CELL_TITLE[cell.state]}${cell.durationMs !== null ? ` — ${formatDuration(cell.durationMs)}` : ''}`}
            className={`h-4 flex-1 rounded-sm ${CELL_CLASS[cell.state]}`}
          />
        ))}
      </div>
    </div>
  );
}

export function HeartbeatMatrixGrid({ view }: { view: HeartbeatMatrixView }) {
  if (view.rows.length === 0) {
    return <p className="text-sm text-warm-500">No registered jobs to show.</p>;
  }

  return (
    <div>
      <p className="mb-2 text-caption text-warm-500">
        Each cell is one of this job&rsquo;s own cadence windows, oldest to newest. A window still in progress with no
        run yet reads unknown, never a fabricated miss.
      </p>
      <div>
        {view.rows.map((row) => (
          <MatrixRow key={row.jobType} row={row} />
        ))}
      </div>
    </div>
  );
}
