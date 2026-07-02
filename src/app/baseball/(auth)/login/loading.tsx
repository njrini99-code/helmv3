export default function Loading() {
  return (
    <div className="min-h-[100dvh] flex items-center justify-center baseball-auth-field">
      <div className="w-full max-w-md p-8 animate-pulse">
        <div className="h-8 w-32 bg-warm-200 rounded mb-8 mx-auto" />
        <div className="space-y-4">
          <div className="h-12 bg-warm-200 rounded-lg" />
          <div className="h-12 bg-warm-200 rounded-lg" />
          <div className="h-12 bg-warm-200 rounded-lg mt-6" />
        </div>
      </div>
    </div>
  );
}
