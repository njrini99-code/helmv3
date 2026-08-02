'use client';

import React, { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { fwHaptic, fwHapticSequence } from '@/lib/fairway/haptics';

interface PullToRefreshProps {
  /** Called when user pulls past the threshold. Should return a promise. */
  onRefresh: () => Promise<void>;
  children: React.ReactNode;
  /** Pull distance in pixels to trigger refresh. Default: 80 */
  threshold?: number;
  /** Disable pull-to-refresh (default: false) */
  disabled?: boolean;
  /** Optional className for the outer wrapper */
  className?: string;
}

interface SpinnerProps {
  progress: number;
  isActive: boolean;
  isRefreshing: boolean;
  reducedMotion: boolean;
}

const SPINNER_SIZE = 32;
const SPINNER_STROKE = 2.5;
const SPINNER_RADIUS = (SPINNER_SIZE - SPINNER_STROKE) / 2;
const SPINNER_CIRC = 2 * Math.PI * SPINNER_RADIUS;

function Spinner({ progress, isActive, isRefreshing, reducedMotion }: SpinnerProps) {
  // Clamp progress to [0, 1] for the dash offset
  const clamped = Math.max(0, Math.min(1, progress));
  const dashOffset = SPINNER_CIRC * (1 - clamped);
  // Rotation tracks pull progress up to 360deg at threshold
  const rotation = clamped * 360;

  return (
    <svg
      width={SPINNER_SIZE}
      height={SPINNER_SIZE}
      viewBox={`0 0 ${SPINNER_SIZE} ${SPINNER_SIZE}`}
      className={cn(
        'text-primary-600',
        isRefreshing && !reducedMotion && 'animate-spin',
      )}
      style={{
        transform: isRefreshing ? undefined : `rotate(${rotation}deg)`,
        transition: isActive && !isRefreshing ? 'transform 0.15s ease-out' : undefined,
      }}
      aria-hidden="true"
    >
      <circle
        cx={SPINNER_SIZE / 2}
        cy={SPINNER_SIZE / 2}
        r={SPINNER_RADIUS}
        fill="none"
        stroke="currentColor"
        strokeOpacity={0.2}
        strokeWidth={SPINNER_STROKE}
      />
      <circle
        cx={SPINNER_SIZE / 2}
        cy={SPINNER_SIZE / 2}
        r={SPINNER_RADIUS}
        fill="none"
        stroke="currentColor"
        strokeWidth={SPINNER_STROKE}
        strokeLinecap="round"
        strokeDasharray={SPINNER_CIRC}
        strokeDashoffset={isRefreshing ? SPINNER_CIRC * 0.25 : dashOffset}
        transform={`rotate(-90 ${SPINNER_SIZE / 2} ${SPINNER_SIZE / 2})`}
      />
    </svg>
  );
}

export function PullToRefresh({
  onRefresh,
  children,
  threshold = 80,
  disabled = false,
  className,
}: PullToRefreshProps) {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  const startY = useRef(0);
  const isPulling = useRef(false);
  const hasPassedThreshold = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Detect touch device + reduced motion preference
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const touch =
      'ontouchstart' in window ||
      (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0);
    setIsTouchDevice(touch);

    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const effectivelyDisabled = disabled || !isTouchDevice;

  function handleTouchStart(e: React.TouchEvent<HTMLDivElement>) {
    if (effectivelyDisabled || isRefreshing) return;
    const el = containerRef.current;
    if (!el || el.scrollTop > 0) return;
    const touch = e.touches[0];
    if (!touch) return;
    startY.current = touch.clientY;
    isPulling.current = true;
    hasPassedThreshold.current = false;
  }

  function handleTouchMove(e: React.TouchEvent<HTMLDivElement>) {
    if (effectivelyDisabled || isRefreshing) return;
    if (!isPulling.current) return;
    const el = containerRef.current;
    if (!el) return;
    // If user scrolled away from top mid-gesture, cancel pull
    if (el.scrollTop > 0) {
      isPulling.current = false;
      setPullDistance(0);
      return;
    }
    const touch = e.touches[0];
    if (!touch) return;
    const delta = touch.clientY - startY.current;
    if (delta <= 0) {
      // Upward drag — not a pull-to-refresh gesture
      setPullDistance(0);
      return;
    }
    // Apply resistance and cap
    const next = Math.min(delta * 0.5, threshold * 1.5);
    setPullDistance(next);

    // Arming tick when crossing the threshold, and again when backing off it.
    //
    // Was a single MEDIUM impact on the way out only. Two problems: a medium
    // impact is a thud where iOS uses a light detent for arming (compare
    // Mail/Safari), and going back under the threshold silently disarmed —
    // the pull stopped being live with no way to feel it, so users released
    // on a dead gesture and got no refresh.
    if (!hasPassedThreshold.current && next >= threshold) {
      hasPassedThreshold.current = true;
      fwHapticSequence('threshold');
    } else if (hasPassedThreshold.current && next < threshold) {
      hasPassedThreshold.current = false;
      fwHapticSequence('threshold');
    }
  }

  async function handleTouchEnd() {
    if (!isPulling.current) return;
    isPulling.current = false;

    if (pullDistance >= threshold && !isRefreshing && !effectivelyDisabled) {
      // Release into the refresh — the arming tick said "let go now", this
      // confirms the release actually took. Without it the gesture ends silent
      // and the only feedback is the spinner appearing.
      fwHaptic('light');
      setIsRefreshing(true);
      try {
        await onRefresh();
      } finally {
        setIsRefreshing(false);
        setPullDistance(0);
        hasPassedThreshold.current = false;
      }
    } else {
      setPullDistance(0);
      hasPassedThreshold.current = false;
    }
  }

  function handleTouchCancel() {
    isPulling.current = false;
    hasPassedThreshold.current = false;
    if (!isRefreshing) {
      setPullDistance(0);
    }
  }

  const indicatorHeight = isRefreshing ? threshold : pullDistance;
  const progress = threshold > 0 ? pullDistance / threshold : 0;
  const showIndicator = indicatorHeight > 0;

  // Transition rules:
  // - while the finger is actively pulling (pullDistance > 0, not refreshing): no transition
  // - while refreshing: no transition (indicator held at threshold)
  // - on release with pullDistance === 0: animate back smoothly (unless reduced motion)
  const restingTransition = reducedMotion ? 'none' : 'height 0.2s ease-out, transform 0.2s ease-out';
  const activeTransition = 'none';
  const transition =
    isRefreshing || (isPulling.current && pullDistance > 0) || pullDistance > 0
      ? activeTransition
      : restingTransition;

  return (
    <div
      ref={containerRef}
      className={cn('relative h-full w-full overflow-y-auto', className)}
      style={{
        // Preserve native iOS momentum scrolling
        WebkitOverflowScrolling: 'touch',
        // Disable the browser's own overscroll refresh so ours can take over
        overscrollBehaviorY: effectivelyDisabled ? undefined : 'contain',
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchCancel}
    >
      <div
        className="pointer-events-none flex items-center justify-center overflow-hidden"
        style={{
          height: `${indicatorHeight}px`,
          opacity: isRefreshing ? 1 : Math.max(0, Math.min(1, progress)),
          transition,
        }}
        aria-hidden={!showIndicator}
      >
        {showIndicator ? (
          <Spinner
            progress={progress}
            isActive={pullDistance > 0}
            isRefreshing={isRefreshing}
            reducedMotion={reducedMotion}
          />
        ) : null}
      </div>
      <div
        style={{
          transform: `translateY(0px)`,
          transition,
        }}
      >
        {children}
      </div>
    </div>
  );
}
