import Link from 'next/link';
import { cn } from '@/lib/utils';
import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import {
  parseErrorsFilters,
  fetchErrorsTab,
  buildFilteredIncidentsReport,
  type ErrorsTabFilters,
} from '@/lib/admin/data/errors';
import { FEATURE_REGISTRY } from '@/lib/admin/feature-registry';
import {
  INCIDENT_CLASS_LABEL,
  INCIDENT_CLASS_DESCRIPTION,
  INCIDENT_CLASS_ORDER,
} from '@/lib/admin/incident-classification';
import { DEFAULT_INCIDENT_WINDOW_HOURS } from '@/lib/admin/data/incident-feed';
import { StatStrip, StatusPill, Surface, type FwStatusTone } from '@/components/fairway';
import { applyIncidentFacets, countLensesForKind, suppressedByClass } from '@/lib/admin/incidents/lens';
import { sumHourlyBuckets, describeWindowDelta, type DeltaDirection } from '@/lib/admin/error-trend';
import { canClaimAllClear } from '@/lib/admin/incidents/sources';
import {
  INCIDENT_LENSES,
  INCIDENT_LENS_LABEL,
  parseIncidentLens,
  type IncidentLens,
} from '@/lib/admin/incidents/types';
import { UnifiedIncidentQueue } from '../_components/UnifiedIncidentQueue';
import { IncidentLensRail } from '../_components/IncidentLensRail';
import { BlindnessBeacon } from '../_components/BlindnessBeacon';
import { ErrorSurfaceReconciliation } from '../_components/ErrorSurfaceReconciliation';
import { reconcileErrorSurfaces } from '@/lib/admin/incidents/reconciliation';
import { SourceCoverageSummaryLine } from '../_components/SourceCoverage';
import { ErrorsOverTime } from '../_components/ErrorsOverTime';
import { KpiTile } from '../_components/KpiTile';
import { PanelBoundary } from '../_components/PanelBoundary';
import { PanelPageSkeleton } from '../_components/PanelSkeletons';
import { PanelAllClear, PanelNoData, PanelStale } from '../_components/PanelStates';
import { AutoRefresh } from '../_components/AutoRefresh';
import { LocalTime } from '../_components/LocalTime';
import { CopyReportButton } from '../_components/CopyReportButton';
import { BulkResolveButton } from '../_components/BulkResolveButton';
import { ErrorsFilterBar, type ActiveFilter, type FilterGroup } from './_components/ErrorsFilterBar';
import { HowToReadIncidents } from './_components/HowToReadIncidents';
import { ArchivePanel } from './_components/ArchivePanel';
import { ReleaseWatchPanel } from './_components/ReleaseWatchPanel';
import { loadErrorsPageData } from './_data';
import { buildBoardAliasGroups, buildIncidentGenome } from '@/lib/admin/incidents/genome';
import { fetchCurrentReleaseWatch, emptyReleaseWatch } from '@/lib/admin/incidents/release-watch';
export const dynamic = 'force-dynamic';

/**
 * /admin/errors — the Incidents page.
 *
 * ORGANISED AS FIVE QUESTIONS, top to bottom, each its own labelled section:
 *
 *   1. What needs attention?      the canonical queue, one row per cause
 *   2. Is it getting worse?       this window against the last, hourly, by
 *                                 source and by feature
 *   3. Is the Bridge seeing       what each source reported, and how much
 *      everything?                of the feed is traceable
 *   4. What does Sentry hold      the org-wide unresolved list, not windowed
 *      that we have not folded?
 *   5. What was fixed, and did    the archive
 *      it ship?
 *
 * The filters sit above all of it, grouped and in words, collapsed until one
 * is active. The page's own legend (`HowToReadIncidents`) sits under the
 * header, closed by default, because "what is an incident" is a question a
 * first-time reader has and a daily one does not.
 *
 * Until 2026-09-01 this page opened with a flat row of twenty pills that
 * rendered query-parameter names as labels, put the source/runtime
 * reconciliation ABOVE the incident list, and scattered its counts across
 * three unlabelled grids. The data underneath did not change; what changed
 * is that every number now sits under a heading that says what question it
 * answers.
 */

// ---------------------------------------------------------------------------
// Labels — words for the values the URL carries.
// ---------------------------------------------------------------------------

