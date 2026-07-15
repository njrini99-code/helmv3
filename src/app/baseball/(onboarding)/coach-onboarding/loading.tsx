import { HelmMark } from '@/components/brand/HelmMark';
import { EntryField } from '@/components/baseball/scenes/EntryField';
import { Skeleton } from '@/components/ui/skeleton';
import '@/components/marketing/first-light/first-light.css';
import './onboarding-entry.css';

/**
 * Route-transition fallback for coach-onboarding — mirrors the wizard's own
 * shell (fixed full-bleed `<EntryField>` scene, `HelmMark` masthead, the
 * numbered-eyebrow progress rule, and the `EditorialFrame` double-bezel
 * panel) instead of the generic dashboard-card `PageLoading` skeleton, so a
 * navigation into this wizard reads as one visual language instead of
 * flashing an unrelated dashboard-list skeleton first (mobile findings,
 * onboarding-auth group).
 *
 * `stage={0}` ("bare morning air") + `variant="dawn"` match the wizard's own
 * pre-mount defaults (`sceneStage` starts at the `'type'` pre-step's stage 0;
 * `sceneVariant` state starts `'dawn'` before the client-only clock effect
 * resolves it), so there's no visible scene jump on mount. A distinct
 * `idSuffix` keeps this component's SVG gradient/filter ids from colliding
 * with the real wizard's `EntryField`.
 */
export default function CoachOnboardingLoading() {
  return (
    <div className="living-annual entry-onboarding-scope relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-4 py-10 sm:px-6">
      <div aria-hidden className="fixed inset-0 z-0">
        <EntryField idSuffix="coach-onboarding-skeleton-field" stage={0} variant="dawn" />
      </div>

      <div className="relative z-10 flex w-full flex-col items-center pb-[env(safe-area-inset-bottom)]">
        {/* Masthead */}
        <div className="mb-7 flex flex-col items-center gap-2 sm:mb-9">
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
          <Skeleton className="h-3 w-48" />
        </div>

        {/* Progress rule — mirrors StepProgress's numbered eyebrow + hairline */}
        <div className="mb-8 w-full max-w-[460px] sm:mb-10">
          <Skeleton className="mx-auto h-3 w-40" />
          <Skeleton className="mt-3 h-[2px] w-full rounded-full" />
        </div>

        {/* EditorialFrame double-bezel panel, empty of registration ticks —
            a plain pulse card standing in for the step content. */}
        <div className="entry-editorial-frame relative w-full max-w-[460px] rounded-3xl p-1.5" aria-busy="true" aria-label="Loading coach onboarding">
          <div className="entry-editorial-frame-inner relative overflow-hidden rounded-2xl">
            <div className="relative space-y-4 p-6 sm:p-8">
              <Skeleton className="h-12 w-full rounded-xl" />
              <Skeleton className="h-12 w-full rounded-xl" />
              <Skeleton className="h-12 w-full rounded-xl" />
              <Skeleton className="mt-2 h-12 w-full rounded-xl" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
