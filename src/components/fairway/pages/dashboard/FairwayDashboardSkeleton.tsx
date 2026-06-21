'use client';

/**
 * ============================================================================
 * Fairway · pages/dashboard · FairwayDashboardSkeleton  (ADDITIVE · FLAG-GATED)
 * ----------------------------------------------------------------------------
 * Shape-matched route skeleton for the Fairway coach/player dashboard. Mirrors
 * the live FairwayCoachDashboard layout so the route `loading.tsx` reserves the
 * SAME silhouette the real page paints — no layout shift (CLS) and no wrong-
 * chrome flash (the legacy DashboardSkeleton rendered a `max-w-7xl` quick-action
 * list + 3-col grid that matches neither the Fairway structure nor its tokens).
 *
 * Mirrored regions (in order, same gaps as FairwayCoachDashboard):
 *   1. Masthead   — ViewHeader-shaped: eyebrow + Fraunces title + description +
 *                   the promoted action cluster (2 secondary + 1 primary pill).
 *   2. Toolbar    — the quiet "Window" band with the Segmented range control.
 *   3. Hero       — the ONE glass CoachHelm signal strip.
 *   4. Today      — the schedule list region.
 *   5. KPI row    — 2/4-up MetricCard skeletons (reuses MetricCard `loading`).
 *   6. Recent     — the rounds DataTable digest.
 *   7. Team       — the 5-col (3+2) trend / pulse / top-performers region.
 *
 * Tokens only (bg-canvas / bg-surface / border-border-subtle / rounded-card),
 * Skeleton primitives for the shimmer (banned: spinners, arbitrary hex). The
 * whole group carries the loading a11y contract via the Skeleton groups.
 *
 * Rendered ONLY inside the `.fairway-ds` redesign fork (see dashboard/loading.tsx);
 * the legacy DashboardSkeleton stays for the flag-off path.
 * ========================================================================== */

import { Skeleton, MetricCard } from '@/components/fairway';

/** A matte Fairway Surface-shaped block (border elevation, rounded-card). */
function Panel({ className, children }: { className?: string; children?: React.ReactNode }) {
  return (
    <div className={`rounded-card border border-border-subtle bg-surface ${className ?? ''}`}>
      {children}
    </div>
  );
}

export function FairwayDashboardSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      className="mx-auto flex w-full max-w-[1200px] flex-col gap-8 px-5 py-8 md:gap-10 md:px-8 md:py-10"
    >
      <span className="sr-only">Loading dashboard…</span>

      {/* ── 1 · Masthead — ViewHeader silhouette ───────────────────────────── */}
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-3">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-9 w-72 max-w-full" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-9 w-28 rounded-full" />
          <Skeleton className="h-9 w-28 rounded-full" />
          <Skeleton className="h-9 w-32 rounded-full" />
        </div>
      </div>

      {/* ── 2 · Quiet toolbar band — Window + Segmented ────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-9 w-64 max-w-full rounded-full" />
      </div>

      {/* ── 3 · The ONE glass hero — CoachHelm signal strip ────────────────── */}
      <Panel className="flex flex-col gap-4 p-6 md:p-7">
        <div className="flex items-center gap-3">
          <Skeleton circle className="h-10 w-10" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-5 w-2/3" />
          </div>
        </div>
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Skeleton className="h-9 w-36 rounded-full" />
          <Skeleton className="h-9 w-28 rounded-full" />
        </div>
      </Panel>

      {/* ── 3.5 · Today — schedule region ──────────────────────────────────── */}
      <section aria-hidden="true" className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-4 w-20" />
        </div>
        <Panel className="flex flex-col gap-2 p-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between gap-3 rounded-fw-md bg-surface-sunken px-4 py-3">
              <Skeleton className="h-4 flex-1" style={{ maxWidth: `${60 - i * 10}%` }} />
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
          ))}
        </Panel>
      </section>

      {/* ── 4 · Team KPIs — 2/4-up MetricCard skeletons ────────────────────── */}
      <section aria-hidden="true" className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <MetricCard label="" value={0} loading />
          <MetricCard label="" value={0} loading />
          <MetricCard label="" value={0} loading />
          <MetricCard label="" value={0} loading />
        </div>
      </section>

      {/* ── 5 · Recent Rounds — DataTable digest ───────────────────────────── */}
      <section aria-hidden="true" className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-4 w-16" />
        </div>
        <Panel className="flex flex-col gap-2 p-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 rounded-fw-md bg-surface-sunken px-4 py-3">
              <Skeleton circle className="h-8 w-8" />
              <Skeleton className="h-3.5 flex-1" style={{ maxWidth: `${62 - (i % 3) * 8}%` }} />
              <Skeleton className="h-3.5 w-10" />
              <Skeleton className="h-3.5 w-10" />
              <Skeleton className="h-3.5 w-12" />
            </div>
          ))}
        </Panel>
      </section>

      {/* ── 6 · Team region — Trend (3) + Pulse/Top Performers (2) ─────────── */}
      <section aria-hidden="true" className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <Panel className="flex flex-col gap-4 p-6 lg:col-span-3">
          <Skeleton className="h-5 w-44" />
          <Skeleton className="h-48 w-full rounded-fw-md" />
        </Panel>
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Panel className="flex flex-col gap-3 p-6">
            <Skeleton className="h-5 w-28" />
            <div className="grid grid-cols-3 gap-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex flex-col gap-2 rounded-fw-md bg-surface-sunken p-3">
                  <Skeleton className="h-7 w-10" />
                  <Skeleton className="h-3 w-14" />
                </div>
              ))}
            </div>
          </Panel>
          <Panel className="flex flex-col gap-3 p-6">
            <Skeleton className="h-5 w-32" />
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between gap-3">
                <Skeleton className="h-4 flex-1" style={{ maxWidth: `${55 - i * 6}%` }} />
                <Skeleton className="h-4 w-12" />
              </div>
            ))}
          </Panel>
        </div>
      </section>
    </div>
  );
}