const SPORT_LABEL: Readonly<Record<string, string>> = { golf: 'Golf', baseball: 'Baseball', shared: 'Shared' };
const SEVERITY_LABEL: Readonly<Record<string, string>> = {
  critical: 'Critical',
  error: 'Error',
  warning: 'Warning',
  info: 'Info',
};
const SOURCE_LABEL: Readonly<Record<string, string>> = {
  server_action: 'Server action',
  route_handler: 'Route handler',
  server_component: 'Server component',
  background_job: 'Background job',
  request_hook: 'Request hook',
  rls_denial: 'RLS denial',
  auth: 'Auth',
  cron: 'Cron',
  integrity: 'Integrity check',
  client: 'Client',
  system: 'System',
  sentry: 'Sentry',
};
const SOURCE_DESCRIPTION: Readonly<Record<string, string>> = {
  server_action: 'Thrown or logged inside a server action',
  rls_denial: 'Row-level security refused a read or write',
  auth: 'Sign-in, session or password flow',
  cron: 'A scheduled job',
  client: 'Reported by the browser',
};
const WINDOW_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: '24', label: 'Last 24 hours' },
  { value: '72', label: 'Last 3 days' },
  { value: '168', label: 'Last 7 days' },
];

// `up` is the bad direction for an error count. `unknown` is amber, not
// grey: a comparison that could not be made is a fact worth noticing, not a
// blank to skim past.
const DELTA_INK: Readonly<Record<DeltaDirection, string>> = {
  up: 'text-fw-danger-ink',
  down: 'text-fw-success-ink',
  flat: 'text-warm-700',
  unknown: 'text-fw-warning-ink',
};

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

// ---------------------------------------------------------------------------
// Hrefs — the page owns the URL shape; every control gets a computed link.
// ---------------------------------------------------------------------------

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

const FEATURE_LABELS: Record<string, string> = Object.fromEntries(
  FEATURE_REGISTRY.map((f) => [f.key, f.label]),
);

/**
 * The filter groups, in words, with an explicit "All" per group so the
 * resting state is visible. `selected` is read off the URL, the same place
 * `parseErrorsFilters` reads it, so the bar and the data can never disagree
 * about what is active.
 */
function buildFilterGroups(current: URLSearchParams, filters: ErrorsTabFilters): FilterGroup[] {
  const single = (param: string, label: string, hint: string, values: ReadonlyArray<[string, string, string?]>): FilterGroup => ({
    param,
    label,
    hint,
    options: [
      { value: '', label: 'All', href: clearParamHref(current, param), selected: !current.get(param) },
      ...values.map(([value, text, description]) => ({
        value,
        label: text,
        href: hrefWithOverrides(current, { [param]: value }),
        selected: current.get(param) === value,
        description,
      })),
    ],
  });

  return [
    single('sport', 'Sport', 'Which product the error belongs to. Legacy rows with no sport tag only appear under All.', [
      ['golf', SPORT_LABEL.golf!],
      ['baseball', SPORT_LABEL.baseball!],
      ['shared', SPORT_LABEL.shared!, 'Platform code both sports use'],
    ]),
    single('severity', 'Severity', 'The worst severity an incident has produced.', [
      ['critical', SEVERITY_LABEL.critical!],
      ['error', SEVERITY_LABEL.error!],
      ['warning', SEVERITY_LABEL.warning!],
      ['info', SEVERITY_LABEL.info!],
    ]),
    single('source', 'Source', 'Where the error was captured.', [
      ['server_action', SOURCE_LABEL.server_action!, SOURCE_DESCRIPTION.server_action],
      ['rls_denial', SOURCE_LABEL.rls_denial!, SOURCE_DESCRIPTION.rls_denial],
      ['auth', SOURCE_LABEL.auth!, SOURCE_DESCRIPTION.auth],
      ['cron', SOURCE_LABEL.cron!, SOURCE_DESCRIPTION.cron],
      ['client', SOURCE_LABEL.client!, SOURCE_DESCRIPTION.client],
    ]),
    {
      param: 'window',
      label: 'Window',
      hint: 'How far back the list reaches. Three days is the default because the nightly analysis reads the same three days.',
      options: WINDOW_OPTIONS.map((option) => ({
        value: option.value,
        label: option.label,
        href:
          Number(option.value) === DEFAULT_INCIDENT_WINDOW_HOURS
            ? clearParamHref(current, 'window')
            : hrefWithOverrides(current, { window: option.value }),
        selected: filters.windowHours === Number(option.value),
      })),
    },
    {
      param: 'kind',
      label: 'Kind',
      hint: 'What the classifier decided an incident is. The default shows only the kinds someone needs to act on.',
      options: [
        {
          value: '',
          label: 'Needs action',
          href: clearParamHref(current, 'kind'),
          selected: !current.get('kind'),
          description: 'Defects, degradations, integration faults and RLS tripwires — the default view',
        },
        {
          value: 'all',
          label: 'Everything',
          href: hrefWithOverrides(current, { kind: 'all' }),
          selected: current.get('kind') === 'all',
          description: 'Every kind, including telemetry and expected control flow',
        },
        ...INCIDENT_CLASS_ORDER.map((klass) => ({
          value: klass,
          label: INCIDENT_CLASS_LABEL[klass],
          href: hrefWithOverrides(current, { kind: klass }),
          selected: current.get('kind') === klass,
          description: INCIDENT_CLASS_DESCRIPTION[klass],
        })),
      ],
    },
  ];
}

