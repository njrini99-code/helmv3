// =============================================================================
// src/components/baseball/settings/SettingsHubSkeleton.tsx
//
// The ONE loading shape for the Settings hub.
//
// The hub previously had two unrelated loading states: the route-level
// `loading.tsx` (a masthead + card grid), and — once the route resolved — a
// full-page centred spinner (`PageLoading`) while the client `useAuth()` hook
// settled. A coach navigating to Settings therefore saw the correct skeleton,
// then a completely different chrome, then the page. Both paths now render
// this, so the shape a coach sees never changes mid-navigation.
//
// Uses `@/components/ui/skeleton` deliberately: that primitive is the correct
// one for non-golf routes (admin, auth, baseball, onboarding) — the Fairway
// `Skeleton` is reserved for golf `loading.tsx` files.
// =============================================================================

import { Skeleton } from '@/components/ui/skeleton';

export function SettingsHubSkeleton() {
  return (
    <div
      className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8 sm:px-6 lg:px-8"
      role="status"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">Loading settings…</span>

      {/* Masthead: eyebrow dateline, title, the 3px team-ink accent rule. */}
      <div className="flex flex-col gap-3">
        <Skeleton variant="text" width={180} height={11} />
        <Skeleton variant="text" width={140} height={36} />
        <Skeleton className="h-[3px] w-16 rounded-full" />
      </div>

      {/* Link-card grid — matches SettingsNavCard's icon badge + two text lines. */}
      <div className="grid gap-3 sm:grid-cols-2">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="rounded-card border border-[color:var(--hairline)] bg-[var(--paper)] p-5"
          >
            <div className="flex items-start gap-3">
              <Skeleton variant="rectangular" width={40} height={40} className="rounded-fw-md" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton variant="text" width="60%" height={16} />
                <Skeleton variant="text" width="90%" height={12} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
