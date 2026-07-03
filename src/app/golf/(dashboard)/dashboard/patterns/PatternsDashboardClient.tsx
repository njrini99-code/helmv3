'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  IconRefresh,
} from '@/components/icons';
import { LargeTitleHeader } from '@/components/golf/layout/LargeTitleHeader';
import { PatternDashboard } from '@/components/golf/coachhelm/patterns';
import { PageHeader } from '@/components/ui/page-header';
import { Reveal } from '@/components/ui/reveal';
import type { ExtendedPattern, PatternSeverity } from '@/app/golf/actions/pattern-management';
import { Button } from '@/components/ui/button';

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
        <Button variant="ghost"
          onClick={handleRefresh}
          disabled={isPending}
          aria-label="Refresh patterns"
          className={cn(
            'flex items-center gap-2 px-4 py-2 min-h-[44px] rounded-lg font-medium transition-colors',
            'bg-cream-50 border border-warm-200 text-warm-700',
            'hover:bg-warm-50 active:bg-warm-100 hover:border-warm-300',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-cream-50',
            isPending && 'opacity-50 cursor-not-allowed'
          )}
        >
          <IconRefresh size={16} className={isPending ? 'animate-spin' : ''} />
          <span className="hidden sm:inline">Refresh</span>
        </Button>
      </LargeTitleHeader>

      {/* Main content */}
      <div className="max-w-[1536px] mx-auto px-4 md:px-6 py-8">
        {/* Editorial hero plinth — magazine-cover framing for the
            pattern-mining surface, sculpted-matte foundation under
            the sticky LargeTitleHeader. */}
        <Reveal>
          <div className="surface-stone rounded-3xl p-6 md:p-10 mb-6">
            <PageHeader
              eyebrow="Pattern Mining"
              eyebrowAccent="primary"
              title="Patterns moving scores."
              subtitle={
                stats && stats.total > 0
                  ? `${stats.total} ${stats.total === 1 ? 'pattern' : 'patterns'} surfaced${
                      stats.detected + stats.confirmed > 0
                        ? ` · ${stats.detected + stats.confirmed} live`
                        : ''
                    }${stats.resolved > 0 ? ` · ${stats.resolved} resolved` : ''}.`
                  : 'AI-detected performance patterns across your roster will surface here as rounds come in.'
              }
            />
          </div>
        </Reveal>

        <PatternDashboard
          patterns={patterns}
          stats={stats}
          onRefresh={handleRefresh}
        />
      </div>
    </div>
  );
}
