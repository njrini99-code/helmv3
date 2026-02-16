'use client';

import { useCallback, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  IconRefresh,
  IconSparkles,
  IconArrowLeft,
} from '@/components/icons';
import { PatternDashboard } from '@/components/golf/coachhelm/patterns';
import type { ExtendedPattern, PatternSeverity } from '@/app/golf/actions/pattern-management';

// ============================================================================
// TYPES
// ============================================================================

interface PatternsDashboardClientProps {
  initialPatterns: ExtendedPattern[];
  initialStats?: {
    total: number;
    detected: number;
    confirmed: number;
    addressed: number;
    resolved: number;
    dismissed: number;
    byPlayer: Array<{ playerId: string; playerName: string; count: number }>;
    byType: Record<string, number>;
    bySeverity: Record<PatternSeverity, number>;
  };
}

// ============================================================================
// CLIENT COMPONENT
// ============================================================================

export function PatternsDashboardClient({
  initialPatterns,
  initialStats,
}: PatternsDashboardClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [patterns] = useState(initialPatterns);
  const [stats] = useState(initialStats);

  const handleRefresh = useCallback(() => {
    startTransition(() => {
      router.refresh();
    });
  }, [router]);

  return (
    <div className="min-h-full bg-transparent">
      {/* Header */}
      <div className="bg-white/70 backdrop-blur-xl border-b border-white/20 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {/* Back button */}
              <button
                onClick={() => router.push('/golf/dashboard')}
                className="p-2 rounded-lg text-warm-400 hover:text-warm-600 hover:bg-warm-100 transition-colors"
              >
                <IconArrowLeft size={20} />
              </button>

              {/* Title */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center shadow-lg shadow-primary-500/20">
                  <IconSparkles size={20} className="text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-semibold text-warm-900">
                    Pattern Management
                  </h1>
                  <p className="text-sm text-warm-500">
                    Review and manage AI-detected performance patterns
                  </p>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3">
              <button
                onClick={handleRefresh}
                disabled={isPending}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors',
                  'bg-white border border-warm-200 text-warm-700',
                  'hover:bg-warm-50 hover:border-warm-300',
                  isPending && 'opacity-50 cursor-not-allowed'
                )}
              >
                <IconRefresh size={16} className={isPending ? 'animate-spin' : ''} />
                Refresh
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        <PatternDashboard
          patterns={patterns}
          stats={stats}
          onRefresh={handleRefresh}
        />
      </div>
    </div>
  );
}
