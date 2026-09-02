import Link from 'next/link';
import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import {
  bridgeGetTracerData,
  bridgeGetTracerEnrichedData,
  bridgeListFlightTraces,
  type FlightTraceRun,
} from '@/app/admin/actions/golf-tracer';
import { Surface, InlineNotice, Sparkline, StatStrip } from '@/components/fairway';
import { PanelBoundary } from '../../_components/PanelBoundary';
import { PanelPageSkeleton } from '../../_components/PanelSkeletons';
import { PanelAllClear } from '../../_components/PanelStates';
import { KpiTile } from '../../_components/KpiTile';
import { AutoRefresh } from '../../_components/AutoRefresh';
import { StuckRoundsPanel } from './StuckRoundsPanel';
import { TracerPlayerList } from './TracerPlayerList';
import { TracerIncidentRow } from './TracerIncidentRow';
import { FlightTraceExplorer } from './FlightTraceExplorer';

export const dynamic = 'force-dynamic';

export interface FlightTraceFetch {
  traces: FlightTraceRun[];
  /** Null when the fetch itself succeeded (even if it returned zero rows —
   *  that is a genuinely empty result, not a failure). Non-null carries a
   *  short, honest reason the RPC threw, so the panel never tells the
   *  operator "no traces yet" when what actually happened is "couldn't
   *  reach the trace store." */
  unavailableReason: string | null;
}

/**
 * `bridgeListFlightTraces` throws when `public.helm_debug_list_traces`
 * doesn't exist — true in production today: the flight recorder migration
 * (20260825200811_helm_flight_recorder.sql) is HELD, not yet applied
 * (supabase/migrations/HELD.md). It could also throw for an unrelated reason
 * (a revoked grant, a misconfigured admin client) that this thin action
 * layer can't distinguish from that one — so the held migration is
 * surfaced as the likely cause, not asserted as certain. Isolating the
 * failure here, instead of letting it reject inside the page's shared
 * `Promise.all`, keeps a missing migration from taking down the whole
 * Tracer page along with it.
 */
async function loadFlightTraces(): Promise<FlightTraceFetch> {
  try {
    return { traces: await bridgeListFlightTraces(), unavailableReason: null };
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'unknown error';
    return {
      traces: [],
      unavailableReason:
        `${detail} Most likely cause: migration 20260825200811 (Helm Flight ` +
        'Recorder) is not applied to production yet — see supabase/migrations/HELD.md.',
    };
  }
}

/**
 * Port strategy: W8 shipped a minimum-viable read-only port. This wave
 * closes the gap the page's own banner used to admit — the daily trend +
 * stuck-round detector (`getTracerEnrichedDataImpl`) is now bridged in
 * (`bridgeGetTracerEnrichedData`), the player list opens a real drill-down
 * (`TracerPlayerList` → `TracerRoundDiagnostic`, wired to
 * `bridgeGetTracerRoundDiagnostic`/`bridgeFixRoundData`), and every tracer
 * incident (here and inside the drill-down) exposes its dropped remediation
 * fields via expand-on-click. Two things never crossed over: marking a tracer
 * incident "resolved" (these rows ARE `admin_events`, so /admin/errors is where
 * that happens) and the full hole-by-hole shot browser, which has no Bridge
 * equivalent. Neither is on the legacy tracer tab any more either — /golf/admin
 * is redirected to /admin (next.config.mjs:183), so that page is unreachable.
 */

