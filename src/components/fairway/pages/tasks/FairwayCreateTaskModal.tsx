'use client';

/**
 * ============================================================================
 * Fairway · Tasks · FairwayCreateTaskModal  (ADDITIVE · FLAG-GATED · COACH)
 * ----------------------------------------------------------------------------
 * The Fairway re-skin of the legacy CreateTaskModal (coach create + assign). A
 * presentation rebuild on the Fairway ModalShell + form primitives; the writes
 * are REUSED VERBATIM via the unchanged task server actions (same import paths):
 *
 *   • createTask(teamId, title, description?, dueDate?, priority?, playerIds?)
 *       — the single create-and-assign path (also notifies assignees).
 *   • setTaskReminder(taskId, reminderAt) — coach-only; called ONLY when the
 *       coach set an optional reminder, so the reminder data point is preserved
 *       WITHOUT reimplementing any write.
 *
 * No destructive writes — both actions upsert/insert; nothing is deleted. Toasts
 * use fairwayToast only. Honest copy + visible labels (no placeholder-only).
 * ========================================================================== */

import { useState } from 'react';

import { cn } from '@/lib/utils';
import {
  ModalShell,
  DiscardChangesModal,
  Button,
  InlineNotice,
  Form,
  FormField,
  Input,
  TextArea,
  RadioGroup,
  Checkbox,
  Select,
  fairwayToast,
} from '@/components/fairway';
import { IconCheck } from '@/components/icons';
import { createTask, createRecurringTask, setTaskReminder } from '@/app/golf/actions/tasks';
import type { FairwayTaskPlayer } from './FairwayTasks';

export interface FairwayCreateTaskModalProps {
  open: boolean;
  onClose: () => void;
  onTaskCreated: () => void | Promise<void>;
  teamId: string;
  players: FairwayTaskPlayer[];
  /**
   * P292 — true when the roster fetch FAILED (vs a genuinely empty roster). Lets
   * the modal show an honest "couldn't load the roster" notice instead of the
   * misleading "No players on the roster yet", and avoids a silent 0-player create.
   */
  playersError?: boolean;
  /**
   * Categories already in use on this team's tasks. A task created here used to
   * land with category = NULL — matching NO category chip and silently
   * disappearing whenever a coach filtered — because only template-instantiated
   * tasks ever carried one. Offering the team's existing set (rather than a
   * hardcoded taxonomy) keeps this consistent with the filter bar, which is
   * likewise derived from real data.
   */
  categories?: string[];
}

type AssignMode = 'all' | 'specific';

/**
 * P292 — pure error-prevention guard for the assignee selection. Returns an
 * honest blocking message when the create would assign the task to nobody, and
 * distinguishes a FAILED roster fetch from a genuinely empty roster. Returns
 * null when the selection is valid. Exported for deterministic unit tests.
 */
export function assignGuardMessage(args: {
  assignMode: AssignMode;
  playerCount: number;
  selectedCount: number;
  playersError: boolean;
}): string | null {
  const { assignMode, playerCount, selectedCount, playersError } = args;
  if (assignMode === 'specific') {
    return selectedCount === 0
      ? 'Select at least one player, or assign to everyone.'
      : null;
  }
  // assignMode === 'all'
  if (playerCount === 0) {
    return playersError
      ? "We couldn't load your roster, so this task can't be assigned yet. Try again in a moment."
      : 'There are no players on the roster yet, so there is no one to assign this task to. Add players first.';
  }
  return null;
}

/**
 * W4 — pure "has the coach typed/changed anything?" check driving the
 * unsaved-changes guard (Escape / backdrop-click / X / Cancel show a
 * "Discard this task?" confirm instead of silently closing whenever this is
 * true). Exported for deterministic unit tests, same pattern as
 * `assignGuardMessage` above.
 */
export function isTaskFormDirty(fields: {
  title: string;
  description: string;
  dueDate: string;
  reminderAt: string;
  category: string;
  repeatFreq: string;
  assignMode: AssignMode;
  selectedPlayers: string[];
}): boolean {
  return (
    fields.title.trim() !== '' ||
    fields.description.trim() !== '' ||
    fields.dueDate !== '' ||
    fields.reminderAt !== '' ||
    fields.category !== '' ||
    fields.repeatFreq !== '' ||
    fields.assignMode !== 'all' ||
    fields.selectedPlayers.length > 0
  );
}

