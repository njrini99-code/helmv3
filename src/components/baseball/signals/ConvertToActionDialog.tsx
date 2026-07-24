'use client';

// =============================================================================
// src/components/baseball/signals/ConvertToActionDialog.tsx
//
// Packet: signal-inbox — the convert-to-ACTION surface (V9 Action Conversion
// Map). Turns a source-backed signal into an assignable, reviewable action that
// flows to the timeline + Decision Room. Built on the Fairway `<ModalShell>` +
// form kit — no bespoke Radix Dialog wiring. THE WAR ROOM lane. NO golf labels.
//
// HONESTY: the dialog carries the signal's source + confidence forward and
// shows them in the header so the coach converts WITH the evidence in view, not
// blind. A sample-too-small signal shows its caveat here too (InlineNotice —
// never a yellow box).
// =============================================================================

import * as React from 'react';
import {
  ModalShell,
  Button,
  InlineNotice,
  Form,
  FormField,
  Input,
  TextArea,
  Select,
} from '@/components/fairway';
import { InkBadge, Eyebrow, PaperCard, StatReadout } from '@/components/baseball/living-annual';
import { IconBolt } from '@/components/icons';
import type { SignalInboxRow } from '@/lib/baseball/read-models/signal-inbox';
import type {
  BaseballActionType,
  BaseballSignalVisibility,
} from '@/lib/types/baseball-signals';
import { CONVERTIBLE_ACTION_TYPES, getActionTypeLabel } from './signal-presentation';

export interface ConvertOption {
  actionType: BaseballActionType;
  title: string;
  detail?: string | null;
  assigneeCoachId?: string | null;
  assigneePlayerId?: string | null;
  dueDate?: string | null;
  visibility?: BaseballSignalVisibility;
}

export interface RosterOption {
  id: string;
  name: string;
}

export interface StaffOption {
  id: string;
  name: string;
}

export interface ConvertToActionDialogProps {
  signal: SignalInboxRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roster: RosterOption[];
  staff: StaffOption[];
  pending?: boolean;
  onConvert: (signalId: string, options: ConvertOption[]) => void;
}

/** Sentinel for the "no selection" state — Base UI Select needs a real value. */
const UNASSIGNED = '__unassigned__';

const VISIBILITY_OPTIONS = [
  { value: 'staff_only', label: 'Staff only' },
  { value: 'player_only', label: 'Player + staff' },
  { value: 'team', label: 'Whole team' },
];

