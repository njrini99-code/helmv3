'use client';

/**
 * IntentDrawer — bottom-sheet / side-drawer where the coach edits
 * narrative_goal + alert_posture + notes for one player.
 *
 * Master plan Part VIII UX: kebab → "Set intent" → this drawer.
 *
 * Tier 4 polish (v3 feature audit feature #5): the panel uses
 * `surface-lift` (Liquid Glass material) + canonical `drawerVariants`
 * for the entrance, with the backdrop fading via `backdropVariants`.
 * Wrapped in `AnimatePresence` so the exit animation runs cleanly when
 * `open` flips false.
 */

import { useState, useTransition } from 'react';
import { AnimatePresence, m } from 'framer-motion';
import { setIntent } from '@/app/golf/actions/v3/intent';
import {
  NARRATIVE_GOAL_PRESENTATION,
  type NarrativeGoal,
  type AlertPosture,
  type CoachPlayerIntent,
} from '@/lib/coachhelm/v3/intent/types';
import {
  drawerVariants,
  drawerTransition,
  backdropVariants,
  backdropTransition,
} from '@/lib/coachhelm/v3/motion';

export interface IntentDrawerProps {
  open: boolean;
  onClose: () => void;
  player_id: string;
  player_name: string;
  current?: CoachPlayerIntent | null;
}

const NARRATIVE_OPTIONS: NarrativeGoal[] = ['bubble', 'maintain', 'develop', 'breakout', 'rehabilitate'];

const POSTURE_OPTIONS: Array<{ value: AlertPosture; label: string; helper: string }> = [
  { value: 'aggressive',   label: 'Aggressive',   helper: 'Surface more (0.85× confidence threshold)' },
  { value: 'balanced',     label: 'Balanced',     helper: 'Default (1.0×)' },
  { value: 'conservative', label: 'Conservative', helper: 'Surface less (1.15× threshold)' },
  { value: 'silent',       label: 'Silent',       helper: 'Never surface insights' },
];

export function IntentDrawer({
  open,
  onClose,
  player_id,
  player_name,
  current,
}: IntentDrawerProps) {
  const [narrativeGoal, setNarrativeGoal] = useState<NarrativeGoal>(current?.narrative_goal ?? 'develop');
  const [alertPosture, setAlertPosture] = useState<AlertPosture>(current?.alert_posture ?? 'balanced');
  const [notes, setNotes] = useState<string>(current?.notes ?? '');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await setIntent({
        player_id,
        narrative_goal: narrativeGoal,
        alert_posture: alertPosture,
        notes: notes.trim() === '' ? null : notes.trim(),
      });
      if (!result.ok) {
        setError(result.error ?? 'Failed to save');
        return;
      }
      onClose();
    });
  }

  return (
    <AnimatePresence>
      {open && (
        <m.div
          key="intent-drawer-backdrop"
          data-testid="intent-drawer"
          role="dialog"
          aria-modal="true"
          aria-label={`Set intent for ${player_name}`}
          className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40 backdrop-blur-sm"
          variants={backdropVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          transition={backdropTransition}
          onClick={onClose}
        >
          <m.div
            className="surface-lift w-full max-w-md rounded-t-3xl md:rounded-3xl p-6"
            variants={drawerVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            transition={drawerTransition}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-eyebrow uppercase tracking-[0.08em] text-warm-500 mb-1">Set intent</p>
            <h2 className="text-lg font-medium text-warm-900 mb-1">{player_name}</h2>
            <p className="text-xs text-warm-500 mb-5">Invisible to the player.</p>

            {/* Narrative goal — segmented control */}
            <label className="block text-xs font-medium text-warm-700 mb-2">Narrative goal</label>
            <div className="flex flex-wrap gap-2 mb-5">
              {NARRATIVE_OPTIONS.map((g) => {
                const cfg = NARRATIVE_GOAL_PRESENTATION[g];
                const selected = narrativeGoal === g;
                return (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setNarrativeGoal(g)}
                    className={`text-xs px-3 py-1.5 rounded-full border transition-colors flex items-center gap-1.5 ${
                      selected
                        ? cfg.pillClass + ' ring-2 ring-offset-1 ring-primary-300'
                        : 'bg-white text-warm-700 border-warm-200 hover:bg-warm-50'
                    }`}
                    data-testid={`intent-goal-${g}`}
                    aria-pressed={selected}
                  >
                    <span aria-hidden="true">{cfg.emoji}</span>
                    {cfg.label}
                  </button>
                );
              })}
            </div>

            {/* Alert posture */}
            <label className="block text-xs font-medium text-warm-700 mb-2">Alert posture</label>
            <div className="space-y-1.5 mb-5">
              {POSTURE_OPTIONS.map((p) => (
                <label
                  key={p.value}
                  className={`flex items-center justify-between gap-3 p-2.5 rounded-xl border cursor-pointer transition-colors ${
                    alertPosture === p.value
                      ? 'bg-primary-50 border-primary-300'
                      : 'bg-white border-warm-200 hover:bg-warm-50'
                  }`}
                >
                  <span>
                    <span className="block text-sm font-medium text-warm-900">{p.label}</span>
                    <span className="block text-eyebrow text-warm-500">{p.helper}</span>
                  </span>
                  <input
                    type="radio"
                    name="alert_posture"
                    value={p.value}
                    checked={alertPosture === p.value}
                    onChange={() => setAlertPosture(p.value)}
                    className="h-4 w-4 text-primary-600 focus:ring-primary-500"
                    data-testid={`intent-posture-${p.value}`}
                  />
                </label>
              ))}
            </div>

            {/* Notes */}
            <label htmlFor="intent-notes" className="block text-xs font-medium text-warm-700 mb-2">
              Notes (optional)
            </label>
            <textarea
              id="intent-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="What's the story this season — e.g. ‘rebuilding stroke after injury'."
              className="w-full rounded-xl border border-warm-200 bg-white px-3 py-2 text-sm focus:border-primary-600 focus:outline-none resize-none"
              data-testid="intent-notes"
            />

            {error && (
              <p role="alert" className="text-xs text-red-600 mt-3">{error}</p>
            )}

            {/* Actions */}
            <div className="mt-6 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={pending}
                className="text-sm text-warm-700 px-4 py-2 rounded-xl hover:bg-warm-100 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={pending}
                className="text-sm bg-primary-600 text-white px-4 py-2 rounded-xl hover:bg-primary-700 disabled:opacity-60 transition-colors"
                data-testid="intent-save"
              >
                {pending ? 'Saving…' : 'Save'}
              </button>
            </div>
          </m.div>
        </m.div>
      )}
    </AnimatePresence>
  );
}
