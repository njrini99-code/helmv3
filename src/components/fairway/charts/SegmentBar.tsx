'use client';

/**
 * ============================================================================
 * SegmentBar — a chunky 100%-segmented instrument bar for categorical parts
 * ----------------------------------------------------------------------------
 * A cockpit SEGMENT readout that mounts into the signature `instrument`
 * InstrumentPanel: one thick horizontal bar split into proportional segments
 * (e.g. improved / no change / worsened). Each part is encoded by LENGTH (color
 * is never the only channel) and labelled inline with its count + percent in an
 * explicit legend. The most important part is called out as a huge Fragment-Mono
 * BIG READOUT (the `instrument` Readout) above the bar.
 *
 * Segments grow in from the left on mount (a staggered width tween) and snap
 * under reduced-motion.
 *
 * Color vocabulary maps to the locked viz tokens by default: green = the good /
 * primary part, warm amber = the caution part, cream-neutral = the inert middle.
 * Callers may override per part. Every part also has a legend swatch SHAPE +
 * text, so CVD users never rely on hue.
 *
 * HONESTY: with no parts (or all-zero counts), the panel shows the honest
 * awaiting state via the Readout — never a full bar of fabricated segments.
 * ========================================================================== */

import * as React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { InstrumentPanel } from '../instrument/InstrumentPanel';
import { Readout } from '../instrument/Readout';
import { InstrumentTable, InstrumentTableToggle } from './InstrumentTable';
import type { ChartTableData } from './ChartFrame';
import { TABULAR_NUMS, VIZ_COLOR, VIZ_EASE, VIZ_REVEAL_MS, chartAriaLabel, formatPercent } from './theme';

/** Semantic tone for a segment — maps to a locked viz token. */
export type SegmentTone = 'good' | 'caution' | 'neutral';

export interface SegmentBarPart {
  /** Part label, e.g. "Improved". */
  label: string;
  /** Raw count for this part. */
  value: number;
  /**
   * Semantic tone (drives the default color + legend swatch). `good` = green,
   * `caution` = warm amber, `neutral` = cream-neutral. Default `neutral`. */
  tone?: SegmentTone;
  /** Explicit color override (must be a VIZ_* token / CSS var, not raw hex). */
  color?: string;
}

export interface SegmentBarProps {
  /** Sparse instrument label (the panel bezel headline). */
  title: React.ReactNode;
  /** Tiny uppercase overline (the instrument's category). */
  overline?: string;
  /** Concise spoken takeaway for the figure's `aria-label`. */
  takeaway?: string;
  parts: ReadonlyArray<SegmentBarPart>;
  /**
   * Which part to call out as the BIG primary % readout. Either the index, or
   * `'good'` to auto-pick the first `good`-tone part. Default `'good'`. */
  primary?: number | 'good';
  /** Bar thickness in px. Default 28 (chunky). */
  thickness?: number;
  /** Force the honest empty / awaiting state. */
  awaiting?: boolean;
  className?: string;
}

const TONE_COLOR: Record<SegmentTone, string> = {
  good: VIZ_COLOR.accent,
  caution: VIZ_COLOR.warning,
  neutral: 'var(--fw-color-warm-300)',
};

