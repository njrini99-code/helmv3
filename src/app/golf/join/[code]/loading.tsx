export default function Loading() {
  return (
    <div className="min-h-dvh bg-auth-golf relative">
      {/* Floating orbs — mirrors the real page's (GolfJoinTeamClient) orb composition */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="auth-orb auth-orb-1 w-[400px] h-[400px] sm:w-[500px] sm:h-[500px] -top-24 -right-24 bg-gradient-to-br from-primary-400/40 to-primary-500/25" />
        <div className="auth-orb auth-orb-2 w-[350px] h-[350px] sm:w-[400px] sm:h-[400px] -bottom-20 -left-20 bg-gradient-to-tr from-primary-400/25 to-primary-400/15" />
        <div className="auth-orb auth-orb-3 hidden sm:block w-[200px] h-[200px] top-1/3 left-[8%] bg-gradient-to-br from-primary-300/20 to-primary-400/15" />
      </div>

      <div className="relative min-h-dvh flex flex-col items-center justify-center p-4 sm:p-6 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        {/* Logo */}
        <div className="mb-6 sm:mb-8">
          <div className="skeleton-shimmer w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-warm-900/10" />
        </div>

        {/* Card — same auth-glass-card + rounded-3xl as the real card, not a
            flat gray glass-standard box */}
        <div className="w-full max-w-lg">
          <div className="auth-glass-card rounded-3xl overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-br from-primary-50/80 to-white/50 border-b border-warm-200/45 p-6 sm:p-8 text-center">
              <div className="skeleton-shimmer w-20 h-20 rounded-lg bg-warm-900/8 mx-auto mb-4" />
              <div className="skeleton-shimmer h-7 w-48 rounded-lg bg-warm-900/10 mx-auto" />
              <div className="skeleton-shimmer h-4 w-40 rounded bg-warm-900/8 mx-auto mt-3" />
            </div>

            {/* Body */}
            <div className="p-6 sm:p-8">
              {/* "Joining as" card */}
              <div className="mb-6">
                <div className="flex items-center gap-3 p-4 bg-warm-50/80 rounded-xl border border-warm-200/50">
                  <div className="skeleton-shimmer w-10 h-10 rounded-full bg-warm-900/10 flex-shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="skeleton-shimmer h-3 w-20 rounded bg-warm-900/8" />
                    <div className="skeleton-shimmer h-4 w-32 rounded bg-warm-900/10" />
                  </div>
                </div>
              </div>

              {/* "One Team Only" notice */}
              <div className="mb-6 p-4 bg-primary-50/80 border border-primary-200/50 rounded-xl space-y-2">
                <div className="skeleton-shimmer h-3.5 w-24 rounded bg-primary-900/10" />
                <div className="skeleton-shimmer h-3 w-full rounded bg-primary-900/8" />
                <div className="skeleton-shimmer h-3 w-3/4 rounded bg-primary-900/8" />
              </div>

              {/* Actions */}
              <div className="space-y-3">
                <div className="skeleton-shimmer h-12 w-full rounded-xl bg-primary-600/15" />
                <div className="skeleton-shimmer h-12 w-full rounded-xl bg-warm-900/8" />
              </div>

              <div className="mt-6 pt-6 border-t border-warm-200/50">
                <div className="skeleton-shimmer h-3 w-full max-w-sm rounded bg-warm-900/8 mx-auto" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
