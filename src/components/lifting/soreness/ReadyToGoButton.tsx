'use client';

// =============================================================================
// src/components/lifting/soreness/ReadyToGoButton.tsx
//
// One-tap "Ready to Go" primary CTA. Big rounded green button with a check
// icon. Spring animation + haptic on tap + success confirmation state.
// Spec §5: most days this is the only action athletes need.
// =============================================================================

import { useState, useCallback } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';

import { haptic } from '@/lib/lifting/haptics';
import { IconCheckCircle2, IconLoader, IconCheck } from '@/components/icons';

interface Props {
  onConfirm: () => Promise<void>;
  submittedAt?: Date;
}

type ButtonState = 'idle' | 'loading' | 'done';

export function ReadyToGoButton({ onConfirm, submittedAt }: Props) {
  const prefersReducedMotion = useReducedMotion();
  const [state, setState] = useState<ButtonState>('idle');
  const [doneTime, setDoneTime] = useState<Date | null>(submittedAt ?? null);

  const handleTap = useCallback(async () => {
    if (state !== 'idle') return;
    haptic('success');
    setState('loading');
    try {
      await onConfirm();
      setDoneTime(new Date());
      setState('done');
    } catch {
      setState('idle');
    }
  }, [state, onConfirm]);

  const timeStr = doneTime
    ? doneTime.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : null;

  return (
    <AnimatePresence mode="wait">
      {state === 'done' ? (
        <motion.div
          key="done"
          initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', damping: 22, stiffness: 280 }}
          className="flex flex-col items-center gap-1.5 rounded-2xl
            bg-primary-50 border border-primary-200 px-6 py-5"
        >
          <motion.div
            initial={prefersReducedMotion ? false : { scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.06, type: 'spring', damping: 16, stiffness: 320 }}
          >
            <IconCheckCircle2 size={30} className="text-primary-600" />
          </motion.div>
          <p className="text-sm font-semibold text-primary-800">You&apos;re marked ready.</p>
          {timeStr && (
            <p className="text-xs text-primary-600">Submitted {timeStr}.</p>
          )}
        </motion.div>
      ) : (
        <motion.button
          key="button"
          onClick={handleTap}
          disabled={state === 'loading'}
          className="w-full rounded-2xl bg-primary-600 px-6 py-4 text-base font-semibold text-white
            shadow-sm transition-all duration-150 hover:bg-primary-700 active:scale-[0.98]
            disabled:opacity-70 focus-visible:outline-none focus-visible:ring-2
            focus-visible:ring-primary-400 focus-visible:ring-offset-2"
          whileTap={prefersReducedMotion ? {} : { scale: 0.97 }}
        >
          {state === 'loading' ? (
            <span className="flex items-center justify-center gap-2">
              <IconLoader size={18} className="animate-spin" />
              <span>Submitting…</span>
            </span>
          ) : (
            <span className="flex items-center justify-center gap-2.5">
              <IconCheck size={18} />
              <span>Ready to Go</span>
            </span>
          )}
        </motion.button>
      )}
    </AnimatePresence>
  );
}
