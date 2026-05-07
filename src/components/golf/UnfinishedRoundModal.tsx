'use client';

/**
 * UnfinishedRoundModal — vaul-backed drawer presenting a saved-but-unfinished
 * round so the player can resume or delete it.
 *
 * Migrated Apr 2026 from a hand-rolled fixed-overlay modal with manual
 * backdrop, focus trap, and framer-motion AnimatePresence → the shared
 * <Drawer> primitive. Inherits drag-to-dismiss, focus trap, scroll-lock,
 * and ESC-to-close for free.
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { IconPlay, IconTrash, IconAlertCircle, IconWarning } from '@/components/icons';
import { deleteInProgressRound } from '@/app/golf/actions/golf';
import { clearEmergencySave } from '@/lib/utils/emergency-save';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';

interface UnfinishedRoundModalProps {
  isOpen: boolean;
  onClose: () => void;
  round: {
    id: string;
    course_name: string | null;
    course_city?: string | null;
    course_state?: string | null;
    round_date: string;
    current_hole?: number | null;
    holes_played?: number | null;
    updated_at?: string | null;
    created_at?: string | null;
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
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState<Date | null>(null);

  // Initialize `now` on the client to avoid SSR/CSR mismatch in the
  // "Last updated N hours ago" relative time string.
  useEffect(() => {
    setNow(new Date());
  }, []);

  const handleResume = () => {
    onClose();
    router.push(`/golf/dashboard/rounds/continue/${round.id}`);
  };

  const handleDeleteClick = () => {
    setConfirmingDelete(true);
  };

  const handleCancelDelete = () => {
    setConfirmingDelete(false);
  };

  const handleConfirmDelete = async () => {
    try {
      setDeleting(true);
      setError(null);
      const result = await deleteInProgressRound(round.id);
      if (!result.success) {
        throw new Error(result.error);
      }
      clearEmergencySave(round.id);
      onDeleted?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete round');
      setDeleting(false);
      setConfirmingDelete(false);
    }
  };

  const timeSince = now && round.updated_at
    ? now.getTime() - new Date(round.updated_at).getTime()
    : 0;
  const hoursSince = Math.floor(timeSince / (1000 * 60 * 60));
  const daysSince = Math.floor(hoursSince / 24);
  const timeAgo = !now
    ? ''
    : daysSince > 0
    ? `${daysSince} day${daysSince > 1 ? 's' : ''} ago`
    : `${hoursSince} hour${hoursSince !== 1 ? 's' : ''} ago`;

  return (
    <Drawer
      open={isOpen}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DrawerContent className="sm:max-w-md sm:mx-auto sm:rounded-3xl">
        <DrawerHeader>
          <DrawerTitle>Unfinished Round</DrawerTitle>
        </DrawerHeader>

        <div className="px-6 pb-6 space-y-4 overflow-y-auto overscroll-contain">
          {/* Round Info */}
          <div className="space-y-2">
            <h3 className="font-medium text-warm-900 text-lg">
              {round.course_name || 'Unknown Course'}
            </h3>
            <div className="flex items-center gap-4 text-sm text-warm-500">
              <span>{new Date(round.round_date).toLocaleDateString()}</span>
              {round.course_city && round.course_state && (
                <>
                  <span>•</span>
                  <span>{round.course_city}, {round.course_state}</span>
                </>
              )}
            </div>
            <div className="flex items-center gap-2 text-sm text-warm-600">
              <span className="px-2 py-1 bg-primary-100 text-primary-700 rounded-full text-xs font-medium">
                On hole {round.current_hole || 1} of {round.holes_played || 18}
              </span>
              <span className="text-warm-400">•</span>
              <span className="text-warm-500" suppressHydrationWarning>
                {timeAgo ? `Last updated ${timeAgo}` : 'Last updated recently'}
              </span>
            </div>
          </div>

          {/* Info banner */}
          <div className="flex items-start gap-3 p-4 bg-amber-50/80 border border-amber-200/60 rounded-xl">
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
            {confirmingDelete ? (
              /* Delete Confirmation */
              <>
                <div className="flex items-start gap-3 p-4 bg-red-50/80 border border-red-200/60 rounded-xl">
                  <IconWarning size={20} className="text-red-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-red-900">
                      Delete this round?
                    </p>
                    <p className="text-xs text-red-700 mt-1">
                      {round.course_name || 'This round'} ({new Date(round.round_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}) and all recorded shots will be permanently deleted. This cannot be undone.
                    </p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={handleCancelDelete}
                    disabled={deleting}
                    className="flex-1 px-4 py-3 rounded-xl border border-warm-200 bg-white text-warm-700 font-medium text-sm hover:bg-warm-50 active:bg-warm-100 transition-colors disabled:opacity-50 min-h-[44px]"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirmDelete}
                    disabled={deleting}
                    className="flex-1 px-4 py-3 rounded-xl bg-red-600 text-white font-medium text-sm hover:bg-red-700 active:bg-red-800 transition-colors disabled:opacity-50 min-h-[44px]"
                  >
                    {deleting ? 'Deleting...' : 'Delete Round'}
                  </button>
                </div>
              </>
            ) : (
              <>
                {/* Resume */}
                <button
                  onClick={handleResume}
                  disabled={deleting}
                  className={cn(
                    'w-full p-4 rounded-xl border-2 transition-all duration-200 min-h-[44px]',
                    'flex items-center gap-4',
                    'border-primary-200 bg-primary-50/80 hover:bg-primary-100 active:bg-primary-200',
                    'disabled:opacity-50 disabled:cursor-not-allowed'
                  )}
                >
                  <div className="w-10 h-10 rounded-xl bg-primary-500 flex items-center justify-center flex-shrink-0">
                    <IconPlay size={20} className="text-white" />
                  </div>
                  <div className="flex-1 text-left">
                    <p className="font-medium text-primary-900">
                      Resume Round
                    </p>
                    <p className="text-xs text-primary-700 mt-0.5">
                      Continue from hole {round.current_hole || 1}
                    </p>
                  </div>
                </button>

                {/* Delete Round */}
                <button
                  onClick={handleDeleteClick}
                  disabled={deleting}
                  className={cn(
                    'w-full p-4 rounded-xl border-2 transition-all duration-200 min-h-[44px]',
                    'flex items-center gap-4',
                    'border-warm-200 bg-cream-100/82 hover:bg-warm-50 active:bg-warm-100',
                    'disabled:opacity-50 disabled:cursor-not-allowed'
                  )}
                >
                  <div className="w-10 h-10 rounded-xl bg-warm-100 flex items-center justify-center flex-shrink-0">
                    <IconTrash size={20} className="text-warm-600" />
                  </div>
                  <div className="flex-1 text-left">
                    <p className="font-medium text-warm-900">
                      Delete Round
                    </p>
                    <p className="text-xs text-warm-500 mt-0.5">
                      Permanently remove this unfinished round
                    </p>
                  </div>
                </button>
              </>
            )}
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
