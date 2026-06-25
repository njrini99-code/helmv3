export default function Loading() {
  return (
    <div className="max-w-[860px] mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6 animate-pulse">
      {/* Back link skeleton */}
      <div className="h-5 w-28 bg-warm-200 rounded" />
      {/* Title */}
      <div className="space-y-2">
        <div className="h-8 w-64 bg-warm-200 rounded" />
        <div className="h-4 w-48 bg-warm-100 rounded" />
      </div>
      {/* Player */}
      <div className="aspect-video bg-warm-200 rounded-2xl" />
      {/* Meta card */}
      <div className="h-16 bg-warm-100 rounded-xl" />
    </div>
  );
}
