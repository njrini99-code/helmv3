'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { IconX, IconBookmark, IconLoader } from '@/components/icons';
import { listSegments } from '@/app/golf/actions/crm-foundations';
import { enrollSegmentInSequence } from '@/app/golf/actions/crm-sequences';
import type { CrmSegment } from '@/app/golf/admin/crm/types/foundations';
import { Button, IconButton } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/select';

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
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- modal backdrop dismisses on click; Escape is handled by the dialog */}
      <div
        className="fixed inset-0 z-50 bg-nav-bg/35"
        onClick={() => onOpenChange(false)}
      />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="enroll-segment-title"
          className="w-full max-w-md bg-surface rounded-card border border-border-subtle shadow-raise pointer-events-auto"
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle">
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-fw-sm bg-accent-50 flex items-center justify-center">
                <IconBookmark size={16} className="text-accent-700" />
              </span>
              <h2
                id="enroll-segment-title"
                className="text-base font-semibold text-text-primary"
              >
                Enroll a segment
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

          <div className="px-5 py-4 space-y-4">
            <p className="text-sm text-text-secondary">
              Every coach matching the segment&apos;s filter definition will be
              enrolled in this sequence. Already-enrolled coaches are skipped.
            </p>

            <div>
              <label
                htmlFor="seg-pick"
                className="block text-xs font-medium text-text-secondary mb-1"
              >
                Segment
              </label>
              {!loading && segments.length === 0 ? (
                <p className="text-xs text-text-tertiary bg-surface-sunken/70 border border-border-subtle rounded-fw-sm px-3 py-2">
                  No segments yet — create one on the Segments tab, then come
                  back to enroll it here.
                </p>
              ) : (
                <NativeSelect
                  id="seg-pick"
                  value={selectedSegmentId}
                  onChange={(e) => setSelectedSegmentId(e.target.value)}
                  disabled={loading || submitting}
                  className="text-sm rounded-fw-sm bg-surface border-border-subtle/80 focus:ring-border-focus/30 focus:border-accent-400"
                  placeholder="— Select a segment —"
                  options={segments.map((s) => ({ value: s.id, label: s.name }))}
                />
              )}
            </div>

            {error && (
              <p className="text-xs text-fw-danger-ink bg-fw-danger-bg border border-fw-danger/25 rounded-fw-sm px-3 py-2">
                {error}
              </p>
            )}

            {result && (
              <div className="text-xs text-text-secondary bg-accent-50 border border-accent-200 rounded-fw-sm px-3 py-2">
                Enrolled <strong>{result.enrolled}</strong> coach
                {result.enrolled === 1 ? '' : 'es'}. Skipped{' '}
                <strong>{result.skipped}</strong> already-enrolled.
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border-subtle bg-surface-sunken/60 rounded-b-card">
            <Button variant="ghost"
              type="button"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
              className="px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50"
            >
              Close
            </Button>
            <Button variant="primary"
              type="button"
              onClick={handleEnroll}
              disabled={!selectedSegmentId || submitting}
              className={cn(
                'flex items-center gap-1.5 px-4 py-1.5 text-sm font-semibold rounded-fw-md shadow-flat',
                'bg-accent-650 text-text-on-accent hover:bg-accent-750 transition-colors',
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
