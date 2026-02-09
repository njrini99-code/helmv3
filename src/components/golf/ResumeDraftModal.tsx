'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { IconX, IconPlay, IconTrash, IconClock, IconFlag, IconCalendar } from '@/components/icons';
import { useFocusTrap } from '@/hooks/use-focus-trap';

interface DraftInfo {
  roundId: string;
  courseName: string | null;
  holesCompleted: number;
  totalHoles: number;
  lastAutoSave: string | null;
  roundDate: string;
}

interface ResumeDraftModalProps {
  isOpen: boolean;
  onClose: () => void;
  onResume: () => void;
  onStartFresh: () => void;
  draftInfo: DraftInfo;
  isLoading?: boolean;
}

/**
 * Modal shown when a player opens the New Round page with an existing draft.
 * Gives them the option to resume the draft or start fresh.
 */
export function ResumeDraftModal({
  isOpen,
  onClose,
  onResume,
  onStartFresh,
  draftInfo,
  isLoading = false,
}: ResumeDraftModalProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [isResuming, setIsResuming] = useState(false);
  const { modalRef } = useFocusTrap(isOpen, onClose);

  if (!isOpen) return null;

  const handleResume = async () => {
    setIsResuming(true);
    onResume();
  };

  const handleStartFresh = async () => {
    setIsDeleting(true);
    onStartFresh();
  };

  // Format the last saved time
  const formatLastSaved = (isoString: string | null): string => {
    if (!isoString) return 'unknown time';

    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMinutes = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMinutes < 1) return 'just now';
    if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
    if (diffDays === 1) return 'yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  // Format the round date
  const formatRoundDate = (dateString: string): string => {
    const date = new Date(dateString + 'T12:00:00'); // Add time to avoid timezone issues
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  };

  const progressPercent = draftInfo.totalHoles > 0
    ? Math.round((draftInfo.holesCompleted / draftInfo.totalHoles) * 100)
    : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-warm-900/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        ref={modalRef}
        className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto"
        role="dialog"
        aria-modal="true"
        aria-labelledby="resume-draft-title"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-warm-200 flex items-center justify-between">
          <h2 id="resume-draft-title" className="text-lg font-semibold text-warm-900">
            Unsaved Round Found
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-warm-100 transition-colors"
            disabled={isLoading || isResuming || isDeleting}
            aria-label="Close dialog"
          >
            <IconX size={20} className="text-warm-400" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-6 space-y-5">
          {/* Draft Info Card */}
          <div className="rounded-xl border border-warm-200 bg-warm-50 p-4 space-y-3">
            {/* Course Name */}
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                <IconFlag size={20} className="text-emerald-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-warm-900 truncate">
                  {draftInfo.courseName || 'Unnamed Course'}
                </p>
                <p className="text-sm text-warm-500 flex items-center gap-2 mt-0.5">
                  <IconCalendar size={14} />
                  {formatRoundDate(draftInfo.roundDate)}
                </p>
              </div>
            </div>

            {/* Progress */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-warm-600">Progress</span>
                <span className="font-medium text-warm-900">
                  {draftInfo.holesCompleted} of {draftInfo.totalHoles} holes
                </span>
              </div>
              <div className="h-2 bg-warm-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>

            {/* Last Saved */}
            <div className="flex items-center gap-2 text-xs text-warm-500">
              <IconClock size={14} />
              <span>Auto-saved {formatLastSaved(draftInfo.lastAutoSave)}</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-3">
            {/* Resume Button */}
            <button
              onClick={handleResume}
              disabled={isLoading || isResuming || isDeleting}
              className={cn(
                'w-full p-4 rounded-xl border-2 transition-all duration-200',
                'flex items-center gap-4',
                'border-emerald-200 bg-emerald-50 hover:bg-emerald-100',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            >
              <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center flex-shrink-0">
                <IconPlay size={20} className="text-white" />
              </div>
              <div className="flex-1 text-left">
                <p className="font-semibold text-emerald-900">
                  {isResuming ? 'Loading...' : 'Resume Round'}
                </p>
                <p className="text-xs text-emerald-700 mt-0.5">
                  Continue from hole {draftInfo.holesCompleted + 1}
                </p>
              </div>
            </button>

            {/* Start Fresh Button */}
            <button
              onClick={handleStartFresh}
              disabled={isLoading || isResuming || isDeleting}
              className={cn(
                'w-full p-4 rounded-xl border-2 transition-all duration-200',
                'flex items-center gap-4',
                'border-warm-200 bg-white hover:bg-warm-50',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            >
              <div className="w-10 h-10 rounded-xl bg-warm-100 flex items-center justify-center flex-shrink-0">
                <IconTrash size={20} className="text-warm-600" />
              </div>
              <div className="flex-1 text-left">
                <p className="font-semibold text-warm-900">
                  {isDeleting ? 'Clearing...' : 'Start Fresh'}
                </p>
                <p className="text-xs text-warm-500 mt-0.5">
                  Discard this draft and start a new round
                </p>
              </div>
            </button>
          </div>

          {/* Note */}
          <p className="text-xs text-warm-500 text-center">
            Drafts are automatically saved and kept for 7 days
          </p>
        </div>
      </div>
    </div>
  );
}
