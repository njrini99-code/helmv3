'use client';

/**
 * Mobile stage header + task dock (§2.1): three labelled dots and a
 * Back/Continue rail.
 *
 * Design note — why this doesn't hide the other stages' fields:
 * `__tests__/FairwayEventEditor.test.tsx` and `FairwayEventEditor.scope.test.tsx`
 * already exercise essentials, people/time, and the primary Save/Create
 * button in a single render with no stage navigation (the suite runs the
 * mobile code path — `window.matchMedia` is stubbed to always report
 * non-matching in `src/test/setup.tsx`). Unmounting stages would break
 * nearly every existing case. This dock is therefore a wayfinding aid over
 * content that is ALWAYS mounted: the dots track progress and Continue/Back
 * move focus and (for the review dot) reveal the review receipt, but no
 * field is ever removed from the accessibility tree because the coach
 * hasn't clicked Continue yet. The always-present `ModalShell.Footer`
 * Save/Create/Cancel/Delete buttons are unchanged and unaffected by `stage`.
 */

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Button } from '@/components/fairway/controls/button';
import { useReducedMotionGuard, DURATION } from '@/lib/coachhelm/v3/motion';
import surfaces from '../CalendarSurfaces.module.css';
import type { EditorStageDef, EditorStageKey } from './useEventEditorStages';

export interface EventEditorStagesProps {
  stage: EditorStageKey;
  stages: ReadonlyArray<EditorStageDef>;
  stageIndex: number;
  isFirst: boolean;
  isLast: boolean;
  canContinueNow: boolean;
  onBack: () => void;
  onContinue: () => void;
  onGoTo: (key: EditorStageKey) => void;
}

export function EventEditorStages({
  stage,
  stages,
  stageIndex,
  isFirst,
  isLast,
  canContinueNow,
  onBack,
  onContinue,
  onGoTo,
}: EventEditorStagesProps) {
  const reduced = useReducedMotionGuard();

  return (
    <div
      data-slot="editor-stage-dock"
      className={cn('flex flex-col gap-2 rounded-fw-md border border-border-subtle p-2', surfaces.dock)}
    >
      <div className="flex items-center justify-center gap-3" role="group" aria-label="Event editor steps">
        {stages.map((s, i) => {
          const active = s.key === stage;
          return (
            <Button
              key={s.key}
              variant="ghost"
              type="button"
              aria-label={`Go to ${s.label}`}
              aria-current={active ? 'step' : undefined}
              onClick={() => onGoTo(s.key)}
              className={cn(
                'h-auto gap-1.5 rounded-full px-2 py-1 font-fw-sans text-caption font-medium',
                active ? 'text-accent-700' : 'text-text-tertiary hover:text-text-secondary',
              )}
            >
              <motion.span
                aria-hidden
                className={cn('h-1.5 w-1.5 rounded-full', active ? 'bg-accent-500' : 'bg-border-strong')}
                animate={{ scale: active ? 1.4 : 1 }}
                transition={{ duration: reduced ? 0 : DURATION.micro }}
              />
              <span className={i === stageIndex ? '' : 'hidden sm:inline'}>{s.label}</span>
            </Button>
          );
        })}
      </div>
      <div className="flex items-center justify-between gap-2">
        <Button
          variant="ghost"
          type="button"
          size="sm"
          onClick={onBack}
          disabled={isFirst}
          leftIcon={<ChevronLeft className="h-4 w-4" aria-hidden />}
        >
          Back
        </Button>
        {!isLast ? (
          <Button
            variant="secondary"
            type="button"
            size="sm"
            onClick={onContinue}
            disabled={!canContinueNow}
            rightIcon={<ChevronRight className="h-4 w-4" aria-hidden />}
          >
            Continue
          </Button>
        ) : null}
      </div>
    </div>
  );
}
