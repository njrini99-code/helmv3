'use client';

// =============================================================================
// src/components/lifting/weight/WeightCheckInCard.tsx
//
// Helm Lifting Lab — Player-facing weight check-in card (Player Today surface).
//
// Shows when a weight check-in request is pending for the current athlete.
// One-tap opens WeightEntryModal; on success shows a calm confirmation state.
// Designed to be placed in the Player Today feed alongside other check-in cards.
//
// Props:
//   athleteId      — helm_lifting_athletes.id for the current athlete
//   orgId          — organization_id
//   requestId      — the open helm_lifting_weight_checkin_requests.id (null = freeform)
//   dueDate        — YYYY-MM-DD string shown as the label
//   scheduleTitle  — optional coach-authored title (e.g. "Monday Morning Weight")
//   instructions   — optional coach instructions
//   onDone         — callback after a successful submission
// =============================================================================

import { useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  IconActivity,
  IconCheckCircle2,
  IconClock,
  IconInfo,
} from '@/components/icons';
import { haptic } from '@/lib/lifting/haptics';
import { WeightEntryModal } from './WeightEntryModal';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WeightCheckInCardProps {
  athleteId: string;
  orgId: string;
  /** Pending request ID to link the entry to; null for ad-hoc day entry. */
  requestId: string | null;
  /** YYYY-MM-DD */
  dueDate: string;
  scheduleTitle?: string | null;
  instructions?: string | null;
  onDone?: (weightLbs: number) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDueDate(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00`);
  const today = new Date().toISOString().slice(0, 10);
  if (ymd === today) return 'Due today';
  return `Due ${d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function WeightCheckInCard({
  athleteId,
  orgId,
  requestId,
  dueDate,
  scheduleTitle,
  instructions,
  onDone,
}: WeightCheckInCardProps) {
  const prefersReducedMotion = useReducedMotion();
  const [modalOpen, setModalOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submittedWeight, setSubmittedWeight] = useState<number | null>(null);

  function handleEnterWeight() {
    haptic('tap');
    setModalOpen(true);
  }

  function handleSuccess(weightLbs: number) {
    setModalOpen(false);
    setSubmitted(true);
    setSubmittedWeight(weightLbs);
    haptic('success');
    onDone?.(weightLbs);
  }

  return (
    <>
      <AnimatePresence mode="wait">
        {submitted ? (
          // ── Confirmation state ──────────────────────────────────────────
          <motion.div
            key="confirmed"
            initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
          >
            <Card variant="glass">
              <CardContent className="flex items-center gap-3 py-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-100">
                  <IconCheckCircle2 size={20} className="text-primary-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-warm-900">Weight logged</p>
                  {submittedWeight != null && (
                    <p className="text-sm text-warm-500">
                      {submittedWeight.toFixed(1)} lbs ·{' '}
                      {new Date().toLocaleTimeString('en-US', {
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </p>
                  )}
                </div>
                <span className="shrink-0 rounded-full bg-primary-50 px-3 py-1 text-xs font-medium text-primary-700">
                  Done
                </span>
              </CardContent>
            </Card>
          </motion.div>
        ) : (
          // ── Pending state ────────────────────────────────────────────────
          <motion.div
            key="pending"
            initial={prefersReducedMotion ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <Card variant="glass" className="overflow-hidden">
              {/* Top accent bar — matches soreness card style */}
              <div className="h-1 w-full bg-gradient-to-r from-primary-400 to-primary-600" />
              <CardContent className="space-y-4 py-5">
                {/* Header row */}
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-50">
                    <IconActivity size={20} className="text-primary-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-warm-900">
                      {scheduleTitle ?? 'Weight Check-In'}
                    </p>
                    <div className="mt-0.5 flex items-center gap-1 text-sm text-warm-500">
                      <IconClock size={13} />
                      <span>{formatDueDate(dueDate)}</span>
                    </div>
                  </div>
                </div>

                {/* Coach instructions */}
                {instructions && (
                  <div className="flex items-start gap-2 rounded-xl bg-warm-50 px-3 py-2.5">
                    <IconInfo size={14} className="mt-0.5 shrink-0 text-warm-400" />
                    <p className="text-sm text-warm-600">{instructions}</p>
                  </div>
                )}

                {/* CTA */}
                <Button
                  onClick={handleEnterWeight}
                  className="w-full"
                  size="md"
                >
                  Enter Weight
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal rendered outside the card so it sits above the whole layout */}
      <WeightEntryModal
        open={modalOpen}
        athleteId={athleteId}
        orgId={orgId}
        requestId={requestId}
        entryDate={dueDate}
        onClose={() => setModalOpen(false)}
        onSuccess={handleSuccess}
      />
    </>
  );
}
