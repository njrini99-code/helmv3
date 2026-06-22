'use client';

import { m, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { isRedesignEnabled, fairwayScope } from '@/lib/redesign/flag';
import { Skeleton } from '@/components/fairway/feedback';
import { Surface } from '@/components/fairway/surfaces/surface';

/* ============================================================================
 * P159 — Fairway-native loading state for the player CoachHelm cockpit.
 * ----------------------------------------------------------------------------
 * The live page (FairwayPlayerCoachHelm) is a max-w-[1200px] CoachHelmShell:
 * a ViewHeader masthead (eyebrow → Fraunces title → description) + a persistent
 * sub-nav strip, then an asymmetric InstrumentCluster cockpit (focal primary +
 * a 2-panel secondary rail + a 4-up tertiary readout row). The previous skeleton
 * rendered the LEGACY shape (sticky bg-cream-100/60 header, max-w-[1536px],
 * lg:grid-cols-12 5/7 two-column layout, warm/glass tokens) which did not match
 * the cockpit — a shape + token swap on hydrate (gate B3 / CLS). This reserves
 * the cockpit's real slots using Fairway tokens so the skeleton→content swap is
 * seamless. The legacy skeleton stays behind the flag-off fork verbatim.
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

/* ── Legacy (flag-off) skeleton — kept verbatim. ───────────────────────────── */

function SkeletonPulse({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'skeleton-shimmer bg-warm-200/60',
        className
      )}
    />
  );
}

function GlassCardSkeleton({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'surface-matte rounded-3xl p-6',
        className
      )}
    >
      {children}
    </div>
  );
}

function HeaderSkeleton() {
  return (
    <div className="flex items-center gap-4">
      <SkeletonPulse className="w-10 h-10 rounded-xl" />
      <div className="space-y-2">
        <SkeletonPulse className="h-5 w-32 rounded" />
        <SkeletonPulse className="h-3 w-48 rounded" />
      </div>
    </div>
  );
}

function StatCardSkeleton() {
  return (
    <GlassCardSkeleton className="relative overflow-hidden">
      {/* Top accent bar */}
      <SkeletonPulse className="absolute top-0 left-0 right-0 h-1" />

      <HeaderSkeleton />

      {/* Main prediction */}
      <div className="flex justify-center my-8">
        <div className="text-center space-y-2">
          <SkeletonPulse className="h-4 w-24 rounded mx-auto" />
          <SkeletonPulse className="h-14 w-20 rounded mx-auto" />
        </div>
      </div>

      {/* Range bar */}
      <div className="space-y-2 mb-4">
        <div className="flex justify-between">
          <SkeletonPulse className="h-3 w-20 rounded" />
          <SkeletonPulse className="h-3 w-24 rounded" />
        </div>
        <SkeletonPulse className="h-3 w-full rounded-full" />
      </div>

      {/* Key factors */}
      <div className="space-y-2">
        <SkeletonPulse className="h-3 w-20 rounded" />
        {[1, 2, 3].map((i) => (
          <SkeletonPulse key={i} className="h-10 w-full rounded-lg" />
        ))}
      </div>
    </GlassCardSkeleton>
  );
}

function FocusAreasSkeleton() {
  return (
    <GlassCardSkeleton>
      <HeaderSkeleton />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-5">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="p-4 rounded-xl border border-warm-200/45 bg-cream-100/60 space-y-3"
          >
            <div className="flex items-center gap-2">
              <SkeletonPulse className="w-8 h-8 rounded-lg" />
              <div className="space-y-1 flex-1">
                <SkeletonPulse className="h-4 w-24 rounded" />
                <SkeletonPulse className="h-3 w-16 rounded" />
              </div>
            </div>
            <SkeletonPulse className="h-8 w-20 rounded" />
            <SkeletonPulse className="h-2 w-full rounded-full" />
            <SkeletonPulse className="h-3 w-full rounded" />
            <SkeletonPulse className="h-3 w-3/4 rounded" />
          </div>
        ))}
      </div>
    </GlassCardSkeleton>
  );
}

