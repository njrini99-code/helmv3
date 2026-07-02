import { ChartFrame, type ChartTableData } from '@/components/fairway';
import type { SentryStatsPoint } from '@/lib/admin/sentry-api';

/**
 * Errors-over-time — dependency-light CSS bars housed in the canonical
 * Fairway ChartFrame (matte chrome, empty/error states, "view as table"
 * a11y fallback) instead of a bespoke figure/figcaption. Deploy markers
 * render as labeled ticks over the bars so a spike lines up against a
 * release at a glance.
 */
export function ErrorsOverTime({
  points,
  deployMarkers,
}: {
  points: SentryStatsPoint[];
  deployMarkers: number[];
}) {
  const hasPoints = points.length > 0;
  const max = Math.max(1, ...points.map((p) => p.total));
  const start = points[0]?.timestamp ?? Date.now();
  const end = points[points.length - 1]?.timestamp ?? start + 1;
  const span = Math.max(1, end - start);
  const totalErrors = points.reduce((sum, p) => sum + p.total, 0);

  const tableData: ChartTableData = {
    caption: 'Errors per hour, with production deploy markers',
    columns: [
      { key: 'time', label: 'Hour' },
      { key: 'errors', label: 'Errors', numeric: true },
    ],
    rows: points.map((p) => ({
      time: new Date(p.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
      errors: p.total,
    })),
  };

  return (
    <ChartFrame
      title="Errors per hour"
      subtitle={
        hasPoints
          ? `${new Date(start).toLocaleTimeString()} — ${new Date(end).toLocaleTimeString()} · ticks mark production deploys`
          : undefined
      }
      takeaway={hasPoints ? `${totalErrors} errors across ${points.length} hourly buckets` : 'No hourly data'}
      state={hasPoints ? 'ready' : 'empty'}
      stateMessage="No hourly error data in this window."
      height={140}
      tableData={hasPoints ? tableData : undefined}
    >
      <div className="flex h-full items-end gap-[2px]">
        {points.map((p) => (
          <div
            key={p.timestamp}
            title={`${new Date(p.timestamp).toLocaleTimeString()}: ${p.total} errors`}
            className="flex-1 rounded-t-fw-sm bg-fw-danger/60"
            style={{ height: `${Math.max(2, Math.round((p.total / max) * 100))}%` }}
          />
        ))}
      </div>
      {deployMarkers.map((t) => (
        <span
          key={t}
          title={`deploy ${new Date(t).toLocaleTimeString()}`}
          className="absolute top-0 h-full w-px bg-warm-900/50"
          style={{ left: `${((t - start) / span) * 100}%` }}
        />
      ))}
    </ChartFrame>
  );
}
