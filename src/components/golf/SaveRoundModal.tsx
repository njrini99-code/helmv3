'use client';

/**
 * SaveRoundModal — vaul-backed exit-round confirmation drawer.
 *
 * Migrated Apr 2026 from a hand-rolled fixed-overlay modal with manual
 * backdrop, focus trap, and onClick stopPropagation plumbing → the
 * shared <Drawer> primitive. We inherit drag-to-dismiss, focus trap,
 * scroll-lock, ESC-to-close, and the iOS handle bar for free.
 */

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { IconClock, IconTrash, IconAlertCircle } from '@/components/icons';
import { useMobileNav } from '@/contexts/mobile-nav-context';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerFooter,
} from '@/components/ui/drawer';

interface SaveRoundModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveForLater: () => Promise<void>;
  onDelete: () => void;
  currentHole: number;
  totalHoles: number;
}

export function SaveRoundModal({
  isOpen,
  onClose,
  onSaveForLater,
  onDelete,
  currentHole,
  totalHoles,
}: SaveRoundModalProps) {
  const { show } = useMobileNav();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Show nav when drawer closes (after save or delete)
  useEffect(() => {
    if (!isOpen) {
      show();
      setConfirmingDelete(false);
    }
  }, [isOpen, show]);

  const handleSaveForLater = async (e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();

    if (saving) {
      return;
    }

    try {
      setSaving(true);
      setError(null);
      await onSaveForLater();
      show();
    } catch (err) {
      const errorMessage = err instanceof Error
        ? err.message
        : typeof err === 'string'
        ? err
        : 'Failed to save round. Please check your connection and try again.';
      setError(errorMessage);
      setSaving(false);
    }
  };

  const handleDelete = () => {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    show();
    onDelete();
  };

  return (
    <Drawer
      open={isOpen}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DrawerContent className="sm:max-w-md sm:mx-auto sm:rounded-3xl">
        <DrawerHeader>
          <DrawerTitle>Exit Round</DrawerTitle>
        </DrawerHeader>

        <div className="px-6 pb-2 space-y-4 overflow-y-auto overscroll-contain">
            {/* Content */}
            {/* Info banner */}
            <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
              <IconAlertCircle size={20} className="text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-900">
                  Round in Progress
                </p>
                <p className="text-xs text-amber-700 mt-1">
                  You're on hole {currentHole} of {totalHoles}. Choose how to proceed:
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
              {/* Save for Later */}
              <button
                onClick={handleSaveForLater}
                disabled={saving}
                type="button"
                className={cn(
                  'w-full p-4 rounded-xl border-2 transition-all duration-200',
                  'flex items-center gap-4',
                  'border-primary-200 bg-primary-50 hover:bg-primary-100',
                  'disabled:opacity-50 disabled:cursor-not-allowed'
                )}
              >
                <div className="w-10 h-10 rounded-xl bg-primary-500 flex items-center justify-center flex-shrink-0">
                  <IconClock size={20} className="text-white" />
                </div>
                <div className="flex-1 text-left">
                  <p className="font-medium text-primary-900">
                    {saving ? 'Saving...' : 'Save for Later'}
                  </p>
                  <p className="text-xs text-primary-700 mt-0.5">
                    Resume this round anytime from the Rounds tab
                  </p>
                </div>
              </button>

              {/* Delete Round */}
              <button
                onClick={handleDelete}
                disabled={saving}
                className={cn(
                  'w-full p-4 rounded-xl border-2 transition-all duration-200',
                  'flex items-center gap-4',
                  confirmingDelete
                    ? 'border-rose-300 bg-rose-50 hover:bg-rose-100'
                    : 'border-warm-200 bg-white hover:bg-warm-50 active:bg-warm-100',
                  'disabled:opacity-50 disabled:cursor-not-allowed'
                )}
              >
                <div className={cn(
                  'w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0',
                  confirmingDelete ? 'bg-rose-500' : 'bg-warm-100'
                )}>
                  <IconTrash size={20} className={confirmingDelete ? 'text-white' : 'text-warm-600'} />
                </div>
                <div className="flex-1 text-left">
                  <p className={cn('font-medium', confirmingDelete ? 'text-rose-900' : 'text-warm-900')}>
                    {confirmingDelete ? 'Tap again to confirm' : 'Delete Round'}
                  </p>
                  <p className={cn('text-xs mt-0.5', confirmingDelete ? 'text-rose-600' : 'text-warm-500')}>
                    {confirmingDelete ? 'This cannot be undone' : 'Discard this round completely'}
                  </p>
                </div>
              </button>
              {confirmingDelete && (
                <button
                  onClick={() => setConfirmingDelete(false)}
                  className="w-full text-sm text-warm-500 hover:text-warm-700 py-1"
                >
                  Cancel
                </button>
              )}
            </div>

            {/* Note about stats */}
            <p className="text-xs text-warm-500 text-center pt-2">
              Note: Round stats will only be calculated when you complete the full {totalHoles} holes
            </p>
          </div>

        <DrawerFooter className="bg-warm-50 border-t border-warm-200">
            <button
              onClick={onClose}
              disabled={saving}
              className="w-full px-4 py-2 text-sm font-medium text-warm-700 hover:text-warm-900 transition-colors disabled:opacity-50"
            >
              Cancel & Continue Playing
            </button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
