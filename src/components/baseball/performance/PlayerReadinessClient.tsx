'use client';

// =============================================================================
// src/components/baseball/performance/PlayerReadinessClient.tsx
//
// V11 player readiness check-in (spec L480-485, L575-638). Sleep / energy /
// stress / soreness / arm status / lower-body status / illness + bodyweight +
// soreness map. Player-safe language only — NEVER medical. "Living Annual"
// kit: PaperCard sections, InkNotice for errors/notices, CommitSeal for the
// done-screen ceremony. Idempotent upsert via submitReadinessCheckin (no
// delete-then-insert).
// =============================================================================

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { PaperCard, InkNotice, CommitSeal } from '@/components/baseball/living-annual';
import { submitReadinessCheckin } from '@/app/baseball/actions/lifting';
import { logBodyweight, saveSorenessMap } from '@/app/baseball/actions/lifting-v11';

interface ExistingCheckin {
  id: string;
  sleep_hours: number | null;
  energy_level: number | null;
  stress_level: number | null;
  soreness_level: number | null;
  lower_body_status: number | null;
  arm_status: string | null;
  illness_flag: boolean | null;
  notes: string | null;
}

interface Props {
  checkDate: string;
  existing: ExistingCheckin | null;
  isLoading?: boolean;
}

const ARM_OPTIONS = ['fresh', 'normal', 'tight', 'sore', 'pain'] as const;
const SCALE = [1, 2, 3, 4, 5];

function ScaleRow({ label, value, onChange, lowLabel, highLabel }: {
  label: string; value: number | null; onChange: (v: number) => void; lowLabel: string; highLabel: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-warm-800">{label}</span>
        <span className="text-eyebrow text-warm-400">{lowLabel} → {highLabel}</span>
      </div>
      <div className="mt-1.5 flex gap-2">
        {SCALE.map((n) => (
          <Button
            key={n}
            type="button"
            variant="ghost"
            onClick={() => onChange(n)}
            className={`h-9 flex-1 rounded-lg border text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50 focus-visible:ring-offset-1 ${
              value === n ? 'border-primary-500 bg-primary-600 text-white' : 'border-warm-200 bg-cream-50 text-warm-600 hover:border-primary-300'
            }`}
            aria-pressed={value === n}
            aria-label={`${label}: ${n}`}
          >
            {n}
          </Button>
        ))}
      </div>
    </div>
  );
}

