export default function Loading() {
  return (
    <div className="p-6 animate-pulse">
      <div className="h-8 w-48 bg-warm-200 rounded mb-6" />
      <div className="aspect-video bg-warm-200 rounded-lg mb-6" />
      <div className="space-y-4">
        <div className="h-12 bg-warm-200 rounded-lg" />
        <div className="h-24 bg-warm-200 rounded-lg" />
        <div className="h-12 w-32 bg-warm-200 rounded-lg" />
      </div>
    </div>
  );
}
