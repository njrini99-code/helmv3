import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import { fetchReliabilitySnapshot, type ReliabilityRunRow } from '@/lib/admin/data/reliability';
import { Surface, Inset, StatusPill, InlineNotice, type FwStatusTone } from '@/components/fairway';
import { DatelineRule } from '@/components/ui/card';
import { PanelBoundary } from '../_components/PanelBoundary';
import { PanelPageSkeleton } from '../_components/PanelSkeletons';
import { PanelNoData, PanelAllClear } from '../_components/PanelStates';
import { AutoRefresh } from '../_components/AutoRefresh';
import { LocalTime } from '../_components/LocalTime';
import type {
  CorrelatedSignal,
  ReliabilitySeverity,
  SourceStatus,
} from '@/lib/reliability/types';

export const dynamic = 'force-dynamic';

/**
 * A blind source is DANGER, not neutral.
 *
 * This is the one tone mapping in the file worth arguing about, so: elsewhere
 * in the Bridge "not configured" is neutral, because choosing not to wire up
 * Inngest is a config decision rather than a fault. Here it is not. The whole
 * claim this tab makes is "these are the problems across your three sources";
 * a source that could not be read makes that claim false, and rendering it as
 * a calm grey chip is precisely how a two-thirds-blind collector reads as a
 * clean bill of health.
 */
const SOURCE_TONE: Record<SourceStatus, FwStatusTone> = {
  ok: 'success',
  partial: 'warning',
  blind: 'danger',
};

const SOURCE_LABEL: Record<SourceStatus, string> = {
  ok: 'reading',
  partial: 'truncated',
  blind: 'BLIND',
};

const SEVERITY_TONE: Record<ReliabilitySeverity, FwStatusTone> = {
  critical: 'danger',
  error: 'danger',
  warning: 'warning',
  info: 'neutral',
};

function SignalRow({ signal }: { signal: CorrelatedSignal }) {
  const corroborated = signal.sources.length > 1;
  return (
    <div className="border-t border-warm-200/60 py-3 first:border-t-0">
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill tone={SEVERITY_TONE[signal.severity]} dot>
          {signal.severity}
        </StatusPill>
        {/* Corroboration is the tab's reason to exist — two independent
            sources agreeing is stronger evidence than one source shouting,
            and it is what this view shows that the Errors tab cannot. */}
        {corroborated && (
          <StatusPill tone="warning">
            confirmed by {signal.sources.length} sources
          </StatusPill>
        )}
        <span className="text-xs font-medium text-warm-500">{signal.proposedRisk}</span>
        <span className="text-xs text-warm-500">
          {signal.count}&times;
        </span>
        {signal.featureId && (
          <span className="text-xs text-warm-500">{signal.featureId}</span>
        )}
      </div>

      <p className="mt-1.5 text-sm font-medium text-warm-900">{signal.title}</p>

      {signal.summary && signal.summary !== signal.title && (
        <p className="mt-0.5 text-xs text-warm-600">{signal.summary}</p>
      )}

      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-warm-500">
        <span>{signal.sources.join(' + ')}</span>
        {signal.route && <span className="font-mono">{signal.route}</span>}
        {signal.errorCode && <span className="font-mono">{signal.errorCode}</span>}
        <span>
          last seen <LocalTime iso={signal.lastSeen} />
        </span>
      </div>
    </div>
  );
}

