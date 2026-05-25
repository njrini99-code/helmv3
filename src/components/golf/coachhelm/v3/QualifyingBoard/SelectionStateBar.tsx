'use client';

import { useTransition } from 'react';
import {
  advanceSelectionState,
  confirmQualifierSelection,
} from '@/app/golf/actions/v3/qualifying';
import type { QualifierSelectionState } from '@/lib/coachhelm/v3/qualifying/types';
import { nextState } from '@/lib/coachhelm/v3/qualifying/state-machine';

const STATE_LABEL: Record<QualifierSelectionState, string> = {
  open: 'Open · accepting entries',
  scoring: 'Scoring · rounds in progress',
  closed: 'Closed · ready to select',
  selected: 'Selected · roster committed',
};

const STATE_PILL: Record<QualifierSelectionState, string> = {
  open: 'bg-warm-100 text-warm-700',
  scoring: 'bg-primary-50 text-primary-700',
  closed: 'bg-amber-50 text-amber-700',
  selected: 'bg-emerald-50 text-emerald-700',
};

interface Props {
  qualifierId: string;
  state: QualifierSelectionState;
  canConfirm: boolean;
}

export function SelectionStateBar({ qualifierId, state, canConfirm }: Props) {
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
      <span
        className={`shrink-0 px-3 py-1.5 text-sm font-medium rounded-full ${STATE_PILL[state]}`}
      >
        {STATE_LABEL[state]}
      </span>
      <div className="md:ml-auto flex flex-wrap gap-2">
        {next && next !== 'selected' && (
          <button
            type="button"
            onClick={handleAdvance}
            disabled={pending}
            className="px-4 py-2 text-sm font-medium rounded-xl bg-warm-900 text-white hover:bg-warm-800 disabled:opacity-50 transition"
          >
            {pending ? 'Advancing…' : `Advance to ${next}`}
          </button>
        )}
        {state === 'closed' && (
          <button
            type="button"
            onClick={handleConfirm}
            disabled={pending || !canConfirm}
            className="px-4 py-2 text-sm font-medium rounded-xl bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 disabled:bg-warm-200 disabled:text-warm-500 transition"
            title={
              !canConfirm
                ? 'Choose all coach picks (with reasoning) before confirming'
                : undefined
            }
          >
            {pending ? 'Confirming…' : 'Confirm selection'}
          </button>
        )}
      </div>
    </div>
  );
}
