'use client';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#FAF6F1]">
      <div className="text-center p-8">
        <h2 className="text-xl font-semibold text-slate-900 mb-2">Failed to validate invite</h2>
        <p className="text-slate-600 mb-4">{error.message || 'An error occurred'}</p>
        <button
          onClick={reset}
          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
