'use client';

/**
 * StatsCenterScreen — a faithful miniature of BaseballHelm's Stats Center
 * idiom (studied from `StatsCenterClient.tsx`'s box-score/game views): the
 * 1–9 innings grid with R/H/E, two team rows, one live inning pulsing
 * while the team bats, a single batter's line below. Cream paper, sage-ink
 * figures; kelly marks only the live-inning dot and the batting-line
 * accent — product-only, per CONTRACTS.md.
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
  const cols = `72px repeat(${INNINGS}, 1fr) 26px 26px 26px`;
  const innings = Array.from({ length: INNINGS }, (_, i) => i);

  return (
    <div
      className={cn('relative flex h-full w-full flex-col overflow-hidden p-4', className)}
      style={{ background: 'linear-gradient(155deg, var(--fl-cream-high) 0%, var(--fl-cream) 100%)' }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <ScreenEyebrow>Stats Center</ScreenEyebrow>
        <ScreenEyebrow>Vs Elon · Home</ScreenEyebrow>
      </div>
      <div className="fl-rule mt-2" />

      <m.div
        variants={containerVariants(0.05)}
        initial={shown ? 'shown' : 'hidden'}
        animate={shown ? 'shown' : 'hidden'}
        className="mt-3 flex-1"
      >
        <div
          className="grid items-center gap-y-2 font-annual text-microlabel tabular-nums"
          style={{ gridTemplateColumns: cols, color: 'var(--fl-sage-ink)' }}
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

      <div className="fl-rule" />
      <m.div
        variants={containerVariants(0.05, 0.2)}
        initial={shown ? 'shown' : 'hidden'}
        animate={shown ? 'shown' : 'hidden'}
        className="mt-2 flex items-center justify-between gap-2"
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
