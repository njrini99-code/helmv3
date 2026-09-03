import { Surface, StatusPill } from '@/components/fairway';
import type { AdoptionMapLens, AdoptionGroupRow } from '@/lib/admin/lenses/adoption-map';

/** Adoption Map — team/role breakdown (brief §20-27's "Feature Adoption Map
 *  tied to reliability"). See adoption-map.ts's header for why this reuses
 *  fetchFeatureAdoption()/fetchUsersTab() rather than re-scanning
 *  admin_events. */

function GroupList({ title, rows }: { title: string; rows: readonly AdoptionGroupRow[] }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-widest text-warm-500">{title}</p>
      <div className="mt-2 divide-y divide-warm-200/60">
        {rows.length === 0 ? (
          <p className="py-3 text-sm text-warm-500">No adopting users in this group yet.</p>
        ) : (
          rows.map((r) => (
            <div key={r.key} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-warm-900">{r.label}</p>
                <p className="truncate font-fw-mono text-xs text-warm-500">
                  {r.topFeatureKeys.slice(0, 3).join(', ') || 'no feature signal'}
                </p>
              </div>
              <div className="text-right">
                <p className="font-fw-mono text-sm tabular-nums text-warm-900">{r.userCount}</p>
                <p className="font-fw-mono text-caption tabular-nums text-warm-500">
                  {r.avgBreadth === null ? '—' : `${r.avgBreadth.toFixed(1)} feat/user`}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export function AdoptionMapPanel({ lens }: { lens: AdoptionMapLens }) {
  return (
    <Surface padding="sm">
      <div className="grid gap-6 md:grid-cols-2">
        <GroupList title="By team" rows={lens.byTeam} />
        <GroupList title="By role" rows={lens.byRole} />
      </div>
      {lens.featureSignals.length > 0 && (
        <div className="mt-6 border-t border-border-subtle pt-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-warm-500">Feature signals (tied to reliability)</p>
          <div className="mt-2 divide-y divide-warm-200/60">
            {lens.featureSignals.map((f) => (
              <div key={f.key} className="flex items-center justify-between gap-3 py-2">
                <p className="truncate text-sm text-warm-900">{f.label}</p>
                <div className="flex items-center gap-2">
                  <span className="font-fw-mono text-xs tabular-nums text-warm-600">{f.uniqueUsers30d} users</span>
                  {f.delta7dPct !== null && (
                    <span className={`font-fw-mono text-xs tabular-nums ${f.delta7dPct < 0 ? 'text-fw-danger-ink' : 'text-accent-700'}`}>
                      {f.delta7dPct > 0 ? '+' : ''}
                      {f.delta7dPct}%
                    </span>
                  )}
                  {f.dropoutRisk && (
                    <StatusPill tone="warning" size="sm">
                      dropout risk
                    </StatusPill>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {lens.roleCoverageNote && <p className="mt-4 text-caption text-warm-400">{lens.roleCoverageNote}</p>}
    </Surface>
  );
}
