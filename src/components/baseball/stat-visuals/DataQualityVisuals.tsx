'use client';

// =============================================================================
// src/components/baseball/stat-visuals/DataQualityVisuals.tsx
//
// V10 baseball PRACTICE-EFFECTIVENESS, IMPORT/SOURCE-QUALITY and PLAYER-SNAPSHOT
// stat visuals, mounted in the Foundations <StatVisualFrame>.
//
// Charts:
//   - PracticeFocusOutcomeBoard §"Practice Focus To Outcome Board"
//       (honest "too early" / "not enough sample" / "correlated, not proven")
//   - ImportDiffViewer          §"Import Diff Viewer" (before/after, no rollback wired)
//   - SourceCoverageBoard       §"Source Coverage Board" (fresh/stale/missing)
//   - PlayerDnaPanel            §"Player DNA Panel" (radar + grouped-bar FALLBACK;
//       rule: "Do not use radar as the only precise chart")
//
// NO golf labels. Cream/green only.
// =============================================================================

import * as React from 'react';
import { cn } from '@/lib/utils';
import {
  StatVisualFrame,
  type StatVisualSourceChip,
  type StatVisualTableData,
} from './StatVisualFrame';
import { TabStrip } from './chart-primitives';
import { gateSample, num } from './chart-geometry';
import {
  IconArrowUpDown,
  IconCheckCircle2,
  IconAlertCircle,
  IconClock,
  IconPlus,
  IconCopy,
} from '@/components/icons';
import type {
  PracticeFocusRow,
  EffectivenessStatus,
  ImportDiffRow,
  ImportDiffKind,
  SourceCoverageCard,
  SourceFreshness,
  PlayerDnaDimension,
} from '@/lib/types/baseball-stat-visuals';
import type { BaseballMetricConfidence } from '@/lib/types/baseball-stat-events';

// =============================================================================
// Practice Focus -> Outcome Board
// =============================================================================

const EFFECTIVENESS_META: Record<
  EffectivenessStatus,
  { label: string; tone: string; ring: string }
> = {
  too_early: { label: 'Too early', tone: 'text-warm-600', ring: 'bg-warm-100 ring-warm-200' },
  not_enough_sample: {
    label: 'Not enough sample',
    tone: 'text-amber-700',
    ring: 'bg-amber-50 ring-amber-600/20',
  },
  correlated_not_proven: {
    label: 'Correlated, not proven',
    tone: 'text-amber-700',
    ring: 'bg-amber-50 ring-amber-600/20',
  },
  moved_up: { label: 'Moved up', tone: 'text-primary-700', ring: 'bg-primary-50 ring-primary-600/20' },
  moved_down: { label: 'Moved down', tone: 'text-red-700', ring: 'bg-red-50 ring-red-600/20' },
  no_change: { label: 'No change', tone: 'text-warm-600', ring: 'bg-warm-100 ring-warm-200' },
};

export interface PracticeFocusOutcomeBoardProps {
  rows: PracticeFocusRow[];
  sources?: StatVisualSourceChip[];
  height?: number;
  className?: string;
}

export function PracticeFocusOutcomeBoard({
  rows,
  sources,
  height = 340,
  className,
}: PracticeFocusOutcomeBoardProps) {
  const gate = gateSample(rows.length, { read: 1 });

  const table: StatVisualTableData = {
    caption: 'Practice focus, players, target metric, movement and effectiveness status.',
    columns: [
      { key: 'focus', label: 'Focus' },
      { key: 'players', label: 'Players', numeric: true },
      { key: 'date', label: 'Date' },
      { key: 'target', label: 'Target metric' },
      { key: 'movement', label: 'Movement' },
      { key: 'status', label: 'Status' },
    ],
    rows: rows.map((r) => ({
      focus: r.focus,
      players: r.players,
      date: r.date,
      target: r.targetMetric,
      movement:
        r.baseline === null || r.latest === null
          ? '—'
          : `${num(r.baseline, 1)} → ${num(r.latest, 1)}`,
      status: EFFECTIVENESS_META[r.status].label,
    })),
  };

  return (
    <StatVisualFrame
      title="Practice focus → outcome"
      subtitle="Did what we practiced improve later performance?"
      overline="Practice effectiveness"
      sources={sources}
      sample={{ size: rows.length, unitLabel: 'focus blocks', confidence: gate.confidence, minForRead: 1 }}
      lowConfidenceCaveat="Effectiveness is correlation against later data — never a claim that practice caused the change. Statuses say so explicitly."
      tableData={table}
      height={height}
      className={className}
    >
      <div className="flex h-full flex-col gap-2 overflow-auto">
        {rows.map((r) => {
          const meta = EFFECTIVENESS_META[r.status];
          const hasMovement = r.baseline !== null && r.latest !== null;
          return (
            <div
              key={r.id}
              className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-xl border border-warm-200 bg-cream-50/60 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-warm-800">{r.focus}</p>
                <p className="mt-0.5 text-xs text-warm-500">
                  {r.players} players · {r.targetMetric}
                  {hasMovement ? ` · ${num(r.baseline, 1)} → ${num(r.latest, 1)}` : ''}
                </p>
                {r.nextAction ? (
                  <p className="mt-1 text-xs text-primary-700">Next: {r.nextAction}</p>
                ) : null}
              </div>
              <span
                className={cn(
                  'shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ring-1',
                  meta.ring,
                  meta.tone,
                )}
              >
                {meta.label}
              </span>
            </div>
          );
        })}
      </div>
    </StatVisualFrame>
  );
}

