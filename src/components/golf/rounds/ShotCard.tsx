'use client';

import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import type { ShotDetail } from '@/app/golf/actions/golf';
import { IconCheck, IconX, IconFlag, IconTarget, IconWarning } from '@/components/icons';
import type { SyncStatus } from '@/lib/offline/shot-storage';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Extended shot interface that includes offline sync metadata
 */
export interface OfflineShotExtended extends Partial<ShotDetail> {
  _offline_id?: string;
  _sync_status?: SyncStatus;
  _created_offline?: string;
  _retry_count?: number;
  _error_message?: string;
}

interface ShotCardProps {
  shot: ShotDetail | OfflineShotExtended;
  isFirst?: boolean;
  isLast?: boolean;
  /** Show offline sync status indicator */
  showSyncStatus?: boolean;
}

// Map club types to icons/labels
const CLUB_DISPLAY: Record<string, { label: string; color: string }> = {
  driver: { label: 'Driver', color: 'bg-blue-100 text-blue-700' },
  '3_wood': { label: '3 Wood', color: 'bg-blue-100 text-blue-700' },
  '5_wood': { label: '5 Wood', color: 'bg-blue-100 text-blue-700' },
  '3_hybrid': { label: '3 Hybrid', color: 'bg-sky-100 text-sky-700' },
  '4_hybrid': { label: '4 Hybrid', color: 'bg-sky-100 text-sky-700' },
  '5_hybrid': { label: '5 Hybrid', color: 'bg-sky-100 text-sky-700' },
  '3_iron': { label: '3 Iron', color: 'bg-slate-100 text-slate-700' },
  '4_iron': { label: '4 Iron', color: 'bg-slate-100 text-slate-700' },
  '5_iron': { label: '5 Iron', color: 'bg-slate-100 text-slate-700' },
  '6_iron': { label: '6 Iron', color: 'bg-slate-100 text-slate-700' },
  '7_iron': { label: '7 Iron', color: 'bg-slate-100 text-slate-700' },
  '8_iron': { label: '8 Iron', color: 'bg-slate-100 text-slate-700' },
  '9_iron': { label: '9 Iron', color: 'bg-slate-100 text-slate-700' },
  pw: { label: 'PW', color: 'bg-amber-100 text-amber-700' },
  gw: { label: 'GW', color: 'bg-amber-100 text-amber-700' },
  sw: { label: 'SW', color: 'bg-amber-100 text-amber-700' },
  lw: { label: 'LW', color: 'bg-amber-100 text-amber-700' },
  putter: { label: 'Putter', color: 'bg-green-100 text-green-700' },
};

// Result display config
const RESULT_DISPLAY: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  fairway: { icon: <IconCheck size={12} />, color: 'text-green-600', label: 'Fairway' },
  green: { icon: <IconCheck size={12} />, color: 'text-green-600', label: 'Green' },
  hole: { icon: <IconFlag size={12} />, color: 'text-green-600', label: 'Holed!' },
  holed: { icon: <IconFlag size={12} />, color: 'text-green-600', label: 'Holed!' },
  miss: { icon: <IconX size={12} />, color: 'text-amber-600', label: 'Missed' },
  rough: { icon: <IconTarget size={12} />, color: 'text-amber-600', label: 'Rough' },
  bunker: { icon: <IconWarning size={12} />, color: 'text-amber-600', label: 'Bunker' },
  hazard: { icon: <IconWarning size={12} />, color: 'text-red-600', label: 'Hazard' },
  penalty: { icon: <IconWarning size={12} />, color: 'text-red-600', label: 'Penalty' },
  ob: { icon: <IconX size={12} />, color: 'text-red-600', label: 'Out of Bounds' },
  water: { icon: <IconWarning size={12} />, color: 'text-red-600', label: 'Water' },
  fringe: { icon: <IconTarget size={12} />, color: 'text-slate-600', label: 'Fringe' },
};

