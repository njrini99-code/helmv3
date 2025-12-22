'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { IconUsers, IconTrash, IconCalendar, IconNote, IconLayoutGrid } from '@/components/icons';
import type { PlayerComparison } from '@/lib/types';
import { deleteComparison } from '@/app/baseball/(dashboard)/dashboard/compare/actions';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface SavedComparisonsListProps {
  comparisons: PlayerComparison[];
}

export function SavedComparisonsList({ comparisons }: SavedComparisonsListProps) {
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleViewComparison = (comparison: PlayerComparison) => {
    // Navigate to comparison page with player IDs
    const playerIds = comparison.player_ids.join(',');
    router.push(`/baseball/dashboard/compare?players=${playerIds}`);
  };

  const handleDelete = async (comparisonId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent card click

    if (!confirm('Are you sure you want to delete this comparison?')) {
      return;
    }

    setDeletingId(comparisonId);

    try {
      const result = await deleteComparison(comparisonId);

      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success('Comparison deleted successfully');
        router.refresh(); // Refresh to show updated list
      }
    } catch (error) {
      toast.error('Failed to delete comparison');
      console.error('Delete error:', error);
    } finally {
      setDeletingId(null);
    }
  };

  // Empty State
  if (!comparisons || comparisons.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-4">
          <IconLayoutGrid size={32} className="text-slate-400" />
        </div>
        <h3 className="text-lg font-semibold text-slate-900 mb-2">
          No saved comparisons yet
        </h3>
        <p className="text-slate-500 mb-6 max-w-md">
          Compare players and save them for future reference. Your saved comparisons will appear here.
        </p>
        <Button
          variant="primary"
          onClick={() => router.push('/baseball/dashboard/compare')}
        >
          Compare Players
        </Button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {comparisons.map((comparison) => (
        <Card
          key={comparison.id}
          className="group hover:border-green-200 hover:shadow-lg transition-all cursor-pointer"
          onClick={() => handleViewComparison(comparison)}
        >
          <div className="p-6">
            {/* Header */}
            <div className="flex items-start justify-between mb-3">
              <h3 className="text-base font-semibold text-slate-900 group-hover:text-green-600 transition-colors line-clamp-2">
                {comparison.name}
              </h3>
              <button
                onClick={(e) => handleDelete(comparison.id, e)}
                disabled={deletingId === comparison.id}
                className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50
                           transition-colors disabled:opacity-50 flex-shrink-0"
                title="Delete comparison"
              >
                <IconTrash size={16} />
              </button>
            </div>

            {/* Description */}
            {comparison.description && (
              <div className="flex items-start gap-2 mb-3">
                <IconNote size={14} className="text-slate-400 mt-0.5 flex-shrink-0" />
                <p className="text-sm leading-relaxed text-slate-600 line-clamp-2">{comparison.description}</p>
              </div>
            )}

            {/* Metadata */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <IconUsers size={14} />
                <span>{comparison.player_ids.length} players</span>
              </div>

              <div className="flex items-center gap-2 text-sm text-slate-500">
                <IconCalendar size={14} />
                <span>
                  {format(new Date(comparison.created_at), 'MMM d, yyyy')}
                </span>
              </div>
            </div>

            {/* Footer - View button appears on hover */}
            <div className="mt-4 pt-4 border-t border-slate-100">
              <span className="text-sm leading-relaxed text-green-600 group-hover:underline">
                View Comparison →
              </span>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
