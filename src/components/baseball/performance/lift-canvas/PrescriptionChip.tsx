'use client';

// =============================================================================
// src/components/baseball/performance/lift-canvas/PrescriptionChip.tsx
//
// Compact prescription chip (e.g. "3×5 @75%") that opens a Popover editor
// on click. Purely presentational — calls onChange with the updated prescription;
// no server calls. Renders a keyboard-accessible trigger button.
// =============================================================================

import { useState } from 'react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
  PopoverClose,
} from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import type { LiftDraftExercise } from '@/lib/baseball/exercise-conflict';

// ─── Types ────────────────────────────────────────────────────────────────────

type Prescription = LiftDraftExercise['prescription'];

export interface PrescriptionChipProps {
  prescription: Prescription;
  onChange: (prescription: Prescription) => void;
  disabled?: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatPrescription(p: Prescription): string {
  const parts: string[] = [];
  if (p.sets != null) parts.push(String(p.sets));
  if (p.reps != null) parts.push(`×${p.reps}`);
  if (p.loadMode === 'percent' && p.load != null) parts.push(` @${p.load}%`);
  else if (p.loadMode === 'weight' && p.load != null) parts.push(` ${p.load}lb`);
  else if (p.loadMode === 'rpe' && p.rpe != null) parts.push(` RPE${p.rpe}`);
  else if (p.loadMode === 'bodyweight') parts.push(' BW');
  return parts.join('').trim() || 'Set prescription';
}

const LOAD_MODE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'No load mode' },
  { value: 'percent', label: '% 1RM' },
  { value: 'weight', label: 'Weight (lb)' },
  { value: 'rpe', label: 'RPE' },
  { value: 'bodyweight', label: 'Bodyweight' },
];

// ─── Component ────────────────────────────────────────────────────────────────

export function PrescriptionChip({
  prescription,
  onChange,
  disabled = false,
}: PrescriptionChipProps) {
  const [draft, setDraft] = useState<Prescription>(prescription);

  function patch(partial: Partial<Prescription>) {
    setDraft((prev) => ({ ...prev, ...partial }));
  }

  function numOrUndef(raw: string): number | undefined {
    return raw === '' ? undefined : Number(raw);
  }

  return (
    <Popover
      onOpenChange={(open) => {
        if (open) setDraft(prescription);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className="inline-flex h-9 items-center gap-1 rounded-lg border border-primary-200 bg-primary-50 px-2.5 text-xs font-semibold tabular-nums text-primary-800 transition-colors hover:bg-primary-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 disabled:opacity-40"
          aria-label={`Edit prescription: ${formatPrescription(prescription)}`}
        >
          {formatPrescription(prescription)}
        </button>
      </PopoverTrigger>

      <PopoverContent className="w-72 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-warm-400">
          Edit prescription
        </p>

        <div className="grid grid-cols-2 gap-2">
          <Input
            label="Sets"
            type="number"
            min={1}
            value={draft.sets ?? ''}
            onChange={(e) => patch({ sets: numOrUndef(e.target.value) })}
          />
          <Input
            label="Reps"
            type="number"
            min={1}
            value={draft.reps ?? ''}
            onChange={(e) => patch({ reps: numOrUndef(e.target.value) })}
          />
        </div>

        <Select
          label="Load mode"
          options={LOAD_MODE_OPTIONS}
          value={draft.loadMode ?? ''}
          onChange={(v) =>
            patch({ loadMode: v === '' ? undefined : (v as Prescription['loadMode']) })
          }
        />

        {(draft.loadMode === 'percent' || draft.loadMode === 'weight') && (
          <Input
            label={draft.loadMode === 'percent' ? 'Load %' : 'Weight (lb)'}
            type="number"
            min={0}
            value={draft.load ?? ''}
            onChange={(e) => patch({ load: numOrUndef(e.target.value) })}
          />
        )}

        {draft.loadMode === 'rpe' && (
          <Input
            label="RPE (1–10)"
            type="number"
            min={1}
            max={10}
            step={0.5}
            value={draft.rpe ?? ''}
            onChange={(e) => patch({ rpe: numOrUndef(e.target.value) })}
          />
        )}

        <Input
          label="Rest (seconds)"
          type="number"
          min={0}
          value={draft.rest ?? ''}
          onChange={(e) => patch({ rest: numOrUndef(e.target.value) })}
        />

        <Input
          label="Note (optional)"
          value={draft.note ?? ''}
          onChange={(e) => patch({ note: e.target.value || undefined })}
        />

        {/* Apply closes the popover via PopoverClose + fires onChange */}
        <PopoverClose asChild>
          <Button
            variant="primary"
            className="w-full"
            onClick={() => onChange(draft)}
          >
            Apply
          </Button>
        </PopoverClose>
      </PopoverContent>
    </Popover>
  );
}
