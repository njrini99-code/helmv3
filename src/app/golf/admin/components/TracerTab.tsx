'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { RefreshCw } from 'lucide-react';
import {
  getTracerData,
  getTracerEnrichedData,
  type TracerData,
  type TracerEnrichedData,
} from '@/app/golf/actions/admin-tracer-data';
import { timeAgo } from './admin-utils';

// Sub-tab components
import { TracerSubTabNav } from './tracer/TracerSubTabNav';
import TracerHealthOverview from './tracer/TracerHealthOverview';
import { TracerRoundInspector } from './tracer/TracerRoundInspector';
import { TracerDataQuality } from './tracer/TracerDataQuality';
import TracerErrorAnalytics from './tracer/TracerErrorAnalytics';
import { RoundDiagnosticModal } from './tracer/RoundDiagnosticModal';
import { TracerSkeleton } from './tracer/TracerSkeleton';

// Types & utils
import type { TracerSubTab, TracerSubTabConfig } from './tracer/tracer-types';
import {
  computeHealthScore,
  flattenRounds,
  computeCompleteness,
  detectOutliers,
  generateAlerts,
  groupErrors,
  getMostAffectedPlayers,
  computeKPIs,
} from './tracer/tracer-utils';

// ============================================================================
// TRACER TAB (Command Center Orchestrator)
// ============================================================================

export function TracerTab() {
  // Core data
  const [data, setData] = useState<TracerData | null>(null);
  const [enrichedData, setEnrichedData] = useState<TracerEnrichedData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  // Sub-tab state
  const [activeTab, setActiveTab] = useState<TracerSubTab>('health');

  // Diagnostic modal
  const [diagnosticRoundId, setDiagnosticRoundId] = useState<string | null>(null);

  // ------------------------------------------------------------------
  // Data fetching
  // ------------------------------------------------------------------

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const [baseData, enriched] = await Promise.all([
        getTracerData(),
        getTracerEnrichedData(),
      ]);
      setData(baseData);
      setEnrichedData(enriched);
      setError(null);
      setLastRefresh(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tracer data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(() => loadData(true), 60000);
    return () => clearInterval(interval);
  }, [loadData]);

  // ------------------------------------------------------------------
  // Computed values (memoized)
  // ------------------------------------------------------------------

  const kpis = useMemo(() => (data ? computeKPIs(data) : null), [data]);
  const healthScore = useMemo(() => (data ? computeHealthScore(data) : null), [data]);
  const flatRounds = useMemo(() => (data ? flattenRounds(data) : []), [data]);
  const completeness = useMemo(() => (data ? computeCompleteness(data) : []), [data]);
  const outliers = useMemo(() => (data ? detectOutliers(data) : []), [data]);
  const alerts = useMemo(
    () => (data && enrichedData ? generateAlerts(data, enrichedData.stuckRounds) : []),
    [data, enrichedData]
  );
  const errorGroups = useMemo(
    () => (data ? groupErrors(data.recentErrors) : []),
    [data]
  );
  const affectedPlayers = useMemo(
    () => (data ? getMostAffectedPlayers(data.recentErrors, data) : []),
    [data]
  );

  // Sparkline data from enriched
  const sparklineData = useMemo(() => {
    if (!enrichedData) return undefined;
    return {
      rounds: enrichedData.dailyRoundCounts.map((d) => d.count),
      errors: enrichedData.dailyErrorCounts.map((d) => d.count),
    };
  }, [enrichedData]);

  // Tab configs with badges
  const tabs: TracerSubTabConfig[] = useMemo(() => {
    const errorCount = data?.errorStats.total7d ?? 0;
    return [
      { id: 'health' as const, label: 'Health' },
      { id: 'rounds' as const, label: 'Rounds' },
      { id: 'quality' as const, label: 'Data Quality' },
      { id: 'errors' as const, label: 'Errors', badge: errorCount > 0 ? errorCount : undefined },
    ];
  }, [data]);

  // ------------------------------------------------------------------
  // Loading / Error states
  // ------------------------------------------------------------------

  if (loading) return <TracerSkeleton activeTab={activeTab} />;

  if (error) {
    return (
      <div className="bg-red-50/80 backdrop-blur-sm border border-red-200 rounded-2xl p-8 text-center">
        <p className="text-warm-900 font-semibold">Failed to load tracer data</p>
        <p className="text-warm-500 text-sm mt-1 max-w-md mx-auto">{error}</p>
        <button
          onClick={() => loadData()}
          className="mt-4 px-5 py-2.5 bg-white/90 border border-warm-200 rounded-xl text-sm font-medium hover:bg-white hover:shadow-sm transition-all"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!data || !kpis || !healthScore) return null;

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Live Status Bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
          </span>
          <span className="text-xs font-medium text-warm-500">
            Live · Shot Tracking Tracer
          </span>
          {lastRefresh && (
            <span className="text-xs text-warm-400">
              · {timeAgo(lastRefresh.toISOString())}
            </span>
          )}
        </div>
        <button
          onClick={() => loadData(true)}
          disabled={refreshing}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
            'bg-white/60 border border-white/30 text-warm-500 hover:bg-white/80 hover:text-warm-700',
            refreshing && 'opacity-60 cursor-not-allowed'
          )}
        >
          <RefreshCw size={12} className={cn(refreshing && 'animate-spin')} />
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {/* Sub-tab Navigation */}
      <TracerSubTabNav
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      {/* Sub-tab Content */}
      {activeTab === 'health' && (
        <TracerHealthOverview
          healthScore={healthScore.score}
          healthBreakdown={{
            completionScore: healthScore.completionScore,
            qualityScore: healthScore.qualityScore,
            errorScore: healthScore.errorScore,
          }}
          totalRounds={kpis.totalRounds}
          completedRounds={kpis.completedRounds}
          completionRate={kpis.completionRate}
          errors7d={data.errorStats.total7d}
          critical7d={data.errorStats.critical7d}
          statsMismatches={kpis.statsMismatches}
          alerts={alerts}
          activityFeed={data.activityFeed}
          sparklineData={sparklineData}
          onNavigate={setActiveTab}
        />
      )}

      {activeTab === 'rounds' && (
        <TracerRoundInspector
          rounds={flatRounds}
          onDiagnose={(roundId) => setDiagnosticRoundId(roundId)}
        />
      )}

      {activeTab === 'quality' && (
        <TracerDataQuality
          statsAccuracy={data.statsAccuracy}
          completeness={completeness}
          outliers={outliers}
        />
      )}

      {activeTab === 'errors' && (
        <TracerErrorAnalytics
          errorGroups={errorGroups}
          affectedPlayers={affectedPlayers}
          dailyErrorCounts={enrichedData?.dailyErrorCounts ?? []}
          recentErrors={data.recentErrors}
          totalErrors7d={data.errorStats.total7d}
          criticalErrors7d={data.errorStats.critical7d}
        />
      )}

      {/* Diagnostic Modal */}
      <RoundDiagnosticModal
        isOpen={diagnosticRoundId !== null}
        onClose={() => setDiagnosticRoundId(null)}
        roundId={diagnosticRoundId}
      />
    </div>
  );
}
