'use client';

/**
 * ============================================================================
 * Fairway · Tasks · FairwayCreateFromTemplateModal  (ADDITIVE · GATED · COACH)
 * ----------------------------------------------------------------------------
 * The Fairway re-skin of the legacy CreateFromTemplateModal. Presentation only;
 * the write is REUSED VERBATIM via createTaskFromTemplate (same import path):
 *
 *   createTaskFromTemplate(templateId, teamId, playerIds?, customTitle?, customDueDate?)
 *
 * The coach can override the title + due date and pick all-vs-specific players,
 * exactly as the legacy modal did. No destructive writes. fairwayToast only.
 * ========================================================================== */

import { useState } from 'react';

import { cn } from '@/lib/utils';
import {
  ModalShell,
  Button,
  Surface,
  Chip,
  InlineNotice,
  Form,
  FormField,
  Input,
  RadioGroup,
  Checkbox,
  CheckboxGroup,
  fairwayToast,
} from '@/components/fairway';
import { IconCheck } from '@/components/icons';
import { createTaskFromTemplate, type TaskTemplate } from '@/app/golf/actions/tasks';
import type { FairwayTaskPlayer } from './FairwayTasks';

export interface FairwayCreateFromTemplateModalProps {
  open: boolean;
  onClose: () => void;
  onTaskCreated: () => void;
  template: TaskTemplate;
  teamId: string;
  players: FairwayTaskPlayer[];
}

type AssignMode = 'all' | 'specific';

function defaultDueDate(template: TaskTemplate): string {
  if (template.default_due_days) {
    const d = new Date();
    d.setDate(d.getDate() + template.default_due_days);
    return d.toISOString().split('T')[0] ?? '';
  }
  return '';
}

export function FairwayCreateFromTemplateModal({
  open,
  onClose,
  onTaskCreated,
  template,
  teamId,
  players,
}: FairwayCreateFromTemplateModalProps) {
  const [customTitle, setCustomTitle] = useState(template.title);
  const [customDueDate, setCustomDueDate] = useState(() => defaultDueDate(template));
  const [assignMode, setAssignMode] = useState<AssignMode>(
    template.default_assignee_type === 'all_players' ? 'all' : 'specific',
  );
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (loading) return;
    if (assignMode === 'specific' && selectedPlayers.length === 0) {
      fairwayToast.warning('Select at least one player, or assign to everyone.');
      return;
    }
    setLoading(true);
    try {
      const playerIds = assignMode === 'all' ? undefined : selectedPlayers;
      const result = await createTaskFromTemplate(
        template.id,
        teamId,
        playerIds,
        customTitle !== template.title ? customTitle : undefined,
        customDueDate || undefined,
      );
      if (result.success) {
        fairwayToast.success('Task created from template.');
        onTaskCreated();
        onClose();
      } else {
        fairwayToast.error(result.error ?? 'Failed to create task.');
      }
    } catch {
      fairwayToast.error('An error occurred.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <ModalShell
      open={open}
      onOpenChange={(next) => {
        if (!next && !loading) onClose();
      }}
      size="lg"
      title="Create task from template"
      description="Tune the title, due date, and who it goes to before assigning."
    >
      <Form spacing="cozy" onSubmit={handleSubmit} className="px-6 pb-6 pt-2">
        {/* Template summary */}
        <Surface elevation="border" padding="sm" className="bg-surface-sunken">
          <p className="font-fw-sans text-eyebrow font-semibold uppercase tracking-[0.12em] text-text-tertiary">
            Template
          </p>
          <p className="mt-1 font-fw-sans text-body font-medium text-text-primary">{template.title}</p>
          {template.description && (
            <p className="mt-1 font-fw-sans text-body-sm text-text-secondary">{template.description}</p>
          )}
          {template.category && (
            <div className="mt-2">
              <Chip tone="neutral" size="sm">
                {template.category}
              </Chip>
            </div>
          )}
        </Surface>

        <FormField label="Task title">
          <Input value={customTitle} onChange={(e) => setCustomTitle(e.target.value)} placeholder="Task title" />
        </FormField>

        <FormField label="Due date" showOptional>
          <Input type="date" value={customDueDate} onChange={(e) => setCustomDueDate(e.target.value)} />
        </FormField>

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
            /* #1270 — CheckboxGroup, not a bare <div>: an ungrouped Base UI
               Checkbox registers as a field of the enclosing <Form>, and outside
               a Field.Root its validity stays `null`, which Form reads as
               invalid and silently blocks submit. This modal's button IS
               type="submit", so it would have been fully dead here. */
            <CheckboxGroup
              value={selectedPlayers}
              onValueChange={(next) => setSelectedPlayers(next)}
              className="grid max-h-56 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2"
            >
              {players.map((p) => {
                const isSel = selectedPlayers.includes(p.id);
                const playerName =
                  `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || 'Player';
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
                    <Checkbox value={p.id} aria-label={playerName} />
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
            </CheckboxGroup>
          ))}

        <div className="flex items-center justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
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
