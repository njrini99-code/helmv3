import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import { fetchJobsTab, type CronBoardRow, type CronRunSummary, type IntegrityRow } from '@/lib/admin/data/jobs';
import { Surface, Inset, StatTile, StatusPill, type FwStatusTone } from '@/components/fairway';
import { DatelineRule } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { PanelBoundary } from '../_components/PanelBoundary';
import { PanelNoData, PanelAllClear } from '../_components/PanelStates';
import { AutoRefresh } from '../_components/AutoRefresh';
import { LocalTime } from '../_components/LocalTime';

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
  return (
    <h2 className="border-b border-primary-600/25 pb-2 text-xs font-semibold uppercase tracking-widest text-warm-500">
      {children}
    </h2>
  );
}

// Dateline rule — replaces the retired border-l-2 "key panel" left-edge
// stripe. Chrome, not a status signal: a helm-green h-[2px] w-7 rounded-full
// rule above the card title. Uses the shared `DatelineRule` primitive
// (src/components/ui/card.tsx) so the geometry can't drift from its sibling
// call sites; tone is the canonical brand green (`primary-600`), not the
// Fairway-opt-in `accent-*` family (this page isn't a Fairway component).
function KeyPanelRule() {
  return <DatelineRule className="mb-3" />;
}

/**
 * Small inline failure-rate readout for the last RECENT_RUNS_PER_JOB runs
 * (jobs.ts) — each run is one tick, oldest→newest, colored by status. Honest
 * "never run" state (empty history — distinct from a real 0-failure run) so
 * a job that's simply awaiting its first scheduled fire never gets rendered
 * identically to one silently missing all its history (the exact bug this
 * per-job-query fix resolves). Hand-rolled rather than the Fairway
 * SegmentBar/Sparkline chart primitives — both are standalone-panel widgets
 * (legend, big readout, InstrumentPanel chrome) sized for a chart slot, not
 * a ~20px-tall strip embedded in a dense table row / phone card.
 */
function RecentRunsStrip({ runs }: { runs: CronRunSummary[] }) {
  if (runs.length === 0) {
    return <p className="text-caption text-warm-500">no run history yet</p>;
  }
  const failures = runs.filter((r) => r.status === 'failed').length;
  return (
    <div className="flex items-center gap-2">
      <div
        role="img"
        aria-label={`${failures} failed of last ${runs.length} runs`}
        className="flex items-center gap-0.5"
      >
        {runs.map((r, i) => (
          <span
            key={`${r.startedAt}-${i}`}
            title={`${r.status} · ${r.startedAt}`}
            className={cn(
              'h-3 w-1.5 shrink-0 rounded-sm',
              r.status === 'failed'
                ? 'bg-fw-danger'
                : r.status === 'completed'
                  ? 'bg-fw-success'
                  : 'bg-warm-300',
            )}
          />
        ))}
      </div>
      <span className="font-fw-mono text-xs tabular-nums text-warm-500">
        {failures > 0 ? `${failures}/${runs.length} failed` : `${runs.length}/${runs.length} ok`}
      </span>
    </div>
  );
}

