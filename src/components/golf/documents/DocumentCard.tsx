'use client';

import { useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dropdown,
  DropdownItem,
  DropdownSeparator,
} from '@/components/ui/dropdown';
import { cn } from '@/lib/utils';
import {
  formatFileSize,
  type GolfDocument,
} from '@/lib/types/golf';

// Document categories for display
const DOCUMENT_CATEGORIES = [
  { value: 'playbook', label: 'Playbook' },
  { value: 'schedule', label: 'Schedule' },
  { value: 'travel', label: 'Travel' },
  { value: 'roster', label: 'Roster' },
  { value: 'academic', label: 'Academic' },
  { value: 'compliance', label: 'Compliance' },
  { value: 'other', label: 'Other' },
];

// Get file type label from MIME type
function getFileTypeLabel(mimeType: string): string {
  if (mimeType === 'application/pdf') return 'PDF';
  if (mimeType.startsWith('image/')) return 'Image';
  if (mimeType.startsWith('video/')) return 'Video';
  if (mimeType.startsWith('audio/')) return 'Audio';
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || mimeType === 'text/csv') return 'Spreadsheet';
  if (mimeType.includes('word') || mimeType.includes('document')) return 'Document';
  if (mimeType.startsWith('text/')) return 'Text';
  return 'File';
}

