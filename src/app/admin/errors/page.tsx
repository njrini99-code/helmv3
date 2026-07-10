import Link from 'next/link';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import {
  parseErrorsFilters,
  fetchErrorsTab,
  buildFilteredIncidentsReport,
} from '@/lib/admin/data/errors';
import { FEATURE_REGISTRY } from '@/lib/admin/feature-registry';
import { StatusPill, Surface, type FwStatusTone } from '@/components/fairway';
import { TriageQueue } from '../_components/TriageQueue';
import { ErrorsOverTime } from '../_components/ErrorsOverTime';
import { KpiTile } from '../_components/KpiTile';
import { PanelBoundary } from '../_components/PanelBoundary';
import { PanelAllClear, PanelNoData, PanelStale } from '../_components/PanelStates';
import { AutoRefresh } from '../_components/AutoRefresh';
import { CopyReportButton } from '../_components/CopyReportButton';
import { ErrorsFilterChips } from './ErrorsFilterChips';

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

function integrationTone(status: string): FwStatusTone {
  if (status === 'ok') return 'info';
  if (status === 'unconfigured') return 'warning';
  return 'danger';
}

function integrationLabel(status: string): string {
  if (status === 'ok') return 'live';
  if (status === 'unconfigured') return 'needs env';
  return 'stale';
}

function chipHref(current: URLSearchParams, param: string, value: string): string {
  const next = new URLSearchParams(current);
  if (next.get(param) === value) next.delete(param);
  else next.set(param, value);
  const qs = next.toString();
  return qs ? `/admin/errors?${qs}` : '/admin/errors';
}

function clearParamHref(current: URLSearchParams, param: string): string {
  const next = new URLSearchParams(current);
  next.delete(param);
  const qs = next.toString();
  return qs ? `/admin/errors?${qs}` : '/admin/errors';
}

/** Build a href off the CURRENT filter set with the given params overridden
 *  (string → set, null → delete) — every other filter (sport/severity/source/
 *  feature) survives the navigation instead of being silently dropped. */
function hrefWithOverrides(current: URLSearchParams, overrides: Record<string, string | null>): string {
  const next = new URLSearchParams(current);
  for (const [key, value] of Object.entries(overrides)) {
    if (value === null) next.delete(key);
    else next.set(key, value);
  }
  const qs = next.toString();
  return qs ? `/admin/errors?${qs}` : '/admin/errors';
}

