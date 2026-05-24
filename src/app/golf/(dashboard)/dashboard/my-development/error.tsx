'use client';

export default function Error({
  _error,
  reset,
}: {
  _error: Error & { digest?: string };
  reset: () => void;
}) {
  console.error(_error);
  return (
    <div className="p-6">
      <div className="bg-white rounded-2xl border border-warm-200 p-8 text-center">
        <h2 className="text-[20px] font-medium text-warm-900 tracking-[-0.015em] mb-2">Failed to load your development plan</h2>
        <p className="text-warm-600 mb-4">{'An error occurred'}</p>
        <button
          onClick={reset}
          className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
