'use client';

import { useTransition } from 'react';
import { AnimatePresence, m, useReducedMotion } from 'framer-motion';
import {
  advanceSelectionState,
  confirmQualifierSelection,
} from '@/app/golf/actions/v3/qualifying';
import type { QualifierSelectionState } from '@/lib/coachhelm/v3/qualifying/types';
import { nextState } from '@/lib/coachhelm/v3/qualifying/state-machine';
import {
  badgeVariants,
  badgeTransition,
  liftHover,
  tapPress,
} from '@/lib/coachhelm/v3/motion';

const STATE_LABEL: Record<QualifierSelectionState, string> = {
  open: 'Open · accepting entries',
  scoring: 'Scoring · rounds in progress',
  closed: 'Closed · ready to select',
  selected: 'Selected · roster committed',
};

const STATE_PILL: Record<QualifierSelectionState, string> = {
  open: 'bg-warm-100 text-warm-700 ring-1 ring-warm-200/60',
  scoring: 'bg-primary-50 text-primary-800 ring-1 ring-primary-200/60',
  closed: 'bg-amber-50 text-amber-800 ring-1 ring-amber-200/60',
  selected: 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200/60',
};

interface Props {
  qualifierId: string;
  state: QualifierSelectionState;
  canConfirm: boolean;
}

export function SelectionStateBar({ qualifierId, state, canConfirm }: Props) {
  const prefersReducedMotion = useReducedMotion();
  const [pending, startTransition] = useTransition();
  const next = nextState(state);

  function handleAdvance() {
    if (!next) return;
    startTransition(async () => {
      await advanceSelectionState(qualifierId, next);
    });
  }

  function handleConfirm() {
    startTransition(async () => {
      await confirmQualifierSelection(qualifierId);
    });
  }

  return (
    <div className="surface-matte rounded-2xl p-4 md:p-5 flex flex-col md:flex-row md:items-center gap-3 md:gap-4">
      {/* Pill crossfades when the state advances — gives the coach a
          confirmation the action landed without a separate toast. */}
      <AnimatePresence mode="wait">
        <m.span
          key={state}
          variants={badgeVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          transition={prefersReducedMotion ? { duration: 0 } : (badgeTransition)}
          className={`shrink-0 inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-full ${STATE_PILL[state]}`}
        >
          {STATE_LABEL[state]}
        </m.span>
      </AnimatePresence>
      <div className="md:ml-auto flex flex-wrap gap-2">
        {next && next !== 'selected' && (
          <m.button
            type="button"
            onClick={handleAdvance}
            disabled={pending}
            whileHover={pending ? undefined : liftHover}
            whileTap={pending ? undefined : tapPress}
            className="px-4 py-2 text-sm font-medium rounded-xl bg-warm-900 text-white hover:bg-warm-800 disabled:opacity-50 transition"
          >
            {pending ? 'Advancing…' : `Advance to ${next}`}
          </m.button>
        )}
        {state === 'closed' && (
          <m.button
            type="button"
            onClick={handleConfirm}
            disabled={pending || !canConfirm}
            whileHover={pending || !canConfirm ? undefined : liftHover}
            whileTap={pending || !canConfirm ? undefined : tapPress}
            className="px-4 py-2 text-sm font-medium rounded-xl bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 disabled:bg-warm-200 disabled:text-warm-500 transition shadow-[0_8px_18px_-10px_rgba(22,163,74,0.55)]"
            title={
              !canConfirm
                ? 'Choose all coach picks (with reasoning) before confirming'
                : undefined
            }
          >
            {pending ? 'Confirming…' : 'Confirm selection'}
          </m.button>
        )}
      </div>
    </div>
  );
}
