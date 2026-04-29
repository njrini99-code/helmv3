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

// ============================================================================
// SaveSegmentDialog — modal that turns the current Filters into a saved
// CrmSegment row via Stream A's createSegment server action.
// ============================================================================

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

  const definition: SegmentDefinition = {
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
  };

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
      <div
        className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
      />

      {/* Dialog */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="save-segment-title"
          className="w-full max-w-md bg-white rounded-2xl border border-warm-200/60 shadow-2xl pointer-events-auto"
        >
          <form onSubmit={handleSubmit}>
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-warm-100">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-lg bg-primary-50 flex items-center justify-center">
                  <IconBookmark size={16} className="text-primary-600" />
                </span>
                <h2 id="save-segment-title" className="text-base font-semibold text-warm-900">
                  Save as segment
                </h2>
              </div>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                aria-label="Close"
                className="p-1.5 rounded-md text-warm-500 hover:text-warm-900 hover:bg-warm-100 transition-colors"
              >
                <IconX size={14} />
              </button>
            </div>

            {/* Body */}
            <div className="px-5 py-4 space-y-4">
              <div>
                <label htmlFor="segment-name" className="block text-xs font-medium text-warm-700 mb-1">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  id="segment-name"
                  type="text"
                  autoFocus
                  required
                  maxLength={80}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Re-engage cold D2"
                  className="w-full px-3 py-2 text-sm rounded-lg bg-white border border-warm-200/80 text-warm-900 placeholder:text-warm-400 focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-400"
                />
              </div>

              <div>
                <label htmlFor="segment-description" className="block text-xs font-medium text-warm-700 mb-1">
                  Description <span className="text-warm-400 font-normal">(optional)</span>
                </label>
                <textarea
                  id="segment-description"
                  rows={2}
                  maxLength={500}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What does this segment represent?"
                  className="w-full px-3 py-2 text-sm rounded-lg bg-white border border-warm-200/80 text-warm-900 placeholder:text-warm-400 resize-none focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-400"
                />
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isShared}
                    onChange={(e) => setIsShared(e.target.checked)}
                    className="w-4 h-4 rounded border-warm-300 text-primary-600 focus:ring-primary-500/20"
                  />
                  <span className="text-sm text-warm-700">Share with team</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={pinned}
                    onChange={(e) => setPinned(e.target.checked)}
                    className="w-4 h-4 rounded border-warm-300 text-primary-600 focus:ring-primary-500/20"
                  />
                  <span className="text-sm text-warm-700">Pin to sidebar rail</span>
                </label>
              </div>

              {error && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-warm-100 bg-warm-50/40 rounded-b-2xl">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                disabled={submitting}
                className="px-3 py-1.5 text-sm text-warm-600 hover:text-warm-800 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || !name.trim()}
                className={cn(
                  'px-4 py-1.5 text-sm font-semibold rounded-xl shadow-sm transition-colors',
                  'bg-primary-600 text-white hover:bg-primary-700',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                )}
              >
                {submitting ? 'Saving...' : 'Save segment'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
