'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { getRoundShotDetails, type RoundShotReviewData } from '@/app/golf/actions/golf';
import { ShotTimeline } from './ShotTimeline';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { IconChevronDown, IconRefresh, IconTarget, IconAlertCircle } from '@/components/icons';

interface ShotByShopProps {
  roundId: string;
  className?: string;
}

type LoadingState = 'idle' | 'loading' | 'loaded' | 'error';

export function ShotByShot({ roundId, className }: ShotByShopProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [loadingState, setLoadingState] = useState<LoadingState>('idle');
  const [data, setData] = useState<RoundShotReviewData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadShotData = useCallback(async () => {
    if (loadingState === 'loading') return;

    setLoadingState('loading');
    setError(null);

    const result = await getRoundShotDetails(roundId);

    if (result.success) {
      setData(result.data);
      setLoadingState('loaded');
    } else {
      setError(result.error);
      setLoadingState('error');
    }
  }, [roundId, loadingState]);

  // Auto-load when expanded
  useEffect(() => {
    if (isExpanded && loadingState === 'idle') {
      loadShotData();
    }
  }, [isExpanded, loadingState, loadShotData]);

  const handleToggle = () => {
    setIsExpanded(!isExpanded);
  };

  const handleRetry = () => {
    loadShotData();
  };

  // Calculate total shots if data is loaded
  const totalShots = data?.holes.reduce((sum, h) => sum + h.shots.length, 0) ?? 0;
  const hasShots = data?.hasShotData ?? false;

  return (
    <Card variant="glass" padding="none" className={cn('overflow-hidden', className)}>
      {/* Header - always visible, clickable to expand/collapse */}
      <button
        onClick={handleToggle}
        className={cn(
          'w-full flex items-center justify-between p-6 text-left transition-colors',
          'hover:bg-warm-50/50',
          isExpanded && 'border-b border-warm-200'
        )}
      >
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center shadow-lg shadow-primary-500/20">
            <IconTarget size={22} className="text-white" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-warm-900">
              Shot-by-Shot Review
            </h3>
            <p className="text-sm text-warm-500">
              {loadingState === 'loaded' && hasShots
                ? `${totalShots} shots tracked across ${data?.holes.length || 0} holes`
                : loadingState === 'loaded' && !hasShots
                  ? 'No shot data recorded for this round'
                  : 'Detailed breakdown of every shot'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {loadingState === 'loaded' && hasShots && (
            <span className="hidden sm:inline-flex px-3 py-1 rounded-full bg-primary-100 text-primary-700 text-xs font-medium">
              {totalShots} shots
            </span>
          )}
          <motion.div
            animate={{ rotate: isExpanded ? 180 : 0 }}
            transition={{ duration: 0.2 }}
            className="text-warm-400"
          >
            <IconChevronDown size={20} />
          </motion.div>
        </div>
      </button>

      {/* Expandable content */}
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ height: { type: 'spring', stiffness: 500, damping: 30 }, opacity: { duration: 0.2 } }}
          >
            <div className="p-6 bg-warm-50/30">
              {/* Loading state */}
              {loadingState === 'loading' && (
                <div className="space-y-4">
                  {/* Skeleton loading */}
                  {[1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="animate-pulse bg-white/70 rounded-2xl border border-warm-200 p-5"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-warm-200" />
                        <div className="flex-1">
                          <div className="h-4 bg-warm-200 rounded w-32 mb-2" />
                          <div className="h-3 bg-warm-200 rounded w-48" />
                        </div>
                        <div className="h-6 bg-warm-200 rounded w-20" />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Error state */}
              {loadingState === 'error' && (
                <div className="rounded-xl bg-red-50 border border-red-200 p-6 text-center">
                  <IconAlertCircle size={32} className="text-red-500 mx-auto mb-3" />
                  <h4 className="text-sm font-medium text-red-900 mb-2">
                    Failed to load shot data
                  </h4>
                  <p className="text-sm text-red-600 mb-4">
                    {error || 'An unexpected error occurred'}
                  </p>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleRetry}
                    className="mx-auto"
                  >
                    <IconRefresh size={14} className="mr-2" />
                    Try Again
                  </Button>
                </div>
              )}

              {/* Loaded state with data */}
              {loadingState === 'loaded' && hasShots && data && (
                <ShotTimeline holes={data.holes} />
              )}

              {/* Loaded state without shot data */}
              {loadingState === 'loaded' && !hasShots && (
                <div className="text-center py-12">
                  <div className="w-16 h-16 rounded-full bg-warm-100 flex items-center justify-center mx-auto mb-4">
                    <IconTarget size={28} className="text-warm-400" />
                  </div>
                  <h4 className="text-lg font-medium text-warm-900 mb-2">
                    No Shot Data Available
                  </h4>
                  <p className="text-sm text-warm-500 max-w-md mx-auto">
                    Shot-by-shot tracking was not enabled during this round.
                    To see detailed shot data, enable comprehensive tracking
                    when entering a round.
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}

// Also export as default for easier imports
export default ShotByShot;
