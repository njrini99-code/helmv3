/**
 * Loading UI for `/golf/demo`.
 *
 * Without this file the route fell through to `src/app/golf/loading.tsx`, which
 * renders `FairwayShellSkeleton` wrapping `FairwayDashboardSkeleton` — the full
 * SIGNED-IN chrome (nav rail with Dashboard / Team / Calendar, top bar,
 * dashboard card grid) plus an `sr-only` "Loading dashboard…".
 *
 * That is wrong twice on this page: it shows app furniture to someone who has
 * not signed in, and it announces the dashboard to a screen-reader user who is
 * on a marketing page. It also lands on the worst possible visitor — `/golf/demo`
 * is where a prospective COACH arrives ("Step inside a live GolfHelm team"), so
 * it was the buyer's first impression, and 843f7b158 linked the signup gate here
 * as well.
 *
 * `golf/loading.tsx`'s docblock already listed `/golf/(auth)/demo` in its blast
 * radius while also claiming every auth route had its own closer boundary. This
 * is the file that makes the second half true; the shape mirrors the real first
 * paint of `demo/page.tsx` — centred column, logo, headline block, feature
 * chips, then the 420px form card — so the hand-off changes content, not layout.
 *
 * Guarded by `src/test/static/golf-auth-loading-boundaries.test.ts`.
 */
export default function Loading() {
  return (
    <div className="relative overflow-hidden min-h-dvh">
      <div className="relative z-10 flex flex-col items-center px-5 py-10 sm:py-14">
        {/* Logo lockup */}
        <div className="flex flex-col items-center gap-2 mb-6 sm:mb-8">
          <div className="skeleton-shimmer bg-warm-900/10 h-10 w-36 rounded-lg" />
        </div>

        {/* Headline + subcopy */}
        <div className="text-center mb-6 sm:mb-8 max-w-[380px] w-full space-y-3">
          <div className="skeleton-shimmer bg-warm-900/10 h-7 w-full rounded-lg" />
          <div className="skeleton-shimmer bg-warm-900/10 h-4 w-11/12 mx-auto rounded" />
          <div className="skeleton-shimmer bg-warm-900/10 h-4 w-9/12 mx-auto rounded" />
        </div>

        {/* Three feature chips */}
        <div className="flex flex-wrap items-center justify-center gap-2 mb-6 sm:mb-8">
          <div className="skeleton-shimmer bg-warm-900/10 h-7 w-28 rounded-full" />
          <div className="skeleton-shimmer bg-warm-900/10 h-7 w-36 rounded-full" />
          <div className="skeleton-shimmer bg-warm-900/10 h-7 w-32 rounded-full" />
        </div>

        {/* Request-access card: heading, sub, three fields, submit */}
        <div className="w-full max-w-[420px] rounded-2xl p-6 sm:p-8 space-y-4">
          <div className="space-y-2 text-center mb-1">
            <div className="skeleton-shimmer bg-warm-900/10 h-5 w-40 mx-auto rounded" />
            <div className="skeleton-shimmer bg-warm-900/10 h-4 w-56 mx-auto rounded" />
          </div>
          <div className="skeleton-shimmer bg-warm-900/10 h-10 w-full rounded-lg" />
          <div className="skeleton-shimmer bg-warm-900/10 h-10 w-full rounded-lg" />
          <div className="skeleton-shimmer bg-warm-900/10 h-10 w-full rounded-lg" />
          <div className="skeleton-shimmer bg-warm-900/10 h-11 w-full rounded-xl mt-2" />
        </div>
      </div>
      <span className="sr-only">Loading the GolfHelm demo request form…</span>
    </div>
  );
}
