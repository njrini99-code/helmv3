'use client';

// =============================================================================
// src/components/baseball/daily-contract/CoachPlayerDailyContractPanel.tsx
//
// Per-player Daily Contract drill-in for the COACH player profile (Snapshot tab).
// The roster-wide feed lives in the Command Center; this is the focused, single-
// player view a coach sees on the operating record: today's shared day (if any),
// the shared-and-completed streak, recent shared history, and the same ACK action
// (with optional note) that writes a private coach→player recognition timeline
// note. NO private reflection is ever shown — only intentions + honored counts.
//
// Honest + fault-tolerant: renders nothing when authorized:false (a non-staff
// viewer never reaches this page anyway); renders a quiet empty state when the
// player has shared nothing. Cream/green primitives, no golf labels.
// =============================================================================

import { useState, useTransition, useCallback } from 'react';
import { LazyMotion, m, AnimatePresence, useReducedMotion } from 'framer-motion';
import { loadFeatures } from '@/lib/motion/load-features';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';
import { PaperCard, InkNotice } from '@/components/baseball/living-annual';
import {
  IconTarget,
  IconCheck,
  IconClock,
  IconFlame,
  IconHeart,
  IconCheckCircle2,
  IconAlertCircle,
  IconX,
} from '@/components/icons';
import type {
  CoachPlayerDailyContractReadModel,
  CoachContractDayView,
} from '@/lib/baseball/read-models/coach-daily-contracts';
import { acknowledgeDailyContract } from '@/app/baseball/actions/daily-contract';

interface CoachPlayerDailyContractPanelProps {
  model: CoachPlayerDailyContractReadModel;
}

function DayItems({ day }: { day: CoachContractDayView }) {
  return (
    <div className="space-y-1.5">
      {day.items.map((it) => (
        <div key={it.id} className="flex items-center gap-2.5">
          <span
            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md ${
              it.done ? 'bg-primary-500 text-white' : 'bg-warm-100 text-warm-400'
            }`}
          >
            {it.done ? <IconCheck size={12} /> : <IconClock size={11} />}
          </span>
          <span
            className={`truncate text-sm ${
              it.skipped ? 'text-warm-400 line-through' : 'text-warm-700'
            }`}
          >
            {it.label}
          </span>
          <span className="ml-auto shrink-0 text-eyebrow uppercase tracking-wide text-warm-400">
            {it.category}
          </span>
        </div>
      ))}
    </div>
  );
}

export function CoachPlayerDailyContractPanel({
  model,
}: CoachPlayerDailyContractPanelProps) {
  const reduceMotion = useReducedMotion();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(model.error);
  const [note, setNote] = useState('');
  const [ackedAt, setAckedAt] = useState<string | null>(
    model.today?.coachAcknowledgedAt ?? null,
  );

  const day = model.today;
  const acked = !!ackedAt;

  const handleAck = useCallback(() => {
    if (!day) return;
    setError(null);
    startTransition(async () => {
      try {
        const res = await acknowledgeDailyContract({ contractId: day.id, note });
        if (!res.success) {
          setError(res.error ?? 'Could not acknowledge. Please try again.');
          return;
        }
        setAckedAt(new Date().toISOString());
      } catch {
        setError('Could not acknowledge. Please try again.');
      }
    });
  }, [day, note]);

  if (!model.authorized) return null;

  const fade = reduceMotion
    ? {}
    : {
        initial: { opacity: 0, y: 4 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.2, ease: [0.22, 1, 0.36, 1] as const },
      };

  return (
    <LazyMotion features={loadFeatures} strict>
    <PaperCard className="p-6">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
            <IconTarget size={16} />
          </span>
          <h3 className="font-semibold text-warm-900">Daily Contract</h3>
        </div>
        {model.sharedStreak > 0 && (
          <span className="flex items-center gap-1 rounded-full bg-primary-50 px-2.5 py-0.5 text-eyebrow font-semibold text-primary-700">
            <IconFlame size={12} />
            {model.sharedStreak}-day shared streak
          </span>
        )}
      </div>

      {error && <InkNotice className="mb-3">{error}</InkNotice>}

      {/* Today's shared day */}
      {day ? (
        <div className="space-y-3">
          <div
            className={`flex items-center gap-2 rounded-xl border px-3.5 py-2.5 ${
              day.status === 'completed'
                ? 'border-primary-200 bg-primary-50/60'
                : day.status === 'missed'
                  ? 'border-pursuit/25 bg-pursuit/10'
                  : 'border-warm-200 bg-warm-50'
            }`}
          >
            {day.status === 'completed' ? (
              <IconCheckCircle2 size={16} className="text-primary-600" />
            ) : day.status === 'missed' ? (
              <IconAlertCircle size={16} className="text-pursuit" />
            ) : (
              <IconClock size={15} className="text-warm-400" />
            )}
            <p
              className={`text-sm font-medium ${
                day.status === 'missed' ? 'text-pursuit' : 'text-warm-800'
              }`}
            >
              {day.status === 'completed'
                ? 'Completed today'
                : day.status === 'missed'
                  ? 'Commitment missed'
                  : 'In progress today'}{' '}
              — {day.honoredCount}/{day.totalCount} honored
            </p>
          </div>

          <DayItems day={day} />

          <AnimatePresence mode="wait">
            {!acked ? (
              <m.div
                key="ack-form"
                {...fade}
                className="space-y-2 rounded-xl border border-warm-200 bg-warm-50 p-2.5"
              >
                <Textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  maxLength={400}
                  placeholder="Optional note back to the player…"
                  aria-label="Acknowledgement note"
                  className="w-full resize-none text-sm"
                />
                <Button
                  variant="primary"
                  size="sm"
                  className="w-full"
                  disabled={isPending}
                  onClick={handleAck}
                  leftIcon={<IconHeart size={14} />}
                >
                  {isPending ? 'Sending…' : 'Acknowledge'}
                </Button>
              </m.div>
            ) : (
              <m.p
                key="acked"
                {...fade}
                className="flex items-center gap-1.5 text-eyebrow font-medium text-primary-700"
              >
                <IconCheckCircle2 size={13} />
                Acknowledged — the player was notified.
              </m.p>
            )}
          </AnimatePresence>
        </div>
      ) : (
        <p className="text-sm text-warm-500">
          This player hasn&apos;t shared a daily contract for today.
        </p>
      )}

      {/* Recent shared history */}
      {model.history.length > 0 && (
        <div className="mt-4 border-t border-warm-200 pt-3">
          <p className="mb-2 text-eyebrow uppercase tracking-wide text-warm-400">
            Recent shared days
          </p>
          <div className="flex flex-wrap gap-1.5">
            {model.history.slice(0, 14).map((d) => (
              <span
                key={d.id}
                title={`${d.contractDate} · ${d.honoredCount}/${d.totalCount} honored · ${d.status}`}
                className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-eyebrow font-medium ${
                  d.status === 'completed'
                    ? 'border-primary-200 bg-primary-50 text-primary-700'
                    : d.status === 'missed'
                      ? 'border-pursuit/25 bg-pursuit/10 text-pursuit'
                      : 'border-warm-200 bg-warm-50 text-warm-500'
                }`}
              >
                {d.status === 'completed' ? (
                  <IconCheck size={10} />
                ) : d.status === 'missed' ? (
                  <IconX size={10} />
                ) : (
                  <IconClock size={10} />
                )}
                {d.honoredCount}/{d.totalCount}
              </span>
            ))}
          </div>
        </div>
      )}
    </PaperCard>
    </LazyMotion>
  );
}
