export default function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#FAF6F1]">
      <div className="flex flex-col items-center gap-4">
        <div className="w-8 h-8 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-slate-600">Loading...</p>
      </div>
    </div>
  );
}
