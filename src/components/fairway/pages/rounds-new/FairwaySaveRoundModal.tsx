'use client';

/**
 * ============================================================================
 * Fairway · Rounds-new · FairwaySaveRoundModal — exit-round confirmation sheet
 * ----------------------------------------------------------------------------
 * Fairway re-skin of the legacy SaveRoundModal. Logic is copied VERBATIM —
 * same saving / error / two-tap-confirm-delete state, same useMobileNav.show()
 * nav restoration on close, same async error handling, same onSaveForLater /
 * onDelete contract (the delete is DESTRUCTIVE → keeps the two-tap guard).
 * Only the presentation changes: the Fairway bottom Sheet + warm tokens.
 *
 * Presentation only; flag-off path still renders the legacy SaveRoundModal.
 * ========================================================================== */

import { useState, useEffect } from 'react';
import { Clock, Trash2, TriangleAlert } from 'lucide-react';

import { cn } from '@/lib/utils';
import { useMobileNav } from '@/contexts/mobile-nav-context';
import { Sheet } from '@/components/fairway/overlays/Sheet';
import { Button } from '@/components/fairway/controls/button';

interface FairwaySaveRoundModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveForLater: () => Promise<void>;
  onDelete: () => void;
  currentHole: number;
  totalHoles: number;
}

export function FairwaySaveRoundModal({
  isOpen,
  onClose,
  onSaveForLater,
  onDelete,
  currentHole,
  totalHoles,
}: FairwaySaveRoundModalProps) {
  const { show } = useMobileNav();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Show nav when sheet closes (after save or delete) — verbatim from legacy.
  useEffect(() => {
    if (!isOpen) {
      show();
      setConfirmingDelete(false);
    }
  }, [isOpen, show]);

  const handleSaveForLater = async (e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    if (saving) return;
    try {
      setSaving(true);
      setError(null);
      await onSaveForLater();
      show();
    } catch (err) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : typeof err === 'string'
            ? err
            : "Couldn't save your round — check your connection and try again.";
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
    <Sheet
      open={isOpen}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title="Exit round"
    >
      <Sheet.Body className="flex flex-col gap-4">
        {/* Info banner */}
        <div className="flex items-start gap-3 rounded-fw-md border border-border-subtle bg-fw-warning-bg p-4">
          <TriangleAlert className="mt-0.5 h-5 w-5 flex-shrink-0 text-fw-warning" aria-hidden />
          <div>
            <p className="font-fw-sans text-body-sm font-medium text-text-primary">Round in progress</p>
            <p className="mt-1 font-fw-sans text-caption text-text-secondary">
              You&apos;re on hole {currentHole} of {totalHoles}. Choose how to proceed:
            </p>
          </div>
        </div>

        {error && (
          <div className="rounded-fw-md border border-fw-danger/25 bg-fw-danger-bg p-4">
            <p className="font-fw-sans text-body-sm text-fw-danger">{error}</p>
          </div>
        )}

        <div className="flex flex-col gap-3">
          {/* Save for later */}
          <button
            type="button"
            onClick={handleSaveForLater}
            disabled={saving}
            className="flex items-center gap-4 rounded-fw-md border border-accent-200 bg-accent-50 p-4 text-left transition-colors hover:bg-accent-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-fw-md bg-accent-500 text-text-on-accent">
              <Clock className="h-5 w-5" aria-hidden />
            </span>
            <span className="flex-1">
              <span className="block font-fw-sans text-body-sm font-medium text-accent-700">
                {saving ? 'Saving…' : 'Save for later'}
              </span>
              <span className="mt-0.5 block font-fw-sans text-caption text-accent-700/80">
                Resume this round anytime from the Rounds tab
              </span>
            </span>
          </button>

          {/* Delete (two-tap confirm — destructive) */}
          <button
            type="button"
            onClick={handleDelete}
            disabled={saving}
            className={cn(
              'flex items-center gap-4 rounded-fw-md border p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50',
              confirmingDelete
                ? 'border-fw-danger/30 bg-fw-danger-bg hover:bg-fw-danger/10'
                : 'border-border-subtle bg-surface hover:bg-surface-tint',
            )}
          >
            <span
              className={cn(
                'grid h-10 w-10 flex-shrink-0 place-items-center rounded-fw-md',
                confirmingDelete ? 'bg-fw-danger text-white' : 'bg-surface-sunken text-text-secondary',
              )}
            >
              <Trash2 className="h-5 w-5" aria-hidden />
            </span>
            <span className="flex-1">
              <span
                className={cn(
                  'block font-fw-sans text-body-sm font-medium',
                  confirmingDelete ? 'text-fw-danger' : 'text-text-primary',
                )}
              >
                {confirmingDelete ? 'Tap again to confirm' : 'Delete round'}
              </span>
              <span
                className={cn(
                  'mt-0.5 block font-fw-sans text-caption',
                  confirmingDelete ? 'text-fw-danger/80' : 'text-text-tertiary',
                )}
              >
                {confirmingDelete ? 'This cannot be undone' : 'Discard this round completely'}
              </span>
            </span>
          </button>

          {confirmingDelete && (
            <Button
              variant="ghost"
              type="button"
              onClick={() => setConfirmingDelete(false)}
              className="py-1 font-fw-sans text-body-sm text-text-tertiary hover:text-text-secondary"
            >
              Cancel
            </Button>
          )}
        </div>

        <p className="pt-1 text-center font-fw-sans text-caption text-text-tertiary">
          Note: round stats are only calculated when you complete the full {totalHoles} holes.
        </p>
      </Sheet.Body>

      <Sheet.Footer>
        <Button variant="ghost" type="button" onClick={onClose} disabled={saving} className="w-full">
          Cancel &amp; continue playing
        </Button>
      </Sheet.Footer>
    </Sheet>
  );
}

export default FairwaySaveRoundModal;
