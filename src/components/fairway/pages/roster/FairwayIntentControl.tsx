'use client';

/**
 * ============================================================================
 * Fairway · Roster · FairwayIntentControl (C12)
 * ----------------------------------------------------------------------------
 * The warm-premium re-skin of the legacy RosterIntentControl (+ IntentPill /
 * IntentDrawer). A per-player coach-only control that:
 *
 *   1. Renders a tinted StatusPill showing the coach's narrative_goal for this
 *      player — OR, when no intent row exists, an HONEST "No intent" cold-start
 *      chip (neutral, dashed). We NEVER synthesize a "set" state from a null row.
 *   2. On click, opens a Fairway Sheet (overlays/Sheet) to AUTHOR the intent:
 *      narrative posture (RadioGroup), alert sensitivity (RadioGroup), highlight
 *      categories (multi Combobox), and free-text notes (TextArea).
 *   3. Persists via setIntent(input) from '@/app/golf/actions/v3/intent',
 *      VERBATIM — checking `.ok` (the v3 intent contract), NOT `.success`.
 *
 * DATA HONESTY (matches legacy): `current` is the real DB row for this
 * (coach, player) pair or `null`. A null row renders the cold-start chip; the
 * Sheet falls back to develop / balanced defaults in LOCAL form state only —
 * nothing is persisted until the coach presses Save. The write is single,
 * scoped, idempotent (the action upserts on (coach_id, player_id)) — never a
 * delete-then-reinsert, never auto-fired.
 *
 * The pill maps the lib's NarrativeGoal onto the LOCKED Fairway palette
 * (green = success/structure; amber = warning; rose = danger). Color is never
 * the only channel — the goal LABEL always rides alongside the dot.
 *
 * PRESENTATION-ONLY: imports the intent action + types verbatim by exact path;
 * NEW file, modifies nothing legacy. Renders inside a `.fairway-ds` scope.
 * ========================================================================== */

import * as React from 'react';
import { Sheet } from '@/components/fairway/overlays/Sheet';
import { StatusPill, type StatusPillProps } from '@/components/fairway/controls/status-pill';
import { Button } from '@/components/fairway/controls/button';
import { FormField } from '@/components/fairway/forms/FormField';
import { RadioGroup } from '@/components/fairway/forms/RadioGroup';
import { Combobox } from '@/components/fairway/forms/Combobox';
import { TextArea } from '@/components/fairway/forms/Input';
import { InlineNotice } from '@/components/fairway/feedback/InlineNotice';
import { fairwayToast } from '@/components/fairway/feedback/ToastStack';
import { cn } from '@/lib/utils';
import { setIntent } from '@/app/golf/actions/v3/intent';
import {
  NARRATIVE_GOAL_PRESENTATION,
  DEFAULT_NARRATIVE_GOAL,
  DEFAULT_ALERT_POSTURE,
  type NarrativeGoal,
  type AlertPosture,
  type CoachPlayerIntent,
} from '@/lib/coachhelm/v3/intent/types';

/* ---------------------------------------------------------------------------
 * Vocabulary — the authoring options. Narrative + posture come straight from
 * the lib types; highlight categories use the canonical FocusAreaCategory set
 * (the action accepts a free string[], so we keep the list self-contained).
 * ------------------------------------------------------------------------- */

/** Stable display order for the narrative-goal radios (matches legacy). */
const NARRATIVE_ORDER: NarrativeGoal[] = [
  'bubble',
  'maintain',
  'develop',
  'breakout',
  'rehabilitate',
];

/**
 * NarrativeGoal → Fairway StatusPill tone. Honest within the LOCKED palette
 * (green = success/structure; amber = warning; rose/red = danger only):
 *   maintain      → success  (on track — green)
 *   breakout      → accent   (the standout positive — green-family structure)
 *   develop       → warning  (work in progress — amber)
 *   bubble        → danger   (roster spot at risk — red is legitimate here)
 *   rehabilitate  → info     (recovering — neutral info)
 */
const NARRATIVE_TONE: Record<NarrativeGoal, NonNullable<StatusPillProps['tone']>> = {
  maintain: 'success',
  breakout: 'accent',
  develop: 'warning',
  bubble: 'danger',
  rehabilitate: 'info',
};

/** Short human helper line per narrative goal, shown under each radio. */
const NARRATIVE_HELPER: Record<NarrativeGoal, string> = {
  bubble: 'On the roster bubble — every round counts.',
  maintain: 'Holding form — protect what is working.',
  develop: 'Building — measurable growth is the goal.',
  breakout: 'Pushing for a leap — surface the upside.',
  rehabilitate: 'Coming back — rebuilding after a setback.',
};

