export default function Loading() {
  return (
    <div className="p-6 animate-pulse">
      <div className="h-8 w-48 bg-slate-200 rounded mb-6" />
      <div className="aspect-video bg-slate-200 rounded-lg mb-6" />
      <div className="space-y-4">
        <div className="h-12 bg-slate-200 rounded-lg" />
        <div className="h-24 bg-slate-200 rounded-lg" />
        <div className="h-12 w-32 bg-slate-200 rounded-lg" />
      </div>
    </div>
  );
}
