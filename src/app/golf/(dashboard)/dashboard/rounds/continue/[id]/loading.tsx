export default function Loading() {
  return (
    <div className="p-6 space-y-6">
      <div className="animate-pulse">
        <div className="h-8 bg-warm-200 rounded w-48 mb-2" />
        <div className="h-4 bg-warm-200 rounded w-72" />
      </div>
      <div className="bg-white rounded-2xl border border-warm-200 p-6 animate-pulse">
        <div className="h-6 bg-warm-200 rounded w-1/3 mb-4" />
        <div className="grid grid-cols-9 gap-2 mb-4">
          {[...Array(9)].map((_, i) => (
            <div key={i} className="h-12 bg-warm-200 rounded" />
          ))}
        </div>
        <div className="h-10 bg-warm-200 rounded w-32" />
      </div>
    </div>
  );
}
