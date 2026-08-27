import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import { fetchReliabilitySnapshot, type ReliabilityRunRow } from '@/lib/admin/data/reliability';
import {
  Surface,
  Inset,
  StatStrip,
  StatusPill,
  InlineNotice,
  Eyebrow,
  Badge,
  SegmentBar,
  type FwStatusTone,
} from '@/components/fairway';
import { DatelineRule } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { KpiTile } from '../_components/KpiTile';
import { PanelBoundary } from '../_components/PanelBoundary';
import { PanelPageSkeleton } from '../_components/PanelSkeletons';
import { PanelNoData, PanelAllClear } from '../_components/PanelStates';
import { AutoRefresh } from '../_components/AutoRefresh';
import { LocalTime } from '../_components/LocalTime';
import type { CorrelatedSignal, ReliabilitySeverity, SourceStatus } from '@/lib/reliability/types';
import {
  corroboratedCount,
  evidenceTarget,
  groupBySeverity,
  historySeries,
  needsAttentionCount,
  readingCount,
  relativeAge,
  severityCounts,
} from './reliability-view';

export const dynamic = 'force-dynamic';

/**
 * A blind source is DANGER, not neutral.
 *
 * The one tone mapping here worth arguing about, so: elsewhere in the Bridge
 * "not configured" is neutral, because declining to wire up Inngest is a config
 * decision rather than a fault. Here it is not. The claim this tab makes is
 * "these are the problems across your three sources"; a source that could not
 * be read makes that claim false, and rendering it as a calm grey chip is
 * precisely how a two-thirds-blind collector reads as a clean bill of health.
 */
const SOURCE_TONE: Record<SourceStatus, FwStatusTone> = {
  ok: 'success',
  partial: 'warning',
  blind: 'danger',
};

const SOURCE_LABEL: Record<SourceStatus, string> = {
  ok: 'reading',
  partial: 'truncated',
  blind: 'blind',
};

const SEVERITY_TONE: Record<ReliabilitySeverity, FwStatusTone> = {
  critical: 'danger',
  error: 'danger',
  warning: 'warning',
  info: 'neutral',
};

const SEVERITY_HEADING: Record<ReliabilitySeverity, string> = {
  critical: 'Critical',
  error: 'Errors',
  warning: 'Warnings',
  info: 'Informational',
};

/** What each source contributes, stated once so the page never implies more. */
const SOURCE_ROLE: Record<string, string> = {
  sentry: 'runtime exceptions',
  supabase: 'application error events',
  vercel: 'build & deploy health',
};

// ---------------------------------------------------------------------------
// Signal row
// ---------------------------------------------------------------------------

function EvidenceLinks({ signal }: { signal: CorrelatedSignal }) {
  if (signal.evidence.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      {signal.evidence.slice(0, 4).map(({ source, ref }) => {
        // A reference is only rendered as a link when it actually resolves to
        // one. Printing a Sentry permalink as grey text — the first draft's
        // behaviour — throws away the single most useful action on the row.
        //
        // The source comes from the PAIR, never from `sources[i]`: those two
        // lists dedupe on different keys and their indices do not correspond.
        const target = evidenceTarget(ref, source);
        const chip =
          'inline-flex items-center gap-1 rounded-md border border-warm-200/70 px-2 py-0.5 text-xs';

        if (target.kind === 'external') {
          return (
            <a
              key={`${source}:${ref}`}
              href={target.href}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(chip, 'text-warm-700 transition-colors hover:border-warm-300 hover:text-warm-900')}
            >
              {target.label}
              <ExternalLink aria-hidden className="h-3 w-3" />
            </a>
          );
        }
        if (target.kind === 'internal') {
          return (
            <Link
              key={`${source}:${ref}`}
              href={target.href}
              className={cn(chip, 'text-warm-700 transition-colors hover:border-warm-300 hover:text-warm-900')}
            >
              {target.label}
            </Link>
          );
        }
        return (
          <span key={`${source}:${ref}`} className={cn(chip, 'font-mono text-warm-500')}>
            {target.label}
          </span>
        );
      })}
    </div>
  );
}