export function FairwayCreateTaskModal({
  open,
  onClose,
  onTaskCreated,
  teamId,
  players,
  playersError = false,
  categories = [],
}: FairwayCreateTaskModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [reminderAt, setReminderAt] = useState('');
  const [category, setCategory] = useState('');
  // #1238 — repeat. '' means a one-off task (the default), so the whole
  // recurring path stays opt-in and every existing flow is untouched.
  const [repeatFreq, setRepeatFreq] = useState('');
  const [repeatUntil, setRepeatUntil] = useState('');
  const [assignMode, setAssignMode] = useState<AssignMode>('all');
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // #48 — the empty-title guard gets its OWN field-anchored error (rendered by
  // FormField's inline error row, same styling as every other field error in
  // the app), separate from `error` (the top InlineNotice for assignment-guard
  // / server createTask failures). The title Input intentionally carries no
  // native `required` attribute: Base UI's <Form> validates every registered
  // Field against the underlying element's native constraint validity BEFORE
  // calling our own onSubmit — with `required` present, an Enter-key submit
  // on an empty title tripped that native gate first, so `handleSubmit` (and
  // its "Give the task a title." message) never ran, and the coach saw either
  // nothing or the browser's own unstyled validation bubble instead of the
  // app's inline error. The plain JS check below (title.trim()) now owns this
  // validation on every submit path — the button click AND the Enter key.
  const [titleError, setTitleError] = useState<string | null>(null);
  // W4 audit fix — Escape / backdrop-click / the X used to discard whatever
  // the coach had typed with no warning. `confirmDiscardOpen` gates the close
  // path through a "Discard this task?" confirm whenever the form is dirty; a
  // clean (untouched) form still closes immediately.
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);

  const isDirty = isTaskFormDirty({ title, description, dueDate, reminderAt, category, repeatFreq, assignMode, selectedPlayers });

  function reset() {
    setTitle('');
    setDescription('');
    setDueDate('');
    setCategory('');
    setRepeatFreq('');
    setRepeatUntil('');
    setReminderAt('');
    setAssignMode('all');
    setSelectedPlayers([]);
    setError(null);
    setTitleError(null);
    setConfirmDiscardOpen(false);
  }

  /** Actually closes — used once a close is confirmed (or the form was never dirty). */
  function handleClose() {
    if (loading) return;
    reset();
    onClose();
  }

  /** Every close attempt (Escape, backdrop click, the X, and the footer Cancel
   *  button all funnel through ModalShell's onOpenChange to here) — gated by
   *  the dirty check above. */
  function requestClose() {
    if (loading) return;
    if (isDirty) {
      setConfirmDiscardOpen(true);
      return;
    }
    handleClose();
  }

  function togglePlayer(id: string) {
    setSelectedPlayers((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  }

  // `e` is optional — ModalShell.Footer's "Create task" button lives outside
  // the <form> element (see the render below), so it invokes this directly
  // via onClick with no event, the same dual-wire the other Fairway
  // Form-in-Body/Footer-outside dialogs use (e.g. FairwayRecruitFormSheet).
  async function handleSubmit(e?: React.FormEvent<HTMLFormElement>) {
    e?.preventDefault();
    if (loading) return;

    if (!title.trim()) {
      // #48 — field-anchored inline error (FormField's own error row), not
      // the top InlineNotice: the title field is where the coach's eye
      // already is, so the message shows exactly where the problem is.
      setTitleError('Give the task a title.');
      return;
    }
    setTitleError(null);
    // P292 — single honest assignee guard: blocks an empty "specific" selection
    // AND an "all team members" create when the roster is empty (which would
    // assign the task to nobody), distinguishing a failed roster fetch from a
    // genuinely empty roster.
    const guard = assignGuardMessage({
      assignMode,
      playerCount: players.length,
      selectedCount: selectedPlayers.length,
      playersError,
    });
    if (guard) {
      setError(guard);
      return;
    }

    // A series is anchored on its first occurrence, so a repeat without a due
    // date has nothing to repeat FROM. Block it here with a plain sentence
    // rather than letting the server reject it after a round trip.
    if (repeatFreq && !dueDate) {
      setError('Pick a due date — a repeating task needs a first date to repeat from.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const assignIds = assignMode === 'all' ? players.map((p) => p.id) : selectedPlayers;

      // #1238 — a repeating task goes down the series path instead. It needs a
      // due date to anchor the series, which the guard above already required
      // when a repeat is chosen.
      if (repeatFreq) {
        const seriesResult = await createRecurringTask({
          teamId,
          title: title.trim(),
          description: description.trim() || undefined,
          startDate: dueDate,
          recurrence: {
            frequency: repeatFreq as 'daily' | 'weekly' | 'biweekly' | 'monthly',
            ...(repeatUntil ? { until: repeatUntil } : {}),
          },
          category: category || undefined,
          assignToPlayerIds: assignIds,
          // Reuse the same reminder the one-off path offers, applied to each
          // occurrence's own due date rather than shared across the series.
          ...(reminderAt
            ? {
                reminderTime: reminderAt.slice(11, 16),
                timezoneOffset: new Date().getTimezoneOffset(),
              }
            : {}),
        });

        if (!seriesResult.success || !seriesResult.data) {
          setError(seriesResult.error ?? 'Failed to create the recurring task.');
          setLoading(false);
          return;
        }

        fairwayToast.success(
          `Created ${seriesResult.data.occurrenceCount} ${
            seriesResult.data.occurrenceCount === 1 ? 'task' : 'tasks'
          } and assigned them.`,
        );
        reset();
        await onTaskCreated();
        onClose();
        return;
      }

      const result = await createTask(
        teamId,
        title.trim(),
        description.trim() || undefined,
        dueDate || undefined,
        undefined, // priority — defaults to 'normal' (legacy parity)
        assignIds,
        category || undefined,
      );

      if (!result.success || !result.data) {
        setError(result.error ?? 'Failed to create task.');
        setLoading(false);
        return;
      }

      // Optional reminder — reuse the coach-only setTaskReminder action (no
      // reimplemented write). Reminder requires a due date upstream; we honor a
      // bare datetime if the coach set one.
      if (reminderAt) {
        try {
          await setTaskReminder(result.data.taskId, new Date(reminderAt).toISOString());
        } catch {
          // Non-fatal: the task was created; the reminder simply didn't attach.
          fairwayToast.warning('Task created, but the reminder could not be set.');
        }
      }

      fairwayToast.success('Task created and assigned.');
      reset();
      await onTaskCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create task.');
      setLoading(false);
    }
  }

  return (
    <>
      <ModalShell
        open={open}
        onOpenChange={(next) => {
          if (!next) requestClose();
        }}
        size="lg"
        title="Create a task"
        description="Assign work to the team and track who has completed it."
      >
        {/*
         * W1 audit fix — the form used to sit directly under ModalShell with no
         * scrolling region, so at short viewports (390×844 and similar) the
         * panel's own `max-h-[calc(100dvh-4rem)] overflow-hidden` clipped the
         * footer actions off-screen with no way to reach Cancel/Create task.
         * ModalShell.Body (flex-1 overflow-y-auto) now owns the scroll and
         * ModalShell.Footer sits OUTSIDE it as a pinned sibling — the same
         * Body-wraps-Form / Footer-outside composition FairwayRecruitFormSheet
         * uses, so the footer stays reachable no matter how tall the fields get.
         */}
        <ModalShell.Body>
          <Form spacing="cozy" onSubmit={handleSubmit}>
            {error ? (
              <InlineNotice tone="danger" title="Couldn't create the task">
                {error}
              </InlineNotice>
            ) : null}

            <FormField label="Task title" required error={titleError}>
              <Input
                name="title"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  // Clear the moment the coach starts fixing it — the same
                  // "error disappears on first correcting keystroke" contract
                  // every other Fairway field error follows.
                  if (titleError) setTitleError(null);
                }}
                placeholder="e.g. Complete shot-tracking drill"
                // #48 — no native `required`: Base UI's <Form> validates every
                // registered Field's underlying native constraint validity
                // BEFORE invoking our own onSubmit, so a native-required,
                // empty title short-circuited handleSubmit on an Enter-key
                // submit — the coach saw the browser's own generic validation
                // state instead of this field's app-styled error. The plain
                // `!title.trim()` check in handleSubmit is the single source
                // of truth for this validation now, on every submit path.
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
              />
            </FormField>

            <FormField label="Description" showOptional>
              <TextArea
                name="description"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Add more detail about this task…"
              />
            </FormField>

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <FormField label="Due date" showOptional>
                <Input
                  type="date"
                  name="dueDate"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </FormField>
              <FormField label="Reminder" showOptional help="When the team gets a nudge.">
                <Input
                  type="datetime-local"
                  name="reminderAt"
                  value={reminderAt}
                  onChange={(e) => setReminderAt(e.target.value)}
                />
              </FormField>
            </div>

            {/* Only offered once the team actually has categories to pick from —
                inventing a taxonomy here would not match the filter bar, which
                is derived from real task data. */}
            {categories.length > 0 && (
              <FormField
                label="Category"
                showOptional
                help="Groups this task under the category filters."
              >
                <Select
                  name="category"
                  value={category}
                  onValueChange={(v) => setCategory((v as string) ?? '')}
                  options={[
                    { label: 'No category', value: '' },
                    ...categories.map((cat) => ({ label: cat, value: cat })),
                  ]}
                />
              </FormField>
            )}

            {/* #1238 — repeat. Defaults to "Does not repeat", so nothing about
                the one-off flow changes unless a coach opts in. */}
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <FormField
                label="Repeat"
                showOptional
                help={repeatFreq ? 'Creates one task per occurrence.' : undefined}
              >
                <Select
                  name="repeatFreq"
                  value={repeatFreq}
                  onValueChange={(v) => setRepeatFreq((v as string) ?? '')}
                  options={[
                    { label: 'Does not repeat', value: '' },
                    { label: 'Daily', value: 'daily' },
                    { label: 'Weekly', value: 'weekly' },
                    { label: 'Every 2 weeks', value: 'biweekly' },
                    { label: 'Monthly', value: 'monthly' },
                  ]}
                />
              </FormField>
              {repeatFreq && (
                <FormField
                  label="Repeat until"
                  showOptional
                  help="Leave blank for the next 52 occurrences."
                >
                  <Input
                    type="date"
                    name="repeatUntil"
                    value={repeatUntil}
                    onChange={(e) => setRepeatUntil(e.target.value)}
                  />
                </FormField>
              )}
            </div>

            {/* Assignment */}
            <FormField label="Assign to">
              <RadioGroup
                value={assignMode}
                onValueChange={(v) => {
                  const next = v as AssignMode;
                  setAssignMode(next);
                  if (next === 'all') setSelectedPlayers([]);
                }}
                options={[
                  {
                    value: 'all',
                    label: 'All team members',
                    description: playersError
                      ? "Couldn't load the roster"
                      : `${players.length} ${players.length === 1 ? 'player' : 'players'}`,
                  },
                  {
                    value: 'specific',
                    label: 'Specific players',
                    description:
                      selectedPlayers.length > 0
                        ? `${selectedPlayers.length} selected`
                        : 'Choose from the roster below',
                  },
                ]}
              />
            </FormField>

            {assignMode === 'specific' &&
              (players.length === 0 ? (
                playersError ? (
                  // P292 — the roster fetch failed; do not pretend the team is empty.
                  <InlineNotice tone="danger" title="Couldn't load the roster">
                    We couldn't load your players right now. Close this and try again in a moment.
                  </InlineNotice>
                ) : (
                  <InlineNotice tone="info" title="No players on the roster yet">
                    Add players to your team first, then you can assign tasks to them.
                  </InlineNotice>
                )
              ) : (
                <div className="grid max-h-56 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
                  {players.map((p) => {
                    const isSel = selectedPlayers.includes(p.id);
                    return (
                      <label
                        key={p.id}
                        className={cn(
                          'flex cursor-pointer items-center gap-3 rounded-fw-md border px-3.5 py-3 transition-colors',
                          isSel
                            ? 'border-accent-300 bg-accent-50/60'
                            : 'border-border-subtle bg-surface hover:border-border-strong',
                        )}
                      >
                        <Checkbox checked={isSel} onCheckedChange={() => togglePlayer(p.id)} />
                        <span
                          className={cn(
                            'font-fw-sans text-body font-medium',
                            isSel ? 'text-accent-700' : 'text-text-primary',
                          )}
                        >
                          {p.first_name ?? ''} {p.last_name ?? ''}
                        </span>
                      </label>
                    );
                  })}
                </div>
              ))}
          </Form>
        </ModalShell.Body>

        <ModalShell.Footer>
          <Button type="button" variant="secondary" onClick={requestClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            busy={loading}
            leftIcon={<IconCheck size={16} />}
            onClick={() => void handleSubmit()}
          >
            Create task
          </Button>
        </ModalShell.Footer>
      </ModalShell>
      <DiscardChangesModal
        open={confirmDiscardOpen}
        onStay={() => setConfirmDiscardOpen(false)}
        onDiscard={handleClose}
        itemLabel="task"
      />
    </>
  );
}
