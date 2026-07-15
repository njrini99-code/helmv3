import { HelmMark } from '@/components/brand/HelmMark';
import { EntryField } from '@/components/baseball/scenes/EntryField';
import { Skeleton } from '@/components/ui/skeleton';
import '@/components/marketing/first-light/first-light.css';
import './onboarding-entry.css';

/**
 * Route-transition fallback for coach-onboarding — mirrors the wizard's
 * guaranteed first-rendered step, the `'type'` pre-step (fixed full-bleed
 * `<EntryField>` scene, `HelmMark` masthead, and a flat list of
 * `OptionCard`-shaped rows) instead of the generic dashboard-card
 * `PageLoading` skeleton, so a navigation into this wizard reads as one
 * visual language instead of flashing an unrelated dashboard-list skeleton
 * first (mobile findings, onboarding-auth group).
 *
 * The `'type'` step renders neither a `<StepProgress>` bar (gated by
 * `step !== 'type'` in page.tsx) nor an `<EditorialFrame>` bezel — both are
 * later-step chrome — so this skeleton omits them too rather than showing
 * chrome the real first paint never draws. The 4 bordered rows below stand
 * in for `COACH_TYPES`' 4 flat `OptionCard` tiles (icon swatch + title/
 * description lines), un-bezeled, matching each tile's own
 * `rounded-2xl border p-5` shape directly instead of wrapping them.
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

        {/* Flat OptionCard-shaped rows — stand-in for the 4 COACH_TYPES
            tiles on the 'type' step. No outer bezel/frame: the real step
            doesn't wrap them in one either. */}
        <div
          className="w-full max-w-[460px] space-y-3"
          aria-busy="true"
          aria-label="Loading coach onboarding"
        >
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="flex w-full items-center gap-4 rounded-2xl border border-[color:var(--hairline)] bg-[var(--paper)] p-5"
            >
              <Skeleton className="h-12 w-12 flex-shrink-0 rounded-fw-sm" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
