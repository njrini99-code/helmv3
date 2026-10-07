// REDESIGN-SCRATCH (docs/redesign/rounds): the scorecard marks, drawn with borders.
//
// The shape carries the meaning and colour only reinforces it, so a mark passes the grayscale
// test: a circle is better than the reference, a double circle far better, a square worse, a
// double square far worse. On a hole the reference is par (birdie, eagle, bogey, double bogey);
// on a round in Direction G it is the player's usual band.
//
// No kit primitive exists for this (research-kit gap 1), so it is built here from the Fairway
// tokens: `text-accent-ink` for the better marks, `text-fw-warning-text` (amber, never red) for
// the worse ones, `border-current` so a shape and its digit always share one ink.
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

import { bucketForHole, type MarkKind } from './model';
import type { FixtureHole } from './fixture';

export type MarkSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
export type MarkShape = 'none' | 'circle' | 'double-circle' | 'square' | 'double-square' | 'dashed';

interface MarkSpec {
  shape: MarkShape;
  ink: string;
  label: string;
}

const SPEC: Record<MarkKind | 'uncounted', MarkSpec> = {
  eagle: { shape: 'double-circle', ink: 'text-accent-ink', label: 'Eagle or better' },
  birdie: { shape: 'circle', ink: 'text-accent-ink', label: 'Birdie' },
  par: { shape: 'none', ink: 'text-text-primary', label: 'Par' },
  bogey: { shape: 'square', ink: 'text-fw-warning-text', label: 'Bogey' },
  double: { shape: 'double-square', ink: 'text-fw-warning-text', label: 'Double bogey or worse' },
  uncounted: { shape: 'dashed', ink: 'text-text-tertiary', label: 'Not counted' },
};

/** Outer box and digit size per step. `xs` is shape only, for a strip of 18 holes. */
const BOX: Record<MarkSize, string> = {
  xs: 'h-3 w-3',
  sm: 'h-6 w-6 text-caption',
  md: 'h-8 w-8 text-body-sm',
  lg: 'h-11 w-11 text-h3',
  xl: 'h-24 w-24 text-stat-lg',
};

/** Line weight of a single mark. */
const SINGLE_LINE: Record<MarkSize, string> = {
  xs: 'border',
  sm: 'border',
  md: 'border-2',
  lg: 'border-2',
  xl: 'border-2',
};

/** A double mark is two equal lines with a gap between them. */
const DOUBLE_LINE: Record<MarkSize, string> = {
  xs: 'border',
  sm: 'border',
  md: 'border',
  lg: 'border-2',
  xl: 'border-2',
};

const DOUBLE_GAP: Record<MarkSize, string> = {
  xs: 'p-px',
  sm: 'p-0.5',
  md: 'p-0.5',
  lg: 'p-1',
  xl: 'p-1.5',
};

/** Lower-case name of a hole result, for building an accessible sentence: "birdie". */
export function holeWord(kind: MarkKind): string {
  return SPEC[kind].label.toLowerCase();
}

export interface ScoreMarkProps {
  kind: MarkKind | 'uncounted';
  size?: MarkSize;
  /**
   * Accessible name. Defaults to the hole meaning ("Birdie"). Where the mark sits on a round
   * pass its own meaning ("Better than your usual") and, ideally, the number it wraps.
   */
  label?: string;
  /** The parent already describes it (a strip of 18 marks reads as one sentence). */
  decorative?: boolean;
  className?: string;
  /** The digits inside the mark. Ignored at `xs`. */
  children?: ReactNode;
}

export function ScoreMark({
  kind,
  size = 'sm',
  label,
  decorative = false,
  className,
  children,
}: ScoreMarkProps) {
  const spec = SPEC[kind];
  const a11y = decorative
    ? ({ 'aria-hidden': true } as const)
    : ({ role: 'img', 'aria-label': label ?? spec.label } as const);
  const digits = size === 'xs' ? null : children;

  const box = cn(
    'inline-flex shrink-0 items-center justify-center font-fw-mono font-semibold leading-none tabular-nums',
    BOX[size],
    spec.ink,
  );

  if (spec.shape === 'none') {
    return (
      <span data-mark={kind} {...a11y} className={cn(box, className)}>
        {size === 'xs' ? (
          // A level hole in a strip: a quiet dot, so the row still counts to 18.
          <span aria-hidden="true" className="block h-1 w-1 rounded-full bg-border-strong" />
        ) : (
          digits
        )}
      </span>
    );
  }

  if (spec.shape === 'dashed') {
    return (
      <span
        data-mark={kind}
        {...a11y}
        className={cn(box, 'rounded-none border border-dashed border-border-control', className)}
      >
        {digits}
      </span>
    );
  }

  const round = spec.shape === 'circle' || spec.shape === 'double-circle';
  const radius = round ? 'rounded-full' : 'rounded-none';

  if (spec.shape === 'circle' || spec.shape === 'square') {
    return (
      <span
        data-mark={kind}
        {...a11y}
        className={cn(box, radius, SINGLE_LINE[size], 'border-current', className)}
      >
        {digits}
      </span>
    );
  }

  // double-circle / double-square: an outer line, a gap, an inner line.
  return (
    <span
      data-mark={kind}
      {...a11y}
      className={cn(box, radius, DOUBLE_LINE[size], DOUBLE_GAP[size], 'border-current', className)}
    >
      <span
        className={cn(
          'flex h-full w-full items-center justify-center',
          radius,
          DOUBLE_LINE[size],
          'border-current',
        )}
      >
        {digits}
      </span>
    </span>
  );
}

/* ── A round as 18 holes ─────────────────────────────────────────────────── */

const KIND_WORD: Record<MarkKind, { one: string; many: string }> = {
  eagle: { one: 'eagle or better', many: 'eagles or better' },
  birdie: { one: 'birdie', many: 'birdies' },
  par: { one: 'par', many: 'pars' },
  bogey: { one: 'bogey', many: 'bogeys' },
  double: { one: 'double bogey or worse', many: 'double bogeys or worse' },
};

/** "Birdies on holes 4, 9; bogeys on holes 5, 14." Pars are not listed. */
export function describeHoles(holes: readonly FixtureHole[]): string {
  const order: MarkKind[] = ['eagle', 'birdie', 'bogey', 'double'];
  const parts: string[] = [];
  for (const kind of order) {
    const on = holes.filter((h) => bucketForHole(h.score, h.par) === kind).map((h) => h.hole);
    if (on.length === 0) continue;
    const word = on.length === 1 ? KIND_WORD[kind].one : KIND_WORD[kind].many;
    parts.push(`${word} on hole${on.length === 1 ? '' : 's'} ${on.join(', ')}`);
  }
  return parts.length > 0 ? `${parts.join('; ')}.` : 'Par on every hole.';
}

/**
 * The round as a row of marks, one per hole, front nine and back nine set apart. It reads as
 * one sentence to a screen reader instead of eighteen fragments.
 */
export function HoleMarkStrip({
  holes,
  className,
}: {
  holes: readonly FixtureHole[];
  className?: string;
}) {
  return (
    <span
      role="img"
      aria-label={describeHoles(holes)}
      className={cn('inline-flex items-center gap-0.5', className)}
    >
      {holes.map((h) => (
        <span key={h.hole} className={cn('inline-flex', h.hole === 10 && 'ml-1.5')}>
          <ScoreMark kind={bucketForHole(h.score, h.par)} size="xs" decorative />
        </span>
      ))}
    </span>
  );
}
