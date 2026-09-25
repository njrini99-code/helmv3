'use client';

/**
 * The success mark: a ring and a check that land together in 260ms
 * (MOT-18, `successCheckmark` in the CoachHelm motion tokens). Static under
 * reduced motion. Used as the success toast icon.
 */

import { motion } from 'framer-motion';
import { successCheckmark, useReducedMotionGuard } from '@/lib/coachhelm/v3/motion';
import { cn } from '@/lib/utils';

export function SuccessCheck({ className }: { className?: string }) {
  const reduce = useReducedMotionGuard();
  const m = successCheckmark(reduce);
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" data-slot="success-check" className={cn('h-5 w-5', className)}>
      <motion.circle
        cx="10"
        cy="10"
        r="8.25"
        stroke="currentColor"
        strokeWidth="1.5"
        style={{ originX: '50%', originY: '50%' }}
        initial={m.ring.initial}
        animate={m.ring.animate}
        transition={m.ring.transition}
      />
      <motion.path
        d="M6.5 10.25l2.4 2.4 4.6-5.1"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={m.path.initial}
        animate={m.path.animate}
        transition={m.path.transition}
      />
    </svg>
  );
}
