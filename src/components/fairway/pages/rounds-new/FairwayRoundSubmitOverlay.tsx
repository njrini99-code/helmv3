'use client';

/**
 * ============================================================================
 * Fairway · Rounds-new · FairwayRoundSubmitOverlay — submit/success/error
 * ----------------------------------------------------------------------------
 * Fairway re-skin of the legacy RoundSubmitOverlay. ALL logic is copied
 * VERBATIM — the 15s safety escape, the 3s success countdown + auto-navigate,
 * the 8s navigation-hang fallback, every ref/timer/effect, and navigateToRound.
 * "The player can NEVER get stuck" guarantees are preserved exactly. Only the
 * three visual states (submitting / success / error) are re-skinned into the
 * warm Fairway system; each overlay root carries `fairway-ds` so the tokens
 * resolve even though this renders in the (still-legacy) tracking subtree.
 *
 * Presentation only; flag-off path still renders the legacy RoundSubmitOverlay.
 * ========================================================================== */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { LazyMotion, domAnimation, m, AnimatePresence, useReducedMotion } from 'framer-motion';
import { TriangleAlert, Check } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/fairway/controls/button';

interface FairwayRoundSubmitOverlayProps {
  isVisible: boolean;
  totalScore: number;
  toPar: number;
  courseName: string;
  error?: string;
  completedRoundId?: string;
  onGoBack: () => void;
  onRetry?: () => void;
  onSaveAndExit?: () => void;
  onDiscard?: () => void;
}

