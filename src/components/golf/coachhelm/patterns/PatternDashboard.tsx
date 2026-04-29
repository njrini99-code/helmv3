'use client';

import { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { GlassCard, GlassStatCard } from '@/components/ui/glass-card';
import {
  IconFilter,
  IconLayoutGrid,
  IconList,
  IconUsers,
  IconActivity,
  IconCheck,
  IconX,
  IconTarget,
  IconSparkles,
} from '@/components/icons';
import { PatternCard } from './PatternCard';
import { PatternByPlayerView } from './PatternByPlayerView';
import { PatternTimeline } from './PatternTimeline';
import { PatternValidationModal } from './PatternValidationModal';
import type {
  ExtendedPattern,
  PatternSeverity,
  PatternLifecycleState,
} from '@/app/golf/actions/pattern-management';
import {
  validatePattern,
  dismissPattern,
  markPatternAddressed,
  resolvePattern,
} from '@/app/golf/actions/pattern-management';

// ============================================================================
// TYPES
// ============================================================================

interface PatternDashboardProps {
  patterns: ExtendedPattern[];
  stats?: {
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
  onRefresh?: () => void;
}

type ViewMode = 'all' | 'by-player' | 'by-type' | 'timeline';

// ============================================================================
// PATTERN DASHBOARD COMPONENT
// ============================================================================

export function PatternDashboard({
  patterns,
  stats,
  onRefresh,
}: PatternDashboardProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('all');
  const [lifecycleFilter, setLifecycleFilter] = useState<PatternLifecycleState | 'all'>('all');
  const [severityFilter, setSeverityFilter] = useState<PatternSeverity | 'all'>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [validatingPattern, setValidatingPattern] = useState<ExtendedPattern | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Filter patterns
  const filteredPatterns = useMemo(() => {
    return patterns.filter(pattern => {
      if (lifecycleFilter !== 'all' && pattern.lifecycleState !== lifecycleFilter) {
        return false;
      }
      if (severityFilter !== 'all' && pattern.severity !== severityFilter) {
        return false;
      }
      return true;
    });
  }, [patterns, lifecycleFilter, severityFilter]);

  // Group patterns by player
  const patternsByPlayer = useMemo(() => {
    const grouped = new Map<string, ExtendedPattern[]>();

    for (const pattern of filteredPatterns) {
      const key = pattern.playerId;
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(pattern);
    }

    return Array.from(grouped.entries()).map(([playerId, playerPatterns]) => ({
      playerId,
      playerName: playerPatterns[0]?.playerName || 'Unknown',
      playerAvatarUrl: playerPatterns[0]?.playerAvatarUrl,
      patterns: playerPatterns,
    }));
  }, [filteredPatterns]);

  // Group patterns by type
  const patternsByType = useMemo(() => {
    const grouped = new Map<string, ExtendedPattern[]>();

    for (const pattern of filteredPatterns) {
      const key = pattern.patternType;
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(pattern);
    }

    return Array.from(grouped.entries());
  }, [filteredPatterns]);

  // Handle pattern actions
  const handleValidate = useCallback((pattern: ExtendedPattern) => {
    setValidatingPattern(pattern);
  }, []);

  const handleDismiss = useCallback(async (pattern: ExtendedPattern) => {
    setActionLoading(pattern.id);
    await dismissPattern(pattern.id, 'Dismissed by coach');
    setActionLoading(null);
    onRefresh?.();
  }, [onRefresh]);

  const handleMarkAddressed = useCallback(async (pattern: ExtendedPattern) => {
    setActionLoading(pattern.id);
    await markPatternAddressed(pattern.id);
    setActionLoading(null);
    onRefresh?.();
  }, [onRefresh]);

  const handleResolve = useCallback(async (pattern: ExtendedPattern) => {
    setActionLoading(pattern.id);
    await resolvePattern(pattern.id);
    setActionLoading(null);
    onRefresh?.();
  }, [onRefresh]);

  const handleValidationSubmit = useCallback(async (validation: {
    isAccurate: boolean;
    severity: PatternSeverity;
    notes?: string;
    createFocusArea?: boolean;
  }) => {
    if (!validatingPattern) return;

    setActionLoading(validatingPattern.id);
    await validatePattern(validatingPattern.id, validation);
    setActionLoading(null);
    setValidatingPattern(null);
    onRefresh?.();
  }, [validatingPattern, onRefresh]);

  // Calculate active pattern counts
  const activeCounts = useMemo(() => ({
    detected: patterns.filter(p => p.lifecycleState === 'detected').length,
    confirmed: patterns.filter(p => p.lifecycleState === 'confirmed').length,
    addressed: patterns.filter(p => p.lifecycleState === 'addressed').length,
    resolved: patterns.filter(p => p.lifecycleState === 'resolved').length,
  }), [patterns]);

  return (
    <div className="space-y-6">
      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <GlassStatCard
          label="Total Patterns"
          value={stats?.total || patterns.length}
          icon={<IconSparkles size={20} />}
        />
        <GlassStatCard
          label="Active"
          value={activeCounts.detected + activeCounts.confirmed + activeCounts.addressed}
          icon={<IconActivity size={20} />}
          trend={activeCounts.detected > 0 ? {
            value: activeCounts.detected,
            direction: 'up',
          } : undefined}
        />
        <GlassStatCard
          label="Needs Review"
          value={activeCounts.detected}
          icon={<IconTarget size={20} />}
        />
        <GlassStatCard
          label="Resolved"
          value={activeCounts.resolved}
          icon={<IconCheck size={20} />}
        />
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        {/* View mode tabs */}
        <div className="flex bg-cream-100/60 rounded-lg p-1 border border-white/20 overflow-x-auto scrollbar-none">
          <button
            onClick={() => setViewMode('all')}
            className={cn(
              'flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap',
              viewMode === 'all'
                ? 'bg-white text-warm-900 shadow-sm'
                : 'text-warm-600 hover:text-warm-900'
            )}
          >
            <IconList size={16} />
            <span className="hidden sm:inline">All Patterns</span><span className="sm:hidden">All</span>
          </button>
          <button
            onClick={() => setViewMode('by-player')}
            className={cn(
              'flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap',
              viewMode === 'by-player'
                ? 'bg-white text-warm-900 shadow-sm'
                : 'text-warm-600 hover:text-warm-900'
            )}
          >
            <IconUsers size={16} />
            <span className="hidden sm:inline">By Player</span><span className="sm:hidden">Player</span>
          </button>
          <button
            onClick={() => setViewMode('by-type')}
            className={cn(
              'flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap',
              viewMode === 'by-type'
                ? 'bg-white text-warm-900 shadow-sm'
                : 'text-warm-600 hover:text-warm-900'
            )}
          >
            <IconLayoutGrid size={16} />
            <span className="hidden sm:inline">By Type</span><span className="sm:hidden">Type</span>
          </button>
          <button
            onClick={() => setViewMode('timeline')}
            className={cn(
              'flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap',
              viewMode === 'timeline'
                ? 'bg-white text-warm-900 shadow-sm'
                : 'text-warm-600 hover:text-warm-900'
            )}
          >
            <IconActivity size={16} />
            Timeline
          </button>
        </div>

        {/* Filter toggle */}
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={cn(
            'flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ml-auto',
            showFilters
              ? 'bg-primary-100 text-primary-700'
              : 'text-warm-600 hover:bg-warm-100 active:bg-warm-200'
          )}
        >
          <IconFilter size={16} />
          Filters
          {(lifecycleFilter !== 'all' || severityFilter !== 'all') && (
            <span className="w-2 h-2 rounded-full bg-primary-500" />
          )}
        </button>
      </div>

      {/* Filter panel */}
      <AnimatePresence>
        {showFilters && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ height: { type: 'spring', stiffness: 500, damping: 30 }, opacity: { duration: 0.2 } }}
            style={{ overflow: 'hidden' }}
          >
            <GlassCard padding="md" hover={false}>
              <div className="flex flex-wrap gap-6">
                {/* Lifecycle filter */}
                <div>
                  <label className="block text-xs font-medium text-warm-500 uppercase tracking-wide mb-2">
                    Status
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {(['all', 'detected', 'confirmed', 'addressed', 'resolved', 'dismissed'] as const).map(state => (
                      <button
                        key={state}
                        onClick={() => setLifecycleFilter(state)}
                        className={cn(
                          'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                          lifecycleFilter === state
                            ? 'bg-primary-100 text-primary-700'
                            : 'text-warm-600 hover:bg-warm-100 active:bg-warm-200'
                        )}
                      >
                        {state.charAt(0).toUpperCase() + state.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Severity filter */}
                <div>
                  <label className="block text-xs font-medium text-warm-500 uppercase tracking-wide mb-2">
                    Severity
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {(['all', 'critical', 'high', 'medium', 'low'] as const).map(sev => (
                      <button
                        key={sev}
                        onClick={() => setSeverityFilter(sev)}
                        className={cn(
                          'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                          severityFilter === sev
                            ? sev === 'critical' ? 'bg-red-100 text-red-700' :
                              sev === 'high' ? 'bg-orange-100 text-orange-700' :
                              sev === 'medium' ? 'bg-amber-100 text-amber-700' :
                              sev === 'low' ? 'bg-warm-100 text-warm-700' :
                              'bg-primary-100 text-primary-700'
                            : 'text-warm-600 hover:bg-warm-100 active:bg-warm-200'
                        )}
                      >
                        {sev.charAt(0).toUpperCase() + sev.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Clear filters */}
                {(lifecycleFilter !== 'all' || severityFilter !== 'all') && (
                  <button
                    onClick={() => {
                      setLifecycleFilter('all');
                      setSeverityFilter('all');
                    }}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium text-warm-500 hover:text-warm-700 hover:bg-warm-100 active:bg-warm-200 transition-colors self-end"
                  >
                    <IconX size={14} />
                    Clear Filters
                  </button>
                )}
              </div>
            </GlassCard>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Content */}
      <AnimatePresence mode="wait">
        {viewMode === 'all' && (
          <motion.div
            key="all"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-4"
          >
            {filteredPatterns.length === 0 ? (
              <GlassCard padding="lg" hover={false}>
                <div className="text-center py-8">
                  <div className="w-12 h-12 rounded-full bg-warm-100 flex items-center justify-center mx-auto mb-4">
                    <IconSparkles size={24} className="text-warm-400" />
                  </div>
                  <h3 className="text-lg font-medium text-warm-900 mb-2">
                    No patterns found
                  </h3>
                  <p className="text-sm text-warm-500">
                    {patterns.length === 0
                      ? 'AI pattern detection will find patterns as more round data is recorded.'
                      : 'No patterns match your current filters.'}
                  </p>
                </div>
              </GlassCard>
            ) : (
              filteredPatterns.map(pattern => (
                <PatternCard
                  key={pattern.id}
                  pattern={pattern}
                  showPlayer={true}
                  onValidate={handleValidate}
                  onDismiss={handleDismiss}
                  onMarkAddressed={handleMarkAddressed}
                  onResolve={handleResolve}
                />
              ))
            )}
          </motion.div>
        )}

        {viewMode === 'by-player' && (
          <motion.div
            key="by-player"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <PatternByPlayerView
              playerGroups={patternsByPlayer}
              onValidate={handleValidate}
              onDismiss={handleDismiss}
              onMarkAddressed={handleMarkAddressed}
              onResolve={handleResolve}
            />
          </motion.div>
        )}

        {viewMode === 'by-type' && (
          <motion.div
            key="by-type"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
          >
            {patternsByType.map(([type, typePatterns]) => (
              <div key={type}>
                <h3 className="text-sm font-medium text-warm-500 uppercase tracking-wide mb-3 flex items-center gap-2">
                  {type.charAt(0).toUpperCase() + type.slice(1)} Patterns
                  <span className="text-xs font-normal text-warm-400">
                    ({typePatterns.length})
                  </span>
                </h3>
                <div className="space-y-4">
                  {typePatterns.map(pattern => (
                    <PatternCard
                      key={pattern.id}
                      pattern={pattern}
                      showPlayer={true}
                      onValidate={handleValidate}
                      onDismiss={handleDismiss}
                      onMarkAddressed={handleMarkAddressed}
                      onResolve={handleResolve}
                    />
                  ))}
                </div>
              </div>
            ))}
          </motion.div>
        )}

        {viewMode === 'timeline' && (
          <motion.div
            key="timeline"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <PatternTimeline patterns={filteredPatterns} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Validation modal */}
      {validatingPattern && (
        <PatternValidationModal
          pattern={validatingPattern}
          isOpen={true}
          onClose={() => setValidatingPattern(null)}
          onSubmit={handleValidationSubmit}
          isLoading={actionLoading === validatingPattern.id}
        />
      )}
    </div>
  );
}
