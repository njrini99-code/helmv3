'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { IconCheck, IconRefresh, IconAlertCircle, IconGlobe } from '@/components/icons';
import type { SaveStatus } from '@/hooks/golf/use-auto-save-round';

interface DraftIndicatorProps {
  saveStatus: SaveStatus;
  isOnline: boolean;
  getTimeSinceLastSave: () => string | null;
  className?: string;
  /** Compact mode for mobile or tight spaces */
  compact?: boolean;
}

/**
 * Visual indicator showing auto-save status for draft rounds.
 *
 * Shows:
 * - Saving animation when in progress
 * - Success checkmark with timestamp after save
 * - Error state with message
 * - Offline indicator
 */
export function DraftIndicator({
  saveStatus,
  isOnline: _isOnline, // Currently unused, but kept for future use
  getTimeSinceLastSave,
  className,
  compact = false,
}: DraftIndicatorProps) {
  const [displayTime, setDisplayTime] = useState<string | null>(null);

  // Update display time every 30 seconds
  useEffect(() => {
    setDisplayTime(getTimeSinceLastSave());

    const interval = setInterval(() => {
      setDisplayTime(getTimeSinceLastSave());
    }, 30000);

    return () => clearInterval(interval);
  }, [getTimeSinceLastSave, saveStatus.lastSaved]);

  // Don't show anything if we haven't saved yet and there's no status
  if (saveStatus.status === 'idle' && !saveStatus.lastSaved) {
    return null;
  }

  // Render based on status
  const renderContent = () => {
    switch (saveStatus.status) {
      case 'saving':
        return (
          <div className="flex items-center gap-2">
            <IconRefresh
              size={compact ? 14 : 16}
              className="text-emerald-600 animate-spin"
            />
            {!compact && (
              <span className="text-sm text-slate-500">Saving...</span>
            )}
          </div>
        );

      case 'saved':
        return (
          <div className="flex items-center gap-2">
            <div className="relative">
              <IconCheck
                size={compact ? 14 : 16}
                className="text-emerald-600"
              />
              {/* Subtle pulse animation on save */}
              <div className="absolute inset-0 animate-ping">
                <IconCheck
                  size={compact ? 14 : 16}
                  className="text-emerald-600 opacity-50"
                />
              </div>
            </div>
            {!compact && (
              <span className="text-sm text-emerald-600">
                Auto-saved {displayTime || 'just now'}
              </span>
            )}
          </div>
        );

      case 'error':
        return (
          <div className="flex items-center gap-2">
            <IconAlertCircle
              size={compact ? 14 : 16}
              className="text-amber-600"
            />
            {!compact && (
              <span className="text-sm text-amber-600">
                {saveStatus.error || 'Save failed'}
              </span>
            )}
          </div>
        );

      case 'offline':
        return (
          <div className="flex items-center gap-2">
            <IconGlobe
              size={compact ? 14 : 16}
              className="text-slate-400"
            />
            {!compact && (
              <span className="text-sm text-slate-500">
                Offline - saved locally
              </span>
            )}
          </div>
        );

      case 'idle':
      default:
        // Show last saved time if available
        if (saveStatus.lastSaved && displayTime) {
          return (
            <div className="flex items-center gap-2">
              <IconCheck
                size={compact ? 14 : 16}
                className="text-slate-400"
              />
              {!compact && (
                <span className="text-sm text-slate-400">
                  Saved {displayTime}
                </span>
              )}
            </div>
          );
        }
        return null;
    }
  };

  const content = renderContent();
  if (!content) return null;

  return (
    <div
      className={cn(
        'inline-flex items-center justify-center',
        compact
          ? 'px-2 py-1 rounded-md'
          : 'px-3 py-1.5 rounded-full',
        saveStatus.status === 'error'
          ? 'bg-amber-50 border border-amber-200'
          : saveStatus.status === 'offline'
          ? 'bg-slate-50 border border-slate-200'
          : saveStatus.status === 'saved'
          ? 'bg-emerald-50 border border-emerald-200'
          : 'bg-white/60 border border-slate-200',
        'transition-all duration-300',
        className
      )}
    >
      {content}
    </div>
  );
}

/**
 * Floating version of the draft indicator for overlay on tracking view.
 */
export function DraftIndicatorFloating({
  saveStatus,
  isOnline,
  getTimeSinceLastSave,
}: Omit<DraftIndicatorProps, 'className' | 'compact'>) {
  return (
    <div className="fixed top-4 right-4 z-40">
      <DraftIndicator
        saveStatus={saveStatus}
        isOnline={isOnline}
        getTimeSinceLastSave={getTimeSinceLastSave}
        compact={false}
        className="shadow-lg backdrop-blur-sm"
      />
    </div>
  );
}
