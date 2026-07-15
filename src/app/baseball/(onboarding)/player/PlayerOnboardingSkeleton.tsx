/**
 * PlayerOnboardingSkeleton — the wizard's own chrome (fixed full-bleed
 * `<EntryField>` scene + `HelmMark` masthead + a plain pulse card standing
 * in for the step content) extracted so there is exactly ONE loading look
 * for this route, reused as:
 *   1. this segment's `loading.tsx` fallback (the route-transition flash), and
 *   2. `page.tsx`'s own `authLoading` gate return.
 *
 * Before this fix a fresh signup landing on this wizard saw THREE unrelated
 * skeleton languages stack in sequence — the generic dashboard-card
 * `PageLoading`/`GenericPageSkeleton` (imported by both the route's own
 * `loading.tsx` AND the `authLoading` gate) sandwiched around this file's own
 * flat-pulse-bars-on-`#FAF6F1` shell — on the exact flow (fresh account
 * onboarding) where a coherent first impression matters most (mobile
 * findings, onboarding-auth group).
 *
 * `stage={0}` ("bare morning air") + `variant="dawn"` match the wizard's own
 * pre-mount defaults (its `sceneStage` starts at the `type` step's stage 0;
 * `sceneVariant` state starts `'dawn'` before the client-only clock effect
 * resolves it) so there's no visible scene jump when the real wizard mounts.
 * A distinct `idSuffix` keeps this component's SVG gradient/filter ids from
 * ever colliding with the real wizard's `EntryField` (they never render
 * simultaneously, but the ids should stay unique on principle).
 */
import { HelmMark } from '@/components/brand/HelmMark';
import { EntryField } from '@/components/baseball/scenes/EntryField';
import { Skeleton } from '@/components/ui/skeleton';
import '@/components/marketing/first-light/first-light.css';
import './onboarding-entry.css';

export function PlayerOnboardingSkeleton() {
  return (
    <div className="entry-onboarding-scope entry-onboarding-root relative min-h-dvh overflow-hidden">
      {/* Full-bleed field scene — same fixed placement as the real wizard. */}
      <div aria-hidden className="fixed inset-0 z-0">
        <EntryField idSuffix="player-onboarding-skeleton-field" stage={0} variant="dawn" />
      </div>

      <div className="relative z-10 flex min-h-dvh flex-col items-center justify-center p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:p-6">
        {/* Logo */}
        <div className="mb-6 sm:mb-8">
          <HelmMark
            sport="baseball"
            size={48}
            className="h-10 w-10 sm:h-12 sm:w-12"
            glow
            glowClassName="blur-xl scale-150"
            glowOpacity={0.2}
            alt="BaseballHelm Logo"
            unoptimized
          />
        </div>

        {/* Plain pulse card standing in for the wizard's glass panel */}
        <div className="entry-glass-card w-full max-w-[460px] rounded-3xl p-6 sm:p-8" aria-busy="true" aria-label="Loading player onboarding">
          <Skeleton className="mx-auto h-5 w-40" />
          <div className="mt-6 space-y-4">
            <Skeleton className="h-12 w-full rounded-xl" />
            <Skeleton className="h-12 w-full rounded-xl" />
            <Skeleton className="h-12 w-full rounded-xl" />
          </div>
        </div>
      </div>
    </div>
  );
}
