import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import { fetchReliabilitySnapshot, queryRelAnalyses, type ReliabilityRunRow } from '@/lib/admin/data/reliability';
import { RcaAnalysisView } from '../errors/_components/RcaAnalysisView';
import type { RcaAnalysis } from '@/lib/admin/rca';
import {
  Surface,
  Inset,
  StatStrip,
  StatusPill,
  InlineNotice,
  Eyebrow,
  SegmentBar,
  type FwStatusTone,
} from '@/components/fairway';
import { DatelineRule } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { KpiTile } from '../_components/KpiTile';
import { PanelBoundary } from '../_components/PanelBoundary';
import { PanelPageSkeleton } from '../_components/PanelSkeletons';
import { PanelNoData, PanelAllClear, PanelStale } from '../_components/PanelStates';
import { AutoRefresh } from '../_components/AutoRefresh';
import { CaptureQualityPanel } from '../_components/CaptureQuality';
import { fetchCaptureQuality } from '@/lib/admin/data/capture-quality';
import { RailRow, RowHead, FactLine, RowFoot, StateChip } from '../_components/Row';
import { LocalTime } from '../_components/LocalTime';
import type { CorrelatedSignal, SourceStatus } from '@/lib/reliability/types';
import {
  buildCoverageMatrix,
  corroboratedCount,
  evidenceTarget,
  groupByCorroboration,
  historySeries,
  needsAttentionCount,
  readingCount,
  relativeAge,
  severityCounts,
  signalIncidentHref,
  type CoverageCell,
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
  degraded: 'warning',
  blind: 'danger',
};