function formatDuration(ms: number | null): string {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/** A single label→value line inside a card. Value wraps (never clips —
 *  MOBILE_DOCTRINE rule 8 "identity + key stats", not truncated text). */
function StatLine({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="shrink-0 text-warm-500">{label}</span>
      <span className="min-w-0 flex-1 break-words text-right font-fw-mono tabular-nums text-warm-600">
        {value}
      </span>
    </div>
  );
}

/**
 * One cron job as a phone-width card: identity + status up top, three key
 * stats below (MOBILE_DOCTRINE rule 8 — no per-job detail route exists, so
 * there's no tap-through target). Alarm rows (`overdue`/`failed`) get a
 * hairline danger ring so they read as distinct from the routine list even
 * without scrolling back up to compare pills.
 */
function CronJobCard({ row }: { row: CronBoardRow }) {
  const isAlarm = row.status === 'overdue' || row.status === 'failed';
  return (
    <Inset padding="sm" className={cn(isAlarm && 'ring-1 ring-fw-danger/30')}>
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 break-words font-fw-mono text-xs font-medium text-warm-900">{row.jobType}</p>
        <StatusPill tone={CRON_STATUS_TONE[row.status]} dot size="sm" className="shrink-0">
          {row.status}
        </StatusPill>
      </div>
      <div className="mt-2.5 space-y-1.5 text-xs">
        <StatLine
          label="Last run"
          value={row.lastRunAt ? <LocalTime iso={row.lastRunAt} variant="datetime" /> : 'awaiting first run'}
        />
        <StatLine label="Duration" value={formatDuration(row.lastDurationMs)} />
        <StatLine label="Cadence" value={`${row.cadenceMinutes}m`} />
      </div>
      <div className="mt-2.5 border-t border-warm-200/60 pt-2">
        <RecentRunsStrip runs={row.recentRuns} />
      </div>
      {row.status === 'failed' && row.lastError ? (
        <p className="mt-2 break-words border-t border-warm-200/60 pt-2 text-xs text-fw-danger">
          {row.lastError}
        </p>
      ) : null}
    </Inset>
  );
}

/**
 * Phone card-ify of the cron board (MOBILE_DOCTRINE rule 8: a `min-w-[###px]`
 * table in `overflow-x-auto` is NOT the doctrine treatment on a phone-primary
 * surface — it just moves the pan sideways inside a smaller box). Triage
 * first (rule 1 + the craft bar's "ops surface, checked from a phone"): jobs
 * that actually need attention (`overdue`/`failed`) render as cards
 * immediately; everything on schedule rolls into ONE all-clear card (rule 3
 * "empty sections never render — one all-caught-up card") with the routine
 * rows tucked behind a collapsed disclosure so 18 registry entries don't
 * blow the ~3-screen-height scroll budget.
 */
function CronBoardCards({ rows }: { rows: CronBoardRow[] }) {
  const alarmRows = rows.filter((r) => r.status === 'overdue' || r.status === 'failed');
  const restRows = rows.filter((r) => r.status !== 'overdue' && r.status !== 'failed');

  return (
    <div className="space-y-3">
      {alarmRows.length > 0 ? (
        <div className="space-y-2">
          {alarmRows.map((row) => (
            <CronJobCard key={row.jobType} row={row} />
          ))}
        </div>
      ) : (
        <PanelAllClear label={`All ${rows.length} cron jobs on schedule`} checkedAt={new Date().toISOString()} />
      )}
      {restRows.length > 0 ? (
        <details>
          <summary className="flex min-h-[44px] cursor-pointer items-center px-2 text-xs text-warm-700 underline decoration-dotted decoration-warm-400 marker:text-warm-400">
            {restRows.length} other job{restRows.length === 1 ? '' : 's'} — view schedule
          </summary>
          <div className="mt-3 space-y-2">
            {restRows.map((row) => (
              <CronJobCard key={row.jobType} row={row} />
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}

/**
 * PHONE-FORMAT RESPONSIVE: the table stays the `md:`+ presentation
 * unchanged. Below `md`, this renders `CronBoardCards` instead — a
 * `min-w-[640px]` table scoped by `overflow-x-auto` still forces a sideways
 * pan on a 390px phone, which is exactly the treatment MOBILE_DOCTRINE rule
 * 8 rules out for a phone-primary reading surface.
 */
function CronBoardTable({ rows }: { rows: CronBoardRow[] }) {
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[780px] text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-widest text-warm-500">
              <th className="sticky left-0 z-10 bg-surface py-2 pr-3">Job</th>
              <th className="px-3">Status</th>
              <th className="px-3">Last run</th>
              <th className="px-3">Duration</th>
              <th className="px-3">Cadence</th>
              <th className="px-3">Last 20 runs</th>
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
                  {row.status === 'failed' && row.lastError ? (
                    <p
                      title={row.lastError}
                      className="mt-1 max-w-[260px] truncate text-xs text-fw-danger"
                    >
                      {row.lastError}
                    </p>
                  ) : null}
                </td>
                <td className="px-3 font-fw-mono text-xs tabular-nums text-warm-600">
                  {row.lastRunAt ? <LocalTime iso={row.lastRunAt} variant="datetime" /> : 'awaiting first run'}
                </td>
                <td className="px-3 font-fw-mono text-xs tabular-nums text-warm-600">
                  {formatDuration(row.lastDurationMs)}
                </td>
                <td className="px-3 font-fw-mono text-xs tabular-nums text-warm-600">{row.cadenceMinutes}m</td>
                <td className="px-3">
                  <RecentRunsStrip runs={row.recentRuns} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="md:hidden">
        <CronBoardCards rows={rows} />
      </div>
    </>
  );
}

/** One integrity check as a phone-width card — mirrors `CronJobCard`'s
 *  rhythm so the two sections read as one composed page, not two bolted-on
 *  treatments (MOBILE_DOCTRINE rule 11). */
function IntegrityCheckCard({ check }: { check: IntegrityRow }) {
  const isFail = check.status === 'fail';
  return (
    <Inset padding="sm" className={cn(isFail && 'ring-1 ring-fw-danger/30')}>
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 break-words font-fw-mono text-xs font-medium text-warm-900">{check.check}</p>
        <StatusPill tone={isFail ? 'danger' : 'success'} dot size="sm" className="shrink-0">
          {check.status}
        </StatusPill>
      </div>
      <div className="mt-2.5 space-y-1.5 text-xs">
        <StatLine label="Offending rows" value={check.count} />
        <StatLine label="Last run" value={<LocalTime iso={check.lastRunAt} variant="datetime" />} />
      </div>
      {isFail && check.sample.length > 0 ? (
        <details className="mt-2">
          <summary className="flex min-h-[44px] cursor-pointer items-center px-2 text-xs text-warm-700 underline decoration-dotted decoration-warm-400 marker:text-warm-400">
            view sample rows
          </summary>
          <pre className="mt-2 max-w-full overflow-x-auto whitespace-pre-wrap break-all border-t border-warm-200/60 pt-2 text-xs text-warm-700">
            {JSON.stringify(check.sample, null, 2)}
          </pre>
        </details>
      ) : null}
    </Inset>
  );
}

/** Phone card-ify of the integrity grid (rule 8), same alarm-first / rolled-
 *  up-clean rhythm as `CronBoardCards` — a passing suite collapses into one
 *  all-clear card instead of N repeated "pass" rows. */
function IntegrityCards({ checks }: { checks: IntegrityRow[] }) {
  const failing = checks.filter((c) => c.status === 'fail');
  const passing = checks.filter((c) => c.status === 'pass');

  return (
    <div className="space-y-3">
      {failing.length > 0 ? (
        <div className="space-y-2">
          {failing.map((c) => (
            <IntegrityCheckCard key={c.check} check={c} />
          ))}
        </div>
      ) : (
        <PanelAllClear label={`All ${checks.length} integrity checks passing`} checkedAt={new Date().toISOString()} />
      )}
      {passing.length > 0 && failing.length > 0 ? (
        <details>
          <summary className="flex min-h-[44px] cursor-pointer items-center px-2 text-xs text-warm-700 underline decoration-dotted decoration-warm-400 marker:text-warm-400">
            {passing.length} passing check{passing.length === 1 ? '' : 's'} — view
          </summary>
          <div className="mt-3 space-y-2">
            {passing.map((c) => (
              <IntegrityCheckCard key={c.check} check={c} />
            ))}
          </div>
        </details>
      ) : null}
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
    <>
      <div className="hidden overflow-x-auto md:block">
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
                <td className="px-3 font-fw-mono text-xs tabular-nums text-warm-600">
                  {c.status === 'fail' && c.sample.length > 0 ? (
                    <details>
                      <summary className="cursor-pointer text-warm-700 underline decoration-dotted decoration-warm-400 marker:text-warm-400">
                        {c.count} — view rows
                      </summary>
                      <pre className="mt-2 max-w-[420px] whitespace-pre-wrap break-all rounded-lg bg-surface-sunken p-2 text-xs text-warm-700">
                        {JSON.stringify(c.sample, null, 2)}
                      </pre>
                    </details>
                  ) : (
                    c.count
                  )}
                </td>
                <td className="px-3 font-fw-mono text-xs tabular-nums text-warm-600">
                  <LocalTime iso={c.lastRunAt} variant="datetime" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="md:hidden">
        <IntegrityCards checks={checks} />
      </div>
    </>
  );
}

async function JobsBody() {
  const tab = await fetchJobsTab();

  return (
    <div className="space-y-6">
      {/* Key panel: the board that answers "is anything actually running on
          schedule" — a 2px green left edge, same signal as the overview's
          Feature health rollup. */}
      <Surface padding="sm">
        <KeyPanelRule />
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
        <StatTile label="admin_events rows" value={tab.logHealth.adminEvents} tone="neutral" mono />
        <StatTile label="error_logs rows" value={tab.logHealth.errorLogs} tone="neutral" mono />
        <StatTile label="job log rows" value={tab.logHealth.jobLogs} tone="neutral" mono />
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
    <div className="space-y-6">
      <AutoRefresh intervalMs={60_000} />
      <PanelBoundary title="Jobs & Integrity">
        <JobsBody />
      </PanelBoundary>
    </div>
  );
}