export function FairwayRoundSubmitOverlay({
  isVisible,
  totalScore,
  toPar,
  courseName,
  error,
  completedRoundId,
  onGoBack,
  onRetry,
  onSaveAndExit,
  onDiscard,
}: FairwayRoundSubmitOverlayProps) {
  const prefersReducedMotion = useReducedMotion();
  const router = useRouter();
  const [showSafetyEscape, setShowSafetyEscape] = useState(false);
  const [showSuccessEscape, setShowSuccessEscape] = useState(false);
  const [successCountdown, setSuccessCountdown] = useState(3);
  const safetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const successEscapeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasNavigatedRef = useRef(false);

  const isSuccess = !!completedRoundId && !error;
  const isError = !!error;
  const isSubmitting = isVisible && !isSuccess && !isError;

  const toParLabel = toPar === 0 ? 'E' : `${toPar > 0 ? '+' : ''}${toPar}`;

  const navigateToRound = useCallback(() => {
    if (hasNavigatedRef.current || !completedRoundId) return;
    hasNavigatedRef.current = true;
    router.push(`/golf/dashboard/rounds/${completedRoundId}`);
  }, [completedRoundId, router]);

  // Safety timeout: after 15s, show escape link
  useEffect(() => {
    if (!isSubmitting) {
      if (safetyTimerRef.current) clearTimeout(safetyTimerRef.current);
      setShowSafetyEscape(false);
      return;
    }
    safetyTimerRef.current = setTimeout(() => {
      setShowSafetyEscape(true);
    }, 15000);
    return () => {
      if (safetyTimerRef.current) clearTimeout(safetyTimerRef.current);
    };
  }, [isSubmitting]);

  // Success: countdown then auto-navigate
  useEffect(() => {
    if (!isSuccess) {
      setSuccessCountdown(3);
      setShowSuccessEscape(false);
      hasNavigatedRef.current = false;
      if (countdownRef.current) clearInterval(countdownRef.current);
      if (successEscapeTimerRef.current) clearTimeout(successEscapeTimerRef.current);
      return;
    }
    setSuccessCountdown(3);
    countdownRef.current = setInterval(() => {
      setSuccessCountdown((prev) => {
        if (prev <= 1) {
          if (countdownRef.current) clearInterval(countdownRef.current);
          navigateToRound();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    // Safety: if navigation hangs, show escape after 8s
    successEscapeTimerRef.current = setTimeout(() => {
      setShowSuccessEscape(true);
    }, 8000);
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
      if (successEscapeTimerRef.current) clearTimeout(successEscapeTimerRef.current);
    };
  }, [isSuccess, navigateToRound]);

  // Reset navigation flag when overlay hides
  useEffect(() => {
    if (!isVisible) hasNavigatedRef.current = false;
  }, [isVisible]);

  if (!isVisible) return null;

  const scrim = <div className="fixed inset-0 bg-warm-900/60 backdrop-blur-md" />;

  return (
    <LazyMotion features={domAnimation}>
      <AnimatePresence mode="wait">
        {/* ── SUCCESS ── */}
        {isSuccess && (
          <m.div
            key="submit-success"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fairway-ds fixed inset-0 z-modal flex items-center justify-center p-4"
          >
            {scrim}
            <m.div
              initial={{ opacity: 0, scale: 0.9, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="relative w-full max-w-sm"
            >
              <div className="overflow-hidden rounded-card bg-surface shadow-fw-modal">
                {/* Green celebration header */}
                <div className="relative overflow-hidden bg-accent-600 px-6 pb-6 pt-8 text-center">
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.16),transparent_60%)]" />
                  <m.div
                    initial={{ scale: 0, rotate: -45 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={
                      prefersReducedMotion
                        ? { duration: 0 }
                        : { delay: 0.15, duration: 0.5, type: 'spring', stiffness: 200, damping: 14 }
                    }
                    className="relative mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-text-on-accent/20 backdrop-blur-sm"
                  >
                    <Check className="h-8 w-8 text-white" strokeWidth={3} aria-hidden />
                  </m.div>
                  <m.h3
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={prefersReducedMotion ? { duration: 0 } : { delay: 0.3 }}
                    className="mb-1 font-fw-sans text-body-lg font-medium text-white/90"
                  >
                    Round submitted
                  </m.h3>
                  <m.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={prefersReducedMotion ? { duration: 0 } : { delay: 0.4 }}
                    className="flex items-baseline justify-center gap-2"
                  >
                    <span className="font-fw-mono text-display tabular-nums tracking-[-0.025em] text-white">
                      {totalScore}
                    </span>
                    <span
                      className={cn(
                        'font-fw-sans text-body-lg font-medium',
                        toPar === 0 ? 'text-white/70' : toPar < 0 ? 'text-accent-100' : 'text-red-200',
                      )}
                    >
                      ({toParLabel})
                    </span>
                  </m.div>
                  <p className="mt-1 font-fw-sans text-body-sm text-white/65">{courseName}</p>
                </div>

                {/* Navigation */}
                <m.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={prefersReducedMotion ? { duration: 0 } : { delay: 0.5 }}
                  className="p-5 text-center"
                >
                  <p className="mb-4 font-fw-sans text-body-sm text-text-tertiary">
                    Loading your round review{successCountdown > 0 ? ` in ${successCountdown}s` : ''}…
                  </p>
                  <Button
                    variant="primary"
                    className="w-full"
                    onClick={() => {
                      hasNavigatedRef.current = false;
                      navigateToRound();
                    }}
                  >
                    View round review
                  </Button>
                  <AnimatePresence>
                    {showSuccessEscape && (
                      <m.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="mt-3"
                      >
                        <Button
                          variant="secondary"
                          className="w-full"
                          onClick={() => router.push('/golf/dashboard/rounds')}
                        >
                          Go to all rounds
                        </Button>
                      </m.div>
                    )}
                  </AnimatePresence>
                </m.div>
              </div>
            </m.div>
          </m.div>
        )}

        {/* ── ERROR ── */}
        {isError && (
          <m.div
            key="submit-error"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fairway-ds fixed inset-0 z-modal flex items-center justify-center p-4"
          >
            {scrim}
            <m.div
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="relative w-full max-w-sm rounded-card bg-surface p-6 text-center shadow-fw-modal"
            >
              <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl border border-fw-danger/20 bg-fw-danger-bg text-fw-danger">
                <TriangleAlert className="h-7 w-7" aria-hidden />
              </div>
              <h3 className="mb-2 font-fw-display text-h3 font-semibold text-text-primary">Submission failed</h3>
              <p className="mb-1 font-fw-sans text-body-sm text-text-secondary">{error}</p>
              <p className="mb-6 font-fw-sans text-caption text-text-tertiary">
                Your round data is saved and won&apos;t be lost.
              </p>

              <div className="flex flex-col gap-3">
                {onRetry && (
                  <Button variant="primary" className="w-full" onClick={onRetry}>
                    Retry submit
                  </Button>
                )}
                {onSaveAndExit && (
                  <Button variant="secondary" className="w-full" onClick={onSaveAndExit}>
                    Save &amp; exit
                  </Button>
                )}
                <Button variant="secondary" className="w-full" onClick={onGoBack}>
                  Go back
                </Button>
                {onDiscard && (
                  <Button variant="danger" className="w-full" onClick={onDiscard}>
                    Discard round
                  </Button>
                )}
              </div>
            </m.div>
          </m.div>
        )}

        {/* ── SUBMITTING ── */}
        {isSubmitting && (
          <m.div
            key="submit-loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fairway-ds fixed inset-0 z-modal flex items-center justify-center p-4"
          >
            {scrim}
            <m.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.3 }}
              className="relative w-full max-w-sm rounded-card bg-surface p-8 text-center shadow-fw-modal"
            >
              <div className="relative mx-auto mb-5 h-20 w-20">
                <svg className="h-20 w-20 -rotate-90" viewBox="0 0 80 80">
                  <circle cx="40" cy="40" r="34" fill="none" stroke="currentColor" strokeWidth="3" className="text-border-subtle" />
                  <circle
                    cx="40"
                    cy="40"
                    r="34"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeDasharray="213.6"
                    strokeDashoffset="213.6"
                    strokeLinecap="round"
                    className="animate-[submitRingSpin_2s_ease-in-out_infinite] text-accent-500"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="font-fw-mono text-h1 tabular-nums tracking-[-0.025em] text-text-primary">
                    {totalScore}
                  </span>
                </div>
              </div>

              <h2 className="mb-1 font-fw-display text-h3 font-semibold text-text-primary">Submitting round</h2>
              <p className="mb-1 font-fw-sans text-body-sm text-text-tertiary">{courseName}</p>
              <p className="font-fw-sans text-caption text-text-secondary">Calculating your statistics…</p>

              <AnimatePresence>
                {showSafetyEscape && (
                  <m.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mt-6 border-t border-border-subtle pt-5"
                  >
                    <p className="mb-3 font-fw-sans text-caption text-text-secondary">Taking longer than expected?</p>
                    <div className="flex gap-3">
                      <Button variant="secondary" className="flex-1" onClick={onGoBack}>
                        Go back
                      </Button>
                      <Button variant="primary" className="flex-1" onClick={() => router.push('/golf/dashboard/rounds')}>
                        View rounds
                      </Button>
                    </div>
                  </m.div>
                )}
              </AnimatePresence>
            </m.div>
          </m.div>
        )}
      </AnimatePresence>

      {/* Keyframe for the progress ring animation */}
      <style jsx global>{`
        @keyframes submitRingSpin {
          0% {
            stroke-dashoffset: 213.6;
          }
          50% {
            stroke-dashoffset: 53.4;
          }
          100% {
            stroke-dashoffset: 213.6;
          }
        }
      `}</style>
    </LazyMotion>
  );
}

export default FairwayRoundSubmitOverlay;
