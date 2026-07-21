'use client';

/**
 * ============================================================================
 * Fairway · modules · DrillPanel — the stage's depth container (spec §4 stage)
 * ----------------------------------------------------------------------------
 * The card a stage view mounts into once a bento cell opens
 * (docs/design/spine-stage-mockup.html `.drill` / `.drill-head`): a single
 * back chip ("← All areas"), a title, an optional status chip, and a
 * two-column grid the caller fills via `children` (matrix + Rx on one side,
 * bars + narrative on the other — the caller owns that layout, DrillPanel
 * only owns the chrome).
 *
 * `onBack` is caller-supplied — the usual wiring is `useStage().home()`, but
 * DrillPanel takes a plain callback so a stage view can also route back to a
 * SIBLING view (e.g. a nested drill returning to a filtered list) without
 * DrillPanel needing to know about StageRouter's internals.
 *
 * ADDITIVE ONLY. No Supabase imports — pure props.
 * ========================================================================== */

import { cn } from '@/lib/utils';
import { PressTarget } from '../controls';
import type { DrillPanelProps } from './types';

export function DrillPanel({ title, backLabel, onBack, chip, children }: DrillPanelProps) {
  return (
    <div
      data-slot="drill"
      className={cn(
        'rounded-fw-lg border border-border-subtle bg-surface',
        '[box-shadow:var(--fw-shadow-card)]',
        'p-5 sm:p-6',
      )}
    >
      <div className="mb-1.5 flex flex-wrap items-center gap-3.5">
        <PressTarget
          onClick={onBack}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full border border-accent-200 bg-accent-50',
            'min-h-11 px-3 py-1.5 text-caption font-bold text-accent-700',
            'transition-colors [transition-duration:150ms]',
            'hover:bg-accent-100',
          )}
        >
          <span aria-hidden>←</span>
          {backLabel}
        </PressTarget>
        <span className="font-fw-display text-body-lg font-semibold text-text-primary">
          {title}
        </span>
        {chip ? <span className="w-full min-w-0 sm:ml-auto sm:w-auto">{chip}</span> : null}
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}
