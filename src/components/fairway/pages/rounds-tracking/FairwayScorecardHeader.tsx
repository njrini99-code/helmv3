'use client';

/**
 * ============================================================================
 * Fairway · Rounds · Tracking — FairwayScorecardHeader
 * ----------------------------------------------------------------------------
 * PRESENTATION-ONLY re-skin of the legacy <ScorecardHeader>. Logic is copied
 * VERBATIM from src/components/golf/ShotTrackingComprehensive.tsx — only the
 * JSX + Fairway tokens change.
 *
 * REDESIGN (light): the old near-black `on-dark` cockpit band fought the light
 * Fairway body and read as a clipped, cut-off strip. It is now a cohesive LIGHT
 * scorecard chrome — a sticky warm-cream `bg-elevated` bar with a hairline
 * bottom border, score-to-par tone using the Fairway success/warning/danger
 * tokens, and the current hole marked by an accent-tinted column (accent text +
 * an accent top rule), NOT a dark fill. Calm, legible, full-bleed (not a clipped
 * dark band), readable on the cream canvas.
 *
 * RISKY BEHAVIOR PRESERVED: this component measures itself and publishes the
 * `--scorecard-height` CSS var (via getBoundingClientRect + resize listener),
 * EXACTLY like the legacy. The ShotPills strip + the desktop sidebar's sticky
 * offsets read this var; if it is not published, those stick to the wrong top.
 * The `fw-hole-N` ids, scrollHoleIntoView, navigation gating, autosave-status
 * logic and is9Hole/totals math are all untouched.
 * ========================================================================== */

import { memo, useRef, useCallback, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/fairway/controls/button';
import { useDistanceUnits } from '@/hooks/golf/use-distance-units';
import { yardsToDisplay } from '@/lib/golf/distance-units';
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
      <span className="h-1 w-1 rounded-full bg-current motion-safe:animate-bounce" style={{ animationDelay: '0ms' }} />
      <span className="h-1 w-1 rounded-full bg-current motion-safe:animate-bounce" style={{ animationDelay: '150ms' }} />
      <span className="h-1 w-1 rounded-full bg-current motion-safe:animate-bounce" style={{ animationDelay: '300ms' }} />
    </span>
  );
}

