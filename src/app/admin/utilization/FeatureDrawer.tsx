'use client';

import Link from 'next/link';
import { Sheet, StatusPill } from '@/components/fairway';
import { LocalTime } from '../_components/LocalTime';
import type { FeatureAdoptionRow } from '@/lib/admin/data/feature-adoption';

/**
 * Shared feature detail drawer — opened from BOTH the Adoption Terrain heat
 * grid's row label and a Feature Constellation tile (same component, same
 * data shape, per both specs' "shares the drawer" build-size note). Every
 * field here is already present on the `FeatureAdoptionRow` the shared
 * rollup produces — no second fetch on open.
 */

const TIER_LABEL: Record<FeatureAdoptionRow['tier'], string> = {
  high: 'High tier',
  med: 'Med tier',
  low: 'Low tier',
};

const APP_LABEL: Record<FeatureAdoptionRow['app'], string> = {
  golfhelm: 'GolfHelm',
  coachhelm: 'CoachHelm',
  baseballhelm: 'BaseballHelm',
};

export function FeatureDrawer({
  feature,
  open,
  onOpenChange,
}: {
  feature: FeatureAdoptionRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      side="right"
      mobileSide="bottom"
      title={feature?.label ?? 'Feature'}
    >
      {feature ? (
        <div className="space-y-4 p-1">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone="neutral" size="sm">
              {APP_LABEL[feature.app]}
            </StatusPill>
            <StatusPill tone={feature.tier === 'high' ? 'accent' : 'neutral'} size="sm">
              {TIER_LABEL[feature.tier]}
            </StatusPill>
            {feature.dropoutRisk ? (
              <StatusPill tone="warning" size="sm">
                dropout risk — quiet {feature.quietDays}d
              </StatusPill>
            ) : null}
          </div>

          <p className="text-body-sm text-warm-700">{feature.healthSignal}</p>

          {feature.primaryTable ? (
            <p className="font-fw-mono text-caption text-warm-500">table: {feature.primaryTable}</p>
          ) : null}

          <div className="grid grid-cols-3 gap-3 rounded-fw-md bg-surface-sunken p-3">
            <div>
              <p className="text-eyebrow uppercase text-warm-500">30d users</p>
              <p className="font-fw-mono text-h3 tabular-nums text-warm-900">{feature.uniqueUsers30d}</p>
            </div>
            <div>
              <p className="text-eyebrow uppercase text-warm-500">7d users</p>
              <p className="font-fw-mono text-h3 tabular-nums text-warm-900">{feature.uniqueUsers7d}</p>
            </div>
            <div>
              <p className="text-eyebrow uppercase text-warm-500">7d Δ</p>
              <p className="font-fw-mono text-h3 tabular-nums text-warm-900">
                {feature.delta7dPct === null ? '—' : `${feature.delta7dPct > 0 ? '+' : ''}${feature.delta7dPct}%`}
              </p>
            </div>
          </div>

          <div>
            <h3 className="text-eyebrow uppercase text-warm-500">Power users (30d)</h3>
            {feature.topPowerUsers.length === 0 ? (
              <p className="mt-1 text-body-sm text-warm-500">No user has driven this feature in the last 30 days.</p>
            ) : (
              <ul className="mt-1 divide-y divide-warm-200/60">
                {feature.topPowerUsers.map((u) => (
                  <li key={u.userId} className="flex items-center justify-between gap-2 py-1.5">
                    <Link href={`/admin/users/${u.userId}`} className="min-w-0 truncate text-body-sm text-accent-700 underline-offset-2 hover:underline">
                      {u.userEmail ?? u.userId}
                    </Link>
                    <span className="font-fw-mono text-caption tabular-nums text-warm-500">{u.eventCount30d}×</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {feature.recentEvents.length > 0 ? (
            <div>
              <h3 className="text-eyebrow uppercase text-warm-500">Most recent events</h3>
              <ul className="mt-1 space-y-1">
                {feature.recentEvents.map((e, i) => (
                  <li key={`${e.occurredAt}-${i}`} className="flex items-center justify-between gap-2 text-caption text-warm-600">
                    <span className="min-w-0 truncate font-fw-mono">{e.eventType}</span>
                    <span className="shrink-0 text-warm-400">
                      <LocalTime iso={e.occurredAt} variant="datetime" />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {feature.knownGaps.length > 0 ? (
            <div>
              <h3 className="text-eyebrow uppercase text-warm-500">Known gaps</h3>
              <ul className="mt-1 list-disc space-y-1 pl-4 text-caption text-warm-500">
                {feature.knownGaps.map((g) => (
                  <li key={g}>{g}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <Link
            href={`/admin/errors?feature=${feature.key}`}
            className="inline-flex items-center text-body-sm text-accent-700 underline-offset-2 hover:underline"
          >
            View error trace for this feature →
          </Link>
        </div>
      ) : null}
    </Sheet>
  );
}
