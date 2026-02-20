'use client';

import { useCallback } from 'react';
import { cn } from '@/lib/utils';
import {
  IconEye,
  IconDownload,
  IconMoreVertical,
  IconClock,
  IconUpload,
  IconEdit,
  IconTrash,
  IconFile,
  IconFileText,
  IconImage,
  IconVideo,
  IconFileSpreadsheet,
  IconFolder,
  IconLayers,
} from '@/components/icons';
import type { BaseballDocument } from '@/app/baseball/actions/documents';

// Document categories for display
const DOCUMENT_CATEGORIES: Record<string, string> = {
  general: 'General',
  playbook: 'Playbook',
  rules: 'Rules',
  conditioning: 'Conditioning',
  scouting: 'Scouting',
  academic: 'Academic',
  administrative: 'Administrative',
  media: 'Media',
};

// Get file type label from MIME type
function getFileTypeLabel(mimeType: string | null): string {
  if (!mimeType) return 'File';
  if (mimeType === 'application/pdf') return 'PDF';
  if (mimeType.startsWith('image/')) return 'Image';
  if (mimeType.startsWith('video/')) return 'Video';
  if (mimeType.startsWith('audio/')) return 'Audio';
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || mimeType === 'text/csv') return 'Spreadsheet';
  if (mimeType.includes('word') || mimeType.includes('document')) return 'Document';
  if (mimeType.startsWith('text/')) return 'Text';
  return 'File';
}

// Get file icon based on MIME type
function getFileIcon(fileType: string | null, size = 20) {
  if (!fileType) return <IconFile size={size} className="text-slate-400" />;
  if (fileType === 'application/pdf') return <IconFileText size={size} className="text-red-500" />;
  if (fileType.startsWith('image/')) return <IconImage size={size} className="text-blue-500" />;
  if (fileType.includes('word') || fileType.includes('document')) return <IconFileText size={size} className="text-blue-600" />;
  if (fileType.includes('sheet') || fileType.includes('excel') || fileType === 'text/csv') return <IconFileSpreadsheet size={size} className="text-emerald-500" />;
  if (fileType.startsWith('video/')) return <IconVideo size={size} className="text-purple-500" />;
  if (fileType.startsWith('text/')) return <IconFileText size={size} className="text-slate-500" />;
  return <IconFile size={size} className="text-slate-400" />;
}

function getFileTypeColor(fileType: string | null): string {
  if (!fileType) return 'bg-slate-100 text-slate-500';
  if (fileType === 'application/pdf') return 'bg-red-50 text-red-600';
  if (fileType.startsWith('image/')) return 'bg-blue-50 text-blue-600';
  if (fileType.includes('word') || fileType.includes('document')) return 'bg-blue-50 text-blue-700';
  if (fileType.includes('sheet') || fileType.includes('excel')) return 'bg-emerald-50 text-emerald-600';
  if (fileType.startsWith('video/')) return 'bg-purple-50 text-purple-600';
  return 'bg-slate-50 text-slate-500';
}

function formatFileSize(bytes: number | null): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

interface DocumentCardProps {
  document: BaseballDocument;
  onPreview?: (document: BaseballDocument) => void;
  onViewHistory?: (document: BaseballDocument) => void;
  onUploadVersion?: (document: BaseballDocument) => void;
  onEdit?: (document: BaseballDocument) => void;
  onDelete?: (document: BaseballDocument) => void;
  onMoveToFolder?: (document: BaseballDocument) => void;
  isCoach?: boolean;
  activeDropdown: string | null;
  setActiveDropdown: (id: string | null) => void;
}

