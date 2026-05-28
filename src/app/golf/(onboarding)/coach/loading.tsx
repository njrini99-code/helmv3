export default function Loading() {
  return (
    <div className="min-h-dvh bg-cream-100 flex items-center justify-center p-4">
      <div className="w-full max-w-[460px] space-y-8">
        {/* Logo placeholder */}
        <div className="flex justify-center">
          <div className="skeleton-shimmer h-10 w-32 rounded-lg" />
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-0">
          {[1, 2, 3].map((step, index) => (
            <div key={step} className="flex items-center">
              {index > 0 && (
                <div className="h-[2px] w-8 sm:w-12 bg-warm-200 skeleton-shimmer" />
              )}
              <div className="w-8 h-8 rounded-full skeleton-shimmer" />
            </div>
          ))}
        </div>

        {/* Title */}
        <div className="text-center space-y-2">
          <div className="skeleton-shimmer h-7 w-56 mx-auto rounded-lg" />
          <div className="skeleton-shimmer h-4 w-72 mx-auto rounded" />
        </div>

        {/* Form card */}
        <div className="glass-standard rounded-2xl p-8 space-y-5">
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-2">
              <div className="skeleton-shimmer h-4 w-24 rounded" />
              <div className="skeleton-shimmer h-10 w-full rounded-lg" />
            </div>
          ))}
          <div className="flex justify-end pt-4">
            <div className="skeleton-shimmer h-10 w-28 rounded-lg" />
          </div>
        </div>
      </div>
    </div>
  );
}
