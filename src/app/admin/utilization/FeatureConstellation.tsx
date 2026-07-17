'use client';

import * as React from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import {
  Surface,
  Segmented,
  StatusPill,
  Numeric,
  Sparkline,
  TrendChip,
  RuledLeaderStat,
  Sheet,
  Button,
  FilterPill,
} from '@/components/fairway';
import { FeatureDrawer } from './FeatureDrawer';
import type { FeatureAdoptionRow, FeatureAdoptionUserRow } from '@/lib/admin/data/feature-adoption';

/**
 * Feature Constellation — small-multiples tiles + power-user cross-highlight
 * (Utilization tab). Reads the SAME `FeatureAdoptionRow[]`/`FeatureAdoptionUserRow[]`
 * payload the heat grid renders — every filter/sort/cross-highlight below is
 * pure client state over data already on the page, so nothing here re-fetches.
 */

type AppFilter = 'all' | FeatureAdoptionRow['app'];
type TierFilter = 'all' | FeatureAdoptionRow['tier'];
type SortMode = 'users' | 'trend' | 'alpha';

const APP_LABEL: Record<FeatureAdoptionRow['app'], string> = {
  golfhelm: 'GolfHelm',
  coachhelm: 'CoachHelm',
  baseballhelm: 'BaseballHelm',
};

const TIER_DOT: Record<FeatureAdoptionRow['tier'], string> = {
  high: 'bg-primary-500',
  med: 'bg-fw-warning',
  low: 'bg-warm-300',
};

function zoneOf(row: FeatureAdoptionRow, hotFloor: number): 'hot' | 'steady' | 'cold' {
  if (row.quietDays >= 14 || row.uniqueUsers30d === 0) return 'cold';
  if (row.uniqueUsers30d >= hotFloor && hotFloor > 0) return 'hot';
  return 'steady';
}

function FeatureTile({
  row,
  zone,
  dimmed,
  onOpen,
}: {
  row: FeatureAdoptionRow;
  zone: 'hot' | 'steady' | 'cold';
  dimmed: boolean;
  onOpen: () => void;
}) {
  return (
    <Surface
      as="button"
      interactive
      padding="sm"
      onClick={onOpen}
      className={cn(
        'min-w-0 text-left transition-opacity duration-200',
        zone === 'hot' ? 'bg-primary-50/60' : null,
        zone === 'cold' ? 'opacity-55' : null,
        dimmed ? 'opacity-20' : null,
      )}
    >
      <div className="flex items-center gap-1.5">
        <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', TIER_DOT[row.tier])} aria-hidden />
        <span className="text-eyebrow uppercase text-warm-500">{APP_LABEL[row.app]}</span>
        {row.dropoutRisk ? (
          <StatusPill tone="warning" size="sm" dot={false} className="ml-auto">
            risk
          </StatusPill>
        ) : null}
      </div>
      <p className="mt-1 truncate text-body-sm font-medium text-warm-900" title={row.label}>
        {row.label}
      </p>
      <div className="mt-2">
        <Numeric value={row.uniqueUsers30d} label="30d users" size="sm" tone="neutral" />
      </div>
      {zone === 'cold' ? (
        <p className="mt-2 text-caption text-warm-500">quiet {row.quietDays}d</p>
      ) : (
        <div className="mt-2 flex items-center justify-between gap-2">
          <Sparkline data={row.eventCount14d} label={`${row.label} 14-day events`} />
          {row.delta7dPct === null ? null : (
            <TrendChip delta={row.delta7dPct} label={`${row.delta7dPct > 0 ? '+' : ''}${row.delta7dPct}%`} size="sm" />
          )}
        </div>
      )}
    </Surface>
  );
}

