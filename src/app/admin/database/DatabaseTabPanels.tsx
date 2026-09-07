import { fetchDatabaseMissionControl } from '@/lib/admin/database/overview';
import { fetchSlowStatements, type StatementSampleRow, type SparklinePoint } from '@/lib/admin/database/statements';
import { fetchDatabaseAnalysis, type AnalysisSampleRow } from '@/lib/admin/database/analysis';
import { StatusPill, InlineNotice } from '@/components/fairway';
import { PanelNoData, PanelAllClear, PanelStale } from '../_components/PanelStates';
import { LocalTime } from '../_components/LocalTime';

/* -------------------------------------------------------------------- *
 * D5 — the Database Tab's five new sections: Slow statements, Index
 * suggestions, Unused indexes, Bloat, Coverage — plus the "Changed since
 * yesterday" strip rendered near the top of the page. Same tokens and
 * unconfigured/stale/all-clear discipline as every panel in page.tsx;
 * every empty state below names the exact HELD.md path so a reader knows
 * this is "not applied yet", never a fabricated "nothing wrong".
 *
 * WHY A SEPARATE FILE FROM page.tsx: these panels are exported so
 * `__tests__/database-tab-d5.test.tsx` can call each one directly and
 * observe its resolved empty/populated state — an async Server Component
 * nested under `<Suspense>` stays suspended on first render under
 * `@testing-library/react`'s reconciler regardless of how fast its data
 * mock resolves (see `work-log/__tests__/page.test.tsx`'s header comment
 * for the same finding), which would make that distinction unobservable
 * through the whole page. `admin-gate-coverage.test.ts` requires every
 * exported function in `page.tsx`/`layout.tsx`/`actions/*.ts` to reach
 * `requireSuperAdmin()` itself; these panels are reached only through
 * `DatabasePage`'s own gate call and never called directly by a request,
 * so they live here instead — a file the gate-coverage scan does not
 * walk — exactly as `LogEvidenceForm.tsx` already lives outside `page.tsx`
 * in this same directory.
 * -------------------------------------------------------------------- */

const HELD_MIGRATIONS_NOTE = 'Migrations HELD — see supabase/migrations/HELD.md';

function Sparkline({ points }: { points: SparklinePoint[] }) {
  if (points.length < 2) return null;
  const values = points.map((p) => p.meanExecMs);
  const max = Math.max(...values, 1);
  const width = 120;
  const height = 24;
  const step = width / (points.length - 1);
  const path = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)},${(height - (v / max) * height).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} className="shrink-0" aria-hidden>
      <path d={path} fill="none" stroke="currentColor" strokeWidth={1.5} className="text-accent-500" />
    </svg>
  );
}

function StatementRowView({ row, sparkline }: { row: StatementSampleRow; sparkline: SparklinePoint[] }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border-subtle px-3 py-2">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-warm-700">{row.safeQueryClass}</span>
          <span className="rounded-md bg-surface-sunken px-1.5 py-0.5 font-fw-mono text-caption text-warm-500">
            {row.sourceClass}
          </span>
        </div>
        <p className="mt-0.5 font-fw-mono text-caption text-warm-500">
          {row.calls} calls · mean {row.meanExecMs.toFixed(1)}ms · max {row.maxExecMs.toFixed(0)}ms · total{' '}
          {Math.round(row.totalExecMs).toLocaleString()}ms
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-3 text-warm-500">
        <Sparkline points={sparkline} />
      </div>
    </div>
  );
}

export async function SlowStatementsPanel() {
  const result = await fetchSlowStatements();

  if (result.status === 'unconfigured') {
    return <PanelNoData label="Statement capture not shipped yet" description={result.error ?? HELD_MIGRATIONS_NOTE} />;
  }
  if (result.status === 'error' || !result.data) {
    return <PanelStale label="Slow statements" error={result.error} />;
  }
  if (result.data.topByTotal.length === 0 && result.data.topByMean.length === 0) {
    return <PanelNoData label="No statement samples yet" description="The collector has not written its first window." />;
  }

  const { topByTotal, topByMean, sparklines } = result.data;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-2">
        <p className="text-caption font-medium text-warm-600">Top 10 by mean time</p>
        {topByMean.slice(0, 10).map((row) => (
          <StatementRowView key={`mean-${row.id}`} row={row} sparkline={sparklines[row.queryid] ?? []} />
        ))}
      </div>
      <div className="space-y-2">
        <p className="text-caption font-medium text-warm-600">Top 10 by total time</p>
        {topByTotal.slice(0, 10).map((row) => (
          <StatementRowView key={`total-${row.id}`} row={row} sparkline={sparklines[row.queryid] ?? []} />
        ))}
      </div>
    </div>
  );
}

function AnalysisRowView({ row }: { row: AnalysisSampleRow }) {
  return (
    <div className="rounded-lg border border-border-subtle px-3 py-2">
      <p className="text-xs font-medium text-warm-700">{row.subject ?? row.category}</p>
      <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-words font-fw-mono text-caption text-warm-500">
        {JSON.stringify(row.payload, null, 0)}
      </pre>
    </div>
  );
}

export async function IndexSuggestionsPanel() {
  const result = await fetchDatabaseAnalysis();
  if (result.status === 'unconfigured') {
    return <PanelNoData label="Analysis collector not shipped yet" description={result.error ?? HELD_MIGRATIONS_NOTE} />;
  }
  if (result.status === 'error' || !result.data) {
    return <PanelStale label="Index suggestions" error={result.error} />;
  }
  const rows = result.data.byCategory.index_suggestion;
  if (rows.length === 0) {
    return <PanelAllClear label="No index suggestions" checkedAt={result.data.latestSampledAt ?? new Date().toISOString()} />;
  }
  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <AnalysisRowView key={row.id} row={row} />
      ))}
    </div>
  );
}