async function TracerBody({ initialTraceId }: { initialTraceId: string | null }) {
  const [data, enriched, flightTraces] = await Promise.all([
    bridgeGetTracerData(),
    bridgeGetTracerEnrichedData(),
    loadFlightTraces(),
  ]);

  const sortedPlayers = [...data.playerSummaries].sort((a, b) => b.total_rounds - a.total_rounds);
  const dailyRounds = enriched.dailyRoundCounts.map((d) => d.count);
  const dailyErrors = enriched.dailyErrorCounts.map((d) => d.count);

  return (
    <div className="space-y-6">
      {/* StatStrip, not a hand-rolled grid — 5 peers on phone is exactly the
          "ragged trailing cell" case (rows of 2/2/1) the primitive exists to
          avoid (MOBILE_DOCTRINE rules 3 + 11): phone gets ONE snap-rail,
          "Stuck rounds" pinned first since it's this page's most actionable
          triage signal, desktop keeps the original md:grid-cols-5. */}
      <StatStrip count={5} mdColumns={5} ariaLabel="Tracer KPIs">
        <KpiTile
          label="Stuck rounds"
          value={enriched.stuckRounds.length}
          href="/admin/golf/tracer#stuck-rounds"
          tone={enriched.stuckRounds.length > 0 ? 'danger' : 'neutral'}
          goodDirection="down"
        />
        <KpiTile
          label="Critical 7d"
          value={data.errorStats.critical7d}
          href="/admin/errors?sport=golf&severity=critical"
          tone={data.errorStats.critical7d > 0 ? 'danger' : 'neutral'}
          goodDirection="down"
        />
        <KpiTile
          label="Errors 7d"
          value={data.errorStats.total7d}
          href="/admin/errors?sport=golf"
          tone={data.errorStats.total7d > 0 ? 'warning' : 'neutral'}
          goodDirection="down"
        />
        <KpiTile
          label="Warnings 7d"
          value={data.errorStats.warnings7d}
          href="/admin/errors?sport=golf&severity=warning"
          goodDirection="down"
        />
        <KpiTile label="Players tracked" value={data.playerSummaries.length} href="/admin/golf/tracer" />
      </StatStrip>

      <Surface padding="sm">
        <h2 className="border-b border-accent-600/25 pb-2 text-xs font-semibold uppercase tracking-widest text-warm-500">Daily activity (30d)</h2>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-warm-600">Rounds started / day</p>
              <p className="font-fw-mono text-lg font-semibold tabular-nums text-warm-900">
                {dailyRounds.at(-1) ?? 0}
              </p>
            </div>
            <Sparkline data={dailyRounds} goodDirection="up" label="Rounds started per day" width={100} height={28} />
          </div>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-warm-600">Tracer errors / day</p>
              <p className="font-fw-mono text-lg font-semibold tabular-nums text-warm-900">
                {dailyErrors.at(-1) ?? 0}
              </p>
            </div>
            <Sparkline data={dailyErrors} goodDirection="down" label="Tracer errors per day" width={100} height={28} />
          </div>
        </div>
      </Surface>

      <FlightTraceExplorer
        traces={flightTraces.traces}
        unavailableReason={flightTraces.unavailableReason}
        initialTraceId={initialTraceId}
      />

      <Surface padding="sm" id="stuck-rounds">
        <h2 className="border-b border-accent-600/25 pb-2 text-xs font-semibold uppercase tracking-widest text-warm-500">
          Stuck rounds — in-progress, no activity in 1h+
        </h2>
        <div className="mt-2">
          <StuckRoundsPanel rounds={enriched.stuckRounds} />
        </div>
      </Surface>

      <Surface padding="sm">
        <h2 className="border-b border-accent-600/25 pb-2 text-xs font-semibold uppercase tracking-widest text-warm-500">Player data quality</h2>
        <TracerPlayerList players={sortedPlayers} roundDetails={data.roundDetails} truncated={data.truncated} />
      </Surface>

      <Surface padding="sm">
        <h2 className="border-b border-accent-600/25 pb-2 text-xs font-semibold uppercase tracking-widest text-warm-500">Recent data-quality incidents</h2>
        {data.recentErrors.length === 0 ? (
          <div className="mt-2">
            <PanelAllClear label="No recent data-quality incidents" checkedAt={new Date().toISOString()} />
          </div>
        ) : (
          <ul className="mt-2 divide-y divide-warm-200/60">
            {data.recentErrors.slice(0, 50).map((incident) => (
              <TracerIncidentRow key={incident.id} incident={incident} />
            ))}
          </ul>
        )}
      </Surface>
    </div>
  );
}

export default async function TracerPage({
  searchParams,
}: {
  // `?trace=<uuid>` is the deep-link target other admin surfaces (e.g. an
  // error page's "view flight trace" link) point at — the explorer below
  // preselects and loads that trace on mount.
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireSuperAdmin();
  const params = await searchParams;
  const rawTrace = params.trace;
  const initialTraceId = typeof rawTrace === 'string' && rawTrace.length > 0 ? rawTrace : null;
  return (
    <div className="space-y-6">
      <AutoRefresh intervalMs={60_000} />
      <InlineNotice tone="info" title="Round diagnostics and fixes live here">
        Click any player below to see their rounds; expand a round to inspect
        its data-quality checks and run a fix (recalculate totals, GIR,
        strokes gained, refresh the stats cache, or remove a stuck round).
        These incidents are <span className="font-fw-mono">admin_events</span>{' '}
        rows, so marking one resolved happens in{' '}
        <Link href="/admin/errors" className="underline">
          Errors
        </Link>
        . The hole-by-hole shot browser has no Bridge equivalent yet.
      </InlineNotice>
      <PanelBoundary title="Tracer" skeleton={<PanelPageSkeleton rows={8} />}>
        <TracerBody initialTraceId={initialTraceId} />
      </PanelBoundary>
    </div>
  );
}
