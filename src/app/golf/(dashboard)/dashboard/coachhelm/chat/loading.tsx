export default function Loading() {
  return (
    <div className="max-w-[1536px] mx-auto px-4 md:px-6 py-6 md:py-8">
      <div className="h-10 w-48 bg-white/40 rounded-xl animate-pulse mb-6" />
      <div className="grid grid-cols-12 gap-4 md:gap-6">
        <div className="col-span-12 md:col-span-4 lg:col-span-3 space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-10 bg-white/40 rounded-xl animate-pulse" />
          ))}
        </div>
        <div className="col-span-12 md:col-span-8 lg:col-span-9 h-[60vh] bg-white/40 rounded-2xl animate-pulse" />
      </div>
    </div>
  );
}