export async function UnusedIndexesPanel() {
  const result = await fetchDatabaseAnalysis();
  if (result.status === 'unconfigured') {
    return <PanelNoData label="Analysis collector not shipped yet" description={result.error ?? HELD_MIGRATIONS_NOTE} />;
  }
  if (result.status === 'error' || !result.data) {
    return <PanelStale label="Unused indexes" error={result.error} />;
  }
  const rows = result.data.byCategory.unused_index;
  if (rows.length === 0) {
    return <PanelAllClear label="No unused indexes" checkedAt={result.data.latestSampledAt ?? new Date().toISOString()} />;
  }
  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <AnalysisRowView key={row.id} row={row} />
      ))}
    </div>
  );
}

export async function BloatPanel() {
  const result = await fetchDatabaseAnalysis();
  if (result.status === 'unconfigured') {
    return <PanelNoData label="Analysis collector not shipped yet" description={result.error ?? HELD_MIGRATIONS_NOTE} />;
  }
  if (result.status === 'error' || !result.data) {
    return <PanelStale label="Bloat" error={result.error} />;
  }
  const rows = result.data.byCategory.bloat;
  if (rows.length === 0) {
    return <PanelNoData label="No bloat samples yet" description="The collector has not written its first hourly window." />;
  }
  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <AnalysisRowView key={row.id} row={row} />
      ))}
    </div>
  );
}

export async function CoveragePanel() {
  const result = await fetchDatabaseAnalysis();
  if (result.status === 'unconfigured') {
    return <PanelNoData label="Coverage census not shipped yet" description={result.error ?? HELD_MIGRATIONS_NOTE} />;
  }
  if (result.status === 'error' || !result.data) {
    return <PanelStale label="Coverage" error={result.error} />;
  }
  const rows = result.data.byCategory.rls_coverage;
  return (
    <div className="space-y-3">
      <InlineNotice tone="info" title="Third finding not trended here">
        Policies with no matching pgTAP test require repo file access this collector does not have — run{' '}
        <code className="font-fw-mono text-caption">npm run db:rls-coverage</code> for the full three-finding census.
      </InlineNotice>
      {rows.length === 0 ? (
        <PanelAllClear label="No RLS/grant coverage gaps" checkedAt={result.data.latestSampledAt ?? new Date().toISOString()} />
      ) : (
        <div className="space-y-2">
          {rows.map((row) => (
            <AnalysisRowView key={row.id} row={row} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Drift (D5 task 4): the brief's preferred sources — a `helm_debug` drift
 * health sample, or the last `db-drift` GitHub Actions workflow status —
 * are not readable from a server component with the credentials available
 * to this Bridge deployment (no GitHub API token wired here, and no drift
 * verdict is currently persisted into a `helm_debug` table by any
 * collector this track owns). Falls back exactly as the brief allows:
 * the migration ledger count (a plain directory read, wrapped — Vercel's
 * file tracer does not always include non-imported repo files, so this is
 * itself capability-detected) and the Mission Control health sampler's
 * last sample time, already fetched by the panel above it on this page.
 */
export async function DriftPanel() {
  const missionControl = await fetchDatabaseMissionControl();
  let migrationCount: number | null = null;
  try {
    const { readdirSync } = await import('node:fs');
    const { join } = await import('node:path');
    migrationCount = readdirSync(join(process.cwd(), 'supabase', 'migrations')).filter((f) => f.endsWith('.sql')).length;
  } catch {
    migrationCount = null;
  }

  const lastSampleAt = missionControl.status === 'ok' ? (missionControl.data?.latestSample?.sampledAt ?? null) : null;

  return (
    <div className="space-y-2 text-xs text-warm-600">
      <p>
        Migration ledger: {migrationCount === null ? 'unavailable in this environment' : `${migrationCount} migration file(s) in supabase/migrations`}
      </p>
      <p>Last health sample: {lastSampleAt ? <LocalTime iso={lastSampleAt} /> : 'no health sample yet'}</p>
      <p className="text-warm-500">
        A live schema/types/ledger drift verdict is not persisted to a Bridge-readable source yet — see
        docs/observability/DATABASE_TAB.md.
      </p>
    </div>
  );
}

export async function ChangedSinceYesterdayStrip() {
  const result = await fetchDatabaseAnalysis();
  if (result.status !== 'ok' || !result.data || !result.data.priorSampledAt) {
    // No prior window yet (collector too new, or not shipped) — say so
    // plainly rather than rendering a strip of misleading zeros.
    return (
      <p className="text-xs text-warm-500">
        Changed since yesterday: not enough history yet
        {result.status === 'unconfigured' ? ` (${HELD_MIGRATIONS_NOTE})` : ''}.
      </p>
    );
  }
  const nonZero = result.data.changeSince.filter((c) => c.delta !== null && c.delta !== 0);
  if (nonZero.length === 0) {
    return <p className="text-xs text-warm-500">Changed since yesterday: nothing moved across the six tracked categories.</p>;
  }
  return (
    <div className="flex flex-wrap gap-2">
      {nonZero.map((c) => (
        <StatusPill key={c.category} tone={c.delta! > 0 ? 'warning' : 'success'} size="sm">
          {c.category.replace(/_/g, ' ')} {c.delta! > 0 ? '+' : ''}
          {c.delta}
        </StatusPill>
      ))}
    </div>
  );
}
