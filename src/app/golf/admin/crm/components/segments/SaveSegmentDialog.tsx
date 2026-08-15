'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { IconX, IconBookmark } from '@/components/icons';
import { createSegment } from '@/app/golf/actions/crm-foundations';
import type {
  SegmentDefinition,
  CrmSegment,
} from '@/app/golf/admin/crm/types/foundations';
import type { Filters } from '../CoachFilters';
import { Button, IconButton } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

// ============================================================================
// SaveSegmentDialog — modal that turns the current Filters into a saved
// CrmSegment row via Stream A's createSegment server action.
// ============================================================================

// ----------------------------------------------------------------------------
// filtersToSegmentDefinition — the ONE place Filters is copied into a
// SegmentDefinition for persistence. Every key of Filters (CoachFilters.tsx)
// must appear here explicitly — no `...filters` spread — so a filter added
// to the Filters interface without a matching line here fails loudly at the
// TypeScript level (SegmentDefinition mirrors Filters field-for-field; see
// foundations.ts header comment) instead of silently vanishing on save.
// Exported so the save->apply round trip is unit-testable without mounting
// the dialog. See SaveSegmentDialog.round-trip.test.ts — that test is the
// contract future filter additions must extend.
// ----------------------------------------------------------------------------
export function filtersToSegmentDefinition(filters: Filters): SegmentDefinition {
  return {
    status: filters.status,
    division: filters.division,
    conference: filters.conference,
    program: filters.program,
    priority: filters.priority,
    search: filters.search,
    followUpDue: filters.followUpDue,
    starred: filters.starred,
    hasNotes: filters.hasNotes,
    noContact30Days: filters.noContact30Days,
    primaryOnly: filters.primaryOnly,
    queueStatus: filters.queueStatus,
    overdueFollowUp: filters.overdueFollowUp,
    noNextStep: filters.noNextStep,
  };
}

interface SaveSegmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: Filters;
  /** Optional callback fired with the newly-created segment. */
  onCreated?: (segment: CrmSegment) => void;
}

export function SaveSegmentDialog({
  open,
  onOpenChange,
  filters,
  onCreated,
}: SaveSegmentDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isShared, setIsShared] = useState(true);
  const [pinned, setPinned] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form on open.
  useEffect(() => {
    if (open) {
      setName('');
      setDescription('');
      setIsShared(true);
      setPinned(true);
      setSubmitting(false);
      setError(null);
    }
  }, [open]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  if (!open) return null;

  const definition: SegmentDefinition = filtersToSegmentDefinition(filters);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const trimmedDescription = description.trim();
      const created = await createSegment({
        name: name.trim(),
        ...(trimmedDescription ? { description: trimmedDescription } : {}),
        definition,
        is_shared: isShared,
        ...(pinned ? { pin_order: 0 } : {}),
      });
      onCreated?.(created);
      onOpenChange(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save segment';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- modal backdrop dismisses on click; Escape is handled by the dialog */}
      <div
        className="fixed inset-0 z-50 bg-nav-bg/35"
        onClick={() => onOpenChange(false)}
      />

      {/* Dialog */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="save-segment-title"
          className="w-full max-w-md bg-surface rounded-card border border-border-subtle shadow-raise pointer-events-auto"
        >
          <form onSubmit={handleSubmit}>
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-fw-sm bg-accent-50 flex items-center justify-center">
                  <IconBookmark size={16} className="text-accent-700" />
                </span>
                <h2 id="save-segment-title" className="text-base font-semibold text-text-primary">
                  Save as segment
                </h2>
              </div>
              <IconButton variant="default"
                type="button"
                onClick={() => onOpenChange(false)}
                aria-label="Close"
                className="p-1.5 rounded-fw-sm text-text-tertiary hover:text-text-primary hover:bg-surface-sunken transition-colors"
              >
                <IconX size={14} />
              </IconButton>
            </div>

            {/* Body */}
            <div className="px-5 py-4 space-y-4">
              <div>
                <label htmlFor="segment-name" className="block text-xs font-medium text-text-secondary mb-1">
                  Name <span className="text-fw-danger">*</span>
                </label>
                {/* eslint-disable-next-line jsx-a11y/no-autofocus -- intentional default focus in dialog */}
                <Input autoFocus
                  id="segment-name"
                  type="text"
                  required
                  maxLength={80}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Re-engage cold D2"
                  className="text-sm min-h-0 py-2 rounded-fw-sm"
                />
              </div>

              <div>
                <label htmlFor="segment-description" className="block text-xs font-medium text-text-secondary mb-1">
                  Description <span className="text-text-tertiary font-normal">(optional)</span>
                </label>
                <Textarea
                  id="segment-description"
                  rows={2}
                  maxLength={500}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What does this segment represent?"
                  className="text-sm py-2 rounded-fw-sm"
                />
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isShared}
                    onChange={(e) => setIsShared(e.target.checked)}
                    className="w-4 h-4 rounded border-border-strong text-accent-700 focus:ring-border-focus/20"
                  />
                  <span className="text-sm text-text-secondary">Share with team</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={pinned}
                    onChange={(e) => setPinned(e.target.checked)}
                    className="w-4 h-4 rounded border-border-strong text-accent-700 focus:ring-border-focus/20"
                  />
                  <span className="text-sm text-text-secondary">Pin to sidebar rail</span>
                </label>
              </div>

              {error && (
                <p className="text-xs text-fw-danger-ink bg-fw-danger-bg border border-fw-danger/25 rounded-fw-sm px-3 py-2">
                  {error}
                </p>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border-subtle bg-surface-sunken/60 rounded-b-card">
              <Button variant="ghost"
                type="button"
                onClick={() => onOpenChange(false)}
                disabled={submitting}
                className="px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50"
              >
                Cancel
              </Button>
              <Button variant="primary"
                type="submit"
                disabled={submitting || !name.trim()}
                className={cn(
                  'px-4 py-1.5 text-sm font-semibold rounded-fw-md shadow-flat transition-colors',
                  'bg-accent-650 text-text-on-accent hover:bg-accent-750',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                )}
              >
                {submitting ? 'Saving...' : 'Save segment'}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
