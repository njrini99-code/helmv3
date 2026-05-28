'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { LazyMotion, domAnimation, m, AnimatePresence, useReducedMotion } from 'framer-motion';
import { IconAlertCircle } from '@/components/icons';
import { Button } from '@/components/ui/button';

interface RoundSubmitOverlayProps {
  /** Whether the overlay is visible */
  isVisible: boolean;
  /** Total score for display */
  totalScore: number;
  /** Score to par (negative = under, positive = over) */
  toPar: number;
  /** Course name for display */
  courseName: string;
  /** Error message from submit attempt */
  error?: string;
  /** The round ID after successful submit */
  completedRoundId?: string;
  /** Called when user wants to go back (retry or review holes) */
  onGoBack: () => void;
  /** Called when user wants to retry submission */
  onRetry?: () => void;
  /** Called when user wants to save current state and exit to rounds list */
  onSaveAndExit?: () => void;
  /** Called when user wants to discard the in-progress round entirely */
  onDiscard?: () => void;
}

/**
 * Full-screen overlay shown during and after round submission.
 *
 * States:
 * 1. Submitting — progress animation with safety timeout
 * 2. Success — celebration with auto-navigate to round review
 * 3. Error — message with retry/go-back options
 *
 * The player can NEVER get stuck:
 * - 15s safety timeout shows a "Continue anyway" link
 * - Success auto-navigates after 3s, with 8s fallback escape
 * - Error always shows escape buttons
 */
