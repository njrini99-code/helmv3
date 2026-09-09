'use client';

/**
 * Stage state machine for the mobile event-editor flow (§2.1):
 * `essentials | people-time | review`.
 *
 * Every field stays mounted regardless of `stage` — see the module docblock
 * on `EventEditorStages.tsx` for why. `stage` instead drives: which dot
 * shows `aria-current="step"`, where focus lands after Continue/Back, and
 * (on mobile only) whether the review receipt is rendered. Desktop ignores
 * this hook entirely — it shows everything at once with no stepper.
 */

import * as React from 'react';

export type EditorStageKey = 'essentials' | 'people-time' | 'review';

export interface EditorStageDef {
  key: EditorStageKey;
  label: string;
}

export const EDITOR_STAGES: ReadonlyArray<EditorStageDef> = [
  { key: 'essentials', label: 'Essentials' },
  { key: 'people-time', label: 'People & time' },
  { key: 'review', label: 'Review' },
];

export interface UseEventEditorStagesOptions {
  /** Changing this value (e.g. `${open}:${event?.id ?? 'new'}`) resets the
   *  stage back to `essentials` — a fresh open should never resume mid-flow
   *  from a previous event. */
  resetKey: string;
  /** Whether the coach can leave `stage` via Continue right now. */
  canContinue: (stage: EditorStageKey) => boolean;
}

export interface UseEventEditorStagesResult {
  stage: EditorStageKey;
  stageIndex: number;
  stages: ReadonlyArray<EditorStageDef>;
  isFirst: boolean;
  isLast: boolean;
  canContinueNow: boolean;
  next: () => void;
  back: () => void;
  goTo: (key: EditorStageKey) => void;
}

export function useEventEditorStages({
  resetKey,
  canContinue,
}: UseEventEditorStagesOptions): UseEventEditorStagesResult {
  const [stage, setStage] = React.useState<EditorStageKey>('essentials');
  const lastResetKey = React.useRef(resetKey);

  React.useEffect(() => {
    if (lastResetKey.current !== resetKey) {
      lastResetKey.current = resetKey;
      setStage('essentials');
    }
  }, [resetKey]);

  const stageIndex = EDITOR_STAGES.findIndex((s) => s.key === stage);
  const isFirst = stageIndex <= 0;
  const isLast = stageIndex >= EDITOR_STAGES.length - 1;
  const canContinueNow = canContinue(stage);

  const next = React.useCallback(() => {
    setStage((current) => {
      if (!canContinue(current)) return current;
      const i = EDITOR_STAGES.findIndex((s) => s.key === current);
      const nextDef = EDITOR_STAGES[i + 1];
      return nextDef ? nextDef.key : current;
    });
  }, [canContinue]);

  const back = React.useCallback(() => {
    setStage((current) => {
      const i = EDITOR_STAGES.findIndex((s) => s.key === current);
      const prevDef = EDITOR_STAGES[i - 1];
      return prevDef ? prevDef.key : current;
    });
  }, []);

  const goTo = React.useCallback((key: EditorStageKey) => setStage(key), []);

  return { stage, stageIndex, stages: EDITOR_STAGES, isFirst, isLast, canContinueNow, next, back, goTo };
}
