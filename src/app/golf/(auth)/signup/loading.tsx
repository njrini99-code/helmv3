export default function Loading() {
  return (
    <div className="min-h-screen bg-[#FFFEFA] flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Logo placeholder */}
        <div className="flex justify-center">
          <div className="skeleton-shimmer h-10 w-32 rounded-lg" />
        </div>
        {/* Title */}
        <div className="skeleton-shimmer h-8 w-48 mx-auto rounded-lg" />
        {/* Form card */}
        <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl p-8 space-y-4">
          <div className="skeleton-shimmer h-4 w-20 rounded" />
          <div className="skeleton-shimmer h-10 w-full rounded-lg" />
          <div className="skeleton-shimmer h-4 w-20 rounded" />
          <div className="skeleton-shimmer h-10 w-full rounded-lg" />
          <div className="skeleton-shimmer h-4 w-20 rounded" />
          <div className="skeleton-shimmer h-10 w-full rounded-lg" />
          <div className="skeleton-shimmer h-10 w-full rounded-lg mt-2" />
        </div>
      </div>
    </div>
  );
}
