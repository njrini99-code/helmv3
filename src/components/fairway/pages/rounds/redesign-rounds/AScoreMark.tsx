// REDESIGN-SCRATCH (docs/redesign/rounds): Direction A, season scorecard.
//
// The scorecard marks, drawn with CSS borders so the shape carries the meaning and
// colour only reinforces it: a circle under par, a square 1 to 4 over, a double square
// 5 or more over, nothing at level par. A not-counted round gets a dashed, hollow box.
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';
import type { MarkKind } from './AModel';

export type ScoreMarkSize = 'xs' | 'sm' | 'lg';

const BOX: Record<ScoreMarkSize, string> = {
  xs: 'h-4 w-4',
  sm: 'h-8 w-8 text-body-sm font-semibold',
  lg: 'h-10 w-10 text-h3',
};

// Single marks get a heavier stroke; the double square is two 1px lines with a gap.
const SINGLE_STROKE: Record<ScoreMarkSize, string> = { xs: 'border', sm: 'border-2', lg: 'border-2' };
const DOUBLE_GAP: Record<ScoreMarkSize, string> = { xs: 'p-px', sm: 'p-0.5', lg: 'p-0.5' };

export interface ScoreMarkProps {
  kind: MarkKind;
  size?: ScoreMarkSize;
  /** Not counted: a dashed, muted box instead of a graded mark. */
  hollow?: boolean;
  className?: string;
  /** The score. Omit it for a legend glyph. */
  children?: ReactNode;
}

export function ScoreMark({ kind, size = 'lg', hollow = false, className, children }: ScoreMarkProps) {
  const base = cn(
    'inline-flex shrink-0 items-center justify-center font-fw-mono leading-none tabular-nums',
    BOX[size],
  );

  if (hollow) {
    return (
      <span
        data-mark="hollow"
        className={cn(base, 'border border-dashed border-border-control text-text-tertiary', className)}
      >
        {children}
      </span>
    );
  }

  if (kind === 'double-square') {
    return (
      <span
        data-mark="double-square"
        className={cn(base, 'border border-current text-text-primary', DOUBLE_GAP[size], className)}
      >
        <span className="inline-flex h-full w-full items-center justify-center border border-current">
          {children}
        </span>
      </span>
    );
  }

  if (kind === 'square') {
    return (
      <span
        data-mark="square"
        className={cn(base, SINGLE_STROKE[size], 'border-current text-text-primary', className)}
      >
        {children}
      </span>
    );
  }

  if (kind === 'circle') {
    return (
      <span
        data-mark="circle"
        className={cn(base, SINGLE_STROKE[size], 'rounded-full border-current text-accent-ink', className)}
      >
        {children}
      </span>
    );
  }

  // Level par or unknown: no mark, but the same box so columns keep their rhythm.
  return (
    <span
      data-mark="none"
      className={cn(base, SINGLE_STROKE[size], 'border-transparent text-text-primary', className)}
    >
      {children}
    </span>
  );
}
