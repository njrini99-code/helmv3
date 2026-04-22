'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  IconRefresh,
} from '@/components/icons';
import { LargeTitleHeader } from '@/components/golf/layout/LargeTitleHeader';
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

  // Initialise from the server-rendered prop, then RE-SYNC on every
  // subsequent prop change. Without the useEffect, router.refresh() would
  // fetch fresh data from the server but the client would keep showing
  // the first-render snapshot forever.
  const [patterns, setPatterns] = useState(initialPatterns);
  const [stats, setStats] = useState(initialStats);

  useEffect(() => {
    setPatterns(initialPatterns);
  }, [initialPatterns]);

  useEffect(() => {
    setStats(initialStats);
  }, [initialStats]);

  const handleRefresh = useCallback(() => {
    startTransition(() => {
      router.refresh();
    });
  }, [router]);

  return (
    <div className="min-h-full bg-transparent">
      {/* Header */}
      <LargeTitleHeader
        title="Pattern Management"
        subtitle="Review and manage AI-detected performance patterns"
      >
        <button
          onClick={handleRefresh}
          disabled={isPending}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors',
            'bg-white border border-warm-200 text-warm-700',
            'hover:bg-warm-50 active:bg-warm-100 hover:border-warm-300',
            isPending && 'opacity-50 cursor-not-allowed'
          )}
        >
          <IconRefresh size={16} className={isPending ? 'animate-spin' : ''} />
          <span className="hidden sm:inline">Refresh</span>
        </button>
      </LargeTitleHeader>

      {/* Main content */}
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-8">
        <PatternDashboard
          patterns={patterns}
          stats={stats}
          onRefresh={handleRefresh}
        />
      </div>
    </div>
  );
}
