'use client';

/**
 * StatsCenterScreen — a faithful miniature of BaseballHelm's Stats Center
 * idiom (studied from `StatsCenterClient.tsx`'s box-score/game views): the
 * 1–9 innings grid with R/H/E, two team rows, one live inning pulsing
 * while the team bats, a batting-lines table (the season/game stat grid
 * Stats Center is built around), and a single batter's line as the
 * footer. Cream paper, sage-ink figures; kelly marks only the live-inning
 * dot and the batting-line accent — product-only, per CONTRACTS.md.
 *
 * DENSITY PASS (2026-07) — see `CommandCenterScreen.tsx`'s file header for
 * the root cause (a `flex-1` area with nothing to grow into, leaving the
 * box score stranded at the top with ~65% empty middle before the
 * batting-line footer). Fixed the same way: the box score stays a
 * fixed-height top block, and the NEW batting-lines table is a CSS grid
 * with `1fr` rows that fills the exact remaining height edge-to-edge.
 */
import { m } from 'framer-motion';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { ScreenEyebrow, rowVariants, containerVariants, barVariants, KELLY, type ScreenReplicaProps } from './shared';

const INNINGS = 9;
const RINI_LINE: readonly number[] = [0, 1, 0, 2, 0, 1];
const ELON_LINE: readonly number[] = [1, 0, 0, 0, 1, 0];
/** 0-based → inning 7, the team currently at bat. */
const LIVE_INNING_INDEX = 6;

const BATTING_LINES: ReadonlyArray<{ name: string; ab: number; r: number; h: number; rbi: number }> = [
  { name: 'J. Alvarez, SS', ab: 4, r: 1, h: 2, rbi: 1 },
  { name: 'M. Chen, RHP', ab: 1, r: 0, h: 0, rbi: 0 },
  { name: 'D. Ruiz, OF', ab: 4, r: 1, h: 2, rbi: 0 },
  { name: 'T. Brooks, 1B', ab: 3, r: 1, h: 1, rbi: 2 },
  { name: 'K. Torres, 2B', ab: 4, r: 0, h: 0, rbi: 0 },
  { name: 'A. Diaz, C', ab: 3, r: 1, h: 1, rbi: 1 },
];

const BATTING_COLS = '1fr 26px 26px 26px 30px';

function liveDot(instant: boolean): ReactNode {
  return (
    <m.span
      aria-hidden="true"
      className="mx-auto inline-block h-1.5 w-1.5 rounded-full"
      style={{ background: KELLY }}
      animate={!instant ? { opacity: [1, 0.45, 1] } : undefined}
      transition={!instant ? { duration: 1.8, repeat: Infinity, ease: 'easeInOut' } : undefined}
    />
  );
}

