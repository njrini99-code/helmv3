export default function Loading() {
  return (
    <div className="min-h-dvh flex items-center justify-center bg-[#FAF6F1]">
      <div className="w-full max-w-md p-8 animate-pulse">
        <div className="h-8 w-32 bg-slate-200 rounded mb-8 mx-auto" />
        <div className="space-y-4">
          <div className="h-12 bg-slate-200 rounded-lg" />
          <div className="h-12 bg-slate-200 rounded-lg" />
          <div className="h-12 bg-slate-200 rounded-lg mt-6" />
        </div>
      </div>
    </div>
  );
}