export function PlayerReadinessClient({ checkDate, existing, isLoading = false }: Props) {
  const [isPending, startTransition] = useTransition();
  const prefersReducedMotion = useReducedMotion();
  const [sleep, setSleep] = useState(existing?.sleep_hours?.toString() ?? '');
  const [energy, setEnergy] = useState<number | null>(existing?.energy_level ?? null);
  const [stress, setStress] = useState<number | null>(existing?.stress_level ?? null);
  const [soreness, setSoreness] = useState<number | null>(existing?.soreness_level ?? null);
  const [lowerBody, setLowerBody] = useState<number | null>(existing?.lower_body_status ?? null);
  const [arm, setArm] = useState<string | null>(existing?.arm_status ?? null);
  const [illness, setIllness] = useState(existing?.illness_flag ?? false);
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [bodyweight, setBodyweight] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Non-blocking notice for the done screen when a secondary write (bodyweight
  // / soreness map) fails after the primary check-in already succeeded.
  const [secondaryNotice, setSecondaryNotice] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading readiness check-in…">
        <PaperCard className="p-5">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-56 mt-1" />
          <div className="mt-5 space-y-5">
            {/* Scale rows skeleton */}
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-2" style={{ animationDelay: `${i * 60}ms` }}>
                <div className="flex items-center justify-between">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-3 w-32" />
                </div>
                <div className="flex gap-2">
                  {Array.from({ length: 5 }).map((_, j) => (
                    <Skeleton key={j} className="h-9 flex-1 rounded-fw-sm" />
                  ))}
                </div>
              </div>
            ))}
            {/* Arm status skeleton */}
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-20" />
              <div className="flex gap-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-9 flex-1 rounded-fw-sm" />
                ))}
              </div>
            </div>
            {/* Notes skeleton */}
            <Skeleton className="h-20 w-full rounded-fw-sm" />
            {/* Submit */}
            <Skeleton className="h-11 w-32 rounded-fw-sm" />
          </div>
        </PaperCard>
      </div>
    );
  }

  function handleSubmit() {
    setError(null);
    setSecondaryNotice(null);
    startTransition(async () => {
      const r = await submitReadinessCheckin({
        checkDate,
        sleepHours: sleep ? Number(sleep) : null,
        energyLevel: energy,
        stressLevel: stress,
        sorenessLevel: soreness,
        lowerBodyStatus: lowerBody,
        armStatus: arm as never,
        illnessFlag: illness,
        notes: notes || null,
      });
      if (!r.success) { setError(r.error ?? 'Could not submit check-in.'); return; }

      // Secondary writes are best-effort: the primary check-in above already
      // succeeded, so a throw here (no lifting org, unresolved player, DB
      // error) must never skip setDone(true) — that would leave the player
      // resubmitting a duplicate check-in. Each gets its own try/catch and
      // failures surface as a non-blocking notice on the done screen instead.
      const failedParts: string[] = [];
      if (bodyweight) {
        try {
          await logBodyweight({ entryDate: checkDate, weightLbs: Number(bodyweight) });
        } catch {
          failedParts.push('bodyweight');
        }
      }
      if (soreness && soreness >= 3 && r.id) {
        // Record a coarse soreness map entry so the staff queue has region context.
        try {
          await saveSorenessMap({
            checkinId: r.id,
            regions: lowerBody && lowerBody >= 3
              ? [{ bodyRegion: 'lower_body', severity: Math.min(10, soreness * 2) }]
              : [{ bodyRegion: 'general', severity: Math.min(10, soreness * 2) }],
          });
        } catch {
          failedParts.push('soreness map');
        }
      }
      if (failedParts.length) {
        setSecondaryNotice(`Check-in saved, but your ${failedParts.join(' and ')} didn't — let the staff know.`);
      }
      setDone(true);
    });
  }

  if (done) {
    return (
      <motion.div
        initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.24 }}
      >
        <PaperCard className="p-10 text-center">
          <CommitSeal label="SAVED" size="sm" className="mx-auto" />
          <p role="status" className="mt-4 font-annual text-2xl font-normal text-text-primary">Check-in saved</p>
          <p className="mt-1 text-sm text-text-secondary">Thanks — the staff has what they need before training.</p>
          {secondaryNotice && (
            <InkNotice role="status" className="mx-auto mt-4 max-w-sm text-left">
              {secondaryNotice}
            </InkNotice>
          )}
          <Link
            href="/baseball/dashboard/lift"
            className="mt-5 inline-block rounded-fw-sm bg-primary-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-cream-50"
          >
            Go to Lift
          </Link>
        </PaperCard>
      </motion.div>
    );
  }

  return (
    <motion.div
      className="space-y-5"
      initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <div>
        <p className="text-eyebrow uppercase text-primary-700">Readiness</p>
        <h1 className="mt-0.5 text-2xl font-semibold tracking-tight text-warm-900">Daily check-in</h1>
        <p className="mt-1 text-sm text-warm-500">Tell the staff how you feel today. This is not a medical form.</p>
      </div>

      {error && <InkNotice>{error}</InkNotice>}

      <PaperCard className="p-5">
        <h2 className="text-lg font-semibold text-warm-900">How you feel</h2>
        <div className="mt-4 space-y-4">
          <Input
            label="Sleep last night (hours)"
            inputMode="decimal"
            value={sleep}
            onChange={(e) => setSleep(e.target.value)}
            placeholder="e.g. 7.5"
          />
          <ScaleRow label="Energy" value={energy} onChange={setEnergy} lowLabel="drained" highLabel="fresh" />
          <ScaleRow label="Stress" value={stress} onChange={setStress} lowLabel="calm" highLabel="high" />
          <ScaleRow label="Overall soreness" value={soreness} onChange={setSoreness} lowLabel="none" highLabel="severe" />
          <ScaleRow label="Lower body" value={lowerBody} onChange={setLowerBody} lowLabel="fresh" highLabel="very sore" />
          <div>
            <p className="text-sm font-medium text-warm-800">Throwing arm</p>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {ARM_OPTIONS.map((opt) => (
                <Button
                  key={opt} type="button" variant="ghost" onClick={() => setArm(opt)}
                  className={`rounded-full border px-3 py-1.5 text-sm capitalize transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50 focus-visible:ring-offset-1 ${arm === opt ? 'border-primary-500 bg-primary-600 text-white' : 'border-warm-200 bg-cream-50 text-warm-600 hover:border-primary-300'}`}
                  aria-pressed={arm === opt}
                  aria-label={`Throwing arm: ${opt}`}
                >
                  {opt}
                </Button>
              ))}
            </div>
          </div>
          <label htmlFor="illness-checkbox" className="flex cursor-pointer items-center gap-2 text-sm text-warm-700">
            <Input id="illness-checkbox" type="checkbox" checked={illness} onChange={(e) => setIllness(e.target.checked)} className="h-4 w-4 rounded border-warm-300 accent-primary-600" />
            Feeling sick / under the weather
          </label>
        </div>
      </PaperCard>

      <PaperCard className="p-5">
        <h2 className="text-lg font-semibold text-warm-900">Bodyweight (optional)</h2>
        <div className="mt-3 max-w-[8rem]">
          <Input
            inputMode="decimal"
            value={bodyweight}
            onChange={(e) => setBodyweight(e.target.value)}
            placeholder="lb"
          />
        </div>
      </PaperCard>

      <PaperCard className="p-5">
        <h2 className="text-lg font-semibold text-warm-900">Anything the staff should know?</h2>
        <div className="mt-3">
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Optional note for the staff"
          />
        </div>
      </PaperCard>

      <Button
        onClick={handleSubmit}
        isLoading={isPending}
        className="w-full"
        variant="primary"
        size="lg"
      >
        Submit check-in
      </Button>
    </motion.div>
  );
}
