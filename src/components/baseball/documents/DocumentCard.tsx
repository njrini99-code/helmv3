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
import { Button, IconButton } from '@/components/ui/button';

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
  if (!fileType) return <IconFile size={size} className="text-warm-400" />;
  if (fileType === 'application/pdf') return <IconFileText size={size} className="text-red-500" />;
  if (fileType.startsWith('image/')) return <IconImage size={size} className="text-warm-500" />;
  if (fileType.includes('word') || fileType.includes('document')) return <IconFileText size={size} className="text-warm-700" />;
  if (fileType.includes('sheet') || fileType.includes('excel') || fileType === 'text/csv') return <IconFileSpreadsheet size={size} className="text-primary-500" />;
  if (fileType.startsWith('video/')) return <IconVideo size={size} className="text-primary-600" />;
  if (fileType.startsWith('text/')) return <IconFileText size={size} className="text-warm-500" />;
  return <IconFile size={size} className="text-warm-400" />;
}

function getFileTypeColor(fileType: string | null): string {
  if (!fileType) return 'bg-warm-100 text-warm-500';
  if (fileType === 'application/pdf') return 'bg-red-50 text-red-600';
  if (fileType.startsWith('image/')) return 'bg-warm-100 text-warm-600';
  if (fileType.includes('word') || fileType.includes('document')) return 'bg-warm-100 text-warm-700';
  if (fileType.includes('sheet') || fileType.includes('excel')) return 'bg-primary-50 text-primary-600';
  if (fileType.startsWith('video/')) return 'bg-primary-50 text-primary-700';
  return 'bg-warm-50 text-warm-500';
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
      role="button"
      tabIndex={0}
      className="group relative glass-standard rounded-2xl overflow-clip hover:shadow-md hover:bg-cream-100/82 transition-all duration-200 cursor-pointer active:scale-[0.98]"
      onClick={handlePreview}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handlePreview(); } }}
    >
      {/* Color accent bar */}
      <div
        className={cn(
          'h-1 w-full',
          document.file_type === 'application/pdf'
            ? 'bg-red-400'
            : document.file_type?.startsWith('image/')
            ? 'bg-warm-400'
            : document.file_type?.includes('word')
            ? 'bg-warm-500'
            : document.file_type?.includes('sheet')
            ? 'bg-primary-400'
            : document.file_type?.startsWith('video/')
            ? 'bg-primary-400'
            : 'bg-warm-300'
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
              <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-warm-100 text-warm-600 flex items-center gap-0.5">
                <IconLayers size={10} />
                v{document.version_count}
              </span>
            )}

            {isCoach && (
              <div className="relative">
                <IconButton variant="default" aria-label="More options"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveDropdown(activeDropdown === document.id ? null : document.id);
                  }}
                  className="p-1.5 rounded-lg text-warm-400 hover:text-warm-600 hover:bg-warm-100/80 opacity-0 group-hover:opacity-100 transition-all"
                >
                  <IconMoreVertical size={14} />
                </IconButton>

                {activeDropdown === document.id && (
                  <>
                    <button
                      type="button"
                      aria-label="Close menu"
                      className="fixed inset-0 z-30 cursor-default bg-transparent border-0 p-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveDropdown(null);
                      }}
                    />
                    <div role="menu" className="absolute right-0 top-8 z-40 w-48 bg-white rounded-xl shadow-xl border border-warm-200 py-1.5 animate-in fade-in slide-in-from-top-1 duration-150">
                      <Button
                        variant="ghost"
                        role="menuitem"
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePreview();
                          setActiveDropdown(null);
                        }}
                        className="justify-start gap-2.5 w-full px-3 py-2 min-h-0 text-sm font-normal text-warm-700 hover:bg-warm-50 active:bg-warm-100"
                      >
                        <IconEye size={14} /> Preview
                      </Button>
                      {onViewHistory && (
                        <Button
                          variant="ghost"
                          role="menuitem"
                          onClick={(e) => {
                            e.stopPropagation();
                            onViewHistory(document);
                          }}
                          className="justify-start gap-2.5 w-full px-3 py-2 min-h-0 text-sm font-normal text-warm-700 hover:bg-warm-50 active:bg-warm-100"
                        >
                          <IconClock size={14} /> Version History
                        </Button>
                      )}
                      {onUploadVersion && (
                        <Button
                          variant="ghost"
                          role="menuitem"
                          onClick={(e) => {
                            e.stopPropagation();
                            onUploadVersion(document);
                          }}
                          className="justify-start gap-2.5 w-full px-3 py-2 min-h-0 text-sm font-normal text-warm-700 hover:bg-warm-50 active:bg-warm-100"
                        >
                          <IconUpload size={14} /> Upload New Version
                        </Button>
                      )}
                      {onEdit && (
                        <Button
                          variant="ghost"
                          role="menuitem"
                          onClick={(e) => {
                            e.stopPropagation();
                            onEdit(document);
                          }}
                          className="justify-start gap-2.5 w-full px-3 py-2 min-h-0 text-sm font-normal text-warm-700 hover:bg-warm-50 active:bg-warm-100"
                        >
                          <IconEdit size={14} /> Edit Details
                        </Button>
                      )}
                      {onMoveToFolder && (
                        <Button
                          variant="ghost"
                          role="menuitem"
                          onClick={(e) => {
                            e.stopPropagation();
                            onMoveToFolder(document);
                          }}
                          className="justify-start gap-2.5 w-full px-3 py-2 min-h-0 text-sm font-normal text-warm-700 hover:bg-warm-50 active:bg-warm-100"
                        >
                          <IconFolder size={14} /> Move to Folder
                        </Button>
                      )}
                      {onDelete && (
                        <>
                          <div className="my-1 h-px bg-warm-100" />
                          <Button
                            variant="ghost"
                            role="menuitem"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDelete(document);
                              setActiveDropdown(null);
                            }}
                            className="justify-start gap-2.5 w-full px-3 py-2 min-h-0 text-sm font-normal text-red-600 hover:bg-red-50 active:bg-red-100"
                          >
                            <IconTrash size={14} /> Delete
                          </Button>
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
        <h3 className="font-semibold text-warm-900 mb-1 truncate text-body leading-tight">
          {document.title}
        </h3>

        {/* Description */}
        {document.description && (
          <p className="text-xs text-warm-500 mb-3 line-clamp-2 leading-relaxed">
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
            <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-md bg-primary-50 text-primary-700">
              {categoryLabel}
            </span>
          )}
          {document.folder && (
            <span className="inline-flex items-center gap-0.5 px-2 py-0.5 text-xs font-medium rounded-md bg-warm-100 text-warm-600">
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
        <div className="flex items-center justify-between pt-3 border-t border-warm-100">
          <div className="flex items-center gap-3 text-xs text-warm-400">
            <span>{formatFileSize(document.file_size)}</span>
            <span>{timeAgo(document.created_at)}</span>
          </div>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-all">
            <IconButton
              variant="ghost"
              aria-label="Preview document"
              onClick={(e) => {
                e.stopPropagation();
                handlePreview();
              }}
              className="w-auto h-auto p-1.5 rounded-lg text-primary-600 hover:text-primary-600 hover:bg-primary-50 active:bg-primary-100"
              title="Preview"
            >
              <IconEye size={14} />
            </IconButton>
            <a
              href={document.file_url}
              download
              onClick={(e) => e.stopPropagation()}
              className="p-1.5 rounded-lg hover:bg-warm-100 active:bg-warm-200 text-warm-500 transition-colors"
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