export function StatsCenterScreen({ active, instant = false, className }: ScreenReplicaProps) {
  const shown = instant || active;
  const boxCols = `72px repeat(${INNINGS}, 1fr) 26px 26px 26px`;
  const innings = Array.from({ length: INNINGS }, (_, i) => i);

  return (
    <div
      className={cn('relative flex h-full w-full flex-col overflow-hidden p-4', className)}
      style={{ background: 'linear-gradient(155deg, var(--fl-cream-high) 0%, var(--fl-cream) 100%)' }}
    >
      {/* HEADER */}
      <div className="flex shrink-0 items-baseline justify-between gap-2">
        <ScreenEyebrow>Stats Center</ScreenEyebrow>
        <ScreenEyebrow>Vs Elon · Home</ScreenEyebrow>
      </div>
      <div className="fl-rule mt-2 shrink-0" />

      {/* BODY */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Box score — fixed-height top block */}
        <m.div
          variants={containerVariants(0.05)}
          initial={shown ? 'shown' : 'hidden'}
          animate={shown ? 'shown' : 'hidden'}
          className="mt-3 shrink-0"
        >
          <div
            className="grid items-center gap-y-2 font-annual text-microlabel tabular-nums"
            style={{ gridTemplateColumns: boxCols, color: 'var(--fl-sage-ink)' }}
          >
            <span />
            {innings.map((i) => (
              <span key={i} className="text-center opacity-50">
                {i + 1}
              </span>
            ))}
            <span className="text-center font-semibold opacity-70">R</span>
            <span className="text-center font-semibold opacity-70">H</span>
            <span className="text-center font-semibold opacity-70">E</span>

            <m.span variants={rowVariants} className="truncate font-semibold">
              Rini
            </m.span>
            {innings.map((i) => (
              <m.span key={i} variants={rowVariants} className="text-center">
                {i === LIVE_INNING_INDEX ? liveDot(instant) : (RINI_LINE[i] ?? '–')}
              </m.span>
            ))}
            <m.span variants={rowVariants} className="text-center font-semibold">
              4
            </m.span>
            <m.span variants={rowVariants} className="text-center">
              7
            </m.span>
            <m.span variants={rowVariants} className="text-center">
              1
            </m.span>

            <m.span variants={rowVariants} className="truncate opacity-70">
              Elon
            </m.span>
            {innings.map((i) => (
              <m.span key={i} variants={rowVariants} className="text-center opacity-70">
                {ELON_LINE[i] ?? '–'}
              </m.span>
            ))}
            <m.span variants={rowVariants} className="text-center opacity-70">
              2
            </m.span>
            <m.span variants={rowVariants} className="text-center opacity-70">
              5
            </m.span>
            <m.span variants={rowVariants} className="text-center opacity-70">
              0
            </m.span>
          </div>
        </m.div>

        <div className="fl-rule my-3 shrink-0" />

        {/* Batting lines — header stays fixed height; the data rows are the
            grower, a 1fr grid that fills whatever height remains, edge to
            edge, instead of leaving a bare middle void. */}
        <div
          className="grid shrink-0 items-center gap-x-2 font-annual text-microbadge font-semibold uppercase opacity-50"
          style={{ gridTemplateColumns: BATTING_COLS, color: 'var(--fl-sage-ink)' }}
        >
          <span>Player</span>
          <span className="text-center">Ab</span>
          <span className="text-center">R</span>
          <span className="text-center">H</span>
          <span className="text-center">Rbi</span>
        </div>
        <m.div
          variants={containerVariants(0.04, 0.15)}
          initial={shown ? 'shown' : 'hidden'}
          animate={shown ? 'shown' : 'hidden'}
          className="grid flex-1 font-annual text-microlabel tabular-nums"
          style={{ gridTemplateRows: `repeat(${BATTING_LINES.length}, 1fr)`, color: 'var(--fl-sage-ink)' }}
        >
          {BATTING_LINES.map((b, i) => (
            <m.div
              key={b.name}
              variants={rowVariants}
              className="grid items-center gap-x-2"
              style={{
                gridTemplateColumns: BATTING_COLS,
                borderTop: i > 0 ? '1px solid rgba(var(--fl-brass-rgb), 0.14)' : undefined,
              }}
            >
              <span className="truncate">{b.name}</span>
              <span className="text-center">{b.ab}</span>
              <span className="text-center">{b.r}</span>
              <span className="text-center">{b.h}</span>
              <span className="text-center font-semibold">{b.rbi}</span>
            </m.div>
          ))}
        </m.div>
      </div>

      {/* FOOTER */}
      <div className="fl-rule shrink-0" />
      <m.div
        variants={containerVariants(0.05, 0.2)}
        initial={shown ? 'shown' : 'hidden'}
        animate={shown ? 'shown' : 'hidden'}
        className="mt-2 flex shrink-0 items-center justify-between gap-2"
      >
        <m.div variants={rowVariants}>
          <ScreenEyebrow>At the Plate</ScreenEyebrow>
          <p className="mt-0.5 text-microlabel" style={{ color: 'var(--fl-sage-ink)' }}>
            T. Brooks — 2-for-3, 2B, RBI
          </p>
        </m.div>
        <m.div variants={barVariants} className="h-[3px] w-16 origin-left rounded-full" style={{ background: KELLY }} />
      </m.div>
    </div>
  );
}