// =============================================================================
// Import Diff Viewer
// =============================================================================

const DIFF_META: Record<ImportDiffKind, { label: string; icon: React.ReactNode; tone: string }> = {
  added: { label: 'Added', icon: <IconPlus size={13} />, tone: 'text-primary-700 bg-primary-50' },
  changed: { label: 'Changed', icon: <IconArrowUpDown size={13} />, tone: 'text-amber-700 bg-amber-50' },
  duplicate: { label: 'Duplicate', icon: <IconCopy size={13} />, tone: 'text-warm-600 bg-warm-100' },
  warning: { label: 'Warning', icon: <IconAlertCircle size={13} />, tone: 'text-red-700 bg-red-50' },
};

export interface ImportDiffViewerProps {
  rows: ImportDiffRow[];
  sources?: StatVisualSourceChip[];
  height?: number;
  className?: string;
}

export function ImportDiffViewer({ rows, sources, height = 340, className }: ImportDiffViewerProps) {
  const [filter, setFilter] = React.useState<ImportDiffKind | 'all'>('all');
  const filtered = filter === 'all' ? rows : rows.filter((r) => r.kind === filter);
  const gate = gateSample(rows.length, { read: 1 });

  const table: StatVisualTableData = {
    caption: 'Each import change: kind, player, field, before and after values.',
    columns: [
      { key: 'kind', label: 'Kind' },
      { key: 'player', label: 'Player' },
      { key: 'field', label: 'Field' },
      { key: 'before', label: 'Before' },
      { key: 'after', label: 'After' },
    ],
    rows: rows.map((r) => ({
      kind: DIFF_META[r.kind].label,
      player: r.player ?? '—',
      field: r.field,
      before: r.before ?? '—',
      after: r.after ?? '—',
    })),
  };

  return (
    <StatVisualFrame
      title="Import diff"
      subtitle="What changed because of this import?"
      overline="Import quality"
      sources={sources}
      sample={{ size: rows.length, unitLabel: 'changes', confidence: gate.confidence, minForRead: 1 }}
      tableData={table}
      height={height}
      className={className}
      actions={
        <TabStrip
          ariaLabel="Diff filter"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all' as const, label: 'All' },
            { value: 'added' as const, label: 'Added' },
            { value: 'changed' as const, label: 'Changed' },
            { value: 'duplicate' as const, label: 'Dupes' },
            { value: 'warning' as const, label: 'Warnings' },
          ]}
        />
      }
    >
      <div className="flex h-full flex-col gap-1.5 overflow-auto">
        {filtered.map((r) => {
          const meta = DIFF_META[r.kind];
          return (
            <div
              key={r.id}
              className="grid grid-cols-[auto_1fr] items-start gap-2.5 rounded-lg border border-warm-200 px-3 py-2"
            >
              <span
                className={cn(
                  'mt-0.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-eyebrow font-semibold',
                  meta.tone,
                )}
              >
                {meta.icon}
                {meta.label}
              </span>
              <div className="min-w-0">
                <p className="text-xs font-medium text-warm-700">
                  {r.player ? `${r.player} · ` : ''}
                  {r.field}
                </p>
                <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="text-warm-400 line-through">{r.before ?? '—'}</span>
                  <IconArrowUpDown size={11} className="text-warm-400" aria-hidden />
                  <span className="font-medium text-warm-800">{r.after ?? '—'}</span>
                </p>
                {r.note ? <p className="mt-0.5 text-xs text-amber-700">{r.note}</p> : null}
              </div>
            </div>
          );
        })}
      </div>
    </StatVisualFrame>
  );
}

// =============================================================================
// Source Coverage Board
// =============================================================================

const FRESHNESS_META: Record<
  SourceFreshness,
  { label: string; icon: React.ReactNode; ring: string }