function RunPanel({ row }: { row: ReliabilityRunRow }) {
  const run = row.run;

  // Recorded but unreadable — an older schema version. Say so; do not render
  // an empty signal list, which would read as "this run found nothing".
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

  return (
    <>
      {blind.length > 0 && (
        <InlineNotice tone="danger">
          <strong>
            {blind.length} of {run.sources.length} sources could not be read.
          </strong>{' '}
          This run is not a clean bill of health — the signals below are only
          what the remaining sources saw.
          <ul className="mt-1.5 space-y-0.5">
            {blind.map((s) => (
              <li key={s.source} className="text-xs">
                <span className="font-medium">{s.source}</span>: {s.reason ?? 'unreadable'}
              </li>
            ))}
          </ul>
        </InlineNotice>
      )}

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {/* Hand-rolled rather than StatTile: that component renders a NUMERIC
            metric, and the fact worth showing per source is a state, not a
            count. A source's signal count would be actively misleading here —
            zero from a blind arm and zero from a healthy arm are the same
            number and opposite meanings. */}
        {run.sources.map((source) => (
          <div
            key={source.source}
            className="rounded-lg border border-warm-200/60 px-3 py-2.5"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-warm-500">
              {source.source}
            </p>
            <div className="mt-1.5">
              <StatusPill tone={SOURCE_TONE[source.status]} dot>
                {SOURCE_LABEL[source.status]}
              </StatusPill>
            </div>
            <p className="mt-1.5 text-xs text-warm-500">
              {source.reason
                ? source.reason
                : `${source.durationMs}ms${source.bounded ? ' · bounded' : ''}`}
            </p>
          </div>
        ))}
      </div>

      <DatelineRule className="my-5" />

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
        <div>
          {run.signals.map((signal) => (
            <SignalRow key={signal.signature} signal={signal} />
          ))}
          {run.truncatedSignals > 0 && (
            <p className="mt-3 text-xs text-warm-500">
              {run.truncatedSignals} further signal
              {run.truncatedSignals === 1 ? '' : 's'} were correlated but not stored
              (display cap). They are counted here so the list is never mistaken
              for the complete set.
            </p>
          )}
        </div>
      )}
    </>
  );
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

  // Never-ran is a WIRING problem, not an all-clear. Distinct copy from the
  // all-clear state above on purpose.
  if (neverRan || !latest) {
    return (
      <PanelNoData
        label="The reliability collector has not run yet"
        description="No run has been recorded. If the cron is deployed, the first run lands within 3 hours; until then this tab can say nothing about production."
      />
    );
  }

  return (
    <div className="space-y-5">
      <Surface>
        <Inset>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold text-warm-900">Latest run</h2>
            <p className="text-xs text-warm-500">
              {latest.startedAt ? <LocalTime iso={latest.startedAt} /> : 'unknown time'}
              {latest.durationMs !== null && ` · ${latest.durationMs}ms`}
            </p>
          </div>
          <div className="mt-4">
            <RunPanel row={latest} />
          </div>
        </Inset>
      </Surface>

      {history.length > 1 && (
        <Surface>
          <Inset>
            <h2 className="text-sm font-semibold text-warm-900">Recent runs</h2>
            <p className="mt-0.5 text-xs text-warm-500">
              Cadence is every 3 hours. A gap here means a run did not happen —
              Vercel cron scheduling is best-effort, so an occasional miss is
              expected and a sustained one is not.
            </p>
            <div className="mt-3 space-y-1.5">
              {history.map((row) => (
                <div key={row.id} className="flex items-center gap-2 text-xs">
                  <StatusPill tone={row.status === 'success' ? 'success' : 'danger'} dot>
                    {row.status}
                  </StatusPill>
                  <span className="text-warm-500">
                    {row.startedAt ? <LocalTime iso={row.startedAt} /> : '—'}
                  </span>
                  <span className="text-warm-500">
                    {row.run ? `${row.run.signals.length} signals` : 'unreadable payload'}
                  </span>
                  {row.errorMessage && (
                    <span className="text-warm-600">{row.errorMessage}</span>
                  )}
                </div>
              ))}
            </div>
          </Inset>
        </Surface>
      )}
    </div>
  );
}

export default async function ReliabilityPage() {
  await requireSuperAdmin();

  return (
    <div className="space-y-5">
      <AutoRefresh intervalMs={180_000} />
      <div>
        <h1 className="text-lg font-semibold text-warm-900">Reliability</h1>
        <p className="mt-0.5 text-sm text-warm-600">
          What Vercel, Sentry and Supabase agree on, collected every 3 hours.
          This tab reports; it does not fix.
        </p>
      </div>
      <PanelBoundary title="Reliability" skeleton={<PanelPageSkeleton />}>
        <ReliabilityPanel />
      </PanelBoundary>
    </div>
  );
}
