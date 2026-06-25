'use client';

// =============================================================================
// src/components/lifting/weight/WeightEntryModal.tsx
//
// Helm Lifting Lab — fast numeric weight entry modal.
//
// Premium iOS-feel bottom-sheet style (full-screen overlay on mobile, centered
// card on desktop). Numeric keypad input with lbs label, optional note, haptic
// feedback on submit. Wires directly to submitBodyweightEntry server action.
//
// Props:
//   open        — controlled visibility
//   athleteId   — helm_lifting_athletes.id
//   orgId       — organization_id
//   requestId   — helm_lifting_weight_checkin_requests.id to link (nullable)
//   entryDate   — YYYY-MM-DD
//   onClose     — called when user dismisses without submitting
//   onSuccess   — called with the submitted weight (lbs) after a successful save
// =============================================================================

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  IconX,
  IconCheckCircle2,
  IconAlertCircle,
  IconActivity,
} from '@/components/icons';
import { haptic } from '@/lib/lifting/haptics';
import { submitBodyweightEntry } from '@/app/lifting/actions/weight-checkins';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WeightEntryModalProps {
  open: boolean;
  athleteId: string;
  orgId: string;
  requestId: string | null;
  /** YYYY-MM-DD */
  entryDate: string;
  onClose: () => void;
  onSuccess: (weightLbs: number) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse a string to a positive finite float; returns null on invalid input. */
function parseWeight(raw: string): number | null {
  const n = parseFloat(raw);
  if (!isFinite(n) || n <= 0 || n > 999) return null;
  return n;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function WeightEntryModal({
  open,
  athleteId,
  orgId,
  requestId,
  entryDate,
  onClose,
  onSuccess,
}: WeightEntryModalProps) {
  const [weightRaw, setWeightRaw] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus the input whenever the modal opens.
  useEffect(() => {
    if (!open) return;
    setWeightRaw('');
    setNote('');
    setError(null);
    setSaving(false);
    // Small delay so the animation has started before we shift focus.
    const id = setTimeout(() => inputRef.current?.focus(), 80);
    return () => clearTimeout(id);
  }, [open]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const parsedWeight = parseWeight(weightRaw);
  const isValid = parsedWeight !== null;

  async function handleSubmit() {
    if (!isValid || saving) return;
    setError(null);
    setSaving(true);
    haptic('select');

    try {
      const result = await submitBodyweightEntry({
        athleteId,
        orgId,
        entryDate,
        weightLbs: parsedWeight!,
        requestId: requestId ?? null,
      });

      if (!result.success) {
        setError(result.error ?? 'Could not save. Try again.');
        setSaving(false);
        return;
      }

      haptic('success');
      onSuccess(parsedWeight!);
    } catch {
      setError('Something went wrong. Please try again.');
      setSaving(false);
    }
  }

  async function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    await handleSubmit();
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Sheet / card */}
          <motion.div
            key="sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Enter weight"
            className="fixed inset-x-0 bottom-0 z-50 sm:inset-0 sm:flex sm:items-center sm:justify-center sm:p-4"
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            transition={{ type: 'spring', stiffness: 340, damping: 32 }}
          >
            <div className="relative w-full rounded-t-3xl bg-[#FFFEFA] px-6 pb-10 pt-5 shadow-2xl sm:max-w-sm sm:rounded-3xl sm:pb-8">
              {/* Handle pill — mobile only */}
              <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-warm-200 sm:hidden" />

              {/* Header */}
              <div className="mb-5 flex items-start justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-100">
                    <IconActivity size={18} className="text-primary-600" />
                  </div>
                  <div>
                    <h2 className="font-semibold text-warm-900">Enter Weight</h2>
                    <p className="text-xs text-warm-500">
                      {new Date(`${entryDate}T12:00:00`).toLocaleDateString('en-US', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={onClose}
                  className="flex h-8 w-8 items-center justify-center rounded-xl text-warm-400 hover:bg-warm-100 hover:text-warm-700"
                  aria-label="Close"
                >
                  <IconX size={16} />
                </Button>
              </div>

              {/* Form */}
              <form onSubmit={handleFormSubmit} className="space-y-4" noValidate>
                {/* Weight input */}
                <div className="space-y-1.5">
                  <label
                    htmlFor="weight-input"
                    className="block text-xs font-medium uppercase tracking-wide text-warm-500"
                  >
                    Bodyweight
                  </label>
                  <div className="relative">
                    <Input
                      ref={inputRef}
                      id="weight-input"
                      type="number"
                      inputMode="decimal"
                      step="0.1"
                      min="50"
                      max="999"
                      placeholder="214.6"
                      value={weightRaw}
                      onChange={(e) => {
                        setWeightRaw(e.target.value);
                        setError(null);
                      }}
                      disabled={saving}
                      className="rounded-2xl border border-warm-200 bg-cream-50 py-4 pl-5 pr-16 text-2xl font-semibold text-warm-900 placeholder:text-warm-300 focus:border-primary-400 focus:ring-2 focus:ring-primary-400/20"
                      aria-describedby={error ? 'weight-error' : undefined}
                      aria-invalid={error ? 'true' : 'false'}
                    />
                    <span className="absolute right-5 top-1/2 -translate-y-1/2 text-base font-medium text-warm-400">
                      lbs
                    </span>
                  </div>
                </div>

                {/* Optional note */}
                <div className="space-y-1.5">
                  <label
                    htmlFor="weight-note"
                    className="block text-xs font-medium uppercase tracking-wide text-warm-500"
                  >
                    Note <span className="normal-case text-warm-400">(optional)</span>
                  </label>
                  <Textarea
                    id="weight-note"
                    placeholder="Felt heavy after travel…"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    disabled={saving}
                    rows={2}
                    maxLength={300}
                    className="resize-none rounded-2xl border border-warm-200 bg-cream-50 px-4 py-3 text-sm text-warm-900 placeholder:text-warm-400 focus:border-primary-400 focus:ring-2 focus:ring-primary-400/20"
                  />
                </div>

                {/* Error */}
                {error && (
                  <div
                    id="weight-error"
                    role="alert"
                    className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700"
                  >
                    <IconAlertCircle size={14} className="shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                {/* Submit */}
                <Button
                  type="submit"
                  disabled={!isValid || saving}
                  isLoading={saving}
                  className="w-full"
                  size="md"
                >
                  {saving ? 'Saving…' : (
                    <span className="flex items-center gap-1.5">
                      <IconCheckCircle2 size={16} />
                      Submit
                    </span>
                  )}
                </Button>
              </form>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