> = {
  fresh: {
    label: 'Fresh',
    icon: <IconCheckCircle2 size={13} />,
    ring: 'text-primary-700 bg-primary-50 ring-primary-600/20',
  },
  stale: {
    label: 'Stale',
    icon: <IconClock size={13} />,
    ring: 'text-amber-700 bg-amber-50 ring-amber-600/20',
  },
  missing: {
    label: 'Missing',
    icon: <IconAlertCircle size={13} />,
    ring: 'text-red-700 bg-red-50 ring-red-600/20',
  },
};

export interface SourceCoverageBoardProps {
  cards: SourceCoverageCard[];
  sources?: StatVisualSourceChip[];
  height?: number;
  className?: string;
}

export function SourceCoverageBoard({
  cards,
  sources,
  height = 340,
  className,
}: SourceCoverageBoardProps) {
  const gate = gateSample(cards.length, { read: 1 });

  const table: StatVisualTableData = {
    caption: 'Per source: freshness, last received/reviewed/success, warnings, mapped players.',
    columns: [
      { key: 'provider', label: 'Provider' },
      { key: 'freshness', label: 'State' },
      { key: 'received', label: 'Last received' },
      { key: 'reviewed', label: 'Last reviewed' },
      { key: 'warnings', label: 'Warnings', numeric: true },
      { key: 'players', label: 'Players', numeric: true },
    ],
    rows: cards.map((c) => ({
      provider: c.provider,
      freshness: FRESHNESS_META[c.freshness].label,
      received: c.lastReceived ?? '—',
      reviewed: c.lastReviewed ?? '—',
      warnings: c.pendingWarnings,
      players: c.mappedPlayers,
    })),
  };

  return (
    <StatVisualFrame
      title="Source coverage"
      subtitle="Which sources are fresh, stale, or missing?"
      overline="Source health"
      sources={sources}
      sample={{ size: cards.length, unitLabel: 'sources', confidence: gate.confidence, minForRead: 1 }}
      tableData={table}
      height={height}
      className={className}
    >
      <div className="grid h-full grid-cols-1 gap-2.5 overflow-auto sm:grid-cols-2">
        {cards.map((c) => {
          const meta = FRESHNESS_META[c.freshness];
          return (
            <div key={c.sourceId} className="rounded-xl border border-warm-200 bg-cream-50/60 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium text-warm-800">{c.provider}</span>
                <span
                  className={cn(
                    'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-eyebrow font-semibold ring-1',
                    meta.ring,
                  )}
                >
                  {meta.icon}
                  {meta.label}
                </span>
              </div>
              <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                <Meta label="Received" value={c.lastReceived} />
                <Meta label="Reviewed" value={c.lastReviewed} />
                <Meta
                  label="Warnings"
                  value={c.pendingWarnings > 0 ? String(c.pendingWarnings) : '0'}
                  tone={c.pendingWarnings > 0 ? 'amber' : undefined}
                />
                <Meta label="Players" value={String(c.mappedPlayers)} />
              </dl>
            </div>
          );
        })}
      </div>
    </StatVisualFrame>
  );
}

function Meta({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | null;
  tone?: 'amber';
}) {
  return (
    <div className="flex flex-col">
      <dt className="text-eyebrow font-semibold uppercase tracking-wide text-warm-400">{label}</dt>
      <dd className={cn('tabular-nums text-warm-700', tone === 'amber' && 'text-amber-700')}>
        {value ?? '—'}
      </dd>
    </div>
  );
}

// =============================================================================
// Player DNA Panel (radar + grouped-bar FALLBACK)
// =============================================================================

export interface PlayerDnaPanelProps {
  dimensions: PlayerDnaDimension[];
  /** role label for the overline, e.g. "Two-way" / "RHP". */
  roleLabel?: string;
  sources?: StatVisualSourceChip[];
  height?: number;
  className?: string;
}