function PowerUserRow({
  user,
  metric,
  selected,
  onSelect,
}: {
  user: FeatureAdoptionUserRow;
  metric: 'breadth' | 'depth';
  selected: boolean;
  onSelect: () => void;
}) {
  const value = metric === 'breadth' ? `${user.breadth} features` : `${user.depthEventCount}× ${user.depthFeatureLabel ?? ''}`;
  return (
    // eslint-disable-next-line helm/no-raw-button -- compact leaderboard row toggle; <Button>'s fixed 44px min-height would break the dense list rhythm
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex w-full items-center justify-between gap-2 rounded-fw-sm px-2 py-1.5 text-left transition-colors',
        selected ? 'bg-primary-100' : 'hover:bg-surface-sunken',
      )}
    >
      <div className="min-w-0 flex-1">
        <RuledLeaderStat label={user.teamLabel ?? '—'} value={user.userEmail ?? user.userId} size="compact" leader={selected} />
      </div>
      <span className="shrink-0 font-fw-mono text-caption tabular-nums text-warm-500">{value}</span>
    </button>
  );
}

export function FeatureConstellation({
  rows,
  users,
}: {
  rows: readonly FeatureAdoptionRow[];
  users: readonly FeatureAdoptionUserRow[];
}) {
  const [appFilter, setAppFilter] = React.useState<AppFilter>('all');
  const [tierFilter, setTierFilter] = React.useState<TierFilter>('all');
  const [sortMode, setSortMode] = React.useState<SortMode>('users');
  const [coldOnly, setColdOnly] = React.useState(false);
  const [selectedUserId, setSelectedUserId] = React.useState<string | null>(null);
  const [leaderboardMetric, setLeaderboardMetric] = React.useState<'breadth' | 'depth'>('breadth');
  const [drawerFeature, setDrawerFeature] = React.useState<FeatureAdoptionRow | null>(null);
  const [mobileLeaderboardOpen, setMobileLeaderboardOpen] = React.useState(false);

  const filtered = React.useMemo(() => {
    let next = rows.filter((r) => (appFilter === 'all' ? true : r.app === appFilter));
    next = next.filter((r) => (tierFilter === 'all' ? true : r.tier === tierFilter));
    if (coldOnly) next = next.filter((r) => r.topPowerUsers.length === 0 && r.quietDays >= 7);
    const sorted = [...next];
    if (sortMode === 'users') sorted.sort((a, b) => b.uniqueUsers30d - a.uniqueUsers30d);
    else if (sortMode === 'trend') sorted.sort((a, b) => (b.delta7dPct ?? -Infinity) - (a.delta7dPct ?? -Infinity));
    else sorted.sort((a, b) => a.label.localeCompare(b.label));
    return sorted;
  }, [rows, appFilter, tierFilter, coldOnly, sortMode]);

  const hotFloor = React.useMemo(() => {
    const nonZero = filtered.map((r) => r.uniqueUsers30d).filter((v) => v > 0).sort((a, b) => b - a);
    if (nonZero.length === 0) return 0;
    const idx = Math.max(0, Math.ceil(nonZero.length * 0.2) - 1);
    return nonZero[idx] ?? 0;
  }, [filtered]);

  const selectedUser = selectedUserId ? (users.find((u) => u.userId === selectedUserId) ?? null) : null;
  const highlightSet = selectedUser ? new Set(selectedUser.featureKeys) : null;

  const sortedUsers = React.useMemo(() => {
    const copy = [...users];
    if (leaderboardMetric === 'breadth') copy.sort((a, b) => b.breadth - a.breadth || b.depthEventCount - a.depthEventCount);
    else copy.sort((a, b) => b.depthEventCount - a.depthEventCount || b.breadth - a.breadth);
    return copy;
  }, [users, leaderboardMetric]);

  const leaderboard = (
    <Surface padding="sm">
      <div className="flex items-center justify-between gap-2 border-b border-warm-200 pb-2">
        <h2 className="text-eyebrow uppercase text-warm-500">Power users</h2>
        <Segmented
          aria-label="Leaderboard metric"
          size="sm"
          value={leaderboardMetric}
          onValueChange={setLeaderboardMetric}
          options={[
            { value: 'breadth', label: 'Breadth' },
            { value: 'depth', label: 'Depth' },
          ]}
        />
      </div>
      {sortedUsers.length === 0 ? (
        <p className="mt-3 text-body-sm text-warm-500">No users with feature-tagged activity in the last 30 days.</p>
      ) : (
        <div className="mt-2 max-h-[480px] space-y-0.5 overflow-y-auto">
          {sortedUsers.map((u) => (
            <PowerUserRow
              key={u.userId}
              user={u}
              metric={leaderboardMetric}
              selected={selectedUserId === u.userId}
              onSelect={() => setSelectedUserId((cur) => (cur === u.userId ? null : u.userId))}
            />
          ))}
        </div>
      )}
      {selectedUser ? (
        <p className="mt-3 border-t border-warm-200 pt-2 text-caption text-warm-500">
          Dimming every tile <Link href={`/admin/users/${selectedUser.userId}`} className="underline">{selectedUser.userEmail ?? selectedUser.userId}</Link> hasn&apos;t touched in 30d.{' '}
          {/* eslint-disable-next-line helm/no-raw-button -- inline text-level clear action, not a <Button> pill */}
          <button type="button" className="text-accent-700 underline" onClick={() => setSelectedUserId(null)}>
            Clear
          </button>
        </p>
      ) : null}
    </Surface>
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            aria-label="App filter"
            size="sm"
            value={appFilter}
            onValueChange={setAppFilter}
            options={[
              { value: 'all', label: 'All' },
              { value: 'golfhelm', label: 'Golf' },
              { value: 'coachhelm', label: 'Coach' },
              { value: 'baseballhelm', label: 'Baseball' },
            ]}
          />
          <Segmented
            aria-label="Tier filter"
            size="sm"
            value={tierFilter}
            onValueChange={setTierFilter}
            options={[
              { value: 'all', label: 'All tiers' },
              { value: 'high', label: 'High' },
              { value: 'med', label: 'Med' },
              { value: 'low', label: 'Low' },
            ]}
          />
          <Segmented
            aria-label="Sort"
            size="sm"
            value={sortMode}
            onValueChange={setSortMode}
            options={[
              { value: 'users', label: 'Users' },
              { value: 'trend', label: 'Trend' },
              { value: 'alpha', label: 'A–Z' },
            ]}
          />
          <FilterPill size="sm" showCheck={false} selected={coldOnly} onClick={() => setColdOnly((v) => !v)}>
            Cold &amp; Dead (30d)
          </FilterPill>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="ml-auto lg:hidden"
            onClick={() => setMobileLeaderboardOpen(true)}
          >
            Power Users
          </Button>
        </div>

        {filtered.length === 0 ? (
          <Surface padding="sm">
            <p className="text-body-sm text-warm-500">No features match this filter combination.</p>
          </Surface>
        ) : (
          // Mobile reflows to a fixed 2-col grid (per the tab brief); md+
          // switches to an editorial auto-fill of ~220px tiles.
          <div className="grid grid-cols-2 gap-3 md:[grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]">
            {filtered.map((row) => (
              <FeatureTile
                key={row.key}
                row={row}
                zone={zoneOf(row, hotFloor)}
                dimmed={highlightSet !== null && !highlightSet.has(row.key)}
                onOpen={() => setDrawerFeature(row)}
              />
            ))}
          </div>
        )}
      </div>

      <div className="hidden lg:block">{leaderboard}</div>

      <Sheet open={mobileLeaderboardOpen} onOpenChange={setMobileLeaderboardOpen} side="bottom" title="Power users">
        {leaderboard}
      </Sheet>

      <FeatureDrawer feature={drawerFeature} open={drawerFeature !== null} onOpenChange={(o) => !o && setDrawerFeature(null)} />
    </div>
  );
}
