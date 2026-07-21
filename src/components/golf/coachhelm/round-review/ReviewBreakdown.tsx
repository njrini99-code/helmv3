'use client';

/**
 * ============================================================================
 * ReviewBreakdown — the "Full breakdown" DrillPanel body (spec §3.4/§5.5)
 * ----------------------------------------------------------------------------
 * Front/back split, putting bands, momentum, driving/penalties, and
 * short-game — the old review's nine accordions' content, behind ONE door.
 * Pure presentational: every section is honest-empty (renders nothing) when
 * its source data has nothing to show, rather than an empty chart shell.
 * ========================================================================== */

import type { ReactNode } from 'react';
import { Eyebrow } from '@/components/fairway';
import { RailBars, RampMatrix, TickerStrip } from '@/components/fairway/modules';
import { TABULAR_NUMS } from '@/components/fairway/charts/theme';
import type {
  FrontBackRow,
  PuttingRamp,
} from './buildReviewViewModel';
import type { RailBarRow, TickerItem } from '@/components/fairway/modules';

export interface ReviewBreakdownProps {
  frontBack: FrontBackRow[];
  puttingRamp: PuttingRamp;
  momentum: TickerItem[];
  drivingPenaltyLines: string[];
  shortGameRows: RailBarRow[];
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-w-0 space-y-3 overflow-clip rounded-fw-md border border-border-subtle bg-surface p-4 shadow-soft">
      <Eyebrow as="h3">{title}</Eyebrow>
      {children}
    </div>
  );
}

export function ReviewBreakdown({
  frontBack,
  puttingRamp,
  momentum,
  drivingPenaltyLines,
  shortGameRows,
}: ReviewBreakdownProps) {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
      {frontBack.length > 0 ? (
        <Section title="Front / back">
          <div className="grid grid-cols-1 gap-2 overflow-x-auto">
            {frontBack.map((row) => (
              <div
                key={row.label}
                className="grid min-w-[420px] grid-cols-[1fr_auto_auto_auto_auto] items-center gap-3 rounded-fw-md bg-surface-sunken px-3 py-2"
              >
                <span className="font-fw-sans text-body-sm font-medium text-text-primary">{row.label}</span>
                <span style={TABULAR_NUMS} className="font-fw-mono text-caption tabular-nums text-text-secondary">
                  {row.score} str
                </span>
                <span style={TABULAR_NUMS} className="font-fw-mono text-caption tabular-nums text-text-secondary">
                  {row.putts} putts
                </span>
                <span style={TABULAR_NUMS} className="font-fw-mono text-caption tabular-nums text-text-secondary">
                  {row.gir} GIR
                </span>
                <span style={TABULAR_NUMS} className="font-fw-mono text-caption tabular-nums text-text-secondary">
                  {row.fairways} FW
                </span>
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      {puttingRamp.cols.length > 0 ? (
        <Section title="Putting by distance">
          <div className="overflow-x-auto">
            <RampMatrix cols={puttingRamp.cols} rows={[{ label: 'Makes', cells: puttingRamp.cells }]} />
          </div>
        </Section>
      ) : null}

      {momentum.length > 0 ? (
        <Section title="Momentum">
          <TickerStrip items={momentum} />
        </Section>
      ) : null}

      {drivingPenaltyLines.length > 0 ? (
        <Section title="Driving & penalties">
          <ul className="space-y-1">
            {drivingPenaltyLines.map((line) => (
              <li key={line} className="font-fw-sans text-body-sm text-text-secondary">
                {line}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {shortGameRows.length > 0 ? (
        <Section title="Short game">
          <RailBars rows={shortGameRows} labelWidth={80} />
        </Section>
      ) : null}
    </div>
  );
}
