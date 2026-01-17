'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GlassCard } from '@/components/ui/glass-card';
import { Avatar } from '@/components/ui/avatar';
import {
  IconChevronDown,
  IconSparkles,
  IconAlertCircle,
} from '@/components/icons';
import { PatternCard } from './PatternCard';
import type { ExtendedPattern } from '@/app/golf/actions/pattern-management';

// ============================================================================
// TYPES
// ============================================================================

interface PlayerPatternGroup {
  playerId: string;
  playerName: string;
  playerAvatarUrl?: string | null;
  patterns: ExtendedPattern[];
}

interface PatternByPlayerViewProps {
  playerGroups: PlayerPatternGroup[];
  onValidate?: (pattern: ExtendedPattern) => void;
  onDismiss?: (pattern: ExtendedPattern) => void;
  onMarkAddressed?: (pattern: ExtendedPattern) => void;
  onResolve?: (pattern: ExtendedPattern) => void;
  onViewEvidence?: (pattern: ExtendedPattern) => void;
}

// ============================================================================
// PLAYER PATTERN CARD COMPONENT
// ============================================================================

function PlayerPatternCard({
  group,
  onValidate,
  onDismiss,
  onMarkAddressed,
  onResolve,
  onViewEvidence,
  defaultExpanded = false,
}: {
  group: PlayerPatternGroup;
  onValidate?: (pattern: ExtendedPattern) => void;
  onDismiss?: (pattern: ExtendedPattern) => void;
  onMarkAddressed?: (pattern: ExtendedPattern) => void;
  onResolve?: (pattern: ExtendedPattern) => void;
  onViewEvidence?: (pattern: ExtendedPattern) => void;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  // Calculate summary stats
  const activePatterns = group.patterns.filter(
    p => p.lifecycleState !== 'resolved' && p.lifecycleState !== 'dismissed'
  );
  const criticalCount = activePatterns.filter(p => p.severity === 'critical').length;
  const highCount = activePatterns.filter(p => p.severity === 'high').length;
  const needsReviewCount = group.patterns.filter(p => p.lifecycleState === 'detected').length;
  const totalStrokeImpact = activePatterns.reduce((sum, p) => sum + Math.abs(p.strokeImpact), 0);

  return (
    <motion.div layout>
      <GlassCard padding="none" hover={false}>
        {/* Player header - clickable to expand */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full p-4 flex items-center gap-4 text-left"
        >
          {/* Avatar */}
          <Avatar
            src={group.playerAvatarUrl}
            name={group.playerName}
            size="md"
          />

          {/* Player info */}
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-slate-900 truncate">
              {group.playerName}
            </h3>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <span className="text-sm text-slate-500">
                {activePatterns.length} active pattern{activePatterns.length !== 1 ? 's' : ''}
              </span>

              {/* Severity badges */}
              {criticalCount > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                  <IconAlertCircle size={12} />
                  {criticalCount} critical
                </span>
              )}
              {highCount > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
                  {highCount} high
                </span>
              )}
              {needsReviewCount > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                  <IconSparkles size={12} />
                  {needsReviewCount} to review
                </span>
              )}
            </div>
          </div>

          {/* Stroke impact summary */}
          {totalStrokeImpact > 0 && (
            <div className="text-right flex-shrink-0">
              <div className="text-lg font-semibold text-red-600">
                +{totalStrokeImpact.toFixed(1)}
              </div>
              <div className="text-xs text-slate-500">
                total impact
              </div>
            </div>
          )}

          {/* Expand icon */}
          <motion.div
            animate={{ rotate: expanded ? 180 : 0 }}
            transition={{ duration: 0.2 }}
            className="text-slate-400 flex-shrink-0"
          >
            <IconChevronDown size={20} />
          </motion.div>
        </button>

        {/* Expanded patterns */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="px-4 pb-4 space-y-3 border-t border-slate-100 pt-4">
                {group.patterns.length === 0 ? (
                  <div className="text-center py-6 text-slate-500">
                    No patterns found for this player
                  </div>
                ) : (
                  group.patterns.map(pattern => (
                    <PatternCard
                      key={pattern.id}
                      pattern={pattern}
                      showPlayer={false}
                      onValidate={onValidate}
                      onDismiss={onDismiss}
                      onMarkAddressed={onMarkAddressed}
                      onResolve={onResolve}
                      onViewEvidence={onViewEvidence}
                    />
                  ))
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </GlassCard>
    </motion.div>
  );
}

// ============================================================================
// PATTERN BY PLAYER VIEW COMPONENT
// ============================================================================

export function PatternByPlayerView({
  playerGroups,
  onValidate,
  onDismiss,
  onMarkAddressed,
  onResolve,
  onViewEvidence,
}: PatternByPlayerViewProps) {
  // Sort players by active pattern count (most patterns first)
  const sortedGroups = [...playerGroups].sort((a, b) => {
    const aActive = a.patterns.filter(
      p => p.lifecycleState !== 'resolved' && p.lifecycleState !== 'dismissed'
    ).length;
    const bActive = b.patterns.filter(
      p => p.lifecycleState !== 'resolved' && p.lifecycleState !== 'dismissed'
    ).length;
    return bActive - aActive;
  });

  if (playerGroups.length === 0) {
    return (
      <GlassCard padding="lg" hover={false}>
        <div className="text-center py-8">
          <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
            <IconSparkles size={24} className="text-slate-400" />
          </div>
          <h3 className="text-lg font-medium text-slate-900 mb-2">
            No patterns to display
          </h3>
          <p className="text-sm text-slate-500">
            Patterns will appear here once detected by the AI engine.
          </p>
        </div>
      </GlassCard>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex items-center justify-between px-2">
        <h3 className="text-sm font-medium text-slate-500">
          {playerGroups.length} player{playerGroups.length !== 1 ? 's' : ''} with patterns
        </h3>
        <span className="text-sm text-slate-400">
          {playerGroups.reduce((sum, g) => sum + g.patterns.length, 0)} total patterns
        </span>
      </div>

      {/* Player cards */}
      <div className="space-y-3">
        {sortedGroups.map((group, index) => (
          <PlayerPatternCard
            key={group.playerId}
            group={group}
            onValidate={onValidate}
            onDismiss={onDismiss}
            onMarkAddressed={onMarkAddressed}
            onResolve={onResolve}
            onViewEvidence={onViewEvidence}
            defaultExpanded={index === 0}
          />
        ))}
      </div>
    </div>
  );
}
