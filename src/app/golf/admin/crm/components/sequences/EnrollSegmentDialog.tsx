'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { IconX, IconBookmark, IconLoader } from '@/components/icons';
import { listSegments } from '@/app/golf/actions/crm-foundations';
import { enrollSegmentInSequence } from '@/app/golf/actions/crm-sequences';
import type { CrmSegment } from '@/app/golf/admin/crm/types/foundations';
import { Button, IconButton } from '@/components/ui/button';

// ============================================================================
// EnrollSegmentDialog — operator picks an existing CrmSegment, dialog enrolls
// every coach matching that segment definition into the active sequence.
// ============================================================================

interface EnrollSegmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sequenceId: string;
  /** Fired with { enrolled, skipped } counts after a successful enrollment. */
  onEnrolled?: (result: { enrolled: number; skipped: number }) => void;
}

export function EnrollSegmentDialog({
  open,
  onOpenChange,
  sequenceId,
  onEnrolled,
}: EnrollSegmentDialogProps) {
  const [segments, setSegments] = useState<CrmSegment[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedSegmentId, setSelectedSegmentId] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    enrolled: number;
    skipped: number;
  } | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setResult(null);
    setSelectedSegmentId('');
    setLoading(true);
    listSegments()
      .then((rows) => setSegments(rows))
      .catch((err) =>
        setError(err instanceof Error ? err.message : 'Failed to load segments'),
      )
      .finally(() => setLoading(false));
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

  const handleEnroll = async () => {
    if (!selectedSegmentId) {
      setError('Pick a segment first');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const r = await enrollSegmentInSequence({
        sequence_id: sequenceId,
        segment_id: selectedSegmentId,
      });
      setResult(r);
      onEnrolled?.(r);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to enroll segment');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
      />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="enroll-segment-title"
          className="w-full max-w-md bg-white rounded-2xl border border-warm-200/60 shadow-2xl pointer-events-auto"
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-warm-100">
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-lg bg-primary-50 flex items-center justify-center">
                <IconBookmark size={16} className="text-primary-600" />
              </span>
              <h2
                id="enroll-segment-title"
                className="text-base font-semibold text-warm-900"
              >
                Enroll a segment
              </h2>
            </div>
            <IconButton variant="default"
              type="button"
              onClick={() => onOpenChange(false)}
              aria-label="Close"
              className="p-1.5 rounded-md text-warm-500 hover:text-warm-900 hover:bg-warm-100 transition-colors"
            >
              <IconX size={14} />
            </IconButton>
          </div>

          <div className="px-5 py-4 space-y-4">
            <p className="text-sm text-warm-600">
              Every coach matching the segment&apos;s filter definition will be
              enrolled in this sequence. Already-enrolled coaches are skipped.
            </p>

            <div>
              <label
                htmlFor="seg-pick"
                className="block text-xs font-medium text-warm-700 mb-1"
              >
                Segment
              </label>
              <select
                id="seg-pick"
                value={selectedSegmentId}
                onChange={(e) => setSelectedSegmentId(e.target.value)}
                disabled={loading || submitting}
                className="w-full px-3 py-2 text-sm rounded-lg bg-white border border-warm-200/80 focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-400"
              >
                <option value="">— Select a segment —</option>
                {segments.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            {error && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            {result && (
              <div className="text-xs text-warm-700 bg-primary-50 border border-primary-200 rounded-lg px-3 py-2">
                Enrolled <strong>{result.enrolled}</strong> coach
                {result.enrolled === 1 ? '' : 'es'}. Skipped{' '}
                <strong>{result.skipped}</strong> already-enrolled.
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-warm-100 bg-warm-50/40 rounded-b-2xl">
            <Button variant="ghost"
              type="button"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
              className="px-3 py-1.5 text-sm text-warm-600 hover:text-warm-800 transition-colors disabled:opacity-50"
            >
              Close
            </Button>
            <Button variant="primary"
              type="button"
              onClick={handleEnroll}
              disabled={!selectedSegmentId || submitting}
              className={cn(
                'flex items-center gap-1.5 px-4 py-1.5 text-sm font-semibold rounded-xl shadow-sm',
                'bg-primary-600 text-white hover:bg-primary-700 transition-colors',
                'disabled:opacity-50 disabled:cursor-not-allowed',
              )}
            >
              {submitting && <IconLoader size={14} className="animate-spin" />}
              Enroll segment
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
