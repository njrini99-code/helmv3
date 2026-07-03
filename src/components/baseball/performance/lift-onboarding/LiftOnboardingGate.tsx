'use client';

// =============================================================================
// src/components/baseball/performance/lift-onboarding/LiftOnboardingGate.tsx
//
// Task C, item (1): first-visit detection + gating for the Lift Lab tour.
//
// `eligibleForOnboarding` is server truth (getPlayerLiftOnboardingState —
// no prior readiness check-in, no prior set log, no durable onboarded_at)
// and is stable across server/client render, so it never flashes the tour
// for a genuinely-returning athlete. What it CANNOT know server-side is
// whether THIS device already dismissed the tour once before (localStorage),
// so the tour only actually opens after a client-only mount check — SSR and
// first paint always render nothing here, avoiding a hydration mismatch.
// =============================================================================

import { useEffect, useState } from 'react';
import { LiftOnboardingFlow } from './LiftOnboardingFlow';
import { readLiftOnboardingFlag, writeLiftOnboardingFlag } from './onboarding-storage';
import { markLiftOnboardingComplete } from '@/app/baseball/actions/lift-onboarding';

export interface LiftOnboardingGateProps {
  /** helm_lifting_athletes.id for the caller, or null if not yet seeded. */
  athleteId: string | null;
  /** Server truth: false → never shows the tour (returning athlete). */
  eligibleForOnboarding: boolean;
}

export function LiftOnboardingGate({ athleteId, eligibleForOnboarding }: LiftOnboardingGateProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!eligibleForOnboarding) return;
    if (readLiftOnboardingFlag(athleteId)) return;
    setOpen(true);
  }, [eligibleForOnboarding, athleteId]);

  function complete() {
    setOpen(false);
    writeLiftOnboardingFlag(athleteId);
    // Best-effort durable write — see lift-onboarding.ts for why this never
    // blocks the UI and never surfaces an error (missing db_gated column,
    // or a blocked demo session, both degrade silently to localStorage-only).
    void markLiftOnboardingComplete().catch(() => {});
  }

  if (!open) return null;

  return <LiftOnboardingFlow onDone={complete} onSkip={complete} />;
}
