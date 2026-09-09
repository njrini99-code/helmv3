'use client';

/**
 * Mobile stage wayfinding (§2.1): a slim row of three labelled dots under
 * the header (`EventEditorStageDots`) and the Back/Continue pair that lives
 * in the editor's single bottom dock (`EventEditorStageRail`).
 * `EventEditorStages` composes both for callers that want the pair together.
 *
 * Design note — why this doesn't hide the other stages' fields:
 * `__tests__/FairwayEventEditor.test.tsx` and `FairwayEventEditor.scope.test.tsx`
 * already exercise essentials, people/time, and the primary Save/Create
 * button in a single render with no stage navigation (the suite runs the
 * mobile code path — `window.matchMedia` is stubbed to always report
 * non-matching in `src/test/setup.tsx`). Unmounting stages would break
 * nearly every existing case. The dots are therefore a wayfinding aid over
 * content that is ALWAYS mounted: they track progress and Continue/Back
 * move focus and (for the review dot) reveal the review receipt, but no
 * field is ever removed from the accessibility tree because the coach
 * hasn't clicked Continue yet.
 */

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Button } from '@/components/fairway/controls/button';
import { useReducedMotionGuard, DURATION } from '@/lib/coachhelm/v3/motion';
import surfaces from '../CalendarSurfaces.module.css';
import type { EditorStageDef, EditorStageKey } from './useEventEditorStages';

export interface EventEditorStageDotsProps {
  stage: EditorStageKey;
  stages: ReadonlyArray<EditorStageDef>;
  stageIndex: number;
  onGoTo: (key: EditorStageKey) => void;
  className?: string;
}

export function EventEditorStageDots({ stage, stages, stageIndex, onGoTo, className }: EventEditorStageDotsProps) {
  const reduced = useReducedMotionGuard();
  return (
    <div
      data-slot="editor-stage-dots"
      role="group"
      aria-label="Event editor steps"
      className={cn('flex items-center justify-center gap-1', className)}
    >
      {stages.map((s, i) => {
        const active = s.key === stage;
        const done = i < stageIndex;
        return (
          <Button
            key={s.key}
            variant="ghost"
            type="button"
            size="sm"
            aria-label={`Go to ${s.label}`}
            aria-current={active ? 'step' : undefined}
            onClick={() => onGoTo(s.key)}
            className={cn(
              'h-auto min-h-[36px] gap-1.5 rounded-full px-2 py-1.5 font-fw-sans text-caption font-medium hover:bg-transparent sm:px-2.5',
              active ? 'font-semibold text-accent-700' : done ? 'text-text-secondary' : 'text-text-tertiary hover:text-text-secondary',
            )}
          >
            <motion.span
              aria-hidden
              className={cn(
                'mr-1.5 inline-block h-2 w-2 shrink-0 rounded-full',
                active ? 'bg-accent-600' : done ? 'bg-accent-400' : 'bg-text-tertiary/50',
              )}
              animate={{ scale: active ? 1.4 : 1 }}
              transition={{ duration: reduced ? 0 : DURATION.micro }}
            />
            <span className="whitespace-nowrap">{s.label}</span>
          </Button>
        );
      })}
    </div>
  );
}

export interface EventEditorStageRailProps {
  isFirst: boolean;
  isLast: boolean;
  canContinueNow: boolean;
  onBack: () => void;
  onContinue: () => void;
  /** Lets the dock stretch Continue across the row on phones. */
  fullWidth?: boolean;
}

export function EventEditorStageRail({ isFirst, isLast, canContinueNow, onBack, onContinue, fullWidth = false }: EventEditorStageRailProps) {
  return (
    <>
      <Button
        variant="ghost"
        type="button"
        size="md"
        onClick={onBack}
        disabled={isFirst}
        leftIcon={<ChevronLeft className="h-4 w-4" aria-hidden />}
        className="shrink-0"
      >
        Back
      </Button>
      {!isLast ? (
        <Button
          variant="secondary"
          type="button"
          size="md"
          onClick={onContinue}
          disabled={!canContinueNow}
          rightIcon={<ChevronRight className="h-4 w-4" aria-hidden />}
          className={cn(fullWidth && 'flex-1 sm:flex-none')}
        >
          Continue
        </Button>
      ) : null}
    </>
  );
}

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

/** Dots + rail together, for a self-contained stage dock. */
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
  return (
    <div
      data-slot="editor-stage-dock"
      className={cn('flex flex-col gap-2 rounded-fw-md border p-2', surfaces.dock)}
    >
      <EventEditorStageDots stage={stage} stages={stages} stageIndex={stageIndex} onGoTo={onGoTo} />
      <div className="flex items-center justify-between gap-2">
        <EventEditorStageRail
          isFirst={isFirst}
          isLast={isLast}
          canContinueNow={canContinueNow}
          onBack={onBack}
          onContinue={onContinue}
        />
      </div>
    </div>
  );
}
