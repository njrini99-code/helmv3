export default function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#FAF6F1]">
      <div className="flex flex-col items-center gap-3">
        <div className="animate-spin h-8 w-8 border-2 border-green-600 border-t-transparent rounded-full" />
        <p className="text-sm text-slate-500">Validating invite...</p>
      </div>
    </div>
  );
}
