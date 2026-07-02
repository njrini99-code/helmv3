import Link from 'next/link';
import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import { parseErrorsFilters, fetchErrorsTab } from '@/lib/admin/data/errors';
import { StatusPill, type FwStatusTone } from '@/components/fairway';
import { TriageQueue } from '../_components/TriageQueue';
import { ErrorsOverTime } from '../_components/ErrorsOverTime';
import { KpiTile } from '../_components/KpiTile';
import { PanelBoundary } from '../_components/PanelBoundary';
import { PanelAllClear, PanelNoData, PanelStale } from '../_components/PanelStates';
import { AutoRefresh } from '../_components/AutoRefresh';

export const dynamic = 'force-dynamic';

const CHIP_SETS: Array<{ param: 'sport' | 'severity' | 'source' | 'window'; values: string[] }> = [
  { param: 'sport', values: ['golf', 'baseball', 'shared'] },
  { param: 'severity', values: ['critical', 'error', 'warning'] },
  { param: 'source', values: ['server_action', 'rls_denial', 'auth', 'cron', 'client'] },
  { param: 'window', values: ['24', '168'] },
];

// Sentry's raw issue `level` string → the same trio (dot + tone + label)
// used everywhere else severity renders — color is never the only channel.
const SENTRY_LEVEL_TONE: Record<string, FwStatusTone> = {
  fatal: 'danger',
  error: 'danger',
  warning: 'warning',
  info: 'neutral',
  debug: 'neutral',
};

function chipHref(current: URLSearchParams, param: string, value: string): string {
  const next = new URLSearchParams(current);
  if (next.get(param) === value) next.delete(param);
  else next.set(param, value);
  const qs = next.toString();
  return qs ? `/admin/errors?${qs}` : '/admin/errors';
}

export default async function ErrorsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireSuperAdmin();
  const params = await searchParams;
  const filters = parseErrorsFilters(params);
  const current = new URLSearchParams(
    Object.entries(params).flatMap(([k, v]) => (typeof v === 'string' ? [[k, v] as [string, string]] : [])),
  );

  async function Body() {
    const tab = await fetchErrorsTab(filters);
    return (
      <div className="space-y-6">
        <section className="grid gap-4 lg:grid-cols-[2fr_1fr]">
          {tab.hourly.status === 'ok' && tab.hourly.data ? (
            <ErrorsOverTime points={tab.hourly.data} deployMarkers={tab.deployMarkers} />
          ) : tab.hourly.status === 'unconfigured' ? (
            <div className="rounded-2xl border border-warm-200 bg-white/70 p-4">
              <PanelNoData label="Hourly series not configured" description="Provision SENTRY_READ_TOKEN to light this chart up." />
            </div>
          ) : (
            <div className="rounded-2xl border border-warm-200 bg-white/70 p-4">
              <PanelStale label="Hourly series" error={tab.hourly.error} />
            </div>
          )}
          <KpiTile
            label="RLS denials · 24h"
            value={tab.rlsDenials24h}
            href="/admin/errors?source=rls_denial"
            tone={tab.rlsDenials24h > 0 ? 'warning' : 'neutral'}
            goodDirection="down"
          />
        </section>

        <section className="rounded-2xl border border-warm-200 bg-white/70 p-4">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-warm-500">Sentry unresolved</h2>
          {tab.sentry.status === 'ok' && tab.sentry.data ? (
            tab.sentry.data.length === 0 ? (
              <PanelAllClear label="No unresolved Sentry issues" checkedAt={tab.sentry.fetchedAt ?? new Date().toISOString()} />
            ) : (
              <ul className="divide-y divide-warm-200/60">
                {tab.sentry.data.map((issue) => (
                  <li key={issue.id} className="flex items-center gap-3 py-2">
                    <StatusPill tone={SENTRY_LEVEL_TONE[issue.level] ?? 'danger'} dot size="sm">
                      {issue.level}
                    </StatusPill>
                    <span className="w-20 shrink-0 font-fw-mono text-xs tabular-nums text-warm-500">{issue.shortId}</span>
                    <span className="min-w-0 flex-1 truncate text-sm text-warm-900">{issue.title}</span>
                    <span className="font-fw-mono text-xs tabular-nums text-warm-600">
                      {issue.userCount} users · {issue.count} events
                    </span>
                    <a href={issue.permalink} target="_blank" rel="noreferrer" className="text-xs text-accent-700 underline">
                      open
                    </a>
                  </li>
                ))}
              </ul>
            )
          ) : tab.sentry.status === 'unconfigured' ? (
            <PanelNoData label="Sentry pull not configured" description="Provision SENTRY_READ_TOKEN (org:read, project:read, event:read)." />
          ) : (
            <PanelStale label="Sentry issues" error={tab.sentry.error} />
          )}
        </section>

        <section className="rounded-2xl border border-warm-200 bg-white/70 p-4">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-warm-500">In-app incidents</h2>
          <TriageQueue items={tab.incidents} />
          <p className="mt-2 text-xs text-warm-500">
            Row detail: <span className="font-fw-mono">/admin/errors/&lt;fingerprint&gt;</span> (click-through from each app row title)
          </p>
        </section>
      </div>
    );
  }

  return (
    <main className="space-y-4 p-6">
      <AutoRefresh />
      <div className="flex flex-wrap gap-2">
        {CHIP_SETS.flatMap(({ param, values }) =>
          values.map((v) => (
            <Link
              key={`${param}:${v}`}
              href={chipHref(current, param, v)}
              className={
                current.get(param) === v
                  ? 'rounded-full bg-warm-900 px-3 py-1 text-xs text-white'
                  : 'rounded-full border border-warm-300 px-3 py-1 text-xs text-warm-700 hover:bg-warm-100'
              }
            >
              {param}: {v}
            </Link>
          )),
        )}
      </div>
      <PanelBoundary title="Errors">
        <Body />
      </PanelBoundary>
    </main>
  );
}
