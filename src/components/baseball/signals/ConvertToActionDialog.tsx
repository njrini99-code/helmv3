'use client';

// =============================================================================
// src/components/baseball/signals/ConvertToActionDialog.tsx
//
// Packet: signal-inbox — the convert-to-ACTION surface (V9 Action Conversion
// Map). Turns a source-backed signal into an assignable, reviewable action that
// flows to the timeline + Decision Room. Cream/green GolfHelm look (Radix
// Dialog + Card + Button + native selects). NO golf labels.
//
// HONESTY: the dialog carries the signal's source + confidence forward and
// shows them in the header so the coach converts WITH the evidence in view, not
// blind. A sample-too-small signal shows its caveat here too.
// =============================================================================

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { Input, Textarea } from '@/components/ui/input';
import { IconAlertCircle, IconBolt } from '@/components/icons';
import { cn } from '@/lib/utils';
import type { SignalInboxRow } from '@/lib/baseball/read-models/signal-inbox';
import type {
  BaseballActionType,
  BaseballSignalVisibility,
} from '@/lib/types/baseball-signals';
import {
  CONVERTIBLE_ACTION_TYPES,
  getActionTypeLabel,
} from './signal-presentation';

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

  function handleSubmit() {
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-warm-900">Convert to action</DialogTitle>
          <DialogDescription className="text-warm-500">
            Create an assignable, reviewable action from this signal. It will
            appear in the action queue and on the player&apos;s timeline when
            player-visible.
          </DialogDescription>
        </DialogHeader>

        {/* Signal context (evidence in view while converting) */}
        <div className="rounded-xl bg-warm-50 border border-warm-200/70 px-3.5 py-3">
          <p className="text-eyebrow font-semibold uppercase tracking-wide text-warm-500">
            Converting
          </p>
          <p className="mt-1 text-sm font-semibold text-warm-900 leading-snug">
            {signal.title}
          </p>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-warm-500">
            <span>
              Confidence{' '}
              <span className="font-medium text-warm-700 tabular-nums">
                {signal.confidence === null
                  ? '—'
                  : `${Math.round(signal.confidence * 100)}%`}
              </span>
            </span>
            <span aria-hidden className="text-warm-300">
              ·
            </span>
            <span>
              {signal.sourceRefs.length} source
              {signal.sourceRefs.length === 1 ? '' : 's'}
            </span>
          </p>
          {signal.sampleTooSmall && (
            <div className="mt-2.5 flex items-start gap-1.5 rounded-lg bg-amber-50/70 border border-amber-200/60 px-2.5 py-2">
              <IconAlertCircle size={13} className="text-amber-500 mt-0.5 flex-shrink-0" aria-hidden />
              <p className="text-xs leading-relaxed text-amber-800">
                Sample too small — convert as a watch item, not a firm directive.
              </p>
            </div>
          )}
        </div>

        {/* Form */}
        <div className="space-y-3">
          <Select
            label="Action type"
            value={actionType}
            onChange={(v) => setActionType(v as BaseballActionType)}
            options={CONVERTIBLE_ACTION_TYPES.map((t) => ({
              value: t.value,
              label: t.label,
            }))}
          />

          <Input
            label="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={getActionTypeLabel(actionType)}
          />

          <Textarea
            label="Detail (optional)"
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            rows={2}
          />

          <div className={cn('grid gap-3', playerScoped ? 'grid-cols-2' : 'grid-cols-1')}>
            {playerScoped && (
              <Select
                label="Assign to player"
                value={assigneePlayerId}
                onChange={(v) => setAssigneePlayerId(v)}
                placeholder="— None —"
                clearable
                options={roster.map((p) => ({ value: p.id, label: p.name }))}
              />
            )}
            <Select
              label="Owner (staff)"
              value={assigneeCoachId}
              onChange={(v) => setAssigneeCoachId(v)}
              placeholder="— Me —"
              clearable
              options={staff.map((s) => ({ value: s.id, label: s.name }))}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Due date (optional)"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
            <Select
              label="Visibility"
              value={visibility}
              onChange={(v) => setVisibility(v as BaseballSignalVisibility)}
              options={[
                { value: 'staff_only', label: 'Staff only' },
                { value: 'player_only', label: 'Player + staff' },
                { value: 'team', label: 'Whole team' },
              ]}
            />
          </div>

          {visibility !== 'staff_only' && (
            <div className="flex items-center gap-2 rounded-lg bg-primary-50/50 px-2.5 py-2">
              <Badge tone="primary" appearance="soft" size="sm">
                Player-visible
              </Badge>
              <p className="text-xs leading-relaxed text-warm-600">
                This action will appear on the player&apos;s timeline.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={!canSubmit}
            isLoading={pending}
            className="gap-1.5"
          >
            <IconBolt size={14} /> Create action
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