/** Alert-posture options, mirroring the legacy drawer copy verbatim. */
const POSTURE_OPTIONS: Array<{ value: AlertPosture; label: string; description: string }> = [
  { value: 'aggressive', label: 'Aggressive', description: 'Surface more (0.85× confidence threshold).' },
  { value: 'balanced', label: 'Balanced', description: 'Default sensitivity (1.0×).' },
  { value: 'conservative', label: 'Conservative', description: 'Surface less (1.15× threshold).' },
  { value: 'silent', label: 'Silent', description: 'Never surface insights for this player.' },
];

/** Canonical highlight-category vocabulary (FocusAreaCategory family). */
const HIGHLIGHT_CATEGORY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'ball_striking', label: 'Ball Striking' },
  { value: 'short_game', label: 'Short Game' },
  { value: 'putting', label: 'Putting' },
  { value: 'course_management', label: 'Course Management' },
  { value: 'mental_game', label: 'Mental Game' },
  { value: 'tournament_performance', label: 'Tournament Performance' },
];

/* ---------------------------------------------------------------------------
 * Props
 * ------------------------------------------------------------------------- */

export interface FairwayIntentControlProps {
  /** The player this intent belongs to. */
  playerId: string;
  /** Display name for the player (drawer header + a11y labels). */
  playerName: string;
  /**
   * The coach's existing intent row for this player, or `null` when unset.
   * `null` → the honest "No intent" cold-start chip (never synthesized).
   */
  current: CoachPlayerIntent | null;
  /** Pill size. Default `md`. */
  size?: 'sm' | 'md';
  /**
   * Optional callback fired AFTER a successful save (e.g. router.refresh()).
   * The control performs the real write either way; this is just a hook for
   * the page composer to re-pull server data.
   */
  onSaved?: () => void;
  className?: string;
}

/* ---------------------------------------------------------------------------
 * FairwayIntentControl
 * ------------------------------------------------------------------------- */

export function FairwayIntentControl({
  playerId,
  playerName,
  current,
  size = 'md',
  onSaved,
  className,
}: FairwayIntentControlProps) {
  const [open, setOpen] = React.useState(false);

  const goal = current?.narrative_goal ?? null;
  const cfg = goal ? NARRATIVE_GOAL_PRESENTATION[goal] : null;
  const pillTone: NonNullable<StatusPillProps['tone']> = goal
    ? NARRATIVE_TONE[goal]
    : 'neutral';

  const triggerLabel = current
    ? `Edit intent for ${playerName} (currently ${cfg?.label ?? goal})`
    : `Set intent for ${playerName}`;

  return (
    <>
      {/*
        The pill IS the trigger. StatusPill is a non-interactive <span>, so we
        wrap it in a real, focusable, accessible button — keeping the warm
        StatusPill chrome while honoring the §7.x interactive-state contract.
      */}
      {/*
        Intentional raw <button>: the trigger must wrap the warm StatusPill
        chrome (a non-interactive <span>) while owning the full §7.1 interactive
        contract — hover lift, focus-visible ring, reduced-motion. Routing
        through <Button> would impose pill-CTA padding/typography and break the
        status-pill visual. The same exception is taken by InlineNotice + the
        Chip remove button in this design system.
      */}
      {/* eslint-disable-next-line helm/no-raw-button */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={triggerLabel}
        data-slot="fw-intent-trigger"
        data-intent={goal ?? 'none'}
        className={cn(
          'group inline-flex max-w-full items-center rounded-full align-middle',
          'outline-none transition-[transform,box-shadow] [transition-duration:var(--fw-dur-fast)]',
          'focus-visible:ring-2 focus-visible:ring-accent-500/70 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
          'hover:-translate-y-px active:translate-y-0 motion-reduce:transform-none',
          className,
        )}
      >
        {goal ? (
          <StatusPill
            tone={pillTone}
            size={size}
            className="cursor-pointer transition-shadow group-hover:shadow-soft"
          >
            {cfg?.label ?? goal}
          </StatusPill>
        ) : (
          // Honest cold-start chip — dashed, muted, dotless. Reads as "unset",
          // never a fabricated goal.
          <span
            data-slot="fw-intent-coldstart"
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border border-dashed border-border-strong',
              'bg-surface-sunken font-fw-sans font-medium text-text-tertiary whitespace-nowrap',
              'transition-colors group-hover:border-accent-300 group-hover:text-text-secondary',
              size === 'md' ? 'h-6 px-2.5 text-caption' : 'h-5 px-2 text-eyebrow',
            )}
          >
            <span aria-hidden="true" className="text-[1.1em] leading-none">
              +
            </span>
            No intent
          </span>
        )}
      </button>

      {/*
        Keyed on `open` so the Sheet's local form state re-initializes from the
        latest `current` row every time the coach reopens it — the form never
        drifts from the server value, and a dismissed draft is discarded.
      */}
      <IntentSheet
        key={open ? 'open' : 'closed'}
        open={open}
        onOpenChange={setOpen}
        playerId={playerId}
        playerName={playerName}
        current={current}
        onSaved={onSaved}
      />
    </>
  );
}