export function ConvertToActionDialog({
  signal,
  open,
  onOpenChange,
  roster,
  staff,
  pending = false,
  onConvert,
}: ConvertToActionDialogProps) {
  // Seed the form from the signal's recommended action whenever a new signal
  // opens the dialog.
  const seededType: BaseballActionType = React.useMemo(() => {
    const rec = signal?.recommendedActionType;
    if (rec && rec !== 'none') return rec as BaseballActionType;
    return 'player_task';
  }, [signal?.recommendedActionType]);

  const [actionType, setActionType] = React.useState<BaseballActionType>(seededType);
  const [title, setTitle] = React.useState('');
  const [detail, setDetail] = React.useState('');
  const [assigneePlayerId, setAssigneePlayerId] = React.useState<string>('');
  const [assigneeCoachId, setAssigneeCoachId] = React.useState<string>('');
  const [dueDate, setDueDate] = React.useState('');
  const [visibility, setVisibility] = React.useState<BaseballSignalVisibility>('staff_only');

  // Re-seed when the dialog opens for a new signal.
  React.useEffect(() => {
    if (open && signal) {
      setActionType(seededType);
      setTitle(signal.recommendedActionLabel ?? signal.title);
      setDetail(signal.whyItMatters ?? '');
      setAssigneePlayerId(signal.playerId ?? '');
      setAssigneeCoachId('');
      setDueDate('');
      setVisibility(signal.visibility);
    }
  }, [open, signal, seededType]);

  const meta = CONVERTIBLE_ACTION_TYPES.find((t) => t.value === actionType);
  const playerScoped = meta?.playerScoped ?? false;

  const canSubmit = title.trim().length > 0 && !pending;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!signal || !canSubmit) return;
    const option: ConvertOption = {
      actionType,
      title: title.trim(),
      detail: detail.trim() || null,
      assigneePlayerId: playerScoped ? assigneePlayerId || signal.playerId || null : null,
      assigneeCoachId: assigneeCoachId || null,
      dueDate: dueDate || null,
      visibility,
    };
    onConvert(signal.id, [option]);
  }

  if (!signal) return null;

  return (
    <ModalShell
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title="Convert to action"
      description="Create an assignable, reviewable action from this signal. It will appear in the action queue and on the player's timeline when player-visible."
    >
      <ModalShell.Body>
        <Form id="convert-to-action-form" spacing="cozy" onSubmit={handleSubmit}>
          {/* Signal context (evidence in view while converting) */}
          <PaperCard className="p-3.5" grain={false}>
            <Eyebrow ink="pursuit">Converting</Eyebrow>
            <p className="mt-1 font-annual text-body-sm font-semibold leading-snug text-text-primary">
              {signal.title}
            </p>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 font-annual text-body-sm text-text-tertiary">
              <span className="inline-flex items-baseline gap-1">
                Confidence
                <StatReadout
                  value={signal.confidence === null ? '—' : Math.round(signal.confidence * 100)}
                  suffix={signal.confidence === null ? undefined : '%'}
                  className="text-body-sm text-text-secondary"
                  ariaLabel="Confidence"
                />
              </span>
              <span aria-hidden className="text-text-tertiary">
                ·
              </span>
              <span>
                {signal.sourceRefs.length} source{signal.sourceRefs.length === 1 ? '' : 's'}
              </span>
            </p>
            {signal.sampleTooSmall && (
              <InlineNotice tone="warning" className="mt-2.5">
                Sample too small — convert as a watch item, not a firm directive.
              </InlineNotice>
            )}
          </PaperCard>

          <FormField label="Action type">
            <Select
              value={actionType}
              onValueChange={(v) => v && setActionType(v as BaseballActionType)}
              options={CONVERTIBLE_ACTION_TYPES.map((t) => ({ value: t.value, label: t.label }))}
            />
          </FormField>

          <FormField label="Title" required>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={getActionTypeLabel(actionType)}
            />
          </FormField>

          <FormField label="Detail" showOptional>
            <TextArea value={detail} onChange={(e) => setDetail(e.target.value)} rows={2} />
          </FormField>

          <div className={playerScoped ? 'grid grid-cols-1 gap-5 sm:grid-cols-2' : ''}>
            {playerScoped && (
              <FormField label="Assign to player" showOptional>
                <Select
                  value={assigneePlayerId || UNASSIGNED}
                  onValueChange={(v) => setAssigneePlayerId(!v || v === UNASSIGNED ? '' : v)}
                  placeholder="— None —"
                  options={[
                    { value: UNASSIGNED, label: '— None —' },
                    ...roster.map((p) => ({ value: p.id, label: p.name })),
                  ]}
                />
              </FormField>
            )}
            <FormField label="Owner (staff)" showOptional>
              <Select
                value={assigneeCoachId || UNASSIGNED}
                onValueChange={(v) => setAssigneeCoachId(!v || v === UNASSIGNED ? '' : v)}
                placeholder="— Me —"
                options={[
                  { value: UNASSIGNED, label: '— Me —' },
                  ...staff.map((s) => ({ value: s.id, label: s.name })),
                ]}
              />
            </FormField>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <FormField label="Due date" showOptional>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </FormField>
            <FormField label="Visibility">
              <Select
                value={visibility}
                onValueChange={(v) => v && setVisibility(v as BaseballSignalVisibility)}
                options={VISIBILITY_OPTIONS}
              />
            </FormField>
          </div>

          {visibility !== 'staff_only' && (
            <div className="flex items-center gap-2 rounded-fw-sm bg-[color:var(--grade-plus)]/[0.06] px-2.5 py-2">
              <InkBadge label="Player-visible" tone="team" />
              <p className="font-annual text-body-sm leading-relaxed text-text-secondary">
                This action will appear on the player&apos;s timeline.
              </p>
            </div>
          )}
        </Form>
      </ModalShell.Body>
      <ModalShell.Footer>
        <Button
          type="button"
          variant="secondary"
          onClick={() => onOpenChange(false)}
          disabled={pending}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          form="convert-to-action-form"
          variant="primary"
          busy={pending}
          disabled={!canSubmit}
          leftIcon={<IconBolt size={14} />}
        >
          Create action
        </Button>
      </ModalShell.Footer>
    </ModalShell>
  );
}
