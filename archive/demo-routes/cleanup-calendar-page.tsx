'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { deleteAllGolfEvents } from '@/app/golf/actions/cleanup-events';

export default function CleanupCalendarPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function handleCleanup() {
    if (!confirm('Delete ALL calendar events? This will remove all events for your team.')) {
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      await deleteAllGolfEvents();
      setResult('✅ All calendar events deleted! Now go to Classes page and sync your classes.');
    } catch (error) {
      setResult(`❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen p-8" style={{ background: 'linear-gradient(180deg, #FFFEFA 0%, #F5F0E6 100%)' }}>
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm">
          <h1 className="text-2xl font-semibold text-slate-900 mb-4">
            Calendar Cleanup
          </h1>
          <p className="text-slate-600 mb-6">
            This will delete ALL calendar events for your team. Use this if you're seeing duplicate or incorrectly-timed events on your calendar.
          </p>

          <button
            onClick={handleCleanup}
            disabled={loading}
            className="bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white px-6 py-3 rounded-lg font-medium transition-colors"
          >
            {loading ? 'Deleting...' : 'Delete All Calendar Events'}
          </button>

          {result && (
            <div className={`mt-6 p-4 rounded-lg ${result.startsWith('✅') ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
              {result}
            </div>
          )}

          {result?.startsWith('✅') && (
            <div className="mt-4">
              <button
                onClick={() => router.push('/golf/dashboard/classes')}
                className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
              >
                Go to Classes Page →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