export function DocumentCard({
  document,
  onPreview,
  onViewHistory,
  onUploadVersion,
  onEdit,
  onDelete,
  onMoveToFolder,
  isCoach = false,
  activeDropdown,
  setActiveDropdown,
}: DocumentCardProps) {
  const categoryLabel = DOCUMENT_CATEGORIES[document.category || ''] || document.category;

  const handlePreview = useCallback(() => {
    onPreview?.(document);
  }, [document, onPreview]);

  return (
    <div
      className="group relative bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl shadow-sm overflow-hidden hover:shadow-md hover:bg-white/80 transition-all duration-200 cursor-pointer active:scale-[0.98]"
      onClick={handlePreview}
    >
      {/* Color accent bar */}
      <div
        className={cn(
          'h-1 w-full',
          document.file_type === 'application/pdf'
            ? 'bg-red-400'
            : document.file_type?.startsWith('image/')
            ? 'bg-blue-400'
            : document.file_type?.includes('word')
            ? 'bg-blue-500'
            : document.file_type?.includes('sheet')
            ? 'bg-emerald-400'
            : document.file_type?.startsWith('video/')
            ? 'bg-purple-400'
            : 'bg-slate-300'
        )}
      />

      <div className="p-5">
        {/* Top row: icon + actions */}
        <div className="flex items-start justify-between mb-4">
          <div
            className={cn(
              'w-11 h-11 rounded-xl flex items-center justify-center',
              getFileTypeColor(document.file_type)
            )}
          >
            {getFileIcon(document.file_type, 20)}
          </div>

          <div className="flex items-center gap-1">
            {/* Version badge */}
            {document.version_count && document.version_count > 1 && (
              <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-slate-100 text-slate-600 flex items-center gap-0.5">
                <IconLayers size={10} />
                v{document.version_count}
              </span>
            )}

            {isCoach && (
              <div className="relative">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveDropdown(activeDropdown === document.id ? null : document.id);
                  }}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100/80 opacity-0 group-hover:opacity-100 transition-all"
                >
                  <IconMoreVertical size={14} />
                </button>

                {activeDropdown === document.id && (
                  <>
                    <div
                      className="fixed inset-0 z-30"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveDropdown(null);
                      }}
                    />
                    <div className="absolute right-0 top-8 z-40 w-48 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 animate-in fade-in slide-in-from-top-1 duration-150">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePreview();
                          setActiveDropdown(null);
                        }}
                        className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 active:bg-slate-100 transition-colors"
                      >
                        <IconEye size={14} /> Preview
                      </button>
                      {onViewHistory && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onViewHistory(document);
                          }}
                          className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 active:bg-slate-100 transition-colors"
                        >
                          <IconClock size={14} /> Version History
                        </button>
                      )}
                      {onUploadVersion && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onUploadVersion(document);
                          }}
                          className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 active:bg-slate-100 transition-colors"
                        >
                          <IconUpload size={14} /> Upload New Version
                        </button>
                      )}
                      {onEdit && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onEdit(document);
                          }}
                          className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 active:bg-slate-100 transition-colors"
                        >
                          <IconEdit size={14} /> Edit Details
                        </button>
                      )}
                      {onMoveToFolder && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onMoveToFolder(document);
                          }}
                          className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 active:bg-slate-100 transition-colors"
                        >
                          <IconFolder size={14} /> Move to Folder
                        </button>
                      )}
                      {onDelete && (
                        <>
                          <div className="my-1 h-px bg-slate-100" />
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onDelete(document);
                              setActiveDropdown(null);
                            }}
                            className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-red-600 hover:bg-red-50 active:bg-red-100 transition-colors"
                          >
                            <IconTrash size={14} /> Delete
                          </button>
                        </>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Title */}
        <h3 className="font-semibold text-slate-900 mb-1 truncate text-[15px] leading-tight">
          {document.title}
        </h3>

        {/* Description */}
        {document.description && (
          <p className="text-xs text-slate-500 mb-3 line-clamp-2 leading-relaxed">
            {document.description}
          </p>
        )}

        {/* Tags */}
        <div className="flex flex-wrap items-center gap-1.5 mb-4">
          <span
            className={cn(
              'inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-md',
              getFileTypeColor(document.file_type)
            )}
          >
            {getFileTypeLabel(document.file_type)}
          </span>
          {document.category && (
            <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-md bg-green-50 text-green-700">
              {categoryLabel}
            </span>
          )}
          {document.folder && (
            <span className="inline-flex items-center gap-0.5 px-2 py-0.5 text-xs font-medium rounded-md bg-slate-100 text-slate-600">
              <IconFolder size={9} /> {document.folder}
            </span>
          )}
          {isCoach && !document.is_player_visible && (
            <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-md bg-amber-50 text-amber-700">
              Coach only
            </span>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-100">
          <div className="flex items-center gap-3 text-xs text-slate-400">
            <span>{formatFileSize(document.file_size)}</span>
            <span>{timeAgo(document.created_at)}</span>
          </div>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
            <button
              onClick={(e) => {
                e.stopPropagation();
                handlePreview();
              }}
              className="p-1.5 rounded-lg hover:bg-green-50 active:bg-green-100 text-green-600 transition-colors"
              title="Preview"
            >
              <IconEye size={14} />
            </button>
            <a
              href={document.file_url}
              download
              onClick={(e) => e.stopPropagation()}
              className="p-1.5 rounded-lg hover:bg-slate-100 active:bg-slate-200 text-slate-500 transition-colors"
              title="Download"
            >
              <IconDownload size={14} />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

export default DocumentCard;
