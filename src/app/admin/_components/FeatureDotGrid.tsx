'use client';

import { useState, type ComponentType } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, MinusCircle } from 'lucide-react';
import { Button, StatusPill, Eyebrow, type FwStatusTone } from '@/components/fairway';
import { cn } from '@/lib/utils';
import type {
  FeatureHealth,
  FeatureHealthSummary as FeatureHealthSummaryData,
  FeatureStatus,
  FeatureTrend,
} from '@/lib/admin/data/feature-health';
import { FeatureHealthCard } from './FeatureHealthCard';
import { FeatureHealthSummary } from './FeatureHealthSummary';

const TONE_FOR_STATUS: Record<FeatureStatus, FwStatusTone> = {
  green: 'success',
  amber: 'warning',
  red: 'danger',
  neutral: 'neutral',
};

const ICON_FOR_STATUS: Record<FeatureStatus, ComponentType<{ size?: number; className?: string; 'aria-hidden'?: boolean }>> = {
  green: CheckCircle2,
  amber: AlertTriangle,
  red: XCircle,
  neutral: MinusCircle,
};

const STATUS_WORD: Record<FeatureStatus, string> = {
  green: 'healthy',
  amber: 'needs attention',
  red: 'red',
  neutral: 'no data',
};

const TREND_ARROW: Record<FeatureTrend, string> = {
  improving: '↓',
  worsening: '↑',
  flat: '→',
};

const APP_LABEL: Record<FeatureHealth['app'], string> = {
  golfhelm: 'GolfHelm',
  coachhelm: 'CoachHelm',
  baseballhelm: 'BaseballHelm',
};

/** Red first, then amber, neutral, green (spec §4 point 1) — sorted here
 *  too, independent of the fetch layer's own ordering, so the board is
 *  correct even if a caller passes an unsorted list. */
const STATUS_RANK: Record<FeatureStatus, number> = { red: 0, amber: 1, neutral: 2, green: 3 };
function byStatusRank(a: FeatureHealth, b: FeatureHealth): number {
  return STATUS_RANK[a.status] - STATUS_RANK[b.status];
}

/** Mirrors `FeatureHealthSummary`'s own "N healthy · M no data" phrasing
 *  (variant="full", rendered in the group header below) so the below-`md`
 *  disclosure CTA never claims a flat "healthy" count for a set that also
 *  folds in neutral (no feature-tagged data) chips. */
function formatCollapsedSummary(summary: Pick<FeatureHealthSummaryData, 'green' | 'neutral'>): string {
  const parts: string[] = [];
  if (summary.green > 0) parts.push(`${summary.green} healthy`);
  if (summary.neutral > 0) parts.push(`${summary.neutral} no data`);
  return parts.join(' · ');
}

function FeatureChip({
  feature,
  selected,
  onSelect,
}: {
  feature: FeatureHealth;
  selected: boolean;
  onSelect: (key: string) => void;
}) {
  const Icon = ICON_FOR_STATUS[feature.status];
  const richGreen = feature.status === 'green';
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={() => onSelect(feature.key)}
      aria-pressed={selected}
      aria-label={`${feature.label}: ${STATUS_WORD[feature.status]} — ${feature.reason}`}
      className={cn(
        'h-auto min-h-0 w-full rounded-xl border px-3 py-2 text-left normal-case',
        richGreen
          ? 'border-accent-500/35 bg-accent-50/60 hover:bg-accent-50'
          : 'border-border-subtle bg-surface',
      )}
    >
      {/* Button always wraps its `children` in a single inner `<span>`
          (src/components/fairway/controls/button.tsx) — passing two
          sibling elements there (as this row used to) mixes an inline
          box (StatusPill) with a block-level one (a `flex` span), which
          the CSS inline-formatting-context rules split onto its own line,
          silently breaking the trailing trend/count out from the label AND
          making `ml-auto` a no-op (no flex ancestor to push against). One
          wrapping row here — passed as Button's ONE child — owns the flex
          context itself instead, so identity (icon + label) and the 2
          key stats (trend, incident count) render as one true row, not two
          stacked ones — the card-ify treatment doctrine rule 8 asks for. */}
      <span className="flex w-full min-w-0 items-center justify-between gap-2">
        <StatusPill tone={TONE_FOR_STATUS[feature.status]} dot size="sm" className="min-w-0">
          <Icon size={12} aria-hidden />
          <span className="truncate">{feature.label}</span>
        </StatusPill>
        <span className="flex flex-shrink-0 items-center gap-1 font-fw-mono text-xs tabular-nums text-warm-500" aria-hidden>
          <span>{TREND_ARROW[feature.trend]}</span>
          <span>{feature.drillIn.warnings24h + feature.topSignatures.reduce((n, s) => n + s.count, 0)}</span>
        </span>
      </span>
    </Button>
  );
}

