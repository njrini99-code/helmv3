'use client';

import { useState, type ComponentType } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, MinusCircle, Info } from 'lucide-react';
import { Button, StatusPill, Eyebrow, type FwStatusTone } from '@/components/fairway';
import type { FeatureHealth, FeatureStatus, FeatureTrend } from '@/lib/admin/data/feature-health';
import { FeatureHealthCard } from './FeatureHealthCard';

/**
 * The Feature Health dot grid (W16 Task 3). Two labeled groups — GolfHelm
 * then CoachHelm — of compact status chips, each carrying tone (color) AND
 * an icon AND a text label (never color alone, StatusPill contract). A
 * click expands the per-feature summarization card in place. Below both
 * groups: a static "Baseball — paused" note with zero data fetch and zero
 * StatusPill dots.
 *
 * Responsive: `grid-cols-1` on a phone (375px) up through `lg:grid-cols-3` —
 * chips wrap their label instead of overflowing horizontally.
 */

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

/** Red first, then amber, neutral, green (spec §4 point 1) — sorted here
 *  too, independent of the fetch layer's own ordering, so the board is
 *  correct even if a caller passes an unsorted list. */
const STATUS_RANK: Record<FeatureStatus, number> = { red: 0, amber: 1, neutral: 2, green: 3 };
function byStatusRank(a: FeatureHealth, b: FeatureHealth): number {
  return STATUS_RANK[a.status] - STATUS_RANK[b.status];
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
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={() => onSelect(feature.key)}
      aria-pressed={selected}
      aria-label={`${feature.label}: ${STATUS_WORD[feature.status]} — ${feature.reason}`}
      className="h-auto min-h-0 w-full justify-start gap-2 rounded-xl border border-border-subtle bg-surface px-3 py-2 text-left normal-case"
    >
      <StatusPill tone={TONE_FOR_STATUS[feature.status]} dot size="sm" className="min-w-0">
        <Icon size={12} aria-hidden />
        <span className="truncate">{feature.label}</span>
      </StatusPill>
      <span className="ml-auto flex flex-shrink-0 items-center gap-1 font-fw-mono text-xs tabular-nums text-warm-500" aria-hidden>
        <span>{TREND_ARROW[feature.trend]}</span>
        <span>{feature.drillIn.warnings24h + feature.topSignatures.reduce((n, s) => n + s.count, 0)}</span>
      </span>
    </Button>
  );
}

function FeatureGroup({
  heading,
  features,
  selectedKey,
  onSelect,
}: {
  heading: string;
  features: FeatureHealth[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
}) {
  const selected = features.find((f) => f.key === selectedKey) ?? null;
  const sorted = [...features].sort(byStatusRank);
  return (
    <section aria-label={heading} className="min-w-0">
      <Eyebrow as="h2" tone="secondary">
        {heading}
      </Eyebrow>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {sorted.map((f) => (
          <FeatureChip key={f.key} feature={f} selected={f.key === selectedKey} onSelect={onSelect} />
        ))}
      </div>
      {selected ? <FeatureHealthCard feature={selected} /> : null}
    </section>
  );
}

export function FeatureDotGrid({ features }: { features: FeatureHealth[] }) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const golf = features.filter((f) => f.app === 'golfhelm');
  const coach = features.filter((f) => f.app === 'coachhelm');

  function toggle(key: string) {
    setSelectedKey((prev) => (prev === key ? null : key));
  }

  return (
    <div className="space-y-8">
      <FeatureGroup heading="GolfHelm" features={golf} selectedKey={selectedKey} onSelect={toggle} />
      <FeatureGroup heading="CoachHelm" features={coach} selectedKey={selectedKey} onSelect={toggle} />

      <div className="flex items-start gap-2 rounded-xl bg-surface-sunken px-4 py-3 text-xs text-warm-500">
        <Info size={14} className="mt-0.5 flex-shrink-0" aria-hidden />
        <span>Baseball — paused (deferred until prod stabilizes). No data fetch, no dots.</span>
      </div>
    </div>
  );
}