/* ---------------------------------------------------------------------------
 * IntentSheet — the authoring drawer (Fairway Sheet). Re-mounts its form state
 * each time it opens so it always reflects the latest `current` row (or the
 * develop/balanced cold-start defaults). The write is a single setIntent call.
 * ------------------------------------------------------------------------- */

function IntentSheet({
  open,
  onOpenChange,
  playerId,
  playerName,
  current,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  playerId: string;
  playerName: string;
  current: CoachPlayerIntent | null;
  onSaved?: () => void;
}) {
  // Keyed remount (below) guarantees these initialize fresh per open, so the
  // form never drifts from the latest server row.
  const [narrativeGoal, setNarrativeGoal] = React.useState<NarrativeGoal>(
    current?.narrative_goal ?? DEFAULT_NARRATIVE_GOAL,
  );
  const [alertPosture, setAlertPosture] = React.useState<AlertPosture>(
    current?.alert_posture ?? DEFAULT_ALERT_POSTURE,
  );
  const [highlights, setHighlights] = React.useState<string[]>(
    current?.highlight_categories ?? [],
  );
  const [notes, setNotes] = React.useState<string>(current?.notes ?? '');
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleSave() {
    setError(null);
    setSaving(true);
    try {
      // setIntent returns { ok, error? } — check .ok, NOT .success.
      const result = await setIntent({
        player_id: playerId,
        narrative_goal: narrativeGoal,
        alert_posture: alertPosture,
        highlight_categories: highlights,
        notes: notes.trim() === '' ? null : notes.trim(),
      });
      if (!result.ok) {
        const message = result.error ?? 'Could not save intent';
        setError(message);
        fairwayToast.error(message);
        return;
      }
      fairwayToast.success(
        current ? `Intent updated for ${playerName}` : `Intent set for ${playerName}`,
      );
      onOpenChange(false);
      onSaved?.();
    } catch {
      const message = 'Could not save intent';
      setError(message);
      fairwayToast.error(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        // Never persist on dismiss — closing is a pure no-op for the data.
        if (!saving) onOpenChange(next);
      }}
      side="right"
      title="Set intent"
      description={
        <>
          <span className="font-medium text-text-primary">{playerName}</span>
          {' · '}Invisible to the player.
        </>
      }
    >
      <Sheet.Body className="space-y-7">
        {/* Narrative goal */}
        <FormField
          label="Narrative goal"
          help="The story this season — drives how CoachHelm frames this player."
        >
          <RadioGroup
            value={narrativeGoal}
            onValueChange={(v) => setNarrativeGoal(v as NarrativeGoal)}
            options={NARRATIVE_ORDER.map((g) => ({
              value: g,
              label: NARRATIVE_GOAL_PRESENTATION[g].label,
              description: NARRATIVE_HELPER[g],
            }))}
          />
        </FormField>

        {/* Alert posture */}
        <FormField
          label="Alert sensitivity"
          help="How aggressively CoachHelm surfaces insights for this player."
        >
          <RadioGroup
            value={alertPosture}
            onValueChange={(v) => setAlertPosture(v as AlertPosture)}
            options={POSTURE_OPTIONS.map((p) => ({
              value: p.value,
              label: p.label,
              description: p.description,
            }))}
          />
        </FormField>

        {/* Highlight categories */}
        <FormField
          label="Highlight categories"
          showOptional
          help="Areas to prioritise when surfacing this player's signals."
        >
          <Combobox
            multiple
            options={HIGHLIGHT_CATEGORY_OPTIONS}
            value={highlights}
            onValueChange={(v) => setHighlights(v)}
            placeholder="Add a category…"
            emptyMessage="No categories match"
          />
        </FormField>

        {/* Notes */}
        <FormField label="Notes" showOptional>
          <TextArea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="What's the story this season — e.g. 'rebuilding stroke after injury'."
          />
        </FormField>

        {error ? (
          <InlineNotice tone="danger" title="Couldn't save intent">
            {error}
          </InlineNotice>
        ) : null}
      </Sheet.Body>

      <Sheet.Footer>
        <Button
          variant="ghost"
          onClick={() => onOpenChange(false)}
          disabled={saving}
        >
          Cancel
        </Button>
        <Button variant="primary" busy={saving} onClick={handleSave}>
          {current ? 'Save changes' : 'Set intent'}
        </Button>
      </Sheet.Footer>
    </Sheet>
  );
}
