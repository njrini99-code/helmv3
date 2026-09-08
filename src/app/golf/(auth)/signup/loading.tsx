/**
 * Loading UI for `/golf/signup`.
 *
 * `page.tsx` is a client component whose `accessGranted` state starts
 * `false` (page.tsx:40), so the deterministic first paint at t=0 is always
 * the team-code gate branch (page.tsx:111-250) — `GolfSignUpForm` isn't
 * mounted until a valid code is submitted. That branch renders a single
 * `bg-surface border-border-subtle rounded-fw-lg` card (page.tsx:129) with
 * a logo + "GolfHelm" wordmark (page.tsx:137-153), an "Enter your team
 * code" heading + subtitle (page.tsx:156-163), one team-code input and one
 * "Continue" button (page.tsx:165-201), and a small sign-in/demo footer
 * panel below the card (page.tsx:217-244).
 *
 * `page.tsx` was migrated onto these Fairway tokens in 61bb959be ("signup
 * screen joins Fairway"), which retired every `warm-*`/`cream-*`/glass use
 * on the page — but that commit didn't touch this file, so the previous
 * version still used the retired flat `bg-auth-golf` background and
 * `glass-standard` card, and skeletoned three label+input rows: the shape
 * of the populated `GolfSignUpForm`, which never renders at t=0.
 */
export default function Loading() {
  return (
    <div
      className="min-h-dvh flex items-center justify-center relative overflow-hidden p-4 sm:p-6"
      role="status"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="relative z-10 w-full max-w-[420px]">
        <div className="bg-surface border border-border-subtle rounded-fw-lg p-6 sm:p-8">
          {/* Logo + "GolfHelm" wordmark */}
          <div className="flex flex-col items-center mb-6 sm:mb-8">
            <div className="skeleton-shimmer h-12 w-12 sm:h-14 sm:w-14 rounded-full mb-3 sm:mb-4" />
            <div className="skeleton-shimmer h-5 sm:h-6 w-28 rounded-lg" />
          </div>

          {/* "Enter your team code" heading + subtitle */}
          <div className="flex flex-col items-center mb-6 space-y-2">
            <div className="skeleton-shimmer h-6 sm:h-7 w-48 rounded-lg" />
            <div className="skeleton-shimmer h-4 w-full rounded" />
            <div className="skeleton-shimmer h-4 w-5/6 rounded" />
          </div>

          {/* Team-code input + Continue button */}
          <div className="space-y-4">
            <div className="skeleton-shimmer h-12 w-full rounded-xl" />
            <div className="skeleton-shimmer h-12 w-full rounded-xl" />
          </div>
        </div>

        {/* Sign-in / demo footer panel */}
        <div className="mx-auto mt-5 sm:mt-6 w-fit max-w-full flex flex-col items-center gap-2 rounded-2xl bg-surface/95 px-4 py-3 shadow-sm ring-1 ring-border-subtle">
          <div className="skeleton-shimmer h-4 w-56 rounded" />
          <div className="skeleton-shimmer h-4 w-44 rounded" />
        </div>
      </div>
      <span className="sr-only">Loading the GolfHelm sign-up form&hellip;</span>
    </div>
  );
}
