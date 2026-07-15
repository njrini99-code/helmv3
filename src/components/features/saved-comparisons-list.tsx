'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, IconButton } from '@/components/ui/button';
import { IconUsers, IconTrash, IconCalendar, IconNote } from '@/components/icons';
import { deleteComparison } from '@/app/baseball/(dashboard)/dashboard/compare/actions';
import { toast } from '@/components/ui/sonner';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { format } from 'date-fns';
import { PaperCard, EmptyIssue } from '@/components/baseball/living-annual';

// Use the actual type returned from getSavedComparisons
interface SavedComparison {
  id: string;
  coach_id: string;
  name: string | null;
  notes: string | null;
  player_ids: string[];
  created_at: string | null;
  updated_at: string | null;
}

interface SavedComparisonsListProps {
  comparisons: SavedComparison[];
}

export function SavedComparisonsList({ comparisons }: SavedComparisonsListProps) {
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const handleViewComparison = (comparison: SavedComparison) => {
    // Navigate to comparison page with player IDs
    const playerIds = comparison.player_ids.join(',');
    router.push(`/baseball/dashboard/compare?players=${playerIds}`);
  };

  const handleDelete = (comparisonId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent card click
    setPendingDeleteId(comparisonId);
  };

  const confirmDelete = async () => {
    if (!pendingDeleteId) return;
    const comparisonId = pendingDeleteId;
    setDeletingId(comparisonId);

    try {
      const result = await deleteComparison(comparisonId);

      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success('Comparison deleted successfully');
        router.refresh(); // Refresh to show updated list
      }
    } catch {
      toast.error('Failed to delete comparison');
    } finally {
      setDeletingId(null);
      setPendingDeleteId(null);
    }
  };

  const deleteDialog = (
    <ConfirmDialog
      open={pendingDeleteId !== null}
      title="Delete comparison?"
      message="Are you sure you want to delete this comparison? This action cannot be undone."
      confirmLabel="Delete"
      cancelLabel="Cancel"
      variant="danger"
      isLoading={deletingId !== null}
      onConfirm={() => { void confirmDelete(); }}
      onCancel={() => {
        if (deletingId === null) setPendingDeleteId(null);
      }}
    />
  );

  // Empty State — the registered EmptyIssue preset (matching
  // PracticePlannerClient's usage) instead of a hand-rolled circle+heading,
  // so this reads as one of the kit's composed editorial letters rather than
  // a leftover from the pre-migration design system.
  if (!comparisons || comparisons.length === 0) {
    return (
      <>
        <EmptyIssue
          variant="generic"
          ink="pursuit"
          action={
            <Button variant="primary" onClick={() => router.push('/baseball/dashboard/compare')}>
              Compare Players
            </Button>
          }
        />
        {deleteDialog}
      </>
    );
  }

  return (
    <>
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {comparisons.map((comparison) => (
        <PaperCard
          key={comparison.id}
          className="group cursor-pointer p-6 transition-shadow duration-200 hover:shadow-card-hover"
          onClick={() => handleViewComparison(comparison)}
        >
          {/* Header */}
          <div className="flex items-start justify-between mb-3">
            <h3 className="font-annual text-base font-semibold text-text-primary group-hover:text-grade-plus transition-colors line-clamp-2">
              {comparison.name || 'Untitled Comparison'}
            </h3>
            <IconButton variant="default" aria-label="Delete"
              onClick={(e) => handleDelete(comparison.id, e)}
              disabled={deletingId === comparison.id}
              className="p-1.5 rounded-lg text-text-tertiary hover:text-[color:var(--notice-error-ink)] hover:bg-[var(--notice-error-ink)]/10 active:bg-[var(--notice-error-ink)]/15
                         transition-colors disabled:opacity-50 flex-shrink-0"
              title="Delete comparison"
            >
              <IconTrash size={16} />
            </IconButton>
          </div>

          {/* Notes */}
          {comparison.notes && (
            <div className="flex items-start gap-2 mb-3">
              <IconNote size={14} className="text-text-tertiary mt-0.5 flex-shrink-0" />
              <p className="font-annual text-body-sm text-text-secondary line-clamp-2">{comparison.notes}</p>
            </div>
          )}

          {/* Metadata */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 font-annual text-body-sm text-text-tertiary">
              <IconUsers size={14} />
              <span>{comparison.player_ids.length} players</span>
            </div>

            {comparison.created_at && (
              <div className="flex items-center gap-2 font-annual text-body-sm text-text-tertiary">
                <IconCalendar size={14} />
                <span>
                  {format(new Date(comparison.created_at), 'MMM d, yyyy')}
                </span>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="mt-4 pt-4 border-t border-[color:var(--hairline)]">
            <span className="font-annual text-body-sm text-grade-plus group-hover:underline">
              View Comparison →
            </span>
          </div>
        </PaperCard>
      ))}
    </div>
    {deleteDialog}
    </>
  );
}
