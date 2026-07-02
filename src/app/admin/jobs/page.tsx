import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import { fetchJobsTab, type CronBoardRow, type IntegrityRow } from '@/lib/admin/data/jobs';
import { Surface, StatTile, StatusPill, type FwStatusTone } from '@/components/fairway';
import { PanelBoundary } from '../_components/PanelBoundary';
import { PanelNoData } from '../_components/PanelStates';
import { AutoRefresh } from '../_components/AutoRefresh';

export const dynamic = 'force-dynamic';

// 'never-ran' is deliberately NEUTRAL, not red — a cron with no row yet
// (waiting for its first scheduled run) is not a broken cron. Only
// 'overdue' and 'failed' alarm. Dot + icon-carrying label + color together
// (StatusPill's `dot` prop) — color is never the only channel.
const CRON_STATUS_TONE: Record<CronBoardRow['status'], FwStatusTone> = {
  ok: 'success',
  overdue: 'danger',
  failed: 'danger',
  'never-ran': 'neutral',
};

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <h2 className="text-xs font-semibold uppercase tracking-widest text-warm-500">{children}</h2>;
}

function formatDuration(ms: number | null): string {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * PHONE-FORMAT RESPONSIVE (owner directive 2026-07-02): every admin table —
 * including this cron board and the integrity grid below — must render
 * cleanly at ~375px. `overflow-x-auto` scopes the horizontal scroll to the
 * table itself (never the page), and the first column stays `sticky` so the
 * row's identity is never scrolled out of view.
 */
function CronBoardTable({ rows }: { rows: CronBoardRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-widest text-warm-500">
            <th className="sticky left-0 z-10 bg-surface py-2 pr-3">Job</th>
            <th className="px-3">Status</th>
            <th className="px-3">Last run</th>
            <th className="px-3">Duration</th>
            <th className="px-3">Cadence</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-warm-200/60">
          {rows.map((row) => (
            <tr key={row.jobType}>
              <td className="sticky left-0 z-10 bg-surface py-2 pr-3 font-fw-mono text-xs text-warm-900">
                {row.jobType}
              </td>
              <td className="px-3">
                <StatusPill tone={CRON_STATUS_TONE[row.status]} dot size="sm">
                  {row.status}
                </StatusPill>
              </td>
              <td className="px-3 font-fw-mono text-xs tabular-nums text-warm-600">
                {row.lastRunAt ? new Date(row.lastRunAt).toLocaleString() : 'awaiting first run'}
              </td>
              <td className="px-3 font-fw-mono text-xs tabular-nums text-warm-600">
                {formatDuration(row.lastDurationMs)}
              </td>
              <td className="px-3 font-fw-mono text-xs tabular-nums text-warm-600">{row.cadenceMinutes}m</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function IntegrityGrid({ checks }: { checks: IntegrityRow[] }) {
  if (checks.length === 0) {
    return (
      <PanelNoData
        label="Awaiting first nightly run"
        description="run_integrity_checks() fires at 07:00 UTC — results land here after the first pass."
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-widest text-warm-500">
            <th className="sticky left-0 z-10 bg-surface py-2 pr-3">Check</th>
            <th className="px-3">Status</th>
            <th className="px-3">Offending rows</th>
            <th className="px-3">Last run</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-warm-200/60">
          {checks.map((c) => (
            <tr key={c.check}>
              <td className="sticky left-0 z-10 bg-surface py-2 pr-3 font-fw-mono text-xs text-warm-900">
                {c.check}
              </td>
              <td className="px-3">
                <StatusPill tone={c.status === 'pass' ? 'success' : 'danger'} dot size="sm">
                  {c.status}
                </StatusPill>
              </td>
              <td className="px-3 font-fw-mono text-xs tabular-nums text-warm-600">{c.count}</td>
              <td className="px-3 font-fw-mono text-xs tabular-nums text-warm-600">
                {new Date(c.lastRunAt).toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

async function JobsBody() {
  const tab = await fetchJobsTab();

  return (
    <div className="space-y-6">
      <Surface padding="sm">
        <SectionLabel>Cron board — expected vs actual</SectionLabel>
        <p className="mt-1 text-xs text-warm-500">
          A job with no row yet reads &ldquo;awaiting first run&rdquo; (neutral) — never a red alarm until it has
          actually missed its schedule.
        </p>
        <div className="mt-3">
          <CronBoardTable rows={tab.board} />
        </div>
      </Surface>

      <Surface padding="sm">
        <SectionLabel>Data-integrity checks</SectionLabel>
        <p className="mt-1 text-xs text-warm-500">
          Orphans, schema canaries, and anon-grant drift — nightly, via <span className="font-fw-mono">run_integrity_checks()</span>.
        </p>
        <div className="mt-3">
          <IntegrityGrid checks={tab.integrity} />
        </div>
      </Surface>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="admin_events rows" value={tab.logHealth.adminEvents} mono />
        <StatTile label="error_logs rows" value={tab.logHealth.errorLogs} mono />
        <StatTile label="job log rows" value={tab.logHealth.jobLogs} mono />
        <Surface padding="sm">
          <p className="text-xs font-semibold uppercase tracking-widest text-warm-500">Inngest</p>
          <p className="mt-1 text-sm text-warm-800">
            {tab.inngestActivated ? 'activated' : 'not activated (keys absent)'}
          </p>
        </Surface>
      </section>
    </div>
  );
}

export default async function JobsPage() {
  await requireSuperAdmin();
  return (
    <main className="space-y-6 p-6">
      <AutoRefresh intervalMs={60_000} />
      <PanelBoundary title="Jobs & Integrity">
        <JobsBody />
      </PanelBoundary>
    </main>
  );
}