function ErrorTraceabilityStrip({ incidents }: { incidents: Awaited<ReturnType<typeof fetchErrorsTab>>['incidents'] }) {
  const appIncidents = incidents.filter((incident) => incident.origin === 'app');
  const withFeature = appIncidents.filter((incident) => incident.feature).length;
  const withRoute = appIncidents.filter((incident) => incident.route).length;
  const withAction = appIncidents.filter((incident) => incident.actionName).length;
  const unknownUsers = appIncidents.filter((incident) => incident.affectedUsers === 0 && incident.occurrences > 0).length;
  const noisyLooking = appIncidents.filter(
    (incident) =>
      incident.source === 'auth' ||
      incident.source === 'client' ||
      (incident.affectedUsers === 0 && incident.occurrences <= 1),
  ).length;
  const coverageBase = Math.max(1, appIncidents.length);
  const rows = [
    ['Feature tags', withFeature, `${Math.round((withFeature / coverageBase) * 100)}% mapped`],
    ['Route traces', withRoute, `${Math.round((withRoute / coverageBase) * 100)}% mapped`],
    ['Action names', withAction, `${Math.round((withAction / coverageBase) * 100)}% mapped`],
    ['Unknown users', unknownUsers, 'identity gap'],
    ['Noise candidates', noisyLooking, 'review before paging'],
  ] as const;

  return (
    <Surface padding="sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-warm-200 pb-2">
        <h2 className="text-eyebrow uppercase text-warm-500">Error traceability</h2>
        <StatusPill tone={unknownUsers > 0 || noisyLooking > 0 ? 'warning' : 'success'} dot size="sm">
          {unknownUsers > 0 || noisyLooking > 0 ? 'needs mapping' : 'mapped'}
        </StatusPill>
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-5">
        {rows.map(([label, value, caption]) => (
          <div key={label} className="rounded-fw-md bg-surface-sunken px-3 py-2">
            <p className="text-caption uppercase tracking-widest text-warm-500">{label}</p>
            <p className="font-fw-mono text-xl font-semibold tabular-nums text-warm-900">{value}</p>
            <p className="text-caption text-warm-500">{caption}</p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-caption text-warm-500">
        Goal: every app incident should carry feature, route or action, and identity when auth exists. Unknown does not mean unaffected.
      </p>
    </Surface>
  );
}

const FEATURE_LABELS: Record<string, string> = Object.fromEntries(
  FEATURE_REGISTRY.map((f) => [f.key, f.label]),
);

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
    const { counts } = tab;
    const showWiderWindowHint =
      tab.incidents.length === 0 &&
      filters.windowHours < 168 &&
      ((tab.widerWindowUnresolved ?? 0) > 0 || (tab.widerWindowUntagged ?? 0) > 0);
    const sourceBreakdown = Array.from(
      tab.incidents.reduce((map, incident) => {
        const key = incident.source ?? incident.origin;
        map.set(key, (map.get(key) ?? 0) + 1);
        return map;
      }, new Map<string, number>()),
    )
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    return (
      <div className="space-y-6">
        {showWiderWindowHint ? (
          <Surface padding="sm" className="border border-warning/30 bg-warning/5">
            <p className="text-body-sm text-warm-800">
              Nothing in the last {filters.windowHours}h
              {filters.sport ? ` for sport=${filters.sport}` : ''}, but there are unresolved incidents in the last 7 days
              {(tab.widerWindowUnresolved ?? 0) > 0 ? (
                <>
                  {' '}
                  (<span className="font-fw-mono tabular-nums">{tab.widerWindowUnresolved}</span>
                  {filters.sport ? ` tagged ${filters.sport}` : ''})
                </>
              ) : null}
              {(tab.widerWindowUntagged ?? 0) > 0 ? (
                <>
                  {' '}
                  plus{' '}
                  <span className="font-fw-mono tabular-nums">{tab.widerWindowUntagged}</span> legacy rows with no sport tag
                </>
              ) : null}
              .{' '}
              <Link
                href={hrefWithOverrides(current, { window: '168' })}
                className="text-accent-700 underline"
              >
                Open 7-day view
              </Link>
              {filters.sport ? (
                <>
                  {' '}
                  or{' '}
                  <Link
                    href={hrefWithOverrides(current, { window: '168', sport: null })}
                    className="text-accent-700 underline"
                  >
                    drop the sport filter
                  </Link>{' '}
                  to include untagged {filters.sport} errors.
                </>
              ) : null}
            </p>
          </Surface>
        ) : null}
        <section className="grid gap-3 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.8fr)]">
          <Surface padding="sm" className="min-w-0">
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <p className="text-eyebrow uppercase text-warm-500">active groups</p>
                <p className="font-fw-mono text-h2 tabular-nums text-warm-900">{counts.totalGroups}</p>
                <p className="text-caption text-warm-500">
                  {counts.appGroups} app · {counts.sentryGroups} sentry · {filters.windowHours}h window
                </p>
              </div>
              <div>
                <p className="text-eyebrow uppercase text-warm-500">high severity</p>
                <p className="font-fw-mono text-h2 tabular-nums text-warm-900">{counts.highSeverityGroups}</p>
                <p className="text-caption text-warm-500">critical and error groups</p>
              </div>
              <div>
                <p className="text-eyebrow uppercase text-warm-500">affected users</p>
                <p className="font-fw-mono text-h2 tabular-nums text-warm-900">{counts.affectedUsers}</p>
                <p className="text-caption text-warm-500">deduped per incident group</p>
              </div>
            </div>
            {sourceBreakdown.length > 0 ? (
              <div className="mt-4 flex flex-wrap gap-2 border-t border-warm-200 pt-3">
                {sourceBreakdown.map(([source, count]) => (
                  <Link
                    key={source}
                    href={chipHref(current, 'source', source)}
                    aria-current={current.get('source') === source ? 'true' : undefined}
                    className={cn(
                      'inline-flex items-center gap-2 rounded border px-2 py-1 font-fw-mono text-caption transition-colors',
                      current.get('source') === source
                        ? 'border-warm-900 bg-warm-900 text-white'
                        : 'border-warm-200 bg-warm-50 text-warm-600 hover:bg-warm-100',
                    )}
                  >
                    {source}
                    <span className={current.get('source') === source ? 'tabular-nums text-white' : 'tabular-nums text-warm-900'}>{count}</span>
                  </Link>
                ))}
              </div>
            ) : null}
          </Surface>
          <Surface padding="sm" className="min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-warm-200 pb-2">
              <h2 className="text-eyebrow uppercase text-warm-500">observability wiring</h2>
              <span className="font-fw-mono text-caption text-warm-500">production</span>
            </div>
            <dl className="mt-3 grid gap-2">
              {([
                ['Sentry issues', tab.sentry.status],
                ['Sentry hourly', tab.hourly.status],
                ['Vercel deploys', tab.deployments.status],
              ] as Array<[string, string]>).map(([label, status]) => (
                <div key={label} className="flex items-center justify-between gap-3">
                  <dt className="text-body-sm text-warm-700">{label}</dt>
                  <dd>
                    <StatusPill tone={integrationTone(status)} dot size="sm">
                      {integrationLabel(status)}
                    </StatusPill>
                  </dd>
                </div>
              ))}
            </dl>
            {tab.deployments.status === 'unconfigured' || tab.sentry.status === 'unconfigured' ? (
              <p className="mt-3 text-caption text-warm-500">
                Missing env vars keep correlation muted; unresolved app incidents still render from Supabase.
              </p>
            ) : null}
          </Surface>
        </section>

        <section className="grid gap-4 lg:grid-cols-[2fr_1fr]">
          {tab.hourly.status === 'ok' && tab.hourly.data ? (
            <ErrorsOverTime points={tab.hourly.data} deployMarkers={tab.deployMarkers} />
          ) : tab.hourly.status === 'unconfigured' ? (
            <Surface padding="sm">
              <PanelNoData label="Hourly series not configured" description="Provision SENTRY_READ_TOKEN to light this chart up." />
            </Surface>
          ) : (
            <Surface padding="sm">
              <PanelStale label="Hourly series" error={tab.hourly.error} />
            </Surface>
          )}
          <KpiTile
            label="RLS denials · 24h"
            value={tab.rlsDenials24h}
            href="/admin/errors?source=rls_denial"
            tone={tab.rlsDenials24h > 0 ? 'warning' : 'neutral'}
            goodDirection="down"
          />
        </section>

        <ErrorTraceabilityStrip incidents={tab.incidents} />

        <Surface as="section" padding="sm">
          <h2 className="border-b border-accent-600/25 pb-2 text-xs font-semibold uppercase tracking-widest text-warm-500">
            Sentry unresolved (org-wide)
          </h2>
          <p className="mt-1 text-caption text-warm-500">
            All open Sentry issues — not windowed. Active groups above only count Sentry issues with activity in the selected window.
          </p>
          {tab.sentry.status === 'ok' && tab.sentry.truncated ? (
            <p className="mt-1 text-caption text-fw-warning">
              Showing first {tab.sentry.data?.length ?? 0} unresolved issues — more exist beyond this page ceiling.
            </p>
          ) : null}
          {tab.sentry.status === 'ok' && tab.sentry.data ? (
            tab.sentry.data.length === 0 ? (
              <PanelAllClear label="No unresolved Sentry issues" checkedAt={tab.sentry.fetchedAt ?? new Date().toISOString()} />
            ) : (
              <ul className="divide-y divide-warm-200/60">
                {tab.sentry.data.map((issue) => (
                  <li key={issue.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                    <StatusPill tone={SENTRY_LEVEL_TONE[issue.level] ?? 'danger'} dot size="sm">
                      {issue.level}
                    </StatusPill>
                    <span className="w-20 shrink-0 font-fw-mono text-xs tabular-nums text-warm-500">{issue.shortId}</span>
                    <span className="min-w-0 flex-1 basis-full break-words text-sm text-warm-900 [overflow-wrap:anywhere] sm:basis-auto">{issue.title}</span>
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
        </Surface>

        <Surface as="section" padding="sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-accent-600/25 pb-2">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-warm-500">In-app incidents</h2>
            <CopyReportButton
              report={buildFilteredIncidentsReport(tab.incidents, filters)}
              label={`Copy all (filtered) · ${tab.incidents.length}`}
            />
          </div>
          <TriageQueue items={tab.incidents} />
          <p className="mt-2 text-xs text-warm-500">
            Row detail: <span className="font-fw-mono">/admin/errors/&lt;fingerprint&gt;</span> (click-through from each app row title)
          </p>
        </Surface>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <AutoRefresh />
      {filters.feature ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex min-h-10 items-center rounded-full bg-warm-900 px-3 text-xs text-white">
            feature: {FEATURE_LABELS[filters.feature] ?? filters.feature}
          </span>
          <Link
            href={clearParamHref(current, 'feature')}
            aria-label="Clear feature filter"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-warm-300 text-warm-500 hover:bg-warm-100"
          >
            <X size={12} aria-hidden />
          </Link>
        </div>
      ) : null}
      <ErrorsFilterChips
        chips={CHIP_SETS.flatMap(({ param, values }) =>
          values.map((v) => ({
            key: `${param}:${v}`,
            label: `${param}: ${v}`,
            href: chipHref(current, param, v),
            selected: current.get(param) === v,
          })),
        )}
      />
      <PanelBoundary title="Errors">
        <Body />
      </PanelBoundary>
    </div>
  );
}
