'use client';

import { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import type { BaseballDocument, BaseballDocumentVersion } from '@/app/baseball/actions/documents';
import { revertToVersion } from '@/app/baseball/actions/documents';
import {
  IconClock,
  IconUser,
  IconFile,
  IconEye,
  IconDownload,
  IconRefresh,
  IconCheck,
} from '@/components/icons';
import { formatDistanceToNow, format } from 'date-fns';

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

interface VersionHistoryProps {
  document: BaseballDocument;
  versions: BaseballDocumentVersion[];
  onPreviewVersion?: (version: BaseballDocumentVersion) => void;
  onDownloadVersion?: (version: BaseballDocumentVersion) => void;
  onReverted?: () => void;
  className?: string;
}

export function VersionHistory({
  document,
  versions,
  onPreviewVersion,
  onDownloadVersion,
  onReverted,
  className,
}: VersionHistoryProps) {
  const [revertingTo, setRevertingTo] = useState<number | null>(null);
  const [isReverting, setIsReverting] = useState(false);
  const [revertError, setRevertError] = useState<string | null>(null);
  const [showRevertDialog, setShowRevertDialog] = useState(false);

  const handleRevertClick = useCallback((versionNumber: number) => {
    setRevertingTo(versionNumber);
    setShowRevertDialog(true);
    setRevertError(null);
  }, []);

  const handleConfirmRevert = useCallback(async () => {
    if (revertingTo === null) return;

    setIsReverting(true);
    setRevertError(null);

    try {
      const { success, error } = await revertToVersion(document.id, String(revertingTo));

      if (error) {
        setRevertError(error);
        return;
      }

      if (success) {
        setShowRevertDialog(false);
        setRevertingTo(null);
        onReverted?.();
      }
    } catch {
      setRevertError('An unexpected error occurred');
    } finally {
      setIsReverting(false);
    }
  }, [document.id, revertingTo, onReverted]);

  const sortedVersions = [...versions].sort((a, b) => b.version_number - a.version_number);
  const currentVersion = sortedVersions[0]?.version_number ?? 1;

  return (
    <>
      <div className={cn('bg-white rounded-2xl border border-slate-200 p-6', className)}>
        <div className="flex items-center gap-2 mb-4">
          <IconClock size={20} className="text-slate-600" />
          <h3 className="text-base font-semibold text-slate-900">Version History</h3>
        </div>

        {versions.length === 0 ? (
          <div className="text-center py-8 text-slate-500">
            <IconClock size={32} className="mx-auto mb-2 opacity-50" />
            <p>No version history available</p>
          </div>
        ) : (
          <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-4 top-0 bottom-0 w-px bg-slate-200" />

            {/* Version items */}
            <div className="space-y-4">
              {sortedVersions.map((version, index) => {
                const isCurrent = version.version_number === currentVersion;
                const isLatest = index === 0;

                return (
                  <div
                    key={version.id}
                    className={cn(
                      'relative pl-10 group',
                      isCurrent && 'bg-green-50/50 -mx-4 px-4 py-3 rounded-lg ml-6'
                    )}
                  >
                    {/* Timeline dot */}
                    <div
                      className={cn(
                        'absolute left-2.5 top-1 w-3 h-3 rounded-full border-2 bg-white',
                        isCurrent
                          ? 'border-green-600 bg-green-600'
                          : 'border-slate-300'
                      )}
                    />

                    {/* Version content */}
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-sm">v{version.version_number}</span>
                          {isCurrent && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-700">
                              <IconCheck size={10} />
                              Current
                            </span>
                          )}
                          {isLatest && !isCurrent && (
                            <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-slate-100 text-slate-600">
                              Latest
                            </span>
                          )}
                        </div>

                        {/* Change notes */}
                        {version.change_notes && (
                          <p className="text-sm text-slate-700 mb-2">{version.change_notes}</p>
                        )}

                        {/* Metadata */}
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                          {version.created_at && (
                            <span className="flex items-center gap-1">
                              <IconClock size={12} />
                              {formatDistanceToNow(new Date(version.created_at), {
                                addSuffix: true,
                              })}
                            </span>
                          )}
                          {version.uploader?.full_name && (
                            <span className="flex items-center gap-1">
                              <IconUser size={12} />
                              {version.uploader.full_name}
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <IconFile size={12} />
                            {formatFileSize(version.file_size)}
                          </span>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 ml-4 opacity-0 group-hover:opacity-100 transition-opacity">
                        {onPreviewVersion && (
                          <button
                            onClick={() => onPreviewVersion(version)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                            title="Preview this version"
                          >
                            <IconEye size={14} />
                          </button>
                        )}
                        {onDownloadVersion && version.file_url && (
                          <button
                            onClick={() => onDownloadVersion(version)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                            title="Download this version"
                          >
                            <IconDownload size={14} />
                          </button>
                        )}
                        {!isCurrent && (
                          <button
                            onClick={() => handleRevertClick(version.version_number)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                            title="Revert to this version"
                          >
                            <IconRefresh size={14} />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Full date on hover */}
                    {version.created_at && (
                      <div className="text-xs text-slate-400 mt-1 hidden group-hover:block">
                        {format(new Date(version.created_at), 'PPpp')}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Revert Confirmation Dialog */}
      {showRevertDialog && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <h3 className="text-lg font-semibold text-slate-900">
                Revert to Version {revertingTo}?
              </h3>
              <p className="text-sm text-slate-500 mt-1">
                This will create a new version based on version {revertingTo}. The current version
                will not be deleted.
              </p>
            </div>

            {revertError && (
              <div className="px-6 py-3">
                <div className="p-3 text-sm text-red-600 bg-red-50 rounded-lg">{revertError}</div>
              </div>
            )}

            <div className="flex gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50/50">
              <button
                onClick={() => setShowRevertDialog(false)}
                disabled={isReverting}
                className="flex-1 px-4 py-2.5 border border-slate-200 rounded-lg font-medium text-slate-700 hover:bg-white transition-colors text-sm disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmRevert}
                disabled={isReverting}
                className="flex-1 px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors text-sm disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isReverting ? (
                  <>
                    <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                    Reverting...
                  </>
                ) : (
                  <>
                    <IconRefresh size={14} />
                    Revert to v{revertingTo}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default VersionHistory;