export function PlayerDnaPanel({
  dimensions,
  roleLabel,
  sources,
  height = 340,
  className,
}: PlayerDnaPanelProps) {
  // Default to the BAR view: the spec rule is "Do not use radar as the only
  // precise chart" — bars are the precise readout, radar is the at-a-glance shape.
  const [view, setView] = React.useState<'bars' | 'radar'>('bars');

  const withData = dimensions.filter((d) => d.value !== null);
  // Confidence is the WORST across shown dimensions — never overstate.
  const confidence: BaseballMetricConfidence = dimensions.reduce<BaseballMetricConfidence>(
    (acc, d) => {
      const rank = { insufficient: 0, low: 1, medium: 2, high: 3 } as const;
      return rank[d.confidence] < rank[acc] ? d.confidence : acc;
    },
    'high',
  );
  const totalSample = dimensions.reduce((s, d) => s + d.sample, 0);
  const gate = gateSample(withData.length, { read: 3 });

  const table: StatVisualTableData = {
    caption: 'Per DNA dimension: normalized value, raw value, sample and confidence.',
    columns: [
      { key: 'dim', label: 'Dimension' },
      { key: 'raw', label: 'Value' },
      { key: 'sample', label: 'Sample', numeric: true },
      { key: 'confidence', label: 'Confidence' },
    ],
    rows: dimensions.map((d) => ({
      dim: d.label,
      raw: d.rawLabel ?? '—',
      sample: d.sample,
      confidence: d.confidence,
    })),
  };

  return (
    <StatVisualFrame
      title="Player DNA"
      subtitle="What kind of player is this right now?"
      overline={roleLabel ?? 'Snapshot'}
      sources={sources}
      sample={{
        size: totalSample,
        unitLabel: 'observations',
        confidence: gate.canRead ? confidence : 'insufficient',
        minForRead: 1,
      }}
      state={withData.length < 3 ? 'insufficient-data' : undefined}
      stateMessage={withData.length < 3 ? 'Need at least 3 measured dimensions for a profile.' : undefined}
      lowConfidenceCaveat={
        dimensions.some((d) => d.confidence === 'insufficient' || d.value === null)
          ? 'Dimensions with thin or missing data render as a gap, never a fake zero.'
          : undefined
      }
      tableData={table}
      height={height}
      className={className}
      actions={
        <TabStrip
          ariaLabel="DNA view"
          value={view}
          onChange={setView}
          options={[
            { value: 'bars', label: 'Bars' },
            { value: 'radar', label: 'Radar' },
          ]}
        />
      }
    >
      {view === 'radar' ? (
        <DnaRadar dimensions={dimensions} height={height} />
      ) : (
        <DnaBars dimensions={dimensions} />
      )}
    </StatVisualFrame>
  );
}

function DnaBars({ dimensions }: { dimensions: PlayerDnaDimension[] }) {
  return (
    <div className="flex h-full flex-col justify-center gap-2.5">
      {dimensions.map((d) => (
        <div key={d.key} className="grid grid-cols-[110px_1fr_64px] items-center gap-3">
          <span className="truncate text-xs font-medium text-warm-700">{d.label}</span>
          <div className="relative h-3 overflow-hidden rounded-full bg-warm-100">
            {d.value !== null ? (
              <div
                className="h-full rounded-full bg-primary-600"
                style={{ width: `${Math.max(0, Math.min(1, d.value)) * 100}%` }}
              />
            ) : null}
          </div>
          <span className="text-right text-xs tabular-nums text-warm-600">
            {d.rawLabel ?? '—'}
          </span>
        </div>
      ))}
    </div>
  );
}

function DnaRadar({ dimensions, height }: { dimensions: PlayerDnaDimension[]; height: number }) {
  const size = Math.min(height - 16, 280);
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 28;
  const n = dimensions.length;

  const angleFor = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2;
  const pointFor = (i: number, value: number) => {
    const a = angleFor(i);
    return { x: cx + Math.cos(a) * r * value, y: cy + Math.sin(a) * r * value };
  };

  // Polygon only over dimensions WITH data (gaps are honest, not zeroed).
  const polyPoints = dimensions
    .map((d, i) => (d.value === null ? null : pointFor(i, Math.max(0, Math.min(1, d.value)))))
    .filter(Boolean) as { x: number; y: number }[];

  return (
    <div className="flex h-full items-center justify-center">
      <svg width={size} height={size} role="presentation">
        {[0.25, 0.5, 0.75, 1].map((ring) => (
          <circle key={ring} cx={cx} cy={cy} r={r * ring} fill="none" stroke="var(--color-warm-200, #e7e5e4)" />
        ))}
        {dimensions.map((d, i) => {
          const a = angleFor(i);
          const ex = cx + Math.cos(a) * r;
          const ey = cy + Math.sin(a) * r;
          return (
            <g key={d.key}>
              <line x1={cx} y1={cy} x2={ex} y2={ey} stroke="var(--color-warm-200, #e7e5e4)" />
              <text
                x={cx + Math.cos(a) * (r + 14)}
                y={cy + Math.sin(a) * (r + 14) + 3}
                textAnchor="middle"
                className="fill-warm-500 text-caption font-medium"
              >
                {d.label}
              </text>
            </g>
          );
        })}
        {polyPoints.length >= 3 ? (
          <polygon
            points={polyPoints.map((p) => `${p.x},${p.y}`).join(' ')}
            className="fill-primary-500/25 stroke-primary-600"
            strokeWidth={1.5}
          />
        ) : null}
        {dimensions.map((d, i) =>
          d.value === null ? null : (
            <circle
              key={d.key}
              {...pointFor(i, Math.max(0, Math.min(1, d.value)))}
              r={2.5}
              fill="#16A34A"
            />
          ),
        )}
      </svg>
    </div>
  );
}