function SignalRow({ signal }: { signal: CorrelatedSignal }) {
  const corroborated = signal.sources.length > 1;

  return (
    <li
      className={cn(
        'relative border-t border-warm-200/60 py-3.5 pl-4 first:border-t-0',
        // A severity stripe, so the shape of the list is readable before any
        // word is. Color is never the only channel — the pill carries the name.
        'before:absolute before:left-0 before:top-4 before:bottom-4 before:w-0.5 before:rounded-full',
        signal.severity === 'critical' && 'before:bg-fw-danger',
        signal.severity === 'error' && 'before:bg-fw-danger/60',
        signal.severity === 'warning' && 'before:bg-fw-warning/70',
        signal.severity === 'info' && 'before:bg-warm-300',
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill tone={SEVERITY_TONE[signal.severity]} dot>
          {signal.severity}
        </StatusPill>

        {/* Corroboration is the tab's reason to exist: two independent sources
            agreeing is stronger evidence than one source shouting, and it is
            what this view shows that the Errors tab structurally cannot. */}
        {corroborated && (
          <Badge tone="warning" numeric>
            confirmed by {signal.sources.length} sources
          </Badge>
        )}

        <Badge tone="neutral" variant="outline">
          {signal.proposedRisk}
        </Badge>

        <span className="font-mono text-xs tabular-nums text-warm-500">
          {signal.count.toLocaleString()}&times;
        </span>

        <span className="ml-auto text-xs text-warm-500">{relativeAge(signal.lastSeen)}</span>
      </div>

      <p className="mt-2 text-sm font-medium leading-snug text-warm-900">{signal.title}</p>

      {signal.summary && signal.summary !== signal.title && (
        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-warm-600">{signal.summary}</p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-warm-500">
        <span className="flex items-center gap-1">
          {signal.sources.map((source) => (
            <Badge key={source} tone="neutral" size="sm">
              {source}
            </Badge>
          ))}
        </span>
        {signal.route && <span className="font-mono text-warm-600">{signal.route}</span>}
        {signal.errorCode && <span className="font-mono text-warm-600">{signal.errorCode}</span>}
        {signal.featureId && <span>{signal.featureId}</span>}
        <span>
          first seen <LocalTime iso={signal.firstSeen} />
        </span>
      </div>

      <EvidenceLinks signal={signal} />
    </li>
  );
}

// ---------------------------------------------------------------------------
// Run panel
// ---------------------------------------------------------------------------

function SourceHealthPanel({ run }: { run: NonNullable<ReliabilityRunRow['run']> }) {
  return (
    <Surface>
      <Inset>
        <Eyebrow as="p">Source health</Eyebrow>
        <p className="mt-1 text-xs text-warm-500">
          What each arm could read this run. A blind arm contributes no signals —
          which is not the same as contributing zero.
        </p>
        <div className="mt-3 space-y-2">
          {run.sources.map((source) => (
            <div
              key={source.source}
              className={cn(
                'flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-3 py-2.5',
                source.status === 'blind'
                  ? 'border-fw-danger/40 bg-fw-danger/[0.03]'
                  : 'border-warm-200/60',
              )}
            >
              <StatusPill tone={SOURCE_TONE[source.status]} dot>
                {SOURCE_LABEL[source.status]}
              </StatusPill>
              <span className="text-sm font-medium text-warm-900">{source.source}</span>
              <span className="text-xs text-warm-500">
                {SOURCE_ROLE[source.source] ?? ''}
              </span>
              <span className="ml-auto font-mono text-xs tabular-nums text-warm-500">
                {source.durationMs}ms
                {source.bounded && ' · bounded'}
              </span>
              {source.reason && (
                <p className="w-full text-xs text-warm-600">{source.reason}</p>
              )}
            </div>
          ))}
        </div>
      </Inset>
    </Surface>
  );
}

function SeverityMixPanel({ run }: { run: NonNullable<ReliabilityRunRow['run']> }) {
  const counts = severityCounts(run.signals);
  return (
    <Surface>
      <Inset>
        <SegmentBar
          overline="This window"
          title="Severity mix"
          takeaway={`${run.signals.length} correlated signals`}
          awaiting={run.signals.length === 0}
          parts={[
            { label: 'Critical', value: counts.critical, tone: 'caution' },
            { label: 'Error', value: counts.error, tone: 'caution' },
            { label: 'Warning', value: counts.warning, tone: 'neutral' },
            { label: 'Info', value: counts.info, tone: 'good' },
          ]}
          // Index 0 (Critical), NOT the default `'good'`. The default auto-picks
          // the first good-toned part — Info — so a window holding 1 critical
          // and 39 info would headline a reassuring "97%" on a page whose only
          // job is answering what is broken. The critical share is the honest
          // headline, and "0%" is a genuinely good reading when it is earned.
          primary={0}
        />
      </Inset>
    </Surface>
  );
}

function RunPanel({
  row,
  history,
}: {
  row: ReliabilityRunRow;
  history: readonly ReliabilityRunRow[];
}) {
  const run = row.run;

  // Recorded but unreadable — an older schema version. Say so; do not render an
  // empty signal list, which would read as "this run found nothing".
  if (!run) {
    return (
      <InlineNotice tone="warning">
        The most recent run was recorded but its payload could not be read
        (unrecognised schema version). Nothing about the state of production
        should be inferred from this panel.
      </InlineNotice>
    );
  }

  const blind = run.sources.filter((s) => s.status === 'blind');
  const groups = groupBySeverity(run.signals);
  const trend = historySeries(history);

  return (
    <div className="space-y-5">
      {blind.length > 0 && (
        <InlineNotice tone="danger">
          <strong>
            {blind.length} of {run.sources.length} sources could not be read.
          </strong>{' '}
          This run is not a clean bill of health — what follows is only what the
          remaining {readingCount(run.sources)} saw.
          <ul className="mt-2 space-y-1">
            {blind.map((s) => (
              <li key={s.source} className="text-xs">
                <span className="font-medium">{s.source}</span> ({SOURCE_ROLE[s.source]}):{' '}
                {s.reason ?? 'unreadable'}
              </li>
            ))}
          </ul>
        </InlineNotice>
      )}

      {/* KPIs first: "is anything on fire" above the fold, per the Bridge's
          UI contract. Every tile is a drill-through, not a readout. */}
      <StatStrip count={4} mdColumns={4} ariaLabel="Reliability KPIs">
        <KpiTile
          label="Needs attention"
          value={needsAttentionCount(run.signals)}
          href="#signals"
          tone={needsAttentionCount(run.signals) > 0 ? 'danger' : 'neutral'}
          goodDirection="down"
        />
        <KpiTile
          label="Cross-source"
          value={corroboratedCount(run.signals)}
          href="#signals"
          goodDirection="down"
          tone={corroboratedCount(run.signals) > 0 ? 'warning' : 'neutral'}
        />
        <KpiTile
          label="Correlated signals"
          value={run.signals.length}
          href="#signals"
          trendData={trend.length > 1 ? trend : undefined}
          goodDirection="down"
        />
        <KpiTile
          label="Sources reading"
          value={readingCount(run.sources)}
          href="#sources"
          tone={blind.length > 0 ? 'danger' : 'neutral'}
          goodDirection="up"
        />
      </StatStrip>

      <div id="sources" className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SourceHealthPanel run={run} />
        <SeverityMixPanel run={run} />
      </div>

      <section id="signals" className="scroll-mt-6">
        {run.signals.length === 0 ? (
          blind.length > 0 ? (
            <PanelNoData
              label="No signals from the sources that were readable"
              description="With sources blind, an empty list is not evidence that production is healthy."
            />
          ) : (
            <PanelAllClear
              label="No correlated signals in this window — all three sources read cleanly"
              checkedAt={run.windowEnd}
            />
          )
        ) : (
          <div className="space-y-4">
            {groups.map((group) => (
              <Surface key={group.severity}>
                <Inset>
                  <div className="flex items-baseline justify-between gap-2">
                    <Eyebrow as="h2">{SEVERITY_HEADING[group.severity]}</Eyebrow>
                    <span className="font-mono text-xs tabular-nums text-warm-500">
                      {group.signals.length}
                    </span>
                  </div>
                  <ul className="mt-1">
                    {group.signals.map((signal) => (
                      <SignalRow key={signal.signature} signal={signal} />
                    ))}
                  </ul>
                </Inset>
              </Surface>
            ))}

            {run.truncatedSignals > 0 && (
              <p className="text-xs text-warm-500">
                {run.truncatedSignals} further signal
                {run.truncatedSignals === 1 ? ' was' : 's were'} correlated but not
                stored (display cap). Counted here so this list is never mistaken
                for the complete set.
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

function HistoryPanel({ history }: { history: readonly ReliabilityRunRow[] }) {
  return (
    <Surface>
      <Inset>
        <Eyebrow as="h2">Recent runs</Eyebrow>
        <p className="mt-1 text-xs text-warm-500">
          Cadence is every 3 hours. A gap means a run did not happen — Vercel cron
          scheduling is best-effort, so an occasional miss is expected and a
          sustained one is not.
        </p>
        <ul className="mt-3 space-y-1">
          {history.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-warm-200/50 py-2 text-xs first:border-t-0"
            >
              <StatusPill tone={row.status === 'failed' ? 'danger' : 'success'} dot>
                {row.status}
              </StatusPill>
              <span className="text-warm-600">
                {row.startedAt ? <LocalTime iso={row.startedAt} /> : '—'}
              </span>
              <span className="font-mono tabular-nums text-warm-500">
                {row.run ? `${row.run.signals.length} signals` : 'unreadable payload'}
              </span>
              {row.durationMs !== null && (
                <span className="font-mono tabular-nums text-warm-500">{row.durationMs}ms</span>
              )}
              {row.errorMessage && (
                <span className="text-warm-600">{row.errorMessage}</span>
              )}
            </li>
          ))}
        </ul>
      </Inset>
    </Surface>
  );
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

async function ReliabilityPanel() {
  const snapshot = await fetchReliabilitySnapshot();

  if (snapshot.status !== 'ok' || !snapshot.data) {
    return (
      <InlineNotice tone="danger">
        Could not read the reliability run log: {snapshot.error ?? 'unknown error'}
      </InlineNotice>
    );
  }

  const { latest, history, neverRan } = snapshot.data;

  // Never-ran is a WIRING problem, not an all-clear — deliberately distinct
  // copy from the all-clear state.
  if (neverRan || !latest) {
    return (
      <PanelNoData
        label="The reliability collector has not run yet"
        description="No run has been recorded. The cron collects every 3 hours once deployed; until the first run lands, this tab can say nothing about production."
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Eyebrow as="p">Latest run</Eyebrow>
        <span className="text-xs text-warm-500">
          {latest.startedAt ? <LocalTime iso={latest.startedAt} /> : 'unknown time'}
          {latest.startedAt && ` · ${relativeAge(latest.startedAt)}`}
          {latest.durationMs !== null && ` · ${latest.durationMs}ms`}
        </span>
        {latest.run && (
          <span className="text-xs text-warm-500">
            window {new Date(latest.run.windowStart).toISOString().slice(11, 16)}–
            {new Date(latest.run.windowEnd).toISOString().slice(11, 16)} UTC
          </span>
        )}
      </div>

      <RunPanel row={latest} history={history} />

      {history.length > 1 && (
        <>
          <DatelineRule />
          <HistoryPanel history={history} />
        </>
      )}
    </div>
  );
}

export default async function ReliabilityPage() {
  await requireSuperAdmin();

  return (
    <div className="space-y-5">
      {/* Matches the collection cadence closely enough to stay current without
          hammering the table — the data only changes every 3 hours. */}
      <AutoRefresh intervalMs={180_000} />
      <div>
        <h1 className="text-lg font-semibold text-warm-900">Reliability</h1>
        <p className="mt-0.5 max-w-2xl text-sm text-warm-600">
          What Sentry, Supabase and Vercel agree on, correlated every 3 hours.
          This tab reports; it does not fix.
        </p>
      </div>
      <PanelBoundary title="Reliability" skeleton={<PanelPageSkeleton />}>
        <ReliabilityPanel />
      </PanelBoundary>
    </div>
  );
}
