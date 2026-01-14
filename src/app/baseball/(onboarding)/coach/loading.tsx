export default function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#FAF6F1]">
      <div className="w-full max-w-2xl p-8 animate-pulse">
        <div className="h-8 w-48 bg-slate-200 rounded mb-4 mx-auto" />
        <div className="h-4 w-64 bg-slate-200 rounded mb-8 mx-auto" />
        <div className="space-y-6">
          <div className="h-16 bg-slate-200 rounded-lg" />
          <div className="h-16 bg-slate-200 rounded-lg" />
          <div className="h-16 bg-slate-200 rounded-lg" />
        </div>
        <div className="h-12 w-32 bg-slate-200 rounded-lg mt-8 mx-auto" />
      </div>
    </div>
  );
}