// Get file icon type from MIME type
function getFileIcon(mimeType: string): string {
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || mimeType === 'text/csv') return 'spreadsheet';
  if (mimeType.includes('word') || mimeType.includes('document')) return 'document';
  if (mimeType.startsWith('text/')) return 'text';
  return 'file';
}
import {
  EyeIcon,
  DownloadIcon,
  MoreVerticalIcon,
  HistoryIcon,
  UploadIcon,
  PencilIcon,
  Trash2Icon,
  FileIcon,
  FileTextIcon,
  FileImageIcon,
  FileVideoIcon,
  FileSpreadsheetIcon,
  FileMusicIcon,
  LockIcon,
  GlobeIcon,
  ExternalLinkIcon,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { openExternalUrl } from '@/lib/utils/capacitor';

interface DocumentCardProps {
  document: GolfDocument;
  onPreview?: (document: GolfDocument) => void;
  onDownload?: (document: GolfDocument) => void;
  onViewHistory?: (document: GolfDocument) => void;
  onUploadVersion?: (document: GolfDocument) => void;
  onEdit?: (document: GolfDocument) => void;
  onDelete?: (document: GolfDocument) => void;
  isCoach?: boolean;
  className?: string;
}

function FileTypeIcon({ mimeType, className }: { mimeType: string; className?: string }) {
  const iconType = getFileIcon(mimeType);

  switch (iconType) {
    case 'pdf':
      return <FileTextIcon className={cn('text-red-500', className)} />;
    case 'image':
      return <FileImageIcon className={cn('text-blue-500', className)} />;
    case 'video':
      return <FileVideoIcon className={cn('text-purple-500', className)} />;
    case 'audio':
      return <FileMusicIcon className={cn('text-pink-500', className)} />;
    case 'spreadsheet':
      return <FileSpreadsheetIcon className={cn('text-primary-500', className)} />;
    case 'document':
      return <FileTextIcon className={cn('text-blue-600', className)} />;
    case 'text':
      return <FileTextIcon className={cn('text-warm-500', className)} />;
    default:
      return <FileIcon className={cn('text-warm-400', className)} />;
  }
}

export function DocumentCard({
  document,
  onPreview,
  onDownload,
  onViewHistory,
  onUploadVersion,
  onEdit,
  onDelete,
  isCoach = false,
  className,
}: DocumentCardProps) {
  const categoryLabel = DOCUMENT_CATEGORIES.find((c: { value: string; label: string }) => c.value === document.category)?.label || document.category;

  const handlePreview = useCallback(() => {
    onPreview?.(document);
  }, [document, onPreview]);

  const handleDownload = useCallback(() => {
    if (onDownload) {
      onDownload(document);
    } else {
      // Default download behavior
      const link = window.document.createElement('a');
      link.href = document.file_url;
      link.download = document.title;
      link.click();
    }
  }, [document, onDownload]);

  return (
    <Card
      className={cn(
        'group transition-all duration-200 hover:shadow-md hover:border-primary/20',
        className
      )}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          {/* File Icon */}
          <div className="flex-shrink-0 p-3 bg-muted/50 rounded-lg group-hover:bg-muted transition-colors">
            <FileTypeIcon mimeType={document.file_type || ''} className="h-8 w-8" />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* Title and Actions Row */}
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                  {document.title}
                </h3>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-sm text-muted-foreground">
                    {getFileTypeLabel(document.file_type || '')}
                  </span>
                  <span className="text-muted-foreground">•</span>
                  <span className="text-sm text-muted-foreground">
                    {formatFileSize(document.file_size || 0)}
                  </span>
                </div>
              </div>

              {/* Quick Actions */}
              <div className={cn(
                'flex items-center gap-1 transition-opacity',
                'opacity-100 md:opacity-0 md:group-hover:opacity-100'
              )}>
                {onPreview && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={handlePreview}
                    title="Preview"
                    aria-label="Preview document"
                  >
                    <EyeIcon className="h-4 w-4" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={handleDownload}
                  title="Download"
                  aria-label="Download document"
                >
                  <DownloadIcon className="h-4 w-4" />
                </Button>

                {/* More actions dropdown */}
                <Dropdown
                  trigger={
                    <Button variant="ghost" size="icon-sm" aria-label="More actions">
                      <MoreVerticalIcon className="h-4 w-4" />
                    </Button>
                  }
                  align="end"
                >
                  {onPreview && (
                    <DropdownItem icon={EyeIcon} onClick={handlePreview}>
                      Preview
                    </DropdownItem>
                  )}
                  <DropdownItem icon={DownloadIcon} onClick={handleDownload}>
                    Download
                  </DropdownItem>
                  <DropdownItem icon={ExternalLinkIcon} onClick={() => openExternalUrl(document.file_url)}>
                    Open in Browser
                  </DropdownItem>

                  {onViewHistory && (
                    <>
                      <DropdownSeparator />
                      <DropdownItem icon={HistoryIcon} onClick={() => onViewHistory(document)}>
                        Version History
                      </DropdownItem>
                    </>
                  )}

                  {isCoach && (
                    <>
                      <DropdownSeparator />
                      {onUploadVersion && (
                        <DropdownItem icon={UploadIcon} onClick={() => onUploadVersion(document)}>
                          Upload New Version
                        </DropdownItem>
                      )}
                      {onEdit && (
                        <DropdownItem icon={PencilIcon} onClick={() => onEdit(document)}>
                          Edit Details
                        </DropdownItem>
                      )}
                      {onDelete && (
                        <DropdownItem
                          icon={Trash2Icon}
                          onClick={() => onDelete(document)}
                          danger
                        >
                          Delete
                        </DropdownItem>
                      )}
                    </>
                  )}
                </Dropdown>
              </div>
            </div>

            {/* Description */}
            {document.description && (
              <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                {document.description}
              </p>
            )}

            {/* Metadata Row */}
            <div className="flex flex-wrap items-center gap-2 mt-3">
              {/* Category Badge */}
              {document.category && (
                <Badge variant="outline" className="text-xs">
                  {categoryLabel}
                </Badge>
              )}

              {/* Visibility Badge */}
              <Badge
                variant="outline"
                className={cn(
                  'text-xs gap-1',
                  document.is_public
                    ? 'text-primary-600 border-primary-200 bg-primary-50 dark:bg-primary-950'
                    : 'text-amber-600 border-amber-200 bg-amber-50 dark:bg-amber-950'
                )}
              >
                {document.is_public ? (
                  <>
                    <GlobeIcon className="h-3 w-3" />
                    Public
                  </>
                ) : (
                  <>
                    <LockIcon className="h-3 w-3" />
                    Private
                  </>
                )}
              </Badge>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between mt-3 pt-3 border-t text-xs text-muted-foreground">
              {document.created_at && (
                <span>
                  Created {formatDistanceToNow(new Date(document.created_at), { addSuffix: true })}
                </span>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default DocumentCard;
