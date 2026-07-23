export default function Loading() {
  return (
    <div className="min-h-dvh bg-auth-golf relative">
      {/* Floating orbs — mirrors the real page's (JoinTeamPage) orb composition */}
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

        <div className="w-full max-w-md">
          {/* Header */}
          <div className="text-center mb-6">
            <div className="skeleton-shimmer w-16 h-16 rounded-full bg-primary-50/80 mx-auto mb-4" />
            <div className="skeleton-shimmer h-7 sm:h-8 w-40 rounded-lg bg-warm-900/10 mx-auto" />
            <div className="skeleton-shimmer h-4 w-64 max-w-full rounded bg-warm-900/8 mx-auto mt-3" />
          </div>

          {/* Card — same auth-glass-card + rounded-3xl as the real card */}
          <div className="auth-glass-card rounded-3xl p-6 sm:p-8">
            <div className="space-y-4">
              <div>
                <div className="skeleton-shimmer h-3 w-24 rounded bg-warm-900/8 mb-2" />
                <div className="skeleton-shimmer h-12 w-full rounded-xl bg-warm-900/8" />
                <div className="skeleton-shimmer h-3 w-40 rounded bg-warm-900/8 mx-auto mt-2" />
              </div>
              <div className="skeleton-shimmer h-12 w-full rounded-xl bg-primary-600/15" />
            </div>

            <div className="skeleton-shimmer h-3 w-56 max-w-full rounded bg-warm-900/8 mx-auto mt-4" />
          </div>
        </div>
      </div>
    </div>
  );
}
