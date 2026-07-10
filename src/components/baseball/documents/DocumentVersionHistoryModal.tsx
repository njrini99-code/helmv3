'use client';

/**
 * DocumentVersionHistoryModal — coach-facing revert/history surface for a
 * single baseball_document. Adapted from `src/components/golf/documents/
 * VersionHistory.tsx` (timeline layout + revert confirm) but packaged as a
 * self-contained modal matching the plain-HTML chrome the other baseball
 * document modals use (see UploadNewVersionModal.tsx), since baseball's
 * DocumentCard already owns its own menu/dropdown rather than golf's
 * full-bleed page.
 */

import { useCallback, useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import {
  IconX,
  IconClock,
  IconDownload,
  IconRotateCcw,
  IconCheck,
  IconUser,
  IconFile,
} from '@/components/icons';
import { IconButton } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { InkNotice } from '@/components/baseball/living-annual';
import {
  getVersionHistory,
  revertToVersion,
  type BaseballDocument,
  type BaseballDocumentVersion,
} from '@/app/baseball/actions/documents';

function formatFileSize(bytes: number | null): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

export interface DocumentVersionRevertPatch {
  id: string;
  version_count: number;
  file_type: string | null;
  file_size: number | null;
  file_url: string;
  /** The version number the document was reverted TO (for toast copy). */
  reverted_to_version_number: number;
}

interface DocumentVersionHistoryModalProps {
  open: boolean;
  document: BaseballDocument | null;
  onClose: () => void;
  onReverted: (patch: DocumentVersionRevertPatch) => void;
}

export function DocumentVersionHistoryModal({
  open,
  document,
  onClose,
  onReverted,
}: DocumentVersionHistoryModalProps) {
  const [versions, setVersions] = useState<BaseballDocumentVersion[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [revertTarget, setRevertTarget] = useState<BaseballDocumentVersion | null>(null);
  const [isReverting, setIsReverting] = useState(false);
  const [revertError, setRevertError] = useState<string | null>(null);

  const fetchVersions = useCallback(async (documentId: string) => {
    setLoading(true);
    setLoadError(null);
    const result = await getVersionHistory(documentId);
    if (result.success) {
      setVersions(result.versions || []);
    } else {
      setLoadError(result.error || 'Failed to load version history');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (open && document) {
      void fetchVersions(document.id);
    }
  }, [open, document, fetchVersions]);

  if (!open || !document) return null;

  const sortedVersions = [...versions].sort((a, b) => b.version_number - a.version_number);
  const currentVersionNumber = sortedVersions[0]?.version_number ?? document.version_count ?? 1;

  const handleClose = () => {
    setRevertTarget(null);
    setRevertError(null);
    onClose();
  };

  const handleConfirmRevert = async () => {
    if (!revertTarget || !document) return;

    setIsReverting(true);
    setRevertError(null);

    const result = await revertToVersion(document.id, revertTarget.id);
    if (!result.success) {
      setRevertError(result.error || 'Failed to revert');
      setIsReverting(false);
      return;
    }

    const nextVersionNumber = Math.max(...versions.map((v) => v.version_number), 0) + 1;
    onReverted({
      id: document.id,
      version_count: nextVersionNumber,
      file_type: revertTarget.mime_type,
      file_size: revertTarget.file_size,
      file_url: revertTarget.file_url || document.file_url,
      reverted_to_version_number: revertTarget.version_number,
    });

    setRevertTarget(null);
    setIsReverting(false);
    await fetchVersions(document.id);
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        {/* eslint-disable-next-line helm/no-raw-button -- click-outside-to-close overlay, not an interactive control */}
        <button
          type="button"
          aria-label="Close modal"
          className="absolute inset-0 bg-warm-900/50 backdrop-blur-sm border-0 p-0 cursor-default"
          onClick={handleClose}
        />

        {/* Modal */}
        <div className="relative bg-cream-50 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-clip">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-warm-200 flex-shrink-0">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-warm-900">Version History</h2>
              <p className="text-sm text-warm-500 mt-0.5 truncate">{document.title}</p>
            </div>
            <IconButton
              variant="default"
              aria-label="Close"
              onClick={handleClose}
              className="p-2 hover:bg-warm-100 active:bg-warm-200 rounded-lg transition-colors"
            >
              <IconX size={20} />
            </IconButton>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {loading ? (
              <div className="py-10 text-center text-sm text-warm-500">Loading versions&hellip;</div>
            ) : loadError ? (
              <InkNotice>{loadError}</InkNotice>
            ) : sortedVersions.length === 0 ? (
              <div className="py-10 text-center text-sm text-warm-500">No version history available</div>
            ) : (
              <div className="relative">
                <div className="absolute left-4 top-1 bottom-1 w-px bg-warm-100" />
                <div className="space-y-4">
                  {sortedVersions.map((version, index) => {
                    const isCurrent = version.version_number === currentVersionNumber;
                    const isLatest = index === 0;

                    return (
                      <div
                        key={version.id}
                        className={`relative pl-10 group ${
                          isCurrent ? 'bg-primary-50/60 -mx-3 px-3 py-3 rounded-xl ml-3' : ''
                        }`}
                      >
                        <div
                          className={`absolute left-2.5 top-1.5 w-3 h-3 rounded-full border-2 bg-cream-50 ${
                            isCurrent ? 'border-primary-600 bg-primary-600' : 'border-warm-300'
                          }`}
                        />
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <span className="font-medium text-sm text-warm-900">v{version.version_number}</span>
                              {isCurrent && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-primary-100 text-primary-700">
                                  <IconCheck size={10} /> Current
                                </span>
                              )}
                              {isLatest && !isCurrent && (
                                <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-warm-100 text-warm-600">
                                  Latest
                                </span>
                              )}
                            </div>

                            {version.change_notes && (
                              <p className="text-sm text-warm-700 mb-1.5">{version.change_notes}</p>
                            )}

                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-warm-400">
                              <span className="flex items-center gap-1">
                                <IconClock size={11} />
                                {version.created_at
                                  ? formatDistanceToNow(new Date(version.created_at), { addSuffix: true })
                                  : ''}
                              </span>
                              {version.uploader?.full_name && (
                                <span className="flex items-center gap-1">
                                  <IconUser size={11} />
                                  {version.uploader.full_name}
                                </span>
                              )}
                              <span className="flex items-center gap-1">
                                <IconFile size={11} />
                                {formatFileSize(version.file_size)}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 flex-shrink-0 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                            {version.file_url && (
                              <a
                                href={version.file_url}
                                download
                                className="p-1.5 rounded-lg hover:bg-warm-100 active:bg-warm-200 text-warm-500 transition-colors"
                                title="Download this version"
                              >
                                <IconDownload size={14} />
                              </a>
                            )}
                            {!isCurrent && (
                              <IconButton
                                variant="default"
                                aria-label={`Revert to version ${version.version_number}`}
                                onClick={() => {
                                  setRevertTarget(version);
                                  setRevertError(null);
                                }}
                                className="p-1.5 rounded-lg hover:bg-warm-100 active:bg-warm-200 text-warm-500 transition-colors"
                                title="Revert to this version"
                              >
                                <IconRotateCcw size={14} />
                              </IconButton>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={!!revertTarget}
        onCancel={() => {
          setRevertTarget(null);
          setRevertError(null);
        }}
        onConfirm={handleConfirmRevert}
        title={`Revert to Version ${revertTarget?.version_number ?? ''}?`}
        message={
          revertError ||
          `This will create a new version based on version ${revertTarget?.version_number ?? ''}. The current version will not be deleted — you can always revert back.`
        }
        confirmLabel={`Revert to v${revertTarget?.version_number ?? ''}`}
        cancelLabel="Cancel"
        variant="warning"
        isLoading={isReverting}
      />
    </>
  );
}

export default DocumentVersionHistoryModal;
