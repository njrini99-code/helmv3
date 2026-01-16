'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { HoleReviewData } from '@/app/golf/actions/golf';
import { ShotCard, type OfflineShotExtended } from './ShotCard';
import { IconChevronDown, IconCheck, IconX, IconFlag } from '@/components/icons';
import type { SyncStatus } from '@/lib/offline/shot-storage';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Extended hole data that includes offline sync metadata
 */
export interface OfflineHoleExtended extends Partial<HoleReviewData> {
  _offline_id?: string;
  _sync_status?: SyncStatus;
  _created_offline?: string;
  _retry_count?: number;
  _error_message?: string;
  // Make shots array work with offline shots
  shots: (HoleReviewData['shots'][number] | OfflineShotExtended)[];
}

interface HoleAccordionProps {
  hole: HoleReviewData | OfflineHoleExtended;
  defaultExpanded?: boolean;
  /** Show offline sync status indicators */
  showSyncStatus?: boolean;
  /** Is this an offline-only hole (not yet synced) */
  isOffline?: boolean;
}

function getScoreDisplay(score: number | null, par: number): {
  label: string;
  color: string;
  bgColor: string;
} {
  if (score === null) return { label: '--', color: 'text-slate-500', bgColor: 'bg-slate-100' };

  const diff = score - par;

  if (diff <= -2) {
    return {
      label: diff === -2 ? 'Eagle' : `${Math.abs(diff)} Under`,
      color: 'text-amber-600',
      bgColor: 'bg-amber-100',
    };
  } else if (diff === -1) {
    return { label: 'Birdie', color: 'text-green-600', bgColor: 'bg-green-100' };
  } else if (diff === 0) {
    return { label: 'Par', color: 'text-slate-600', bgColor: 'bg-slate-100' };
  } else if (diff === 1) {
    return { label: 'Bogey', color: 'text-red-600', bgColor: 'bg-red-100' };
  } else if (diff === 2) {
    return { label: 'Double', color: 'text-red-700', bgColor: 'bg-red-100' };
  } else {
    return { label: `+${diff}`, color: 'text-red-800', bgColor: 'bg-red-100' };
  }
}

function getScoreToPar(score: number | null, par: number): string {
  if (score === null) return '--';
  const diff = score - par;
  if (diff === 0) return 'E';
  return diff > 0 ? `+${diff}` : `${diff}`;
}

// ============================================================================
// SYNC STATUS ICON
// ============================================================================

function SyncStatusIcon({ status }: { status: SyncStatus }) {
  switch (status) {
    case 'pending':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
          <CloudOffIcon className="w-3 h-3" />
          <span className="hidden sm:inline">Offline</span>
        </span>
      );
    case 'syncing':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
          <SyncingSpinner className="w-3 h-3" />
          <span className="hidden sm:inline">Syncing</span>
        </span>
      );
    case 'failed':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200">
          <AlertIcon className="w-3 h-3" />
          <span className="hidden sm:inline">Failed</span>
        </span>
      );
    case 'synced':
    default:
      return null;
  }
}

function CloudOffIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17l4 4m0-4l-4 4" />
    </svg>
  );
}

