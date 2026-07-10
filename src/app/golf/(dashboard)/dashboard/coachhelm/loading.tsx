'use client';

import { fairwayScope } from '@/lib/redesign/flag';
import { Skeleton } from '@/components/fairway/feedback';
import { Surface } from '@/components/fairway/surfaces/surface';

/* ============================================================================
 * P159 — Fairway-native loading state for the player CoachHelm cockpit.
 * ----------------------------------------------------------------------------
 * The live page (FairwayPlayerCoachHelm) is a max-w-[1200px] CoachHelmShell:
 * a ViewHeader masthead (eyebrow → Fraunces title → description) + a persistent
 * sub-nav strip, then an asymmetric InstrumentCluster cockpit (focal primary +
 * a 2-panel secondary rail + a 4-up tertiary readout row). This reserves the
 * cockpit's real slots using Fairway tokens so the skeleton→content swap is
 * seamless.
 * ========================================================================== */

function FairwayCoachHelmLoading() {
  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
      <div
        role="status"
        aria-busy="true"
        aria-live="polite"
        className="mx-auto flex w-full max-w-[1200px] flex-col px-4 pt-2 md:px-6"
      >
        <span className="sr-only">Loading CoachHelm…</span>

        {/* ── Masthead (ViewHeader: eyebrow · title · description) + action ───── */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-2 h-9 w-64 max-w-full" />
            <Skeleton className="mt-2 h-3.5 w-80 max-w-full" />
          </div>
          <Skeleton className="h-9 w-9 rounded-fw-md" />
        </div>

        {/* ── Persistent sub-nav strip (Overview · Development · Game · Standing) */}
        <div className="mt-5 flex items-center gap-2 border-b border-border-subtle pb-3">
          {[80, 104, 96, 84].map((w) => (
            <Skeleton key={w} className="h-7 rounded-full" style={{ width: w }} />
          ))}
        </div>

        {/* ── Body: the InstrumentCluster cockpit ──────────────────────────────── */}
        <div className="py-6">
          <div className="flex flex-col gap-10">
            {/* Cockpit: focal primary (2fr) + secondary rail (1fr) */}
            <div className="flex flex-col gap-5 sm:gap-6">
              <div className="grid grid-cols-1 gap-5 sm:gap-6 lg:grid-cols-[2fr_minmax(15rem,1fr)]">
                {/* Primary — the EdgeInstrument: big mono number + narrative */}
                <Surface elevation="shadow" padding="lg" className="min-w-0">
                  <Skeleton className="h-3 w-28" />
                  <Skeleton className="mt-4 h-16 w-40" />
                  <div className="mt-5 space-y-2.5">
                    <Skeleton className="h-3.5 w-full" />
                    <Skeleton className="h-3.5 w-11/12" />
                    <Skeleton className="h-3.5 w-3/5" />
                  </div>
                  <Skeleton className="mt-6 h-9 w-44 rounded-fw-md" />
                </Surface>

                {/* Secondary rail — prediction readout + strength radar */}
                <div className="flex min-w-0 flex-col gap-5 sm:gap-6">
                  <Surface elevation="border" padding="md" className="min-w-0">
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="mt-3 h-10 w-24" />
                    <Skeleton className="mt-3 h-3 w-28" />
                  </Surface>
                  <Surface elevation="border" padding="md" className="min-w-0">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton circle className="mx-auto mt-3 h-32 w-32" />
                  </Surface>
                </div>
              </div>

              {/* Tertiary — 4-up micro readout row */}
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-6 lg:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Surface key={i} elevation="border" padding="md">
                    <Skeleton className="h-3 w-16" />
                    <Skeleton className="mt-3 h-8 w-20" />
                  </Surface>
                ))}
              </div>
            </div>

            {/* The feed — section heading + 2-up insight cards */}
            <section className="flex flex-col gap-3">
              <Skeleton className="h-3 w-32" />
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {Array.from({ length: 2 }).map((_, i) => (
                  <Surface key={i} elevation="border" padding="md">
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="mt-2 h-4 w-3/4" />
                    <Skeleton className="mt-3 h-3.5 w-full" />
                    <Skeleton className="mt-2 h-3.5 w-2/3" />
                  </Surface>
                ))}
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CoachHelmLoading() {
  return <FairwayCoachHelmLoading />;
}
