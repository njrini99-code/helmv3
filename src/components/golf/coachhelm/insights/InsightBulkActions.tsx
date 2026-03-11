'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ConfirmModal } from '@/components/ui/modal';
import {
  IconCheck,
  IconX,
  IconDownload,
  IconCheckCheck,
} from '@/components/icons';

// ============================================================================
// TYPES
// ============================================================================

interface InsightBulkActionsProps {
  selectedCount: number;
  totalCount: number;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onBulkDismiss: () => Promise<void>;
  onBulkAcknowledge: () => Promise<void>;
  onBulkResolve?: () => Promise<void>;
  onExport: () => void;
  isAllSelected: boolean;
  className?: string;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function InsightBulkActions({
  selectedCount,
  totalCount,
  onSelectAll,
  onDeselectAll,
  onBulkDismiss,
  onBulkAcknowledge,
  onBulkResolve,
  onExport,
  isAllSelected,
  className,
}: InsightBulkActionsProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{
    open: boolean;
    action: 'dismiss' | 'acknowledge' | 'resolve' | null;
  }>({ open: false, action: null });

  const isVisible = selectedCount > 0;

  const handleConfirmAction = async () => {
    if (!confirmModal.action) return;

    setIsProcessing(true);

    try {
      switch (confirmModal.action) {
        case 'dismiss':
          await onBulkDismiss();
          break;
        case 'acknowledge':
          await onBulkAcknowledge();
          break;
        case 'resolve':
          if (onBulkResolve) await onBulkResolve();
          break;
      }
    } finally {
      setIsProcessing(false);
      setConfirmModal({ open: false, action: null });
    }
  };

  const getConfirmModalProps = () => {
    switch (confirmModal.action) {
      case 'dismiss':
        return {
          title: `Dismiss ${selectedCount} insight${selectedCount !== 1 ? 's' : ''}?`,
          description: 'Dismissed insights will be hidden from your active feed. You can still view them by filtering for dismissed insights.',
          confirmText: 'Dismiss All',
          variant: 'danger' as const,
        };
      case 'acknowledge':
        return {
          title: `Acknowledge ${selectedCount} insight${selectedCount !== 1 ? 's' : ''}?`,
          description: 'Acknowledged insights indicate you have reviewed them. They will remain visible but marked as acknowledged.',
          confirmText: 'Acknowledge All',
          variant: 'default' as const,
        };
      case 'resolve':
        return {
          title: `Resolve ${selectedCount} insight${selectedCount !== 1 ? 's' : ''}?`,
          description: 'Resolved insights indicate the issue has been addressed. They will be marked as completed.',
          confirmText: 'Resolve All',
          variant: 'default' as const,
        };
      default:
        return {
          title: '',
          description: '',
          confirmText: '',
          variant: 'default' as const,
        };
    }
  };

  const modalProps = getConfirmModalProps();

  return (
    <>
      <AnimatePresence>
        {isVisible && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 400 }}
            className={cn(
              'fixed bottom-[var(--golf-mobile-bottom-nav-offset)] left-1/2 z-40 -translate-x-1/2 lg:bottom-6',
              'w-full max-w-2xl px-4',
              className
            )}
          >
            <div
              className={cn(
                'flex items-center justify-between gap-4',
                'px-4 py-3',
                'bg-warm-900/95 backdrop-blur-xl',
                'border border-warm-700 rounded-2xl',
                'shadow-2xl shadow-warm-900/40'
              )}
            >
              {/* Selection Info */}
              <div className="flex items-center gap-3">
                {/* Selection Count Badge */}
                <motion.div
                  key={selectedCount}
                  initial={{ scale: 0.8 }}
                  animate={{ scale: 1 }}
                  className={cn(
                    'flex items-center justify-center',
                    'min-w-[36px] h-9 px-3',
                    'bg-primary-500 text-white',
                    'font-semibold text-sm rounded-lg'
                  )}
                >
                  {selectedCount}
                </motion.div>

                {/* Selection Text */}
                <div className="hidden sm:block">
                  <p className="text-sm font-medium text-white">
                    {selectedCount} of {totalCount} selected
                  </p>
                </div>

                {/* Select All / Deselect All */}
                <button
                  type="button"
                  onClick={isAllSelected ? onDeselectAll : onSelectAll}
                  className={cn(
                    'text-xs font-medium',
                    'text-warm-400 hover:text-white',
                    'underline underline-offset-2',
                    'transition-colors'
                  )}
                >
                  {isAllSelected ? 'Deselect all' : 'Select all'}
                </button>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2">
                {/* Acknowledge */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmModal({ open: true, action: 'acknowledge' })}
                  disabled={isProcessing}
                  className={cn(
                    'text-warm-300 hover:text-white hover:bg-warm-700',
                    'hidden sm:flex'
                  )}
                >
                  <IconCheck size={16} className="mr-1.5" />
                  Acknowledge
                </Button>

                {/* Resolve (optional) */}
                {onBulkResolve && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmModal({ open: true, action: 'resolve' })}
                    disabled={isProcessing}
                    className={cn(
                      'text-warm-300 hover:text-white hover:bg-warm-700',
                      'hidden md:flex'
                    )}
                  >
                    <IconCheckCheck size={16} className="mr-1.5" />
                    Resolve
                  </Button>
                )}

                {/* Dismiss */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmModal({ open: true, action: 'dismiss' })}
                  disabled={isProcessing}
                  className="text-red-400 hover:text-red-300 hover:bg-red-900/30 transition-colors"
                >
                  <IconX size={16} className="mr-1.5 hidden sm:block" />
                  <IconX size={16} className="sm:hidden" />
                  <span className="hidden sm:inline">Dismiss</span>
                </Button>

                {/* Divider */}
                <div className="w-px h-6 bg-warm-700 mx-1" />

                {/* Export */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onExport}
                  disabled={isProcessing}
                  className="text-warm-300 hover:text-white hover:bg-warm-700 transition-colors"
                >
                  <IconDownload size={16} />
                  <span className="hidden sm:inline ml-1.5">Export</span>
                </Button>

                {/* Close */}
                <button
                  type="button"
                  onClick={onDeselectAll}
                  className={cn(
                    'p-2 rounded-lg',
                    'text-warm-400 hover:text-white hover:bg-warm-700',
                    'transition-colors'
                  )}
                  aria-label="Close bulk actions"
                >
                  <IconX size={18} />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Confirmation Modal */}
      <ConfirmModal
        open={confirmModal.open}
        onClose={() => setConfirmModal({ open: false, action: null })}
        onConfirm={handleConfirmAction}
        title={modalProps.title}
        description={modalProps.description}
        confirmText={isProcessing ? 'Processing...' : modalProps.confirmText}
        cancelText="Cancel"
        variant={modalProps.variant}
      />
    </>
  );
}