/** Autosave status chip — shared by the mobile row + desktop band. Light tokens. */
function AutoSaveChip({
  status,
  compact = false,
}: {
  status: 'idle' | 'saving' | 'saved' | 'error';
  compact?: boolean;
}) {
  if (status === 'idle') return null;
  return (
    <span
      role="status"
      aria-live="polite"
      aria-label={
        status === 'saving' ? 'Saving round' : status === 'saved' ? 'Round saved' : 'Save failed'
      }
      className={cn(
        'flex items-center gap-1.5 rounded-fw-sm px-2 py-1 font-fw-sans text-caption font-medium transition-colors',
        status === 'saving' && 'bg-fw-warning-bg text-fw-warning-ink',
        status === 'saved' && 'bg-accent-50 text-accent-700',
        status === 'error' && 'bg-fw-danger-bg text-fw-danger-ink',
      )}
    >
      {status === 'saving' && (
        <>
          <SavingDots />
          {!compact && 'Saving…'}
        </>
      )}
      {status === 'saved' && (
        <>
          <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          {!compact && 'Saved'}
        </>
      )}
      {status === 'error' && (
        <>
          <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          {!compact && 'Save failed'}
        </>
      )}
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
 * The desktop-only "Round in progress" exit band. LIGHT Fairway chrome — a warm
 * surface-tint strip with a hairline bottom border (was an on-dark band).
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
    <div className="hidden items-center justify-between border-b border-border-subtle bg-surface-tint px-6 py-3 lg:flex">
      <div className="flex items-center gap-4">
        <span className="inline-flex items-center gap-2 font-fw-sans text-body-sm font-semibold text-text-primary">
          <span className="h-1.5 w-1.5 rounded-full bg-accent-500" aria-hidden="true" />
          Round in progress
        </span>
        <span className="font-fw-sans text-caption text-text-tertiary">
          Hole {currentHoleNumber} of {totalHoles} · {shotCount + 1} shot{shotCount !== 0 ? 's' : ''}
        </span>
        {showAutoSaveStatus && <AutoSaveChip status={autoSaveStatus} />}
      </div>
      <Button
        variant="danger"
        size="sm"
        onClick={onExit}
        leftIcon={
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        }
      >
        Save &amp; exit
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
  // Distance-unit preference — the legacy ScorecardHeader reads this
  // independently too, so the scorecard's yardage column honors the
  // player's meters preference even though the tracking parent never
  // prop-drills it here.
  const { distancePref } = useDistanceUnits();
  const isMeters = distancePref === 'meters';

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

    // Score-to-par color ramp → Fairway LIGHT tones. Same thresholds as legacy.
    const scoreColor = (() => {
      if (isCurrent) return 'text-accent-700';
      if (!hasScore) return 'text-text-tertiary/50';
      if (scoreToPar <= -1) return 'text-fw-success-ink';
      if (scoreToPar === 0) return 'text-text-primary';
      if (scoreToPar === 1) return 'text-fw-warning-ink';
      return 'text-fw-danger-ink';
    })();

    return (
      <Button variant="ghost"
        type="button"
        key={hole.number}
        id={`fw-hole-${hole.number}`}
        aria-label={`Hole ${hole.number}, Par ${hole.par}, ${isMeters ? yardsToDisplay(hole.yardage, 'meters') : hole.yardage} ${isMeters ? 'meters' : 'yards'}${hasScore ? `, Score: ${hole.score}` : ', not yet played'}${isCurrent ? ' (current hole)' : ''}${canNavigate && !isCurrent ? ', click to edit' : ''}`}
        onClick={() => canNavigate && onNavigateToHole?.(holeIndex)}
        disabled={!canNavigate}
        className={cn(
          'relative min-w-[72px] rounded-none border-r border-border-subtle px-2 py-2.5 text-center transition-colors [&>div]:block [&>div]:w-full',
          'outline-none focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-inset',
          isCurrent
            ? 'bg-accent-50'
            : hasScore
              ? canNavigate
                ? 'cursor-pointer bg-surface-sunken/60 hover:bg-surface-tint'
                : 'cursor-default bg-surface-sunken/60'
              : canNavigate
                ? 'cursor-pointer hover:bg-surface-tint'
                : 'cursor-default',
        )}
      >
        {/* accent top rule marks the current hole (not a dark fill) */}
        {isCurrent && <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-accent-500" />}
        <div className={cn('font-fw-sans text-microlabel font-semibold', isCurrent ? 'text-accent-700' : 'text-text-secondary')}>
          {hole.number}
        </div>
        <div className="truncate font-fw-sans text-microbadge uppercase tracking-wide text-text-tertiary">Par {hole.par}</div>
        <div className="truncate font-fw-sans text-microbadge text-text-tertiary/80">
          {isMeters ? yardsToDisplay(hole.yardage, 'meters') : hole.yardage} {isMeters ? 'm' : 'yds'}
        </div>
        <div className={cn('mt-1 font-fw-display text-body-lg font-semibold tabular-nums', scoreColor)}>
          {hasScore ? hole.score : '–'}
        </div>
        {hasScore && !isCurrent && (
          <div className="mt-0.5 text-eyebrow text-fw-success-ink">
            <svg className="mx-auto h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </div>
        )}
        {canNavigate && !isCurrent && !hasScore && (
          <div className="mt-0.5 truncate font-fw-sans text-microbadge text-text-tertiary">Edit</div>
        )}
      </Button>
    );
  };

  /** A nine / total summary column (Out / In / Total). Light tinted band. */
  const renderTotalColumn = (
    label: string,
    par: number,
    yards: number,
    score: number,
    hasScores: boolean,
    emphasis: boolean,
  ) => (
    <div
      className={cn(
        'min-w-[78px] border-r border-border-strong px-2 py-2.5 text-center',
        emphasis ? 'bg-surface-tint' : 'bg-surface-sunken',
      )}
    >
      <div className="truncate font-fw-sans text-microlabel font-semibold uppercase tracking-wide text-text-secondary">{label}</div>
      <div className="font-fw-sans text-microbadge uppercase tracking-wide text-text-tertiary">Par {par}</div>
      <div className="font-fw-sans text-microbadge text-text-tertiary/80">{isMeters ? yardsToDisplay(yards, 'meters') : yards}</div>
      <div className="mt-1 font-fw-display text-body-lg font-semibold tabular-nums text-text-primary">{hasScores ? score : '–'}</div>
    </div>
  );

  return (
    <div ref={headerRef} className="sticky top-0 z-50 bg-elevated text-text-primary shadow-flat">
      {/* Mobile control row */}
      <div className="flex items-center justify-between gap-2 border-b border-border-subtle px-3 py-2 lg:hidden">
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => scrollHoleIntoView(Math.max(1, currentHoleNumber - 1))}
            disabled={currentHoleIndex === 0}
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
          <AutoSaveChip status={autoSaveStatus} compact />
          <span className="flex-shrink-0 whitespace-nowrap font-fw-sans text-eyebrow font-semibold uppercase tracking-wide text-accent-700">
            Hole {currentHoleNumber} / {holes.length}
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => scrollHoleIntoView(Math.min(holes.length, currentHoleNumber + 1))}
          disabled={currentHoleIndex === holes.length - 1}
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
          {renderTotalColumn(
            is9Hole ? 'Total' : 'Out',
            front9.reduce((sum, hole) => sum + hole.par, 0),
            front9.reduce((sum, hole) => sum + hole.yardage, 0),
            front9Score,
            front9HasScores,
            is9Hole,
          )}
          {!is9Hole && back9.map((hole, index) => renderHoleButton(hole, index + 9))}
          {!is9Hole &&
            renderTotalColumn(
              'In',
              back9.reduce((sum, hole) => sum + hole.par, 0),
              back9.reduce((sum, hole) => sum + hole.yardage, 0),
              back9Score,
              back9HasScores,
              false,
            )}
          {!is9Hole &&
            renderTotalColumn(
              'Total',
              totalPar,
              holes.reduce((sum, hole) => sum + hole.yardage, 0),
              front9Score + back9Score,
              front9HasScores || back9HasScores,
              true,
            )}
        </div>
      </div>
    </div>
  );
});