function InsightsPanelSkeleton() {
  return (
    <GlassCardSkeleton>
      <HeaderSkeleton />

      <div className="space-y-3 mt-4">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="relative rounded-xl border border-warm-200/35 bg-cream-100/60 p-4 overflow-hidden"
          >
            <SkeletonPulse className="absolute top-0 left-0 right-0 h-0.5" />
            <div className="flex items-start gap-3">
              <SkeletonPulse className="w-9 h-9 rounded-lg flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <SkeletonPulse className="h-4 w-3/4 rounded" />
                <SkeletonPulse className="h-3 w-full rounded" />
                <SkeletonPulse className="h-3 w-2/3 rounded" />
                <div className="flex items-center gap-2 mt-2">
                  <SkeletonPulse className="h-3 w-20 rounded" />
                  <SkeletonPulse className="h-4 w-16 rounded-full" />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </GlassCardSkeleton>
  );
}

function RecentRoundsSkeleton() {
  return (
    <GlassCardSkeleton>
      <div className="flex items-center justify-between mb-4">
        <HeaderSkeleton />
        <SkeletonPulse className="h-4 w-20 rounded" />
      </div>

      <div className="space-y-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="flex items-center gap-4 p-4 rounded-xl bg-cream-100/60 border border-warm-200/45"
          >
            <SkeletonPulse className="w-14 h-14 rounded-xl flex-shrink-0" />
            <div className="flex-1 space-y-1">
              <SkeletonPulse className="h-4 w-40 rounded" />
              <div className="flex items-center gap-3">
                <SkeletonPulse className="h-3 w-16 rounded" />
                <SkeletonPulse className="h-3 w-20 rounded" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </GlassCardSkeleton>
  );
}

function LegacyCoachHelmLoading() {
  const prefersReducedMotion = useReducedMotion();
  return (
    <div className="min-h-full">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary-500/10 via-transparent to-transparent pointer-events-none" />

      {/* Header skeleton */}
      <div className="sticky top-0 z-20 border-b border-warm-200/30 relative bg-cream-100/60 backdrop-blur-sm pt-[max(0.25rem,env(safe-area-inset-top,0px))] lg:pt-0">
        <div className="max-w-[1536px] mx-auto px-4 md:px-6 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <SkeletonPulse className="w-12 h-12 rounded-xl" />
              <div className="space-y-2">
                <SkeletonPulse className="h-6 w-36 rounded" />
                <SkeletonPulse className="h-4 w-48 rounded" />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <SkeletonPulse className="h-7 w-24 rounded-full" />
              <SkeletonPulse className="h-4 w-28 rounded hidden sm:block" />
              <SkeletonPulse className="w-8 h-8 rounded-lg" />
              <SkeletonPulse className="w-8 h-8 rounded-lg" />
            </div>
          </div>
        </div>
      </div>

      {/* Main Content skeleton */}
      <div className="relative max-w-[1536px] mx-auto px-4 md:px-6 py-8">
        {/* Section toggle skeleton */}
        <m.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mb-6"
        >
          <SkeletonPulse className="h-11 w-60 rounded-xl" />
        </m.div>

        {/* Grid layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column */}
          <div className="lg:col-span-5 space-y-6">
            <m.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={prefersReducedMotion ? { duration: 0 } : ({ duration: 0.4 })}
            >
              <StatCardSkeleton />
            </m.div>

            <m.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={prefersReducedMotion ? { duration: 0 } : ({ duration: 0.4, delay: 0.1 })}
            >
              <FocusAreasSkeleton />
            </m.div>
          </div>

          {/* Right Column */}
          <div className="lg:col-span-7 space-y-6">
            <m.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={prefersReducedMotion ? { duration: 0 } : ({ duration: 0.4, delay: 0.15 })}
            >
              <InsightsPanelSkeleton />
            </m.div>

            <m.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={prefersReducedMotion ? { duration: 0 } : ({ duration: 0.4, delay: 0.2 })}
            >
              <RecentRoundsSkeleton />
            </m.div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CoachHelmLoading() {
  if (isRedesignEnabled()) return <FairwayCoachHelmLoading />;
  return <LegacyCoachHelmLoading />;
}