/** Every filter the URL currently carries, as a word pair with a link that clears it. */
function activeFilters(current: URLSearchParams, filters: ErrorsTabFilters): ActiveFilter[] {
  const active: ActiveFilter[] = [];
  if (filters.sport) active.push({ param: 'sport', label: 'Sport', value: SPORT_LABEL[filters.sport] ?? filters.sport, clearHref: clearParamHref(current, 'sport') });
  if (filters.severity) active.push({ param: 'severity', label: 'Severity', value: SEVERITY_LABEL[filters.severity] ?? filters.severity, clearHref: clearParamHref(current, 'severity') });
  if (filters.source) active.push({ param: 'source', label: 'Source', value: SOURCE_LABEL[filters.source] ?? filters.source, clearHref: clearParamHref(current, 'source') });
  if (current.get('window')) active.push({ param: 'window', label: 'Window', value: WINDOW_OPTIONS.find((w) => Number(w.value) === filters.windowHours)?.label ?? `${filters.windowHours}h`, clearHref: clearParamHref(current, 'window') });
  if (filters.kind) active.push({ param: 'kind', label: 'Kind', value: filters.kind === 'all' ? 'Everything' : INCIDENT_CLASS_LABEL[filters.kind], clearHref: clearParamHref(current, 'kind') });
  if (filters.feature) active.push({ param: 'feature', label: 'Feature', value: FEATURE_LABELS[filters.feature] ?? filters.feature, clearHref: clearParamHref(current, 'feature') });
  return active;
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

function SectionHeading({ id, title, lede }: { id: string; title: string; lede: string }) {
  return (
    <div className="max-w-3xl">
      <h2 id={id} className="text-base font-semibold text-warm-900">
        {title}
      </h2>
      <p className="mt-0.5 text-caption leading-5 text-warm-500">{lede}</p>
    </div>
  );
}

/** Takes the already-filtered app-origin subset — never the raw mixed
 *  incidents array — so the render guard at the call site and the metrics
 *  computed in here are provably the same population (see repair-round
 *  fix below: a Sentry-only incidents array must not produce a "0 / 1 = 0%"
 *  strip). */
function ErrorTraceabilityStrip({ appIncidents }: { appIncidents: Awaited<ReturnType<typeof fetchErrorsTab>>['incidents'] }) {
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
        <div>
          <h3 className="text-eyebrow uppercase text-warm-500">Traceability</h3>
          <p className="text-caption text-warm-500">
            How much of the app-origin feed says which feature, route and action it came from.
          </p>
        </div>
        <StatusPill tone={unknownUsers > 0 || noisyLooking > 0 ? 'warning' : 'success'} dot size="sm">
          {unknownUsers > 0 || noisyLooking > 0 ? 'needs mapping' : 'mapped'}
        </StatusPill>
      </div>
      {/* Below md: 5 peer stat cells become a contained, edge-bled horizontal
          snap-rail (Mobile Doctrine rule 3 — cap the scroll, never stack 5
          full-width rows) via the shared StatStrip primitive. `mdColumns={5}`
          pins the desktop shape back to the original single-row 5-col grid
          starting exactly at md so md+ is byte-for-byte unchanged. */}
      <StatStrip
        count={rows.length}
        mdColumns={5}
        edgeBleedClassName="-mx-4 px-4"
        ariaLabel="Error traceability breakdown"
        className="mt-3"
      >
        {rows.map(([label, value, caption]) => (
          <div key={label} className="rounded-fw-md bg-surface-sunken px-3 py-2">
            <p className="text-caption uppercase tracking-widest text-warm-500">{label}</p>
            <p className="font-fw-mono text-xl font-semibold tabular-nums text-warm-900">{value}</p>
            <p className="text-caption text-warm-500">{caption}</p>
          </div>
        ))}
      </StatStrip>
      <p className="mt-3 text-caption text-warm-500">
        Every app incident should carry a feature, a route or an action, and an identity when auth exists. Unknown does not mean unaffected.
      </p>
    </Surface>
  );
}