export function SegmentBar({
  title,
  overline,
  takeaway,
  parts,
  primary = 'good',
  thickness = 28,
  awaiting = false,
  className,
}: SegmentBarProps) {
  const reduced = useReducedMotion() ?? false;
  const [showTable, setShowTable] = React.useState(false);

  const total = React.useMemo(
    () => parts.reduce((s, p) => s + (Number.isFinite(p.value) ? Math.max(0, p.value) : 0), 0),
    [parts],
  );
  const isAwaiting = awaiting || parts.length === 0 || total === 0;

  const resolved = React.useMemo(
    () =>
      parts.map((p, i) => {
        const v = Number.isFinite(p.value) ? Math.max(0, p.value) : 0;
        const pct = total > 0 ? v / total : 0;
        const tone: SegmentTone = p.tone ?? 'neutral';
        return {
          label: p.label,
          tone,
          index: i,
          value: v,
          pct,
          color: p.color ?? TONE_COLOR[tone],
        };
      }),
    [parts, total],
  );

  const primaryIndex =
    primary === 'good' ? resolved.findIndex((p) => p.tone === 'good') : primary;
  const primaryPart = primaryIndex >= 0 ? resolved[primaryIndex] : resolved[0];

  const tableData: ChartTableData = {
    caption: typeof title === 'string' ? title : 'Outcome breakdown',
    columns: [
      { key: 'label', label: 'Outcome' },
      { key: 'count', label: 'Count', numeric: true },
      { key: 'pct', label: 'Share', numeric: true },
    ],
    rows: resolved.map((p) => ({
      label: p.label,
      count: String(p.value),
      pct: formatPercent(p.pct),
    })),
  };
  const hasTable = tableData.rows.length > 0 && !isAwaiting;

  const ariaLabel = chartAriaLabel(
    typeof title === 'string' ? title : 'Outcome breakdown',
    takeaway ??
      (primaryPart && !isAwaiting
        ? `${formatPercent(primaryPart.pct)} ${primaryPart.label.toLowerCase()}, ${total} total`
        : 'no outcomes yet'),
  );

  return (
    <InstrumentPanel
      depth="base"
      eyebrow={overline}
      header={title}
      readout={
        hasTable ? (
          <InstrumentTableToggle show={showTable} onToggle={() => setShowTable((v) => !v)} />
        ) : undefined
      }
      className={className}
    >
      {showTable && hasTable ? (
        <InstrumentTable data={tableData} />
      ) : isAwaiting ? (
        <div role="img" aria-label={ariaLabel}>
          <Readout
            state="awaiting"
            size="md"
            samples={{ have: total, need: 1 }}
            awaitingLabel="No outcomes yet"
            label={typeof title === 'string' ? title : undefined}
          />
        </div>
      ) : (
        <div role="img" aria-label={ariaLabel} className="flex flex-col gap-4">
          {/* big called-out primary readout — the instrument display */}
          {primaryPart ? (
            <div className="flex items-baseline gap-2">
              <Readout
                value={primaryPart.pct}
                format={{ style: 'percent', maximumFractionDigits: 0 }}
                size="md"
                align="start"
              />
              <span className="font-fw-sans text-body-sm font-medium text-text-secondary">
                {primaryPart.label.toLowerCase()}
                <span
                  style={TABULAR_NUMS}
                  className="ml-1.5 font-fw-mono text-caption text-text-tertiary"
                >
                  ({primaryPart.value} of {total})
                </span>
              </span>
            </div>
          ) : null}

          {/* the chunky segmented bar */}
          <div
            className="flex w-full overflow-hidden rounded-fw-sm bg-surface-sunken"
            style={{ height: thickness }}
          >
            {resolved.map((p, i) =>
              p.pct > 0 ? (
                <motion.div
                  key={p.label}
                  className="h-full first:rounded-l-fw-sm last:rounded-r-fw-sm"
                  style={{ background: p.color }}
                  initial={reduced ? false : { width: 0 }}
                  animate={{ width: `${p.pct * 100}%` }}
                  transition={
                    reduced
                      ? { duration: 0 }
                      : { duration: VIZ_REVEAL_MS / 1000, ease: VIZ_EASE, delay: i * 0.08 }
                  }
                />
              ) : null,
            )}
          </div>

          {/* inline legend — swatch SHAPE + label + count + % (never color-only) */}
          <ul className="flex flex-wrap gap-x-5 gap-y-1.5">
            {resolved.map((p) => (
              <li key={p.label} className="flex items-center gap-2">
                <span
                  aria-hidden
                  className="h-2.5 w-2.5 shrink-0 rounded-sm"
                  style={{ background: p.color }}
                />
                <span className="font-fw-sans text-caption font-medium text-text-secondary">
                  {p.label}
                </span>
                <span
                  style={TABULAR_NUMS}
                  className="font-fw-mono text-caption font-semibold text-text-primary"
                >
                  {p.value}
                </span>
                <span
                  style={TABULAR_NUMS}
                  className="font-fw-mono text-caption text-text-tertiary"
                >
                  {formatPercent(p.pct)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </InstrumentPanel>
  );
}
