'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { formatDistanceToNow } from 'date-fns';
import { IconFile, IconCheck, IconX, IconRefresh } from '@/components/icons';

interface Upload {
  id: string;
  filename: string;
  row_count: number | null;
  processed_count: number | null;
  status: string | null;
  created_at: string | null;
}

interface UploadHistoryProps {
  teamId: string;
  limit?: number;
}

export function UploadHistory({ teamId, limit = 5 }: UploadHistoryProps) {
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchHistory() {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('baseball_stat_uploads')
        .select('*')
        .eq('team_id', teamId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (!error && data) {
        setUploads(data as Upload[]);
      }
      setLoading(false);
    }

    fetchHistory();
  }, [teamId, limit]);

  if (loading) {
    return (
      <div className="glass-standard rounded-2xl p-6">
        <div className="flex items-center gap-3 text-slate-500">
          <IconRefresh size={20} className="animate-spin" />
          <span>Loading upload history...</span>
        </div>
      </div>
    );
  }

  if (uploads.length === 0) {
    return (
      <div className="glass-standard rounded-2xl p-6 text-center">
        <p className="text-slate-500">No previous uploads</p>
      </div>
    );
  }

  return (
    <div className="glass-standard rounded-2xl p-6">
      <h3 className="font-semibold text-slate-900 mb-4">Recent Uploads</h3>
      <div className="space-y-3">
        {uploads.map((upload) => (
          <div
            key={upload.id}
            className="flex items-center gap-4 p-3 bg-slate-50 rounded-lg"
          >
            <div className="w-10 h-10 rounded-lg bg-white flex items-center justify-center">
              <IconFile size={20} className="text-slate-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-slate-900 truncate">
                {upload.filename}
              </p>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span className={`px-1.5 py-0.5 rounded ${
                  upload.status === 'completed' 
                    ? 'bg-primary-100 text-primary-700'
                    : upload.status === 'processing'
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-slate-100 text-slate-600'
                }`}>
                  {upload.status || 'pending'}
                </span>
                {upload.created_at && (
                  <>
                    <span>•</span>
                    <span>{formatDistanceToNow(new Date(upload.created_at), { addSuffix: true })}</span>
                  </>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3 text-sm">
              {upload.processed_count !== null && upload.processed_count > 0 && (
                <div className="flex items-center gap-1 text-primary-600">
                  <IconCheck size={14} />
                  <span>{upload.processed_count}</span>
                </div>
              )}
              {upload.row_count !== null && upload.row_count > (upload.processed_count || 0) && (
                <div className="flex items-center gap-1 text-amber-600">
                  <IconX size={14} />
                  <span>{upload.row_count - (upload.processed_count || 0)}</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