/** Section heading per lens — the list says which question it is answering. */
function lensHeading(lens: IncidentLens): string {
  return lens === 'all' ? 'All incidents' : `${INCIDENT_LENS_LABEL[lens]} incidents`;
}

/** A filter chip in the breakdown rows — a real link, selected state in
 *  colour AND `aria-current`. `text-warm-50`, not `text-white`: warm-900
 *  inverts in the dark token block, so a literal white label on a selected
 *  chip would be white-on-cream once /admin follows the theme. */
function BreakdownChip({
  href,
  selected,
  label,
  count,
  title,
}: {
  href: string | null;
  selected: boolean;
  label: string;
  count: number;
  title?: string;
}) {
  const className = cn(
    'inline-flex min-h-8 items-center gap-2 rounded border px-2 font-fw-mono text-caption transition-colors',
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500',
    href === null && 'cursor-default border-dashed',
    selected
      ? 'border-warm-900 bg-warm-900 text-warm-50'
      : 'border-warm-200 bg-warm-50 text-warm-600 hover:bg-warm-100',
  );
  const body = (
    <>
      {label}
      <span className={selected ? 'tabular-nums text-warm-50' : 'tabular-nums text-warm-900'}>{count}</span>
    </>
  );
  return href ? (
    <Link href={href} aria-current={selected ? 'true' : undefined} className={className} title={title}>
      {body}
    </Link>
  ) : (
    <span className={className} title={title}>
      {body}
    </span>
  );
}

