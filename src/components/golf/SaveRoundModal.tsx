'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { IconX, IconClock, IconTrash, IconAlertCircle } from '@/components/icons';
import { useMobileNav } from '@/contexts/mobile-nav-context';

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

  // Show nav when modal closes (after save or delete)
  useEffect(() => {
    if (!isOpen) {
      show();
    }
  }, [isOpen, show]);

  if (!isOpen) return null;

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
      // Show nav after save
      show();
      // Modal will be closed by parent component after successful save
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
    // Show nav after delete
    show();
    onDelete();
    // Modal will be closed by parent component
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => {
          // Prevent clicks inside modal from closing it
          e.stopPropagation();
        }}
      >
          {/* Header */}
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">
              Exit Round
            </h2>
            <button
              onClick={onClose}
              className="p-1 rounded-lg hover:bg-slate-100 transition-colors"
              disabled={saving}
              aria-label="Close dialog"
            >
              <IconX size={20} className="text-slate-400" aria-hidden="true" />
            </button>
          </div>

          {/* Content */}
          <div className="px-6 py-6 space-y-4">
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
                  'border-emerald-200 bg-emerald-50 hover:bg-emerald-100',
                  'disabled:opacity-50 disabled:cursor-not-allowed'
                )}
              >
                <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center flex-shrink-0">
                  <IconClock size={20} className="text-white" />
                </div>
                <div className="flex-1 text-left">
                  <p className="font-semibold text-emerald-900">
                    {saving ? 'Saving...' : 'Save for Later'}
                  </p>
                  <p className="text-xs text-emerald-700 mt-0.5">
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
                  'border-slate-200 bg-white hover:bg-slate-50',
                  'disabled:opacity-50 disabled:cursor-not-allowed'
                )}
              >
                <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0">
                  <IconTrash size={20} className="text-slate-600" />
                </div>
                <div className="flex-1 text-left">
                  <p className="font-semibold text-slate-900">Delete Round</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Discard this round completely
                  </p>
                </div>
              </button>
            </div>

            {/* Note about stats */}
            <p className="text-xs text-slate-500 text-center pt-2">
              Note: Round stats will only be calculated when you complete the full {totalHoles} holes
            </p>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 bg-slate-50 border-t border-slate-200">
            <button
              onClick={onClose}
              disabled={saving}
              className="w-full px-4 py-2 text-sm font-medium text-slate-700 hover:text-slate-900 transition-colors disabled:opacity-50"
            >
              Cancel & Continue Playing
            </button>
          </div>
        </div>
    </div>
  );
}
