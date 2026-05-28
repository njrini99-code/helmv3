'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button, IconButton } from '@/components/ui/button';
import { IconUsers, IconTrash, IconCalendar, IconNote, IconLayoutGrid } from '@/components/icons';
import { deleteComparison } from '@/app/baseball/(dashboard)/dashboard/compare/actions';
import { toast } from '@/components/ui/sonner';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { format } from 'date-fns';

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

  // Empty State
  if (!comparisons || comparisons.length === 0) {
    return (
      <>
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 rounded-full bg-warm-100 flex items-center justify-center mb-4">
            <IconLayoutGrid size={32} className="text-warm-400" />
          </div>
          <h3 className="text-lg font-semibold text-warm-900 mb-2">
            No saved comparisons yet
          </h3>
          <p className="text-warm-500 mb-6 max-w-md">
            Compare players and save them for future reference. Your saved comparisons will appear here.
          </p>
          <Button
            variant="primary"
            onClick={() => router.push('/baseball/dashboard/compare')}
          >
            Compare Players
          </Button>
        </div>
        {deleteDialog}
      </>
    );
  }

  return (
    <>
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {comparisons.map((comparison) => (
        <Card
          key={comparison.id}
          className="group hover:border-primary-200 hover:shadow-lg transition-all cursor-pointer"
          onClick={() => handleViewComparison(comparison)}
        >
          <div className="p-6">
            {/* Header */}
            <div className="flex items-start justify-between mb-3">
              <h3 className="text-base font-semibold text-warm-900 group-hover:text-primary-600 transition-colors line-clamp-2">
                {comparison.name || 'Untitled Comparison'}
              </h3>
              <IconButton variant="default" aria-label="Delete"
                onClick={(e) => handleDelete(comparison.id, e)}
                disabled={deletingId === comparison.id}
                className="p-1.5 rounded-lg text-warm-400 hover:text-red-600 hover:bg-red-50 transition-colors active:bg-red-100
                           transition-colors disabled:opacity-50 flex-shrink-0"
                title="Delete comparison"
              >
                <IconTrash size={16} />
              </IconButton>
            </div>

            {/* Notes */}
            {comparison.notes && (
              <div className="flex items-start gap-2 mb-3">
                <IconNote size={14} className="text-warm-400 mt-0.5 flex-shrink-0" />
                <p className="text-sm leading-relaxed text-warm-600 line-clamp-2">{comparison.notes}</p>
              </div>
            )}

            {/* Metadata */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-warm-500">
                <IconUsers size={14} />
                <span>{comparison.player_ids.length} players</span>
              </div>

              {comparison.created_at && (
                <div className="flex items-center gap-2 text-sm text-warm-500">
                  <IconCalendar size={14} />
                  <span>
                    {format(new Date(comparison.created_at), 'MMM d, yyyy')}
                  </span>
                </div>
              )}
            </div>

            {/* Footer - View button appears on hover */}
            <div className="mt-4 pt-4 border-t border-warm-100">
              <span className="text-sm leading-relaxed text-primary-600 group-hover:underline">
                View Comparison →
              </span>
            </div>
          </div>
        </Card>
      ))}
    </div>
    {deleteDialog}
    </>
  );
}
