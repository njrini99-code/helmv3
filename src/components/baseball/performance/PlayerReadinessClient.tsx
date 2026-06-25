'use client';

// =============================================================================
// src/components/baseball/performance/PlayerReadinessClient.tsx
//
// V11 player readiness check-in (spec L480-485, L575-638). Sleep / energy /
// stress / soreness / arm status / lower-body status / illness + bodyweight +
// soreness map. Player-safe language only — NEVER medical. Cream/green, reuses
// Card. Idempotent upsert via submitReadinessCheckin (no delete-then-insert).
// =============================================================================

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { IconCheckCircle2, IconAlertCircle } from '@/components/icons';
import { Skeleton } from '@/components/ui/skeleton';
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

  if (isLoading) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading readiness check-in…">
        <Card variant="glass">
          <CardHeader>
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-56 mt-1" />
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Scale rows skeleton */}
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-2" style={{ animationDelay: `${i * 60}ms` }}>
                <div className="flex items-center justify-between">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-3 w-32" />
                </div>
                <div className="flex gap-2">
                  {Array.from({ length: 5 }).map((_, j) => (
                    <Skeleton key={j} className="h-9 flex-1 rounded-lg" />
                  ))}
                </div>
              </div>
            ))}
            {/* Arm status skeleton */}
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-20" />
              <div className="flex gap-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-9 flex-1 rounded-lg" />
                ))}
              </div>
            </div>
            {/* Notes skeleton */}
            <Skeleton className="h-20 w-full rounded-xl" />
            {/* Submit */}
            <Skeleton className="h-11 w-32 rounded-xl" />
          </CardContent>
        </Card>
      </div>
    );
  }

  function handleSubmit() {
    setError(null);
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
      if (bodyweight) {
        await logBodyweight({ entryDate: checkDate, weightLbs: Number(bodyweight) });
      }
      if (soreness && soreness >= 3 && r.id) {
        // Record a coarse soreness map entry so the staff queue has region context.
        await saveSorenessMap({
          checkinId: r.id,
          regions: lowerBody && lowerBody >= 3
            ? [{ bodyRegion: 'lower_body', severity: Math.min(10, soreness * 2) }]
            : [{ bodyRegion: 'general', severity: Math.min(10, soreness * 2) }],
        });
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
        <Card className="border-primary-200 bg-primary-50/50">
          <CardContent className="py-10 text-center">
            <motion.div
              className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary-100 text-primary-600"
              initial={prefersReducedMotion ? false : { scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.3, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
              aria-hidden
            >
              <IconCheckCircle2 size={30} />
            </motion.div>
            <p className="mt-4 text-2xl font-semibold tracking-tight text-warm-900">Check-in saved</p>
            <p className="mt-1 text-sm text-warm-500">Thanks — the staff has what they need before training.</p>
            <Link
              href="/baseball/dashboard/lift"
              className="mt-5 inline-block rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-cream-50"
            >
              Go to Lift
            </Link>
          </CardContent>
        </Card>
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

      {error && (
        <div role="alert" className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <IconAlertCircle size={15} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <Card>
        <CardHeader><h2 className="text-lg font-semibold text-warm-900">How you feel</h2></CardHeader>
        <CardContent className="space-y-4">
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader><h2 className="text-lg font-semibold text-warm-900">Bodyweight (optional)</h2></CardHeader>
        <CardContent>
          <div className="max-w-[8rem]">
            <Input
              inputMode="decimal"
              value={bodyweight}
              onChange={(e) => setBodyweight(e.target.value)}
              placeholder="lb"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><h2 className="text-lg font-semibold text-warm-900">Anything the staff should know?</h2></CardHeader>
        <CardContent>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Optional note for the staff"
          />
        </CardContent>
      </Card>

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
