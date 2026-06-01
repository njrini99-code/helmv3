'use client';

/**
 * ============================================================================
 * Fairway · Rounds · Tracking — FairwayScorecardHeader
 * ----------------------------------------------------------------------------
 * PRESENTATION-ONLY re-skin of the legacy <ScorecardHeader>. Logic is copied
 * VERBATIM from src/components/golf/ShotTrackingComprehensive.tsx — only the
 * JSX + Fairway tokens change.
 *
 * RISKY BEHAVIOR PRESERVED: this component measures itself and publishes the
 * `--scorecard-height` CSS var (via getBoundingClientRect + resize listener),
 * EXACTLY like the legacy. The ShotPills strip + the desktop sidebar's sticky
 * offsets read this var; if it is not published, those stick to the wrong top.
 *
 * On-dark "cockpit" band (bg-nav-bg + .on-dark) carries the scorecard strip and
 * the desktop exit header. Autosave status renders as Fairway dots / StatusPill.
 * Exit = Button variant="danger".
 * ========================================================================== */

import { memo, useRef, useCallback, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/fairway/controls/button';
import type { RoundHole } from '@/lib/types/golf';

type Hole = RoundHole;

interface FairwayScorecardHeaderProps {
  holes: Hole[];
  currentHoleIndex: number;
  currentHoleNumber: number;
  autoSaveStatus: 'idle' | 'saving' | 'saved' | 'error';
  onExit?: () => void;
  onNavigateToHole?: (holeIndex: number) => void;
}

// Verbatim helpers from the legacy file.
function scrollElementIntoView(element: Element | null) {
  element?.scrollIntoView({
    behavior: 'auto',
    block: 'nearest',
    inline: 'center',
  });
}

function scrollHoleIntoView(holeNumber: number) {
  scrollElementIntoView(document.getElementById(`fw-hole-${holeNumber}`));
}

/** Three pulsing dots for the saving state (Fairway tokens). */
function SavingDots() {
  return (
    <span className="flex items-center gap-0.5" aria-hidden="true">
      <span className="h-1 w-1 rounded-full bg-current skeleton-shimmer" style={{ animationDelay: '0ms' }} />
      <span className="h-1 w-1 rounded-full bg-current skeleton-shimmer" style={{ animationDelay: '150ms' }} />
      <span className="h-1 w-1 rounded-full bg-current skeleton-shimmer" style={{ animationDelay: '300ms' }} />
    </span>
  );
}

interface FairwayDesktopExitHeaderProps {
  currentHoleNumber: number;
  totalHoles: number;
  shotCount: number;
  autoSaveStatus: 'idle' | 'saving' | 'saved' | 'error';
  showAutoSaveStatus: boolean;
  onExit: () => void;
}

/**
 * The desktop-only "Round in Progress" exit band (legacy lines ~611-665).
 * On-dark Fairway band; exit = Button variant="danger".
 */
export function FairwayDesktopExitHeader({
  currentHoleNumber,
  totalHoles,
  shotCount,
  autoSaveStatus,
  showAutoSaveStatus,
  onExit,
}: FairwayDesktopExitHeaderProps) {
  return (
    <div className="on-dark hidden items-center justify-between border-b border-white/10 bg-nav-bg px-6 py-3 text-nav-text lg:flex">
      <div className="flex items-center gap-4">
        <span className="font-fw-sans text-sm font-medium text-nav-text-dim">Round in Progress</span>
        <span className="font-fw-sans text-xs text-white/45">
          Hole {currentHoleNumber} of {totalHoles} • {shotCount + 1} shot{shotCount !== 0 ? 's' : ''}
        </span>
        {showAutoSaveStatus && autoSaveStatus !== 'idle' && (
          <span
            className={cn(
              'flex items-center gap-2 rounded-fw-sm px-2 py-1 font-fw-sans text-xs font-medium transition-colors',
              autoSaveStatus === 'saving' && 'bg-fw-warning/15 text-fw-warning',
              autoSaveStatus === 'saved' && 'bg-accent-500/15 text-accent-300',
              autoSaveStatus === 'error' && 'bg-fw-danger/15 text-fw-danger',
            )}
          >
            {autoSaveStatus === 'saving' && (
              <>
                <SavingDots />
                Saving...
              </>
            )}
            {autoSaveStatus === 'saved' && (
              <>
                <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Saved
              </>
            )}
            {autoSaveStatus === 'error' && (
              <>
                <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                Save failed
              </>
            )}
          </span>
        )}
      </div>
      <Button
        variant="danger"
        onClick={onExit}
        leftIcon={
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        }
      >
        Save &amp; Exit
      </Button>
    </div>
  );
}

export const FairwayScorecardHeader = memo(function FairwayScorecardHeader({
  holes,
  currentHoleIndex,
  currentHoleNumber,
  autoSaveStatus,
  onExit,
  onNavigateToHole,
}: FairwayScorecardHeaderProps) {
  const headerRef = useRef<HTMLDivElement>(null);

  // VERBATIM logic — publish the --scorecard-height CSS var so sticky offsets work.
  const updateCSSProperty = useCallback(() => {
    if (headerRef.current) {
      const height = headerRef.current.getBoundingClientRect().height;
      document.documentElement.style.setProperty('--scorecard-height', `${height}px`);
    }
  }, []);

  useEffect(() => {
    updateCSSProperty();
    window.addEventListener('resize', updateCSSProperty);
    return () => window.removeEventListener('resize', updateCSSProperty);
  }, [updateCSSProperty]);

  const is9Hole = holes.length <= 9;
  const front9 = holes.slice(0, 9);
  const back9 = is9Hole ? [] : holes.slice(9);
  const front9Score = front9.reduce((sum, hole) => sum + (hole.score || 0), 0);
  const back9Score = back9.reduce((sum, hole) => sum + (hole.score || 0), 0);
  const front9HasScores = front9.some((hole) => hole.score !== null);
  const back9HasScores = back9.some((hole) => hole.score !== null);
  const totalPar = holes.reduce((sum, hole) => sum + hole.par, 0);

  const renderHoleButton = (hole: Hole, holeIndex: number) => {
    const isCurrent = holeIndex === currentHoleIndex;
    const hasScore = hole.score !== null;
    const scoreToPar = hasScore ? (hole.score || 0) - hole.par : 0;
    const canNavigate = onNavigateToHole && (hasScore || holeIndex < currentHoleIndex);

    // Score-to-par color ramp → Fairway on-dark tones. Same thresholds as legacy.
    const scoreColor = (() => {
      if (isCurrent) return 'text-nav-text';
      if (!hasScore) return 'text-white/35';
      if (scoreToPar <= -2) return 'text-accent-300';
      if (scoreToPar === -1) return 'text-accent-400';
      if (scoreToPar === 0) return 'text-nav-text';
      if (scoreToPar === 1) return 'text-fw-warning';
      return 'text-fw-danger';
    })();

    return (
      <Button variant="ghost"
        type="button"
        key={hole.number}
        id={`fw-hole-${hole.number}`}
        aria-label={`Hole ${hole.number}, Par ${hole.par}, ${hole.yardage} yards${hasScore ? `, Score: ${hole.score}` : ', not yet played'}${isCurrent ? ' (current hole)' : ''}${canNavigate && !isCurrent ? ', click to edit' : ''}`}
        onClick={() => canNavigate && onNavigateToHole?.(holeIndex)}
        disabled={!canNavigate}
        className={cn(
          'min-w-[75px] rounded-none border-r border-white/10 px-2 py-3 text-center transition-colors [&>span]:block [&>span]:w-full',
          'outline-none focus-visible:ring-2 focus-visible:ring-accent-400 focus-visible:ring-inset',
          isCurrent
            ? 'bg-accent-600'
            : hasScore
              ? canNavigate
                ? 'cursor-pointer bg-nav-surface/40 hover:bg-nav-surface/70'
                : 'cursor-default bg-nav-surface/40'
              : canNavigate
                ? 'cursor-pointer hover:bg-nav-surface/70'
                : 'cursor-default',
        )}
      >
        <div className={cn('font-fw-sans text-xs font-medium', isCurrent ? 'text-nav-text' : 'text-nav-text-dim')}>
          Hole {hole.number}
        </div>
        <div className={cn('font-fw-sans text-xs', isCurrent ? 'text-white/80' : 'text-white/45')}>Par {hole.par}</div>
        <div className={cn('font-fw-sans text-xs', isCurrent ? 'text-white/70' : 'text-white/35')}>{hole.yardage} yds</div>
        <div className={cn('mt-1 font-fw-display text-body-lg font-medium tabular-nums', scoreColor)}>
          {hasScore ? hole.score : '-'}
        </div>
        {hasScore && !isCurrent && (
          <div className="mt-0.5 text-eyebrow text-accent-400">
            <svg className="mx-auto h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </div>
        )}
        {canNavigate && !isCurrent && !hasScore && (
          <div className="mt-0.5 font-fw-sans text-xs text-white/45">✎ Edit</div>
        )}
      </Button>
    );
  };

  return (
    <div ref={headerRef} className="on-dark sticky top-0 z-50 bg-nav-bg text-nav-text">
      {/* Mobile control row */}
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-2 lg:hidden">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => scrollHoleIntoView(Math.max(1, currentHoleNumber - 1))}
            disabled={currentHoleIndex === 0}
            className="text-nav-text hover:bg-nav-surface hover:text-nav-text"
          >
            ← Prev
          </Button>
          {onExit && (
            <Button variant="danger" size="sm" onClick={onExit}>
              Exit
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {autoSaveStatus !== 'idle' && (
            <span
              className={cn(
                'flex items-center gap-1 rounded-fw-sm px-1.5 py-0.5 font-fw-sans text-xs font-medium transition-colors',
                autoSaveStatus === 'saving' && 'bg-fw-warning/15 text-fw-warning',
                autoSaveStatus === 'saved' && 'bg-accent-500/15 text-accent-300',
                autoSaveStatus === 'error' && 'bg-fw-danger/15 text-fw-danger',
              )}
            >
              {autoSaveStatus === 'saving' && <SavingDots />}
              {autoSaveStatus === 'saved' && (
                <svg className="h-2.5 w-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              )}
              {autoSaveStatus === 'error' && '!'}
            </span>
          )}
          <span className="font-fw-sans text-eyebrow font-medium uppercase tracking-wide text-nav-accent">
            Hole {currentHoleNumber} of {holes.length}
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => scrollHoleIntoView(Math.min(holes.length, currentHoleNumber + 1))}
          disabled={currentHoleIndex === holes.length - 1}
          className="text-nav-text hover:bg-nav-surface hover:text-nav-text"
        >
          Next →
        </Button>
      </div>

      <div
        className="overflow-x-auto overscroll-x-contain touch-pan-x"
        style={{
          WebkitOverflowScrolling: 'touch',
          maskImage: 'linear-gradient(to right, transparent 0, black 16px, black calc(100% - 16px), transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to right, transparent 0, black 16px, black calc(100% - 16px), transparent 100%)',
        }}
      >
        <div className="inline-flex min-w-full">
          {front9.map((hole, index) => renderHoleButton(hole, index))}
          <div className="min-w-[75px] border-r-2 border-white/20 bg-nav-surface/60 px-2 py-3 text-center">
            <div className="font-fw-sans text-xs font-medium text-fw-warning">{is9Hole ? 'TOTAL' : 'OUT'}</div>
            <div className="font-fw-sans text-xs text-white/45">Par {front9.reduce((sum, hole) => sum + hole.par, 0)}</div>
            <div className="font-fw-sans text-xs text-white/35">{front9.reduce((sum, hole) => sum + hole.yardage, 0)}</div>
            <div className="mt-1 font-fw-display text-body-lg font-medium tabular-nums text-fw-warning">{front9HasScores ? front9Score : '-'}</div>
          </div>
          {!is9Hole && back9.map((hole, index) => renderHoleButton(hole, index + 9))}
          {!is9Hole && (
            <div className="min-w-[75px] border-r-2 border-white/20 bg-nav-surface/60 px-2 py-3 text-center">
              <div className="font-fw-sans text-xs font-medium text-fw-warning">IN</div>
              <div className="font-fw-sans text-xs text-white/45">Par {back9.reduce((sum, hole) => sum + hole.par, 0)}</div>
              <div className="font-fw-sans text-xs text-white/35">{back9.reduce((sum, hole) => sum + hole.yardage, 0)}</div>
              <div className="mt-1 font-fw-display text-body-lg font-medium tabular-nums text-fw-warning">{back9HasScores ? back9Score : '-'}</div>
            </div>
          )}
          {!is9Hole && (
            <div className="min-w-[85px] bg-nav-surface/80 px-2 py-3 text-center">
              <div className="font-fw-sans text-xs font-medium text-nav-text">TOTAL</div>
              <div className="font-fw-sans text-xs text-white/45">Par {totalPar}</div>
              <div className="font-fw-sans text-xs text-white/35">{holes.reduce((sum, hole) => sum + hole.yardage, 0)}</div>
              <div className="mt-1 font-fw-display text-body-lg font-medium tabular-nums text-nav-text">{(front9HasScores || back9HasScores) ? front9Score + back9Score : '-'}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
