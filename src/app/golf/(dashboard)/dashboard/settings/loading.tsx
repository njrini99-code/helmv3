import { Skeleton } from '@/components/fairway/feedback/Skeleton';
import { Surface, ViewHeader } from '@/components/fairway';
import { fairwayScope } from '@/lib/redesign/flag';

/**
 * Route Suspense fallback for /golf/dashboard/settings.
 *
 * page.tsx:6-11 renders FairwaySettingsGeneral, a 'use client' component with
 * NO server loader — it loads everything from useGolfUser() + the supabase
 * client (FairwaySettingsGeneral.tsx:465-569), so the real t=0 first paint
 * after that component mounts is its own `!profile` branch
 * (FairwaySettingsGeneral.tsx:638-658), not its populated/settled layout: a
 * bare `<ViewHeader title="Settings" />` — no description or meta, those only
 * render once `profile` resolves (:666-680) — followed by three generic
 * `Surface` cards, each holding a title-width skeleton and a
 * description-width skeleton (:649-654). Shape-matched literally, including
 * the exact classnames used there.
 */
export default function SettingsLoading() {
  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
      <div className="mx-auto w-full max-w-[1200px] px-4 py-6 md:px-6 md:py-8 pb-24">
        <ViewHeader title="Settings" />
        <div
          role="status"
          aria-busy="true"
          aria-live="polite"
          className="mt-8 flex flex-col gap-7"
        >
          <span className="sr-only">Loading settings…</span>
          {[1, 2, 3].map((i) => (
            <Surface key={i} elevation="border" padding="lg">
              <Skeleton className="h-5 w-40 rounded" />
              <Skeleton className="mt-3 h-3 w-64 rounded" />
            </Surface>
          ))}
        </div>
      </div>
    </div>
  );
}