// Sync status display config
const SYNC_STATUS_DISPLAY: Record<SyncStatus, { icon: React.ReactNode; label: string; className: string }> = {
  pending: {
    icon: <CloudOffIcon className="w-3 h-3" />,
    label: 'Saved offline',
    className: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  syncing: {
    icon: <SyncingIcon className="w-3 h-3 animate-spin" />,
    label: 'Syncing...',
    className: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  synced: {
    icon: <IconCheck size={12} />,
    label: 'Synced',
    className: 'bg-green-50 text-green-700 border-green-200',
  },
  failed: {
    icon: <IconWarning size={12} />,
    label: 'Sync failed',
    className: 'bg-red-50 text-red-700 border-red-200',
  },
};

// Shot type labels
const SHOT_TYPE_LABELS: Record<string, string> = {
  tee: 'Tee Shot',
  approach: 'Approach',
  around_green: 'Around Green',
  chip: 'Chip',
  pitch: 'Pitch',
  putt: 'Putt',
  putting: 'Putt',
  bunker: 'Bunker Shot',
  recovery: 'Recovery',
  layup: 'Layup',
  penalty: 'Penalty',
};

function formatDistance(distance: number | null, unit: string | null): string {
  if (distance === null) return '--';
  if (unit === 'feet' || unit === 'ft') return `${distance}ft`;
  return `${distance}y`;
}

function getShotTypeLabel(shotType: string): string {
  return SHOT_TYPE_LABELS[shotType] || shotType.charAt(0).toUpperCase() + shotType.slice(1);
}

function getClubDisplay(clubType: string) {
  const normalized = clubType.toLowerCase().replace(/-/g, '_');
  return CLUB_DISPLAY[normalized] || { label: clubType, color: 'bg-slate-100 text-slate-700' };
}

function getResultDisplay(result: string) {
  const normalized = result.toLowerCase();
  return RESULT_DISPLAY[normalized] || {
    icon: <IconTarget size={12} />,
    color: 'text-slate-600',
    label: result.charAt(0).toUpperCase() + result.slice(1)
  };
}

// ============================================================================
// ICON COMPONENTS
// ============================================================================

function CloudOffIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M17 17l4 4m0-4l-4 4"
      />
    </svg>
  );
}

function SyncingIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function ShotCard({ shot, isFirst, isLast, showSyncStatus = false }: ShotCardProps) {
  const clubDisplay = getClubDisplay(shot.club_type || '');
  const resultDisplay = getResultDisplay(shot.result || '');
  const isPutt = shot.shot_type === 'putt' || shot.shot_type === 'putting';
  const isPenalty = shot.is_penalty === true;

  // Get offline sync status if available
  const offlineShot = shot as OfflineShotExtended;
  const syncStatus = offlineShot._sync_status;
  const isOfflineShot = !!offlineShot._offline_id;
  const syncDisplay = syncStatus ? SYNC_STATUS_DISPLAY[syncStatus] : null;

  // Calculate distance traveled
  const distanceBefore = shot.distance_to_hole_before;
  const distanceAfter = shot.distance_to_hole_after;
  const shotDistance = shot.shot_distance;

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2 }}
      className="relative"
    >
      {/* Timeline connector */}
      {!isFirst && (
        <div className="absolute left-4 -top-4 w-0.5 h-4 bg-gradient-to-b from-slate-200 to-slate-300" />
      )}

      {/* Shot card */}
      <div
        className={cn(
          'relative ml-0 pl-10 py-3',
          isPenalty && 'bg-red-50/50 rounded-lg'
        )}
      >
        {/* Shot number indicator */}
        <div
          className={cn(
            'absolute left-0 top-3 w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold shadow-sm',
            isPenalty
              ? 'bg-red-100 text-red-700 border border-red-200'
              : 'bg-white text-slate-700 border border-slate-200'
          )}
        >
          {shot.shot_number}
        </div>

        {/* Shot content */}
        <div className="bg-white/70 backdrop-blur-sm rounded-xl border border-slate-200/80 p-4 shadow-sm hover:shadow-md transition-shadow">
          {/* Header row */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-slate-900">
                {getShotTypeLabel(shot.shot_type || '')}
              </span>
              <span className={cn(
                'px-2 py-0.5 rounded-full text-xs font-medium',
                clubDisplay.color
              )}>
                {clubDisplay.label}
              </span>

              {/* Offline sync status badge */}
              {showSyncStatus && isOfflineShot && syncDisplay && syncStatus !== 'synced' && (
                <span
                  className={cn(
                    'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border',
                    syncDisplay.className
                  )}
                  title={syncStatus === 'failed' ? offlineShot._error_message : undefined}
                >
                  {syncDisplay.icon}
                  <span className="hidden sm:inline">{syncDisplay.label}</span>
                </span>
              )}
            </div>

            {/* Result badge */}
            <div className={cn('flex items-center gap-1', resultDisplay.color)}>
              {resultDisplay.icon}
              <span className="text-xs font-medium">{resultDisplay.label}</span>
            </div>
          </div>

          {/* Distance row */}
          <div className="flex items-center gap-4 text-sm">
            {/* Starting distance */}
            <div className="flex items-center gap-2 text-slate-600">
              <span className="text-xs text-slate-400">From:</span>
              <span className="font-medium">
                {formatDistance(distanceBefore ?? null, shot.distance_unit_before ?? null)}
              </span>
            </div>

            {/* Arrow */}
            <svg className="w-4 h-4 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>

            {/* Ending distance */}
            <div className="flex items-center gap-2 text-slate-600">
              <span className="text-xs text-slate-400">To:</span>
              <span className={cn(
                'font-medium',
                shot.result === 'holed' || shot.result === 'hole' ? 'text-green-600' : ''
              )}>
                {shot.result === 'holed' || shot.result === 'hole'
                  ? 'Holed!'
                  : formatDistance(distanceAfter ?? null, shot.distance_unit_after ?? null)}
              </span>
            </div>

            {/* Shot distance (if available) */}
            {shotDistance !== null && (
              <div className="ml-auto flex items-center gap-1 text-slate-500">
                <span className="text-xs">Distance:</span>
                <span className="font-medium text-slate-700">{shotDistance}y</span>
              </div>
            )}
          </div>

          {/* Putt-specific details */}
          {isPutt && (shot.putt_break || shot.putt_slope) && (
            <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-4 text-xs text-slate-500">
              {shot.putt_break && (
                <div className="flex items-center gap-1">
                  <span>Break:</span>
                  <span className="font-medium text-slate-700 capitalize">
                    {shot.putt_break.replace(/_/g, ' ')}
                  </span>
                </div>
              )}
              {shot.putt_slope && (
                <div className="flex items-center gap-1">
                  <span>Slope:</span>
                  <span className="font-medium text-slate-700 capitalize">
                    {shot.putt_slope.replace(/_/g, ' ')}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Miss direction */}
          {shot.miss_direction && !isPutt && (
            <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-1 text-xs text-slate-500">
              <span>Miss:</span>
              <span className="font-medium text-amber-600 capitalize">
                {shot.miss_direction.replace(/_/g, ' ')}
              </span>
            </div>
          )}

          {/* Lie before */}
          {shot.lie_before && shot.lie_before !== 'tee' && (
            <div className="mt-2 text-xs text-slate-400">
              Lie: <span className="text-slate-600 capitalize">{shot.lie_before.replace(/_/g, ' ')}</span>
            </div>
          )}

          {/* Penalty info */}
          {isPenalty && shot.penalty_type && (
            <div className="mt-3 pt-3 border-t border-red-100 flex items-center gap-1 text-xs text-red-600">
              <IconWarning size={12} />
              <span className="font-medium capitalize">{shot.penalty_type.replace(/_/g, ' ')}</span>
            </div>
          )}
        </div>
      </div>

      {/* Bottom connector (if not last) */}
      {!isLast && (
        <div className="absolute left-4 bottom-0 w-0.5 h-4 bg-gradient-to-b from-slate-300 to-slate-200" />
      )}
    </motion.div>
  );
}
