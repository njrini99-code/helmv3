'use client';

/**
 * ============================================================================
 * Fairway · Rounds · Tracking — FairwayCompletedHole
 * ----------------------------------------------------------------------------
 * PRESENTATION-ONLY re-skin of the legacy completed-hole shot review (legacy
 * lines ~769-869). The per-shot label derivation (formatResult, distLabel,
 * afterLabel) is copied VERBATIM. Tapping a row calls onEditShot(shot) — the
 * SAME handler the legacy wires to handleEditShot. Result badges → StatusPill.
 * ========================================================================== */

import { cn } from '@/lib/utils';
import { Button } from '@/components/fairway/controls/button';
import { StatusPill } from '@/components/fairway/controls/status-pill';
import type { FwStatusTone } from '@/components/fairway/controls';
import type { ShotRecord, RoundHole } from '@/lib/types/golf';

interface FairwayCompletedHoleProps {
  shotHistory: ShotRecord[];
  currentHole: RoundHole;
  showBackToCurrentHole: boolean;
  nextUnplayedIdx: number;
  onEditShot: (shot: ShotRecord) => void;
  onNavigateToHole: (targetIndex: number) => void;
}

/** Result → StatusPill tone (legacy badge color map, mapped to Fairway tones). */
function resultTone(result: ShotRecord['result']): FwStatusTone {
  if (result === 'hole') return 'accent';
  if (result === 'green') return 'success';
  if (result === 'fairway') return 'success';
  if (result === 'penalty') return 'danger';
  return 'neutral';
}

export function FairwayCompletedHole({
  shotHistory,
  currentHole,
  showBackToCurrentHole,
  nextUnplayedIdx,
  onEditShot,
  onNavigateToHole,
}: FairwayCompletedHoleProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="font-fw-sans text-body-sm font-medium uppercase tracking-wider text-text-secondary">Shot Review</p>
        <StatusPill tone="accent" dot={false}>
          Score: {shotHistory.length} ({shotHistory.length - currentHole.par > 0 ? '+' : ''}
          {shotHistory.length - currentHole.par})
        </StatusPill>
      </div>
      <p className="font-fw-sans text-xs text-text-tertiary">Tap any shot to edit</p>
      <div className="space-y-2">
        {shotHistory.map((shot) => {
          // VERBATIM label derivation from the legacy file.
          const formatResult = (r: string) => r.charAt(0).toUpperCase() + r.slice(1);
          const distLabel = shot.distanceUnitBefore === 'feet'
            ? `${shot.distanceToHoleBefore}ft`
            : `${shot.distanceToHoleBefore}y`;
          const afterLabel = shot.result === 'hole'
            ? 'Holed'
            : shot.distanceUnitAfter === 'feet'
              ? `${shot.distanceToHoleAfter}ft left`
              : `${shot.distanceToHoleAfter}y left`;
          return (
            <Button
              key={shot.shotNumber}
              type="button"
              variant="ghost"
              onClick={() => onEditShot(shot)}
              className={cn(
                'block h-auto min-h-0 w-full rounded-fw-md border-0 p-3 text-left font-normal transition-colors',
                'outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
                shot.isPenalty
                  ? 'bg-fw-danger-bg ring-1 ring-fw-danger/40 hover:bg-fw-danger/10'
                  : 'bg-surface ring-1 ring-border-subtle hover:bg-surface-tint hover:ring-border-strong',
              )}
            >
              <span className="flex w-full items-center gap-3">
                {/* Shot number */}
                <span
                  className={cn(
                    'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-fw-sm font-fw-sans text-body-sm font-medium tabular-nums',
                    shot.isPenalty
                      ? 'bg-fw-danger/15 text-fw-danger'
                      : shot.result === 'hole'
                        ? 'bg-accent-50 text-accent-700'
                        : 'bg-surface-sunken text-text-secondary',
                  )}
                >
                  {shot.isPenalty ? 'P' : shot.shotNumber}
                </span>

                {/* Shot info */}
                <span className="block min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate font-fw-sans text-sm font-medium capitalize text-text-primary">
                      {shot.isPenalty ? `Penalty (${shot.penaltyType || 'unknown'})` : shot.shotType.replace('_', ' ')}
                    </span>
                    {!shot.isPenalty && (
                      <span className="font-fw-sans text-xs text-text-tertiary">
                        {shot.clubType === 'driver' ? 'Driver' : shot.clubType === 'putter' ? 'Putter' : ''}
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block overflow-hidden text-ellipsis whitespace-nowrap font-fw-sans text-xs text-text-tertiary">
                    {shot.isPenalty ? `+1 stroke` : `${distLabel} → ${afterLabel}`}
                    {shot.missDirection && !shot.isPenalty && (
                      <span className="ml-1.5 text-text-tertiary">• Miss {shot.missDirection}</span>
                    )}
                  </span>
                </span>

                {/* Shot distance + result badge */}
                <span className="flex flex-shrink-0 items-center gap-2">
                  {!shot.isPenalty && (
                    <span className="font-fw-mono text-body-sm font-medium tabular-nums text-accent-700">{shot.shotDistance}y</span>
                  )}
                  <StatusPill tone={resultTone(shot.result)} size="sm" dot={false}>
                    {formatResult(shot.result)}
                  </StatusPill>
                  {/* Edit indicator */}
                  <svg className="h-4 w-4 text-text-tertiary" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </span>
              </span>
            </Button>
          );
        })}
      </div>

      {/* Back to current hole button */}
      {showBackToCurrentHole && (
        <Button variant="secondary" fullWidth onClick={() => onNavigateToHole(nextUnplayedIdx)}>
          Back to Current Hole →
        </Button>
      )}
    </div>
  );
}
