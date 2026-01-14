'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { IconX, IconPlay, IconTrash, IconAlertCircle } from '@/components/icons';
import { deleteInProgressRound } from '@/app/golf/actions/golf';

interface UnfinishedRoundModalProps {
  isOpen: boolean;
  onClose: () => void;
  round: {
    id: string;
    course_name: string;
    course_city?: string | null;
    course_state?: string | null;
    round_date: string;
    current_hole?: number | null;
    holes_to_play?: number | null;
    updated_at?: string | null;
  };
  onDeleted?: () => void;
}

export function UnfinishedRoundModal({
  isOpen,
  onClose,
  round,
  onDeleted,
}: UnfinishedRoundModalProps) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleResume = () => {
    onClose();
    router.push(`/golf/dashboard/rounds/continue/${round.id}`);
  };

  const handleDelete = async () => {
    try {
      setDeleting(true);
      setError(null);
      const result = await deleteInProgressRound(round.id);
      if (!result.success) {
        throw new Error(result.error);
      }
      onDeleted?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete round');
      setDeleting(false);
    }
  };

  const timeSince = round.updated_at
    ? new Date().getTime() - new Date(round.updated_at).getTime()
    : 0;
  const hoursSince = Math.floor(timeSince / (1000 * 60 * 60));
  const daysSince = Math.floor(hoursSince / 24);
  const timeAgo = daysSince > 0
    ? `${daysSince} day${daysSince > 1 ? 's' : ''} ago`
    : `${hoursSince} hour${hoursSince !== 1 ? 's' : ''} ago`;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
          {/* Header */}
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">
              Unfinished Round
            </h2>
            <button
              onClick={onClose}
              className="p-1 rounded-lg hover:bg-slate-100 transition-colors"
              disabled={deleting}
              aria-label="Close dialog"
            >
              <IconX size={20} className="text-slate-400" aria-hidden="true" />
            </button>
          </div>

          {/* Content */}
          <div className="px-6 py-6 space-y-4">
            {/* Round Info */}
            <div className="space-y-2">
              <h3 className="font-semibold text-slate-900 text-lg">
                {round.course_name}
              </h3>
              <div className="flex items-center gap-4 text-sm text-slate-500">
                <span>{new Date(round.round_date).toLocaleDateString()}</span>
                {round.course_city && round.course_state && (
                  <>
                    <span>•</span>
                    <span>{round.course_city}, {round.course_state}</span>
                  </>
                )}
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <span className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-medium">
                  Hole {round.current_hole || 1} of {round.holes_to_play || 18}
                </span>
                <span className="text-slate-400">•</span>
                <span className="text-slate-500">Last updated {timeAgo}</span>
              </div>
            </div>

            {/* Info banner */}
            <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
              <IconAlertCircle size={20} className="text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-900">
                  Round in Progress
                </p>
                <p className="text-xs text-amber-700 mt-1">
                  This round was saved but not completed. You can resume from where you left off or delete it.
                </p>
              </div>
            </div>

            {/* Error message */}
            {error && (
              <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl">
                <p className="text-sm text-rose-700">{error}</p>
              </div>
            )}

            {/* Action buttons */}
            <div className="space-y-3">
              {/* Resume */}
              <button
                onClick={handleResume}
                disabled={deleting}
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
                    Resume Round
                  </p>
                  <p className="text-xs text-emerald-700 mt-0.5">
                    Continue from hole {round.current_hole || 1}
                  </p>
                </div>
              </button>

              {/* Delete Round */}
              <button
                onClick={handleDelete}
                disabled={deleting}
                className={cn(
                  'w-full p-4 rounded-xl border-2 transition-all duration-200',
                  'flex items-center gap-4',
                  'border-slate-200 bg-white hover:bg-slate-50',
                  'disabled:opacity-50 disabled:cursor-not-allowed'
                )}
              >
                <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0">
                  <IconTrash size={20} className="text-slate-600" />
                </div>
                <div className="flex-1 text-left">
                  <p className="font-semibold text-slate-900">
                    {deleting ? 'Deleting...' : 'Delete Round'}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Permanently remove this unfinished round
                  </p>
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
