export default function Loading() {
  return (
    <div className="min-h-dvh bg-[#FFFEFA] flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Team logo placeholder */}
        <div className="flex justify-center">
          <div className="skeleton-shimmer h-16 w-16 rounded-2xl" />
        </div>

        {/* Team info card */}
        <div className="glass-standard rounded-2xl p-8 space-y-5">
          {/* Team name */}
          <div className="text-center space-y-2">
            <div className="skeleton-shimmer h-7 w-48 mx-auto rounded-lg" />
            <div className="skeleton-shimmer h-4 w-36 mx-auto rounded" />
          </div>

          {/* Team details */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center gap-3">
              <div className="skeleton-shimmer h-5 w-5 rounded" />
              <div className="skeleton-shimmer h-4 w-40 rounded" />
            </div>
            <div className="flex items-center gap-3">
              <div className="skeleton-shimmer h-5 w-5 rounded" />
              <div className="skeleton-shimmer h-4 w-32 rounded" />
            </div>
          </div>

          {/* Join button */}
          <div className="skeleton-shimmer h-10 w-full rounded-lg mt-4" />
        </div>
      </div>
    </div>
  );
}