const SOURCE_LABEL: Record<SourceStatus, string> = {
  ok: 'reading',
  partial: 'truncated',
  degraded: 'degraded',
  blind: 'blind',
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

function SignalRow({
  signal,
  analysis,
}: {
  signal: CorrelatedSignal;
  analysis: RcaAnalysis | null;
}) {
  const corroborated = signal.sources.length > 1;

  // Ported to the shared row language (../_components/Row) on 2026-08-27.
  // What this row had before, and why each piece moved:
  //
  //   A severity STRIPE and a severity PILL, both. The stripe was already the
  //   right idea; the pill repeated it at the front of the row, where it led
  //   the eye and told you the least. RailRow keeps the stripe and drops the
  //   duplicate.
  //
  //   The TITLE arrived fourth, after the pill, the corroboration badge, the
  //   risk badge and the count — so the one thing you are actually looking for
  //   was the last thing you found. It leads now.
  //
  //   Route, errorCode and featureId were three separate spans in a wrapping
  //   flex row. They are facts, so they read as one FactLine in the same order
  //   the errors queue uses: code, feature, route.
  return (
    <RailRow severity={signal.severity}>
      <RowHead value={signal.count.toLocaleString()} valueLabel={`${signal.count} occurrences`}>
        {/* EVERY ROW IS A DOOR, not a leaf. This tab shows the same production
            faults the Incidents tab does, seen through the source-agreement
            lens — so a row that dead-ends here would be the second incident
            list this redesign exists to remove. The `rel:<signature>` spelling
            is both the storage key the nightly triage writes an analysis under
            and the route that resolves it, so the two cannot drift. */}
        <Link href={signalIncidentHref(signal.signature)} className="hover:underline">
          {signal.title}
        </Link>
      </RowHead>

      {signal.summary && signal.summary !== signal.title ? (
        <p className="mt-1 line-clamp-2 text-caption leading-relaxed text-warm-600">{signal.summary}</p>
      ) : null}

      <FactLine
        items={[signal.errorCode, signal.featureId, signal.route]}
        emphasizeFirst={Boolean(signal.errorCode)}
      />

      <RowFoot
        meta={
          <>
            {signal.sources.join(' + ')} · first <LocalTime iso={signal.firstSeen} /> · last{' '}
            {relativeAge(signal.lastSeen)}
          </>
        }
      >
        {/* Corroboration is this tab's reason to exist: two independent sources
            agreeing is stronger evidence than one source shouting, and it is
            what the Errors tab structurally cannot show. It is genuinely STATE,
            so it stays a chip — and it is the only accent on the row. */}
        {corroborated ? (
          <StateChip tone="accent" title={`Independently reported by ${signal.sources.join(', ')}`}>
            {signal.sources.length} sources
          </StateChip>
        ) : null}
        <StateChip title="Proposed risk tier">{signal.proposedRisk}</StateChip>
      </RowFoot>

      <EvidenceLinks signal={signal} />

      {/* The root-cause analysis the nightly triage wrote for this signal.
          These live in admin_events under fingerprint `rel:<signature>` and
          had no surface at all before 2026-08-28 — this is where they show. */}
      {analysis ? (
        <div className="mt-3 rounded-fw-md border border-warm-200 bg-surface-sunken/40 p-3">
          <p className="mb-2 text-caption uppercase tracking-widest text-warm-500">
            Root-cause analysis
          </p>
          <RcaAnalysisView analysis={analysis} />
        </div>
      ) : null}
    </RailRow>
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

/** Cell colour per state. A no-run cell is deliberately the emptiest thing on
 *  the grid: it means the collector's own record is unreadable, which must not
 *  look like a provider outage. */
const COVERAGE_CELL: Readonly<Record<CoverageCell, { className: string; label: string }>> = {
  reading: { className: 'bg-fw-success', label: 'reading' },
  partial: { className: 'bg-fw-warning', label: 'partial' },
  blind: { className: 'bg-fw-danger', label: 'blind' },
  'no-run': { className: 'border border-warm-300 bg-transparent', label: 'no run' },
};

/**
 * "Was the system actually watching?"
 *
 * A current-status pill answers the less useful question. A source that was
 * blind for three hours overnight and recovered at 6am reads as perfectly
 * healthy on a pill, while every count computed during those three hours was
 * quietly partial. This makes the hole visible after the fact, which is when
 * an operator actually asks.
 */
function CoveragePanel({ coverage }: { coverage: ReturnType<typeof buildCoverageMatrix> }) {
  return (
    <Surface>
      <Inset>
        <div className="flex items-baseline justify-between gap-2">
          <Eyebrow as="h2">Coverage history</Eyebrow>
          <span className="font-mono text-xs tabular-nums text-warm-500">
            {coverage[0]?.totalRuns ?? 0} runs
          </span>
        </div>
        <p className="mt-0.5 text-caption text-warm-500">Oldest left, newest right.</p>
        {/* The grid scrolls in its own axis; the PAGE never pans sideways. */}
        <div className="mt-3 overflow-x-auto">
          <ul className="min-w-max space-y-1.5">
            {coverage.map((row) => (
              <li key={row.source} className="flex items-center gap-2">
                <span className="w-20 shrink-0 font-fw-mono text-caption uppercase text-warm-500">
                  {row.source}
                </span>
                <span className="flex gap-0.5" aria-hidden>
                  {row.cells.map((cell, i) => (
                    <span
                      key={`${row.source}-${i}`}
                      title={COVERAGE_CELL[cell].label}
                      className={cn('h-3.5 w-3.5 rounded-sm', COVERAGE_CELL[cell].className)}
                    />
                  ))}
                </span>
                {/* The chart is never the only explanation — the same fact in
                    words, for assistive tech and for anyone reading in
                    greyscale. */}
                <span className="font-fw-mono text-caption tabular-nums text-warm-500">
                  {row.readingRuns}/{row.totalRuns} reading
                </span>
              </li>
            ))}
          </ul>
        </div>
        {coverage.length === 0 ? (
          <p className="mt-2 text-caption text-warm-500">
            No run history yet — the collector has not written a readable row.
          </p>
        ) : null}
      </Inset>
    </Surface>
  );
}

function RunPanel({
  row,
  history,
  analysisBySignature,
}: {
  row: ReliabilityRunRow;
  history: readonly ReliabilityRunRow[];
  analysisBySignature: ReadonlyMap<string, RcaAnalysis>;
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
  // Grouped by INDEPENDENT OBSERVATION COUNT, not severity. Severity is the
  // Incidents tab's axis; sorting by it here made this page read as a second,
  // differently-ordered copy of that queue. What only this page can compute is
  // how many separate systems saw the same fault.
  const groups = groupByCorroboration(run.signals);
  const trend = historySeries(history);
  const coverage = buildCoverageMatrix(history);

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

      <CoveragePanel coverage={coverage} />

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
            <InlineNotice tone="info">
              These are the same production faults the Incidents tab lists, grouped by how many
              independent systems saw each one. Every title links to its canonical incident.{' '}
              <Link href="/admin/errors?lens=reliability" className="underline">
                Open the Reliability lens on Incidents
              </Link>
              .
            </InlineNotice>
            {groups.map((group) => (
              <Surface key={group.sourceCount}>
                <Inset>
                  <div className="flex items-baseline justify-between gap-2">
                    <Eyebrow as="h2">
                      {group.sourceCount === 1
                        ? '1 source'
                        : `${group.sourceCount} independent sources`}
                    </Eyebrow>
                    <span className="font-mono text-xs tabular-nums text-warm-500">
                      {group.signals.length}
                    </span>
                  </div>
                  {/* Said in words, because the number alone invites the wrong
                      reading. Observation count is a mechanical fact about
                      coverage; it is not a confidence score, and this page must
                      not let it become one by implication. */}
                  <p className="mt-0.5 text-caption text-warm-500">
                    {group.sourceCount > 1
                      ? 'Seen independently by more than one system — corroboration, not confidence.'
                      : 'Reported by a single system. Not weaker evidence, just uncorroborated.'}
                  </p>
                  <ul className="mt-1">
                    {group.signals.map((signal) => (
                      <SignalRow
                        key={signal.signature}
                        signal={signal}
                        analysis={analysisBySignature.get(signal.signature) ?? null}
                      />
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

/**
 * How completely errors were CAPTURED — a measurement, not an incident list.
 *
 * It belongs on this tab because the question it answers is the same one the
 * rest of the page asks from the other direction. Source health says whether
 * we could SEE production; this says whether what we saw arrived with enough
 * detail to act on. An incident whose row carries no error code, no stack and
 * no route is not a mystery about production — it is a mystery about the CALL
 * SITE, and until that is visible the under-instrumented emitters stay
 * under-instrumented forever.
 *
 * Its own boundary: it reads `admin_events` directly and shares nothing with
 * the collector snapshot above, so a failure in either must not take the other
 * with it.
 */
async function CaptureQualitySection() {
  const report = await fetchCaptureQuality();
  if (report.status !== 'ok' || !report.data) {
    return <PanelStale label="Capture quality" error={report.error} />;
  }
  return <CaptureQualityPanel report={report.data} />;
}

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

  // The analyses the nightly triage wrote for these signals — keyed by bare
  // signature. Without this the Reliability tab renders the signals but never
  // their root-cause analysis, which is where every rel:* analysis was
  // invisible (fixed 2026-08-28).
  const analysisBySignature =
    latest?.run && latest.run.signals.length > 0
      ? await queryRelAnalyses(latest.run.signals.map((sig) => sig.signature))
      : new Map<string, RcaAnalysis>();

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

      <RunPanel row={latest} history={history} analysisBySignature={analysisBySignature} />

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
      <Surface>
        <Inset>
          <Eyebrow as="h2">Capture quality</Eyebrow>
          <p className="mt-1 text-xs text-warm-500">
            How completely errors arrived, not how healthy production is. A low number is a
            backlog item for the call site.
          </p>
          <div className="mt-3">
            <PanelBoundary title="Capture quality" skeleton={<PanelPageSkeleton rows={4} />}>
              <CaptureQualitySection />
            </PanelBoundary>
          </div>
        </Inset>
      </Surface>
    </div>
  );
}