export function RoundSubmitOverlay({
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
}: RoundSubmitOverlayProps) {
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
      setSuccessCountdown(prev => {
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

  return (
    <LazyMotion features={domAnimation}>
      <AnimatePresence mode="wait">
        {/* ============================================================ */}
        {/* SUCCESS STATE */}
        {/* ============================================================ */}
        {isSuccess && (
          <m.div
            key="submit-success"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-modal flex items-center justify-center p-4"
          >
            <div className="fixed inset-0 bg-warm-900/60 backdrop-blur-md" />
            <m.div
              initial={{ opacity: 0, scale: 0.9, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={prefersReducedMotion ? { duration: 0 } : ({ duration: 0.4, ease: [0.16, 1, 0.3, 1] })}
              className="relative w-full max-w-sm"
            >
              <div className="glass-prominent rounded-2xl shadow-2xl overflow-hidden">
                {/* Green gradient celebration header */}
                <div className="relative overflow-hidden bg-primary-600 px-6 pt-8 pb-6 text-center">
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.15),transparent_60%)]" />

                  {/* Animated checkmark */}
                  <m.div
                    initial={{ scale: 0, rotate: -45 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={prefersReducedMotion ? { duration: 0 } : ({ delay: 0.15, duration: 0.5, type: 'spring', stiffness: 200, damping: 14 })}
                    className="relative w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center mx-auto mb-4"
                  >
                    <m.svg
                      initial={{ pathLength: 0, opacity: 0 }}
                      animate={{ pathLength: 1, opacity: 1 }}
                      transition={prefersReducedMotion ? { duration: 0 } : ({ delay: 0.4, duration: 0.4 })}
                      className="w-8 h-8 text-white"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={3}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <m.path d="M20 6 9 17l-5-5" />
                    </m.svg>
                  </m.div>

                  <m.h3
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={prefersReducedMotion ? { duration: 0 } : ({ delay: 0.3 })}
                    className="text-lg font-medium text-white/90 mb-1"
                  >
                    Round Submitted
                  </m.h3>
                  <m.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={prefersReducedMotion ? { duration: 0 } : ({ delay: 0.4 })}
                    className="flex items-baseline justify-center gap-2"
                  >
                    <span className="text-display font-light tracking-[-0.025em] text-white tabular-nums">{totalScore}</span>
                    <span className={`text-lg font-medium ${toPar === 0 ? 'text-white/70' : toPar < 0 ? 'text-primary-100' : 'text-red-200'}`}>
                      ({toParLabel})
                    </span>
                  </m.div>
                  <p className="text-sm text-white/60 mt-1">{courseName}</p>
                </div>

                {/* Navigation section */}
                <m.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={prefersReducedMotion ? { duration: 0 } : ({ delay: 0.5 })}
                  className="p-5 text-center"
                >
                  <p className="text-sm text-warm-500 mb-4">
                    Loading your round review{successCountdown > 0 ? ` in ${successCountdown}s` : ''}...
                  </p>
                  <Button variant="primary"
                    onClick={() => {
                      hasNavigatedRef.current = false;
                      navigateToRound();
                    }}
                    className="w-full py-3 rounded-xl bg-primary-600 text-white font-medium hover:bg-primary-700 active:bg-primary-800 transition-colors shadow-sm"
                  >
                    View Round Review
                  </Button>

                  {/* Escape hatch if navigation hangs */}
                  <AnimatePresence>
                    {showSuccessEscape && (
                      <m.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="mt-3"
                      >
                        <Button variant="ghost"
                          onClick={() => router.push('/golf/dashboard/rounds')}
                          className="w-full py-2.5 rounded-xl bg-warm-100 text-warm-600 text-sm font-medium hover:bg-warm-200 transition-colors"
                        >
                          Go to All Rounds
                        </Button>
                      </m.div>
                    )}
                  </AnimatePresence>
                </m.div>
              </div>
            </m.div>
          </m.div>
        )}

        {/* ============================================================ */}
        {/* ERROR STATE */}
        {/* ============================================================ */}
        {isError && (
          <m.div
            key="submit-error"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-modal flex items-center justify-center p-4"
          >
            <div className="fixed inset-0 bg-warm-900/60 backdrop-blur-md" />
            <m.div
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={prefersReducedMotion ? { duration: 0 } : ({ duration: 0.3, ease: [0.16, 1, 0.3, 1] })}
              className="relative glass-prominent rounded-2xl shadow-2xl max-w-sm w-full p-6 text-center"
            >
              {/* Error icon */}
              <div className="w-14 h-14 rounded-2xl bg-sf-red/10 border border-sf-red/20 flex items-center justify-center mx-auto mb-4">
                <IconAlertCircle size={28} className="text-sf-red" />
              </div>
              <h3 className="text-title-3 text-warm-900 mb-2">
                Submission Failed
              </h3>
              <p className="text-footnote text-warm-500 mb-1">
                {error}
              </p>
              <p className="text-caption-1 text-warm-500 mb-6">
                Your round data is saved and won&apos;t be lost.
              </p>

              <div className="flex flex-col gap-3">
                {/* Primary action: retry */}
                {onRetry && (
                  <Button variant="primary"
                    onClick={onRetry}
                    className="w-full py-3 rounded-xl bg-primary-600 text-white font-medium hover:bg-primary-700 active:bg-primary-800 transition-colors shadow-sm"
                  >
                    Retry Submit
                  </Button>
                )}

                {/* Secondary action: save & exit */}
                {onSaveAndExit && (
                  <Button variant="ghost"
                    onClick={onSaveAndExit}
                    className="w-full py-3 rounded-xl bg-warm-100 text-warm-700 font-medium hover:bg-warm-200 active:bg-warm-300 transition-colors"
                  >
                    Save &amp; Exit
                  </Button>
                )}

                {/* Fallback: go back to editing */}
                <Button variant="ghost"
                  onClick={onGoBack}
                  className="w-full py-3 rounded-xl bg-warm-100 text-warm-700 font-medium hover:bg-warm-200 active:bg-warm-300 transition-colors"
                >
                  Go Back
                </Button>

                {/* Destructive action: discard round */}
                {onDiscard && (
                  <Button variant="ghost"
                    onClick={onDiscard}
                    className="w-full py-3 rounded-xl bg-sf-red/5 text-sf-red border border-sf-red/20 font-medium hover:bg-sf-red/10 active:bg-sf-red/15 transition-colors"
                  >
                    Discard Round
                  </Button>
                )}
              </div>
            </m.div>
          </m.div>
        )}

        {/* ============================================================ */}
        {/* SUBMITTING STATE */}
        {/* ============================================================ */}
        {isSubmitting && (
          <m.div
            key="submit-loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-modal flex items-center justify-center p-4"
          >
            <div className="fixed inset-0 bg-warm-900/60 backdrop-blur-md" />
            <m.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={prefersReducedMotion ? { duration: 0 } : ({ duration: 0.3 })}
              className="relative glass-prominent rounded-2xl shadow-2xl max-w-sm w-full p-8 text-center"
            >
              {/* Animated progress ring */}
              <div className="relative w-20 h-20 mx-auto mb-5">
                <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
                  <circle cx="40" cy="40" r="34" fill="none" stroke="currentColor" strokeWidth="3" className="text-warm-100" />
                  <circle
                    cx="40" cy="40" r="34" fill="none" stroke="currentColor" strokeWidth="3"
                    strokeDasharray="213.6"
                    strokeDashoffset="213.6"
                    strokeLinecap="round"
                    className="text-primary-500 animate-[submitRingSpin_2s_ease-in-out_infinite]"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-h1 font-light text-warm-900 tabular-nums tracking-[-0.025em]">{totalScore}</span>
                </div>
              </div>

              <h2 className="text-h3 font-medium text-warm-900 tracking-[-0.012em] mb-1">
                Submitting Round
              </h2>
              <p className="text-sm text-warm-500 mb-1">
                {courseName}
              </p>
              <p className="text-xs text-warm-600">
                Calculating your statistics...
              </p>

              {/* Safety escape — appears after 15s */}
              <AnimatePresence>
                {showSafetyEscape && (
                  <m.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mt-6 pt-5 border-t border-warm-100"
                  >
                    <p className="text-xs text-warm-600 mb-3">
                      Taking longer than expected?
                    </p>
                    <div className="flex gap-3">
                      <Button variant="ghost"
                        onClick={onGoBack}
                        className="flex-1 py-2.5 rounded-xl bg-warm-100 text-warm-600 text-sm font-medium hover:bg-warm-200 transition-colors"
                      >
                        Go Back
                      </Button>
                      <Button variant="primary"
                        onClick={() => router.push('/golf/dashboard/rounds')}
                        className="flex-1 py-2.5 rounded-xl bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 transition-colors"
                      >
                        View Rounds
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
          0% { stroke-dashoffset: 213.6; }
          50% { stroke-dashoffset: 53.4; }
          100% { stroke-dashoffset: 213.6; }
        }
      `}</style>
    </LazyMotion>
  );
}