function FeatureGroup({
  heading,
  features,
  summary,
  selectedKey,
  onSelect,
}: {
  heading: string;
  features: FeatureHealth[];
  /** This group's slice of the SAME `summarizeFeatureHealth()` output the
   *  Overview/golf/baseball banner reads — computed once by the Health page
   *  server component (see `admin/health/page.tsx`) and passed down, never
   *  re-derived here. A client component cannot import the (server-only)
   *  `summarizeFeatureHealth` value itself, so the count derivation happens
   *  one layer up and this component only renders it. */
  summary: FeatureHealthSummaryData;
  selectedKey: string | null;
  onSelect: (key: string) => void;
}) {
  const selected = features.find((f) => f.key === selectedKey) ?? null;
  const sorted = [...features].sort(byStatusRank);
  // Below `md` only: green AND neutral chips collapse behind one disclosure
  // per group (Mobile Doctrine rule 3 — BaseballHelm alone registers ~48
  // features; a flat single-column list at 390px would run 15+
  // screen-heights). Neutral (no feature-tagged data yet) must fold too:
  // feature tagging only began 2026-07-02, so a group can still be mostly
  // neutral this soon after instrumentation — leaving it uncollapsed blows
  // the cap even with green hidden. Toggling shows them at every
  // breakpoint; `md:block` below always wins at `md` and up, so desktop
  // keeps rendering every chip, untouched.
  const [showHealthy, setShowHealthy] = useState(false);

  // Counts come from the SAME `summarizeFeatureHealth()` slice passed down
  // from the Health page — never re-derived here (health-consolidation
  // pass: this used to be its own `sorted.reduce(...)` tally, a third
  // independent rendering of the red/amber/neutral vocabulary alongside
  // `FeatureHealthRollup` and this same header's own text).
  const needsEyes = summary.red + summary.amber;
  // Collapsed-by-default set = green AND neutral (REPAIR: neutral used to
  // stay in the flat list uncollapsed — feature tagging only began
  // 2026-07-02, so a group can be mostly neutral this soon after
  // instrumentation and still blow the rule-3 ~3-screen-height cap even
  // with green folded away). The header rollup above already reports both
  // counts ("N healthy · M no data"), so the CTA mirrors that phrasing.
  const collapsedCount = summary.green + summary.neutral;

  return (
    <section aria-label={heading} className="min-w-0">
      {/* Rollup header: the app label plus an at-a-glance status count, so
          a thumb scanning the Health tab knows whether a lane needs eyes
          before reading a single chip — the whole point of a daily triage
          surface (rule 1's spirit applied to this sub-view). */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-accent-600/25 pb-2">
        <Eyebrow as="h2" tone="secondary">
          {heading}
        </Eyebrow>
        <FeatureHealthSummary variant="full" summary={summary} />
      </div>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {sorted.map((f) => {
          const collapsedOnPhone = f.status !== 'red' && f.status !== 'amber' && !showHealthy;
          return (
            <div key={f.key} className={cn('min-w-0', collapsedOnPhone && 'hidden md:block')}>
              <FeatureChip feature={f} selected={f.key === selectedKey} onSelect={onSelect} />
            </div>
          );
        })}
      </div>
      {collapsedCount > 0 ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          fullWidth
          onClick={() => setShowHealthy((s) => !s)}
          aria-expanded={showHealthy}
          className={cn(
            'mt-2 justify-start whitespace-normal rounded-xl px-3 py-2 text-left text-xs font-medium md:hidden',
            needsEyes === 0 && !showHealthy
              ? 'bg-fw-success-bg text-accent-700 hover:bg-fw-success-bg/80'
              : 'text-warm-500 hover:text-warm-700',
          )}
        >
          {showHealthy
            ? 'Hide healthy & no-data features'
            : needsEyes === 0
              ? `All ${formatCollapsedSummary(summary)} — show list →`
              : `Show ${formatCollapsedSummary(summary)} →`}
        </Button>
      ) : null}
      {selected ? <FeatureHealthCard feature={selected} /> : null}
    </section>
  );
}

export function FeatureDotGrid({
  features,
  groupSummaries,
}: {
  features: FeatureHealth[];
  /** Per-app `summarizeFeatureHealth()` output, keyed by app — computed by
   *  the Health page server component (`admin/health/page.tsx`) from the
   *  same `features` list, and passed down so every group header reads
   *  the identical red/amber/neutral tally as the Overview/golf/baseball
   *  banner instead of re-deriving its own. */
  groupSummaries: Record<FeatureHealth['app'], FeatureHealthSummaryData>;
}) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const groups = (['golfhelm', 'coachhelm', 'baseballhelm'] as const).map((app) => ({
    app,
    heading: APP_LABEL[app],
    features: features.filter((f) => f.app === app),
  }));

  function toggle(key: string) {
    setSelectedKey((prev) => (prev === key ? null : key));
  }

  return (
    <div className="space-y-8">
      {groups.map((group) => (
        <FeatureGroup
          key={group.app}
          heading={group.heading}
          features={group.features}
          summary={groupSummaries[group.app]}
          selectedKey={selectedKey}
          onSelect={toggle}
        />
      ))}
    </div>
  );
}
