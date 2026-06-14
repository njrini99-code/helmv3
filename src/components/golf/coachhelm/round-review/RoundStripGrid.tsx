'use client';

/**
 * RoundStripGrid — at-a-glance 18-hole summary band.
 *
 * Lives at the top of the round review (above the detailed card grid)
 * as a magazine-cover-style overview. Each hole is a tiny vertical
 * strip showing the player's shot path; clicking one scrolls the
 * detailed card into view.
 *
 * Pure presentation: shots are fetched once at the parent (the round
 * review) and passed in already grouped — this component just lays
 * them out.
 */

import { useMemo } from 'react';
import { HoleShotPath } from '@/components/golf/coachhelm/v3/HoleShotPath';
import type { ShotInput } from '@/components/golf/coachhelm/v3/HoleShotPath/types';
import { scoreToParLabel } from '@/components/golf/coachhelm/v3/HoleShotPath/geometry';

interface HoleRow {
  hole_number: number;
  par: number | null;
  yardage: number | null;
  score: number | null;
}

interface Props {
  holes: HoleRow[];
  /** Map of hole_number → shots for that hole. */
  shotsByHole: Map<number, ShotInput[]>;
  /** Optional anchor-id prefix for the per-hole detailed cards so
   *  clicking a strip can scroll to its detail. */
  detailAnchorPrefix?: string;
}

export function RoundStripGrid({ holes, shotsByHole, detailAnchorPrefix }: Props) {
  const front = useMemo(() => holes.filter((h) => h.hole_number <= 9), [holes]);
  const back = useMemo(() => holes.filter((h) => h.hole_number > 9), [holes]);

  const renderNine = (nine: HoleRow[], label: string) => (
    <div>
      <div className="text-eyebrow uppercase tracking-[0.18em] text-warm-500 mb-2 px-1">
        {label}
      </div>
      <div className="flex gap-1.5 md:gap-2 overflow-x-auto snap-x snap-mandatory md:snap-none -mx-1 px-1 md:mx-0 md:px-0">
        {nine.map((h) => {
          const par = h.par === 3 || h.par === 4 || h.par === 5 ? h.par : undefined;
          const label = scoreToParLabel(h.score, h.par ?? undefined);
          const isBirdieOrBetter =
            label !== null &&
            (label === 'Birdie' || label === 'Eagle' || label === 'Albatross');
          const isBogeyOrWorse =
            label !== null &&
            label !== 'E' &&
            !isBirdieOrBetter &&
            !label.startsWith('-');
          const scoreColor = isBirdieOrBetter
            ? 'text-primary-600'
            : isBogeyOrWorse
              ? 'text-rose-600'
              : 'text-warm-700';

          const anchorHref = detailAnchorPrefix
            ? `#${detailAnchorPrefix}-${h.hole_number}`
            : undefined;
          const handleClick = () => {
            if (!anchorHref) return;
            const el = document.getElementById(`${detailAnchorPrefix}-${h.hole_number}`);
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          };

          return (
            <div key={h.hole_number} className="flex flex-col items-center gap-1 shrink-0 snap-start">
              <span className="text-eyebrow tabular-nums text-warm-400">
                {h.hole_number}
              </span>
              <HoleShotPath
                hole_number={h.hole_number}
                par={par}
                yardage={h.yardage}
                score={h.score}
                shots={shotsByHole.get(h.hole_number) ?? []}
                size="strip"
                onClick={anchorHref ? handleClick : undefined}
              />
              <span className={`text-eyebrow font-medium tabular-nums leading-none ${scoreColor}`}>
                {label ?? '—'}
              </span>
            </div>
          );
        })}
        {/* Nine total */}
        <div className="ml-1 flex flex-col items-center justify-end gap-1 self-stretch shrink-0 snap-start">
          <span className="text-eyebrow uppercase tracking-[0.14em] text-warm-400">
            Tot
          </span>
          <div className="h-28 md:h-32 w-7 md:w-8 flex items-center justify-center rounded-2xl bg-warm-100/70 ring-1 ring-warm-200/60">
            <span className="text-sm font-medium tabular-nums text-warm-900">
              {nine.reduce((sum, h) => sum + (h.score ?? 0), 0) || '—'}
            </span>
          </div>
          <span className="text-eyebrow text-warm-400">&nbsp;</span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="surface-matte rounded-2xl p-4 md:p-6">
      <div className="flex flex-col gap-5">
        {front.length > 0 && renderNine(front, 'Front nine')}
        {back.length > 0 && renderNine(back, 'Back nine')}
      </div>
    </div>
  );
}
