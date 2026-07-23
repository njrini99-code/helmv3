import { HelmMark } from '@/components/brand/HelmMark';
import { EntryField } from '@/components/baseball/scenes/EntryField';
import { Skeleton } from '@/components/ui/skeleton';
import '@/components/marketing/first-light/first-light.css';
import '@/styles/baseball-auth.css';

/**
 * Route-transition fallback for /baseball/login — mirrors BaseballAuthShell's
 * real chrome (fixed full-bleed `<EntryField>` scene + the `fl-glass-3` panel,
 * bottom-sheet on mobile / right-floating on desktop) instead of a dead-
 * centered generic pulse box, so the panel doesn't reposition or gain a card
 * boundary/logo/heading the instant the real page mounts.
 *
 * `stage={0}` + `variant="dawn"` match BaseballAuthShell's own pre-mount
 * defaults (its `variant` state starts `'dawn'` before the client-only clock
 * effect resolves it), so there's no visible scene jump on mount.
 */
export default function Loading() {
  return (
    <div className="baseball-auth-field relative min-h-[100dvh] w-full overflow-x-hidden">
      <div aria-hidden className="fixed inset-0 z-0">
        <EntryField idSuffix="login-skeleton-field" stage={0} variant="dawn" />
      </div>

      <div className="relative z-10 flex min-h-[100dvh] w-full flex-col items-center justify-end md:items-end md:justify-center md:pr-[6vw] md:py-10">
        <div
          className="baseball-auth-panel fl-glass-3 relative w-full max-h-[88dvh] overflow-y-auto overscroll-contain rounded-t-3xl px-6 pt-7 md:max-h-none md:overflow-visible md:max-w-[440px] md:rounded-3xl md:px-9 md:py-9"
          aria-busy="true"
          aria-label="Loading sign-in"
        >
          <div
            className="relative z-10"
            style={{ paddingBottom: 'max(1.75rem, calc(env(safe-area-inset-bottom) + 1rem))' }}
          >
            <div className="mb-6 flex flex-col items-center text-center">
              <div className="mb-3">
                <HelmMark
                  sport="baseball"
                  size={44}
                  className="h-11 w-11"
                  glow
                  glowClassName="blur-2xl scale-150"
                  glowOpacity={0.15}
                  priority
                  unoptimized
                />
              </div>
              <Skeleton className="mb-2 h-3 w-40" />
              <Skeleton className="h-9 w-64 sm:h-10 sm:w-72" />
              <div className="mt-3 h-[2px] w-16 rounded-full bg-warm-200" />
              <Skeleton className="mt-3 h-3 w-64" />
            </div>

            <div className="space-y-4">
              <Skeleton className="h-12 w-full rounded-xl" />
              <Skeleton className="h-12 w-full rounded-xl" />
              <Skeleton className="h-12 w-full rounded-xl" />
            </div>

            <div className="mt-6 flex flex-col items-center gap-1">
              <Skeleton className="h-4 w-40" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