function SyncingSpinner({ className }: { className?: string }) {
  return (
    <svg className={cn(className, 'animate-spin')} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function AlertIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
      />
    </svg>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function HoleAccordion({
  hole,
  defaultExpanded = false,
  showSyncStatus = false,
  isOffline = false,
}: HoleAccordionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const scoreDisplay = getScoreDisplay(hole.score ?? null, hole.par ?? 4);
  const hasShots = (hole.shots?.length ?? 0) > 0;
  const scoreToPar = getScoreToPar(hole.score ?? null, hole.par ?? 4);

  // Get offline status if available
  const offlineHole = hole as OfflineHoleExtended;
  const syncStatus = offlineHole._sync_status;
  const isOfflineHole = !!offlineHole._offline_id || isOffline;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-slate-200 bg-white/70 backdrop-blur-sm overflow-hidden shadow-sm"
    >
      {/* Accordion header - always visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn(
          'w-full flex items-center justify-between p-5 text-left transition-colors',
          'hover:bg-slate-50/50',
          isExpanded && 'border-b border-slate-100'
        )}
      >
        <div className="flex items-center gap-4">
          {/* Hole number circle */}
          <div className={cn(
            'w-12 h-12 rounded-xl flex flex-col items-center justify-center',
            scoreDisplay.bgColor
          )}>
            <span className="text-xs text-slate-500 font-medium">Hole</span>
            <span className={cn('text-lg font-bold', scoreDisplay.color)}>
              {hole.hole_number}
            </span>
          </div>

          {/* Hole info */}
          <div>
            <div className="flex items-center gap-3">
              <span className="text-lg font-semibold text-slate-900">
                Par {hole.par}
              </span>
              {hole.yardage && (
                <span className="text-sm text-slate-500">
                  {hole.yardage} yds
                </span>
              )}
              {/* Offline sync status badge */}
              {showSyncStatus && isOfflineHole && syncStatus && syncStatus !== 'synced' && (
                <SyncStatusIcon status={syncStatus} />
              )}
            </div>
            <div className="flex items-center gap-3 mt-1">
              {/* Score display */}
              <span className={cn('text-sm font-medium', scoreDisplay.color)}>
                Score: {hole.score ?? '--'} ({scoreToPar})
              </span>
              <span className={cn(
                'px-2 py-0.5 rounded-full text-xs font-medium',
                scoreDisplay.bgColor,
                scoreDisplay.color
              )}>
                {scoreDisplay.label}
              </span>
            </div>
          </div>
        </div>

        {/* Right side - stats summary */}
        <div className="flex items-center gap-4">
          {/* Quick stats */}
          <div className="hidden md:flex items-center gap-4 text-sm">
            {/* Putts */}
            {hole.putts !== null && (
              <div className="flex items-center gap-1.5">
                <IconFlag size={14} className="text-slate-400" />
                <span className="text-slate-600">{hole.putts} putts</span>
              </div>
            )}

            {/* FIR (for par 4s and 5s) */}
            {hole.par >= 4 && hole.fairway_hit !== null && (
              <div className="flex items-center gap-1">
                {hole.fairway_hit ? (
                  <IconCheck size={14} className="text-green-600" />
                ) : (
                  <IconX size={14} className="text-red-500" />
                )}
                <span className={hole.fairway_hit ? 'text-green-600' : 'text-red-500'}>
                  FIR
                </span>
              </div>
            )}

            {/* GIR */}
            {hole.green_in_regulation !== null && (
              <div className="flex items-center gap-1">
                {hole.green_in_regulation ? (
                  <IconCheck size={14} className="text-green-600" />
                ) : (
                  <IconX size={14} className="text-red-500" />
                )}
                <span className={hole.green_in_regulation ? 'text-green-600' : 'text-red-500'}>
                  GIR
                </span>
              </div>
            )}
          </div>

          {/* Expand indicator */}
          <div className={cn(
            'flex items-center gap-2 text-sm',
            hasShots ? 'text-primary-600' : 'text-slate-400'
          )}>
            {hasShots && (
              <span className="hidden sm:inline">
                {hole.shots.length} shot{hole.shots.length !== 1 ? 's' : ''}
              </span>
            )}
            <motion.div
              animate={{ rotate: isExpanded ? 180 : 0 }}
              transition={{ duration: 0.2 }}
            >
              <IconChevronDown size={20} />
            </motion.div>
          </div>
        </div>
      </button>

      {/* Accordion content */}
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
          >
            <div className="p-5 bg-slate-50/50">
              {/* Hole stats summary (mobile) */}
              <div className="md:hidden grid grid-cols-3 gap-3 mb-4 pb-4 border-b border-slate-200">
                <div className="text-center">
                  <div className="text-xs text-slate-500">Putts</div>
                  <div className="text-lg font-semibold text-slate-900">
                    {hole.putts ?? '--'}
                  </div>
                </div>
                {hole.par >= 4 && (
                  <div className="text-center">
                    <div className="text-xs text-slate-500">FIR</div>
                    <div className={cn(
                      'text-lg font-semibold',
                      hole.fairway_hit ? 'text-green-600' : 'text-red-500'
                    )}>
                      {hole.fairway_hit ? 'Yes' : 'No'}
                    </div>
                  </div>
                )}
                <div className="text-center">
                  <div className="text-xs text-slate-500">GIR</div>
                  <div className={cn(
                    'text-lg font-semibold',
                    hole.green_in_regulation ? 'text-green-600' : 'text-red-500'
                  )}>
                    {hole.green_in_regulation ? 'Yes' : 'No'}
                  </div>
                </div>
              </div>

              {/* Additional stats row */}
              {(hole.driving_distance || hole.approach_proximity || hole.first_putt_distance) && (
                <div className="flex flex-wrap gap-4 mb-4 pb-4 border-b border-slate-200 text-sm">
                  {hole.driving_distance && (
                    <div>
                      <span className="text-slate-500">Drive:</span>{' '}
                      <span className="font-medium text-slate-900">{hole.driving_distance}y</span>
                    </div>
                  )}
                  {hole.approach_proximity && (
                    <div>
                      <span className="text-slate-500">Approach to:</span>{' '}
                      <span className="font-medium text-slate-900">{hole.approach_proximity}ft</span>
                    </div>
                  )}
                  {hole.first_putt_distance && (
                    <div>
                      <span className="text-slate-500">First putt:</span>{' '}
                      <span className="font-medium text-slate-900">{hole.first_putt_distance}ft</span>
                    </div>
                  )}
                  {hole.scramble_attempt && (
                    <div>
                      <span className="text-slate-500">Scramble:</span>{' '}
                      <span className={cn(
                        'font-medium',
                        hole.scramble_made ? 'text-green-600' : 'text-red-500'
                      )}>
                        {hole.scramble_made ? 'Saved' : 'Missed'}
                      </span>
                    </div>
                  )}
                  {hole.sand_save_attempt && (
                    <div>
                      <span className="text-slate-500">Sand save:</span>{' '}
                      <span className={cn(
                        'font-medium',
                        hole.sand_save_made ? 'text-green-600' : 'text-red-500'
                      )}>
                        {hole.sand_save_made ? 'Yes' : 'No'}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Shot timeline */}
              {hasShots ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-medium text-slate-700">
                      Shot-by-Shot Breakdown
                    </h4>
                    {/* Offline message */}
                    {showSyncStatus && isOfflineHole && (
                      <span className="text-xs text-amber-600">
                        Will sync when online
                      </span>
                    )}
                  </div>
                  <div className="space-y-1">
                    {hole.shots.map((shot, index) => (
                      <ShotCard
                        key={(shot as OfflineShotExtended)._offline_id || shot.id}
                        shot={shot}
                        isFirst={index === 0}
                        isLast={index === hole.shots.length - 1}
                        showSyncStatus={showSyncStatus}
                      />
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3">
                    <IconFlag size={20} className="text-slate-400" />
                  </div>
                  <p className="text-sm text-slate-500">
                    No shot data recorded for this hole
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    Shot-by-shot tracking was not enabled during this round
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
