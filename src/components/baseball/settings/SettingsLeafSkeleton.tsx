// =============================================================================
// src/components/baseball/settings/SettingsLeafSkeleton.tsx
//
// The ONE loading shape for a settings leaf route.
//
// Nine settings routes (audit, imports, integrations, permissions, philosophy,
// privacy, recruiting-preferences, roles, season, teams) each rendered
// `PageLoading` — a centred full-viewport spinner — and then resolved into a
// left-aligned masthead over paper cards. So every navigation inside Settings
// flashed a chrome that belongs to no design system in the product, then
// replaced it wholesale. That flash is a large part of why the hub reads as
// assembled from parts even when the destination page is correct.
//
// This shape-matches `SettingsShell`: the eyebrow dateline, the title, the 3px
// team-ink accent rule, then `sections` PaperCard-shaped blocks with the
// section header + hairline + body that `SettingsSection` renders. Nothing
// moves when the real page mounts.
//
// Uses `@/components/ui/skeleton` deliberately: that primitive is the correct
// one for non-golf routes — the Fairway `Skeleton` is reserved for golf.
// =============================================================================

import { Skeleton } from '@/components/ui/skeleton';

export interface SettingsLeafSkeletonProps {
  /** Accessible description of what is loading, e.g. "Loading Roles…". */
  label: string;
  /** How many section cards the destination page opens with. */
  sections?: number;
}

export function SettingsLeafSkeleton({ label, sections = 3 }: SettingsLeafSkeletonProps) {
  return (
    <div
      className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8 sm:px-6 lg:px-8"
      role="status"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">{label}</span>

      {/* Masthead */}
      <div className="flex flex-col gap-3">
        <Skeleton variant="text" width={180} height={11} />
        <Skeleton variant="text" width={220} height={36} />
        <Skeleton className="h-[3px] w-16 rounded-full" />
        <Skeleton variant="text" width={260} height={13} />
      </div>

      {/* Section cards */}
      {Array.from({ length: sections }).map((_, i) => (
        <div
          key={i}
          className="rounded-card border border-[color:var(--hairline)] bg-[var(--paper)] p-6"
        >
          <div className="flex items-start gap-3">
            <Skeleton variant="rectangular" width={36} height={36} className="rounded-fw-md" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton variant="text" width="45%" height={18} />
              <Skeleton variant="text" width="80%" height={13} />
            </div>
          </div>
          {/* The section's team-ink hairline rule. */}
          <Skeleton className="my-4 h-[1.5px] w-full rounded-full" />
          <div className="space-y-2">
            <Skeleton variant="text" width="100%" height={14} />
            <Skeleton variant="text" width="70%" height={14} />
          </div>
        </div>
      ))}
    </div>
  );
}