export default async function ErrorsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireSuperAdmin();
  const params = await searchParams;
  const filters = parseErrorsFilters(params);
  const lens: IncidentLens = parseIncidentLens(params.lens);
  const current = new URLSearchParams(
    Object.entries(params).flatMap(([k, v]) => (typeof v === 'string' ? [[k, v] as [string, string]] : [])),
  );

  async function Body() {
    const { tab, archiveResult, board } = await loadErrorsPageData(filters);
    const { counts } = tab;
    // Both facets narrow the SAME canonical list: lens by lifecycle/attention,
    // kind by what the classifier decided the incident is. Neither forks it.
    const lensed = applyIncidentFacets(board.incidents, lens, filters.kind);
    const allClearAllowed = canClaimAllClear(board.coverage);

    // Phase 1 — Incident Genome + Release Watch (brief §8/§9/§14).
    // `fetchCurrentReleaseWatch` itself fails soft to an `unavailableReason`
    // for the ordinary "ledger unconfigured" case; the outer `.catch()` is
    // defense against a genuinely unexpected throw — a Release Watch that
    // could not be computed must never blank the rest of the Incidents
    // queue behind it. Alias grouping runs over the FULL board (not just
    // `lensed`) so a card's "same root cause" answer never depends on which
    // lens happens to be selected; the Genome itself is only computed for
    // rows this render actually shows.
    const releaseWatch = await fetchCurrentReleaseWatch({ incidents: board.incidents, coverage: board.coverage }).catch(
      (err: unknown) =>
        emptyReleaseWatch(
          err instanceof Error ? `Release watch failed: ${err.message}` : 'Release watch failed unexpectedly.',
          board.coverage.anyBlind,
        ),
    );
    const aliasGroups = buildBoardAliasGroups(board.incidents);
    const genomeByIncident = new Map(
      lensed.map((incident) => [incident.id, buildIncidentGenome(incident, board.incidents, aliasGroups)] as const),
    );

    // The two surfaces, separately. Counting INCIDENTS rather than raw rows is
    // deliberate: an incident is one production cause, so twelve Sentry events
    // of one fault are one thing wrong, not twelve. Worth knowing before
    // comparing screens — this number will NOT match the Sentry dashboard's
    // unresolved-issue count, and is not meant to.
    //
    // The two counts are also asymmetric on purpose. The application side takes
    // error-or-worse only, because admin_events is GRADED and that grading is
    // its whole value. The runtime side takes every correlated Sentry incident,
    // ungraded, because docs/OBSERVABILITY_AUTHORITY.md forbids silencing Sentry
    // issues Helm happens to grade info — Helm's opinion of a fault it never
    // handled is not evidence about that fault.
    //
    // A source that could not be read contributes null, never 0. That
    // substitution is the entire defect being fixed.
    const healthOf = (name: 'app' | 'sentry') =>
      board.freshness.find((f) => f.source === name)?.health ?? 'unknown';
    const readable = (name: 'app' | 'sentry') => {
      const h = healthOf(name);
      return h !== 'blind' && h !== 'unknown';
    };
    const reconciliation = reconcileErrorSurfaces({
      application: {
        health: healthOf('app'),
        count: readable('app')
          ? board.incidents.filter(
              (i) =>
                i.appFingerprints.length > 0 && (i.severity === 'error' || i.severity === 'critical'),
            ).length
          : null,
      },
      runtime: {
        health: healthOf('sentry'),
        count: readable('sentry')
          ? board.incidents.filter((i) => i.sentryIssueIds.length > 0).length
          : null,
      },
    });
    // fingerprint-keyed 24h histograms, re-keyed to incident ids. An incident
    // folds one or more fingerprints, so the series is the FIRST one that has
    // history rather than a sum — summing two independent histograms would
    // draw a shape neither source ever produced.
    //
    // A Sentry-origin incident folds NO app fingerprints, so the app histogram
    // lookup alone leaves it with no sparkline at all — which is how the old
    // TriageQueue's second series source (`sentryStats24h`) quietly went unused
    // when this queue replaced it. Sentry bakes its own 24h stats into each
    // issue, so fall back to those, keyed by the incident's Sentry issue ids.
    const sentrySeriesById = new Map<string, number[]>();
    for (const issue of tab.sentry.data ?? []) {
      const series = issue.stats24h.map(([, count]) => count);
      if (series.length >= 2) sentrySeriesById.set(issue.id, series);
    }
    const seriesByIncident: Record<string, number[]> = {};
    for (const incident of board.incidents) {
      const series =
        incident.appFingerprints
          .map((fp) => tab.appHourlyBuckets[fp])
          .find((s) => Array.isArray(s) && s.length >= 2) ??
        incident.sentryIssueIds.map((id) => sentrySeriesById.get(id)).find((s) => s !== undefined);
      if (series) seriesByIncident[incident.id] = series;
    }
    // Sentry-origin and app-origin incidents are concatenated independently
    // by mergeTriage() with no invariant coupling them — tab.incidents can be
    // non-empty (legacy Sentry issues) while app incidents are genuinely zero
    // for this window/filter set. Compute once here so the traceability strip's
    // render guard and its metrics agree on the same population.
    const appIncidents = tab.incidents.filter((incident) => incident.origin === 'app');
    // What the default kind filter is holding back. Stated explicitly and
    // broken down by class — a filter that silently hides most of the feed is
    // worse than no filter, because the operator cannot tell the queue is
    // being curated at all.
    const suppressedBreakdown = suppressedByClass(board.incidents);
    // A QA fixture round stays `actionable` (unforced — see the field's doc
    // comment on `TriageItem.isFixture`) so it still renders in this default
    // feed, badged FIXTURE; it must not count toward "what needs action"
    // here. Catalogued defect (h).
    const shownActionable = board.incidents.filter(
      (incident) => incident.actionable && !incident.isFixture,
    ).length;
    const heldBack = suppressedBreakdown.reduce((sum, entry) => sum + entry.count, 0);
    const showSuppressedNotice = !filters.kind && heldBack > 0;
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
      .slice(0, 6);
    // Which features carry the incidents in this window, off the canonical
    // board. Only a key the registry knows becomes a link — parseErrorsFilters
    // drops anything else, so an unregistered feature string would link to a
    // filter that silently did nothing, the inert-control trap lens.ts
    // documents. It still renders, unlinked, because a feature the registry
    // has never heard of carrying incidents is itself worth seeing.
    const featureBreakdown = Array.from(
      board.incidents.reduce((map, incident) => {
        map.set(incident.featureId ?? '', (map.get(incident.featureId ?? '') ?? 0) + 1);
        return map;
      }, new Map<string, number>()),
    )
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
    // The one "compared to what" on this page. Rows written, current window
    // against the equal window before it; null in means unreadable out.
    const windowDelta = describeWindowDelta(tab.appErrorRows.current, tab.appErrorRows.previous, filters.windowHours);
    // Sentry's hourly series is the first choice; the app's own rows draw the
    // same chart when it is unavailable, labelled as one witness. Summed
    // against the exact clock the buckets were built on.
    const appHourly = sumHourlyBuckets(tab.appHourlyBuckets, tab.appHourlyComputedAt);
    const lensCounts = countLensesForKind(board.incidents, filters.kind);

    return (
      <div className="space-y-8">
        {/* THE PAGE STATES ITS OWN PROVENANCE. Counts, the sources behind
            them, the window they cover, and how long ago they were
            reconciled — because a count without those four is a claim about
            the present made from data of unknown vintage. */}
        <section aria-label="Incident summary" className="space-y-3">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <p className="font-fw-mono text-body-sm tabular-nums text-warm-800">
              <span className="font-semibold text-warm-900">{board.lensCounts.actionable}</span> actionable
              <span className="px-1.5 text-warm-400">·</span>
              <span className="font-semibold text-warm-900">{board.lensCounts.regressions}</span> regression
              {board.lensCounts.regressions === 1 ? '' : 's'}
              <span className="px-1.5 text-warm-400">·</span>
              <span className="font-semibold text-warm-900">{board.lensCounts.repairable}</span> repairable
              <span className="px-1.5 text-warm-400">·</span>
              <span className="font-semibold text-warm-900">{board.lensCounts.stalled}</span> stalled
            </p>
            <p className="flex flex-wrap items-center gap-x-2 font-fw-mono text-caption text-warm-400">
              <SourceCoverageSummaryLine coverage={board.coverage} />
              <span aria-hidden>·</span>
              <span>{board.windowHours}h window</span>
              <span aria-hidden>·</span>
              <span>
                reconciled <LocalTime iso={board.computedAt} />
              </span>
            </p>
          </div>
          <HowToReadIncidents />
        </section>

        <BlindnessBeacon note={board.blindnessNote} coverage={board.coverage} />

        <ReleaseWatchPanel releaseWatch={releaseWatch} />

        {/* 1. THE canonical list. One incident per production cause, every
            source that saw it attached, and no second copy of it anywhere on
            this page — which is the entire point of the read model behind it. */}
        <Surface as="section" padding="sm" aria-labelledby="incidents-queue-heading">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-warm-200 pb-3">
            <div className="max-w-2xl">
              <h2 id="incidents-queue-heading" className="text-base font-semibold text-warm-900">
                What needs attention
              </h2>
              <p className="mt-0.5 text-caption leading-5 text-warm-500">
                Pick a lens to change the question this list answers. Every lens filters the same incidents; none is
                a separate feed. Rows are grouped by severity and each one links to its full record.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <CopyReportButton
                report={buildFilteredIncidentsReport(tab.incidents, filters)}
                label={`Copy all (filtered) · ${tab.incidents.length}`}
              />
              <BulkResolveButton eventIds={lensed.flatMap((i) => board.eventIdsByIncident[i.id] ?? [])} />
            </div>
          </div>

          <div className="mt-3">
            <IncidentLensRail
              active={lens}
              // Counted over the list the kind facet leaves, so the number beside
              // a lens equals what clicking it shows while ?kind= is active.
              counts={lensCounts}
              hrefFor={(next) => hrefWithOverrides(current, { lens: next === 'actionable' ? null : next })}
            />
          </div>

          {showSuppressedNotice ? (
            <p className="mt-3 rounded-fw-md bg-surface-sunken px-3 py-2 text-caption leading-5 text-warm-700">
              Showing <span className="font-fw-mono tabular-nums">{shownActionable}</span> that need action.{' '}
              <span className="font-fw-mono tabular-nums">{heldBack}</span> held back as not a bug:{' '}
              {suppressedBreakdown.map((entry, i) => (
                <span key={entry.klass}>
                  {i > 0 ? ', ' : ''}
                  <Link
                    href={hrefWithOverrides(current, { kind: entry.klass })}
                    className="text-accent-700 underline"
                    title={INCIDENT_CLASS_DESCRIPTION[entry.klass]}
                  >
                    {entry.count} {INCIDENT_CLASS_LABEL[entry.klass].toLowerCase()}
                  </Link>
                </span>
              ))}
              .{' '}
              <Link href={hrefWithOverrides(current, { kind: 'all' })} className="text-accent-700 underline">
                Show everything
              </Link>
            </p>
          ) : null}

          {showWiderWindowHint ? (
            <p className="mt-3 rounded-fw-md border border-fw-warning/30 bg-fw-warning/5 px-3 py-2 text-caption leading-5 text-warm-800">
              Nothing in the last {filters.windowHours}h
              {filters.sport ? ` for ${SPORT_LABEL[filters.sport] ?? filters.sport}` : ''}, but there are unresolved
              incidents in the last 7 days
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
                  plus <span className="font-fw-mono tabular-nums">{tab.widerWindowUntagged}</span> legacy rows with no
                  sport tag
                </>
              ) : null}
              .{' '}
              <Link href={hrefWithOverrides(current, { window: '168' })} className="text-accent-700 underline">
                Open the 7-day view
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
          ) : null}

          <div className="mt-3">
            <h3 className="mb-1 flex items-baseline gap-2 text-eyebrow uppercase tracking-widest text-warm-500">
              {INCIDENT_LENSES.includes(lens) ? lensHeading(lens) : 'Incidents'}
              <span className="font-fw-mono tabular-nums text-warm-400">{lensed.length}</span>
            </h3>
            <UnifiedIncidentQueue
              incidents={lensed}
              eventIdsByIncident={board.eventIdsByIncident}
              seriesByIncident={seriesByIncident}
              canClaimAllClear={allClearAllowed}
              blindnessNote={board.blindnessNote}
              checkedAt={board.computedAt}
              presentations={board.presentations}
              genomeByIncident={genomeByIncident}
              releaseRelationships={releaseWatch.relationships}
            />
          </div>
          <p className="mt-3 text-caption text-warm-500">
            Open a title for the full record: every event, the analysis, the repair and its proof. Reliability-origin
            incidents live under their <span className="font-fw-mono">rel:</span> signature.
          </p>
        </Surface>

        {/* 2. Trends — the one "compared to what", and where the rows come from. */}
        <section aria-labelledby="incidents-trends-heading" className="space-y-3">
          <SectionHeading
            id="incidents-trends-heading"
            title="Is it getting worse?"
            lede="This window against the one before it, the hourly shape with production deploys marked, and which sources and features are producing the rows."
          />
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)]">
            {tab.hourly.status === 'ok' && tab.hourly.data ? (
              <ErrorsOverTime points={tab.hourly.data} deployMarkers={tab.deployMarkers} />
            ) : appHourly.length > 0 ? (
              // Sentry's series is unavailable, but the app's own rows still
              // draw a trend — one witness, labelled as one, rather than a
              // blank chart over data the Bridge already holds.
              <ErrorsOverTime
                points={appHourly}
                deployMarkers={tab.deployMarkers}
                source="app"
                note={
                  tab.hourly.status === 'unconfigured'
                    ? 'Sentry hourly series not configured — app events only'
                    : `Sentry hourly series unavailable (${tab.hourly.error ?? 'fetch failed'}) — app events only`
                }
              />
            ) : tab.hourly.status === 'unconfigured' ? (
              <Surface padding="sm">
                <PanelNoData
                  label="Hourly series not configured"
                  description="Provision SENTRY_READ_TOKEN to draw the hourly chart. No app rows fell in the last 24 hours to draw it from either."
                />
              </Surface>
            ) : (
              <Surface padding="sm">
                <PanelStale label="Hourly series" error={tab.hourly.error} />
              </Surface>
            )}

            <Surface padding="sm" className="min-w-0">
              <h3 className="text-eyebrow uppercase text-warm-500">This window vs the last</h3>
              <p className={cn('mt-1 text-body-sm font-medium leading-5', DELTA_INK[windowDelta.direction])}>
                {windowDelta.label}
              </p>
              <p className="text-caption text-warm-500">
                App error rows written, resolved or not. The sport filter applies; the others do not, so the two
                numbers stay comparable.
              </p>
              <dl className="mt-4 grid grid-cols-2 gap-3">
                <div>
                  <dt className="text-eyebrow uppercase text-warm-500">Active incidents</dt>
                  <dd className="font-fw-mono text-h2 tabular-nums text-warm-900">{counts.totalGroups}</dd>
                  <dd className="text-caption text-warm-500">
                    {counts.appGroups} app · {counts.sentryGroups} Sentry
                  </dd>
                </div>
                <div>
                  <dt className="text-eyebrow uppercase text-warm-500">Need action</dt>
                  <dd className="font-fw-mono text-h2 tabular-nums text-warm-900">{counts.actionableGroups}</dd>
                  <dd className="text-caption text-warm-500">{counts.highSeverityGroups} high severity · the nav badge</dd>
                </div>
                <div>
                  <dt className="text-eyebrow uppercase text-warm-500">Affected users</dt>
                  <dd className="font-fw-mono text-h2 tabular-nums text-warm-900">{counts.affectedUsers}</dd>
                  <dd className="text-caption text-warm-500">deduped per incident</dd>
                </div>
                <div className="min-w-0">
                  <KpiTile
                    label="RLS denials · 24h"
                    value={tab.rlsDenials24h}
                    href="/admin/errors?source=rls_denial"
                    tone={tab.rlsDenials24h > 0 ? 'warning' : 'neutral'}
                    goodDirection="down"
                  />
                </div>
              </dl>
            </Surface>
          </div>

          <Surface padding="sm">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="min-w-0">
                <h3 className="text-eyebrow uppercase text-warm-500">By source</h3>
                <p className="mt-0.5 text-caption text-warm-500">Where the rows were captured. Click one to narrow the list.</p>
                {sourceBreakdown.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {sourceBreakdown.map(([source, count]) => (
                      <BreakdownChip
                        key={source}
                        href={chipHref(current, 'source', source)}
                        selected={current.get('source') === source}
                        label={SOURCE_LABEL[source] ?? source}
                        count={count}
                        title={SOURCE_DESCRIPTION[source]}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-caption text-warm-500">No incidents in this window.</p>
                )}
              </div>
              <div className="min-w-0">
                <h3 className="text-eyebrow uppercase text-warm-500">By feature</h3>
                <p className="mt-0.5 text-caption text-warm-500">
                  The product area each incident is tagged to. A dashed tag is not in the feature registry, or the
                  error was logged without one, and cannot be filtered on.
                </p>
                {featureBreakdown.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {featureBreakdown.map(([feature, count]) => {
                      const known = feature !== '' && feature in FEATURE_LABELS;
                      return (
                        <BreakdownChip
                          key={feature || 'untagged'}
                          href={known ? chipHref(current, 'feature', feature) : null}
                          selected={known && current.get('feature') === feature}
                          label={feature === '' ? 'untagged' : (FEATURE_LABELS[feature] ?? feature)}
                          count={count}
                          title={
                            feature === ''
                              ? 'Logged without a featureArea — counts against no feature'
                              : known
                                ? undefined
                                : 'Not a registered feature key — the Errors filter cannot narrow to it'
                          }
                        />
                      );
                    })}
                  </div>
                ) : (
                  <p className="mt-2 text-caption text-warm-500">No incidents in this window.</p>
                )}
              </div>
            </div>
          </Surface>
        </section>

        {/* 3. Coverage — what each source reported, and how traceable the feed is. */}
        <section aria-labelledby="incidents-coverage-heading" className="space-y-3">
          <SectionHeading
            id="incidents-coverage-heading"
            title="Is the Bridge seeing everything?"
            lede="Counts are only as good as the reads behind them. What each source reported this refresh, whether the app and Sentry agree, and how much of the feed can be traced to a feature, route or action."
          />
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.8fr)]">
            <ErrorSurfaceReconciliation verdict={reconciliation} />
            <Surface padding="sm" className="min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-warm-200 pb-2">
                <h3 className="text-eyebrow uppercase text-warm-500">Observability wiring</h3>
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
          </div>
          {/* Rule 3: empty sections never render — an all-zero coverage strip
              when there's nothing to trace is noise, not signal. Gated on
              appIncidents (not the raw incidents array): Sentry-only incident
              sets must not slip past this guard and render a "0 / 1 = 0%" strip. */}
          {appIncidents.length > 0 ? <ErrorTraceabilityStrip appIncidents={appIncidents} /> : null}
        </section>

        {/* 4. Sentry, org-wide — the un-windowed list, so nothing Sentry holds
            is invisible just because it was quiet this window. */}
        <Surface as="section" padding="sm" aria-labelledby="incidents-sentry-heading">
          <div className="border-b border-warm-200 pb-2">
            <h2 id="incidents-sentry-heading" className="text-base font-semibold text-warm-900">
              Everything Sentry still holds open
            </h2>
            <p className="mt-0.5 text-caption leading-5 text-warm-500">
              All unresolved Sentry issues, org-wide and not windowed. The queue above only counts Sentry issues with
              activity in the selected window, so this list is usually longer.
            </p>
          </div>
          {tab.sentry.status === 'ok' && tab.sentry.truncated ? (
            <p className="mt-2 text-caption text-fw-warning-ink">
              Showing the first {tab.sentry.data?.length ?? 0} unresolved issues; more exist beyond this page ceiling.
            </p>
          ) : null}
          <div className="mt-2">
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
          </div>
        </Surface>

        {/* 5. Archive / Fixed — reference material for "was this ever fixed,
            and did it ship", never the headline. ArchivePanel owns its own
            heading and empty/error states; this wrapper only adds the break. */}
        <div className="border-t border-warm-200 pt-6">
          <ArchivePanel result={archiveResult} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <AutoRefresh />
      <header className="max-w-3xl">
        <h1 className="text-h2 font-semibold text-warm-900">Incidents</h1>
        <p className="mt-1 text-sm leading-6 text-warm-600">
          One row per production cause. App errors, Sentry issues and reliability signals that describe the same
          fault are merged into a single incident, so a fault three systems saw is one thing to fix, not three.
        </p>
      </header>
      <ErrorsFilterBar
        groups={buildFilterGroups(current, filters)}
        active={activeFilters(current, filters)}
        clearAllHref={hrefWithOverrides(current, {
          sport: null,
          severity: null,
          source: null,
          window: null,
          kind: null,
          feature: null,
        })}
      />
      <PanelBoundary title="Incidents" skeleton={<PanelPageSkeleton rows={8} />}>
        <Body />
      </PanelBoundary>
    </div>
  );
}
