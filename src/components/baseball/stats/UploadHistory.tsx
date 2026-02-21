'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { formatDistanceToNow } from 'date-fns';
import {
  IconFile,
  IconCheck,
  IconX,
  IconRefresh,
  IconUpload,
  IconAlertCircle,
} from '@/components/icons';

// ============================================================================
// TYPES
// ============================================================================

// Interface matching the database schema for baseball_stat_uploads
interface Upload {
  id: string;
  filename: string;
  coach_id: string;
  team_id: string;
  status: string | null;
  row_count: number | null;
  processed_count: number | null;
  error_message: string | null;
  file_url: string | null;
  completed_at: string | null;
  created_at: string | null;
}

interface UploadHistoryProps {
  teamId: string;
  limit?: number;
  showViewAll?: boolean;
  onViewAll?: () => void;
}

// ============================================================================
// LOADING SKELETON
// ============================================================================

function UploadSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="flex items-center gap-4 p-3 bg-slate-50 rounded-lg animate-pulse"
        >
          <div className="w-10 h-10 rounded-lg bg-slate-200" />
          <div className="flex-1">
            <div className="h-4 w-32 bg-slate-200 rounded mb-2" />
            <div className="h-3 w-48 bg-slate-200 rounded" />
          </div>
          <div className="flex items-center gap-3">
            <div className="h-4 w-8 bg-slate-200 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// COMPONENT
// ============================================================================

export function UploadHistory({
  teamId,
  limit = 5,
  showViewAll = false,
  onViewAll,
}: UploadHistoryProps) {
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const supabase = createClient();
      const { data, error: fetchError } = await supabase
        .from('baseball_stat_uploads')
        .select('*')
        .eq('team_id', teamId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (fetchError) {
        setError('Failed to load upload history');
        console.error('Error fetching upload history:', fetchError);
      } else {
        setUploads((data as Upload[]) || []);
      }
    } catch (err) {
      setError('An unexpected error occurred');
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  }, [teamId, limit]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // Loading state with skeleton
  if (loading) {
    return (
      <div className="glass-standard rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-slate-900">Recent Uploads</h3>
          <div className="w-6 h-6 rounded-full border-2 border-primary-600 border-t-transparent animate-spin" />
        </div>
        <UploadSkeleton />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="glass-standard rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-slate-900">Recent Uploads</h3>
          <button
            onClick={fetchHistory}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            title="Retry"
          >
            <IconRefresh size={16} />
          </button>
        </div>
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-3">
            <IconAlertCircle size={24} className="text-red-600" />
          </div>
          <p className="text-slate-700 font-medium mb-1">
            Unable to load history
          </p>
          <p className="text-sm text-slate-500 mb-4">{error}</p>
          <button
            onClick={fetchHistory}
            className="text-sm text-primary-600 hover:text-primary-700 font-medium"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  // Empty state
  if (uploads.length === 0) {
    return (
      <div className="glass-standard rounded-2xl p-6">
        <h3 className="font-semibold text-slate-900 mb-4">Recent Uploads</h3>
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-3">
            <IconUpload size={24} className="text-slate-400" />
          </div>
          <p className="text-slate-700 font-medium mb-1">No uploads yet</p>
          <p className="text-sm text-slate-500">
            Upload a CSV file to start tracking stats
          </p>
        </div>
      </div>
    );
  }

  // Normal state with data
  return (
    <div className="glass-standard rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-slate-900">Recent Uploads</h3>
        <button
          onClick={fetchHistory}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          title="Refresh"
        >
          <IconRefresh size={16} />
        </button>
      </div>
      <div className="space-y-3">
        {uploads.map((upload) => {
          const isComplete = upload.status === 'completed';
          const isProcessing = upload.status === 'processing';
          const hasFailed = upload.status === 'failed' || !!upload.error_message;

          return (
            <div
              key={upload.id}
              className="flex items-center gap-4 p-3 bg-slate-50 hover:bg-slate-100 rounded-lg transition-colors cursor-default"
            >
              <div className="w-10 h-10 rounded-lg bg-white flex items-center justify-center shadow-sm">
                <IconFile size={20} className="text-slate-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-slate-900 truncate">
                  {upload.filename}
                </p>
                <div className="flex items-center flex-wrap gap-x-2 gap-y-1 text-xs text-slate-500">
                  <span
                    className={`px-1.5 py-0.5 rounded font-medium ${
                      isComplete
                        ? 'bg-primary-100 text-primary-700'
                        : isProcessing
                          ? 'bg-amber-100 text-amber-700'
                          : hasFailed
                            ? 'bg-red-100 text-red-700'
                            : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {upload.status || 'pending'}
                  </span>
                  {upload.created_at && (
                    <>
                      <span>•</span>
                      <span>
                        {formatDistanceToNow(new Date(upload.created_at), {
                          addSuffix: true,
                        })}
                      </span>
                    </>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3 text-sm flex-shrink-0">
                {upload.processed_count != null && upload.processed_count > 0 && (
                  <div className="flex items-center gap-1 text-primary-600" title="Processed rows">
                    <IconCheck size={14} />
                    <span className="font-medium">{upload.processed_count}</span>
                  </div>
                )}
                {upload.row_count != null && upload.row_count > 0 && upload.processed_count != null && upload.row_count > upload.processed_count && (
                  <div className="flex items-center gap-1 text-amber-600" title="Unprocessed rows">
                    <IconX size={14} />
                    <span className="font-medium">{upload.row_count - upload.processed_count}</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {showViewAll && onViewAll && uploads.length >= limit && (
        <button
          onClick={onViewAll}
          className="w-full mt-4 py-2 text-sm text-primary-600 hover:text-primary-700 font-medium text-center transition-colors"
        >
          View all uploads
        </button>
      )}
    </div>
  );
}
