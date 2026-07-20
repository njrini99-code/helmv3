'use client';

/**
 * ============================================================================
 * RankCell — a small ramp-shaded rank chip (mockup §.rk, MatrixBoard rows)
 * ----------------------------------------------------------------------------
 * Turns a `rank` of `of` into the same 0–4 band ramp `RampMatrix` uses (via
 * `rampBandForRank`), reusing `RAMP_CLASSES` from RampMatrix.tsx so a band-4
 * cell always renders the identical class whether it comes from a value ramp
 * or a rank ramp.
 * ========================================================================== */

import { rampBandForRank } from './logic';
import { RAMP_CLASSES } from './RampMatrix';
import type { RankCellProps } from './types';
import { cn } from '@/lib/utils';
import { TABULAR_NUMS } from '../charts/theme';

export function RankCell({ rank, of }: RankCellProps) {
  const band = rampBandForRank(rank, of);
  return (
    <span
      style={TABULAR_NUMS}
      className={cn(
        'mx-auto grid h-[26px] w-[34px] place-items-center rounded-fw-sm font-fw-mono text-caption font-normal tabular-nums',
        RAMP_CLASSES[band],
      )}
      aria-label={`Rank ${rank} of ${of}`}
    >
      {rank}
    </span>
  );
}
