/**
 * Skeleton for /dashboard/my-standing while server data loads.
 */
export default function MyStandingLoading() {
  return (
    <div className="max-w-[720px] mx-auto px-4 md:px-6 py-6 md:py-8 animate-pulse">
      <div className="h-8 w-44 bg-warm-100 rounded mb-3" />
      <div className="surface-stone rounded-3xl p-6 md:p-10 mb-6">
        <div className="h-4 w-24 bg-warm-100 rounded mb-3" />
        <div className="h-8 w-72 bg-warm-100 rounded mb-2" />
        <div className="h-3 w-96 bg-warm-100 rounded" />
      </div>
      {[1, 2, 3].map((i) => (
        <section key={i} className="mb-8">
          <div className="h-4 w-32 bg-warm-100 rounded mb-1" />
          <div className="h-3 w-64 bg-warm-100 rounded mb-3" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[0, 1].map((j) => (
              <div
                key={j}
                className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl p-5 h-[140px]"
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
