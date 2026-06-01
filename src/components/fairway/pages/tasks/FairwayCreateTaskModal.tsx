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
  Button,
  InlineNotice,
  Form,
  FormField,
  Input,
  TextArea,
  RadioGroup,
  Checkbox,
  fairwayToast,
} from '@/components/fairway';
import { IconCheck } from '@/components/icons';
import { createTask, setTaskReminder } from '@/app/golf/actions/tasks';
import type { FairwayTaskPlayer } from './FairwayTasks';

export interface FairwayCreateTaskModalProps {
  open: boolean;
  onClose: () => void;
  onTaskCreated: () => void | Promise<void>;
  teamId: string;
  players: FairwayTaskPlayer[];
}

type AssignMode = 'all' | 'specific';

export function FairwayCreateTaskModal({
  open,
  onClose,
  onTaskCreated,
  teamId,
  players,
}: FairwayCreateTaskModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [reminderAt, setReminderAt] = useState('');
  const [assignMode, setAssignMode] = useState<AssignMode>('all');
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setTitle('');
    setDescription('');
    setDueDate('');
    setReminderAt('');
    setAssignMode('all');
    setSelectedPlayers([]);
    setError(null);
  }

  function handleClose() {
    if (loading) return;
    reset();
    onClose();
  }

  function togglePlayer(id: string) {
    setSelectedPlayers((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (loading) return;

    if (!title.trim()) {
      setError('Give the task a title.');
      return;
    }
    if (assignMode === 'specific' && selectedPlayers.length === 0) {
      setError('Select at least one player, or assign to everyone.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const assignIds = assignMode === 'all' ? players.map((p) => p.id) : selectedPlayers;

      const result = await createTask(
        teamId,
        title.trim(),
        description.trim() || undefined,
        dueDate || undefined,
        undefined, // priority — defaults to 'normal' (legacy parity)
        assignIds,
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
    <ModalShell
      open={open}
      onOpenChange={(next) => {
        if (!next) handleClose();
      }}
      size="lg"
      title="Create a task"
      description="Assign work to the team and track who has completed it."
    >
      <Form spacing="cozy" onSubmit={handleSubmit} className="px-6 pb-6 pt-2">
        {error ? (
          <InlineNotice tone="danger" title="Couldn't create the task">
            {error}
          </InlineNotice>
        ) : null}

        <FormField label="Task title" required>
          <Input
            name="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Complete shot-tracking drill"
            required
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
                description: `${players.length} ${players.length === 1 ? 'player' : 'players'}`,
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
            <InlineNotice tone="info" title="No players on the roster yet">
              Add players to your team first, then you can assign tasks to them.
            </InlineNotice>
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

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={handleClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" busy={loading} leftIcon={<IconCheck size={16} />}>
            Create task
          </Button>
        </div>
      </Form>
    </ModalShell>
  );
}

export default FairwayCreateTaskModal;
