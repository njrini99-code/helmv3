import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import { bridgeGetTracerData } from '@/app/admin/actions/golf-tracer';
import { Surface, StatusPill, type FwStatusTone } from '@/components/fairway';
import { PanelBoundary } from '../../_components/PanelBoundary';
import { PanelAllClear, PanelNoData } from '../../_components/PanelStates';
import { KpiTile } from '../../_components/KpiTile';
import { AutoRefresh } from '../../_components/AutoRefresh';

export const dynamic = 'force-dynamic';

/**
 * Port strategy: minimum-viable read-only port for W8 (per the wave doc's
 * fallback clause). This page calls bridgeGetTracerData() only — the
 * per-round diagnostic drill-down (getTracerRoundDiagnostic) and the
 * fixRoundData "fix" buttons are NOT wired here; they're deferred to the
 * first W14 retirement prerequisite, where the legacy TracerRoundInspector /
 * RoundDiagnosticModal client components get ported as interactive pieces.
 * Both delegations already exist and are gated in
 * src/app/admin/actions/golf-tracer.ts.
 */

const SEVERITY_TONE: Record<'critical' | 'error' | 'warning' | 'info', FwStatusTone> = {
  critical: 'danger',
  error: 'danger',
  warning: 'warning',
  info: 'neutral',
};

function playerName(p: { first_name: string | null; last_name: string | null }): string {
  return `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || 'Unknown player';
}

async function TracerBody() {
  const data = await bridgeGetTracerData();

  const sortedPlayers = [...data.playerSummaries].sort((a, b) => b.total_rounds - a.total_rounds);

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiTile label="Players tracked" value={data.playerSummaries.length} href="/admin/golf/tracer" />
        <KpiTile
          label="Errors 7d"
          value={data.errorStats.total7d}
          href="/admin/errors?sport=golf"
          tone={data.errorStats.total7d > 0 ? 'warning' : 'neutral'}
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
          label="Warnings 7d"
          value={data.errorStats.warnings7d}
          href="/admin/errors?sport=golf&severity=warning"
          goodDirection="down"
        />
      </section>

      <Surface padding="sm">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-warm-500">Player data quality</h2>
        {sortedPlayers.length === 0 ? (
          <PanelNoData label="No player round activity yet" description="Player rows appear once a round is logged." />
        ) : (
          <ul className="mt-2 divide-y divide-warm-200/60">
            {sortedPlayers.slice(0, 100).map((p) => (
              <li key={p.player_id} className="flex items-center gap-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate text-warm-900">{playerName(p)}</span>
                <span className="font-fw-mono text-xs tabular-nums text-warm-600">
                  {p.completed_rounds}/{p.total_rounds} completed
                </span>
                <span className="font-fw-mono text-xs tabular-nums text-warm-600">
                  {p.in_progress_rounds} in-progress · {p.draft_rounds} draft
                </span>
                <span className="font-fw-mono text-xs tabular-nums text-warm-500">
                  {p.last_activity ? new Date(p.last_activity).toLocaleDateString() : 'never'}
                </span>
              </li>
            ))}
          </ul>
        )}
        {data.truncated ? (
          <p className="mt-2 text-xs text-warm-500">Showing latest data — the bounded query hit its row cap.</p>
        ) : null}
      </Surface>

      <Surface padding="sm">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-warm-500">Recent data-quality incidents</h2>
        {data.recentErrors.length === 0 ? (
          <div className="mt-2">
            <PanelAllClear label="No recent data-quality incidents" checkedAt={new Date().toISOString()} />
          </div>
        ) : (
          <ul className="mt-2 divide-y divide-warm-200/60">
            {data.recentErrors.slice(0, 50).map((incident) => (
              <li key={incident.id} className="flex items-center gap-3 py-2 text-sm">
                <StatusPill tone={SEVERITY_TONE[incident.severity]} dot size="sm">
                  {incident.severity}
                </StatusPill>
                <span className="min-w-0 flex-1 truncate text-warm-900">{incident.title}</span>
                <span className="font-fw-mono text-xs tabular-nums text-warm-600">
                  {incident.occurrences} occurrence{incident.occurrences === 1 ? '' : 's'}
                </span>
                <span className="font-fw-mono text-xs tabular-nums text-warm-500">
                  {new Date(incident.lastSeen).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Surface>
    </div>
  );
}

export default async function TracerPage() {
  await requireSuperAdmin();
  return (
    <main className="space-y-6 p-6">
      <AutoRefresh intervalMs={60_000} />
      <PanelBoundary title="Tracer">
        <TracerBody />
      </PanelBoundary>
    </main>
  );
}
