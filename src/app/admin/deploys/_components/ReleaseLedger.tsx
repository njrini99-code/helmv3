import { TrendChart } from '@/components/fairway';
import { fetchReleaseLedger } from '@/lib/admin/data/release-ledger';
import { PanelNoData, PanelStale } from '../../_components/PanelStates';
import { ReleaseCard } from './ReleaseCard';

/**
 * "Release Ledger" hero panel — a trailing-7d hourly admin_events error
 * trend (TrendChart) with a color-coded ReferenceDot at every production
 * deploy, followed by one release card per deploy carrying the
 * before/after-2h delta and the folded-in Regression Radar verdict
 * (resolved-and-quiet vs new-since, scoped to that deploy's own reign).
 *
 * Cards render as a responsive grid (1 col phone, 2 col sm, 3 col xl) rather
 * than a horizontal-scroll rail — composed rhythm without adding new
 * scroll-snap machinery the kit doesn't already have.
 */
export async function ReleaseLedger() {
  const ledger = await fetchReleaseLedger();

  if (ledger.status === 'unconfigured') {
    return (
      <PanelNoData
        label="Release ledger not configured"
        description="Set VERCEL_API_TOKEN / VERCEL_PROJECT_ID / VERCEL_TEAM_ID, or ship once to production so a deploy marker gets recorded (works with zero new secrets)."
      />
    );
  }
  if (ledger.status === 'error' || !ledger.data) {
    return <PanelStale label="Release ledger" error={ledger.error} />;
  }

  const { trend, cards, deploySource } = ledger.data;
  const hasTrendSignal = trend.length > 0;

  return (
    <div className="space-y-4">
      {deploySource === 'marker-fallback' ? (
        <p className="text-xs text-warm-500">
          Vercel deployments API isn&apos;t configured — showing deploy markers recorded at boot instead of the full
          deployments history.
        </p>
      ) : null}

      <TrendChart
        title="Errors, last 7 days"
        overline="Release ledger"
        subtitle="Hourly admin_events error volume · markers = production deploys, colored by that deploy's own verdict"
        data={trend}
        state={hasTrendSignal ? 'ready' : 'empty'}
        height={220}
      />

      {cards.length === 0 ? (
        <PanelNoData
          label="No production deploys in the last 7 days"
          description="Release cards appear here once a production deploy lands."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {cards.map((card) => (
            <ReleaseCard key={card.uid} card={card} />
          ))}
        </div>
      )}
    </div>
  );
}
