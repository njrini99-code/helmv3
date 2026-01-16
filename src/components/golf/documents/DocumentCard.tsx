'use client';

import { useState, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import {
  formatFileSize,
  getFileTypeLabel,
  getFileIcon,
  DOCUMENT_CATEGORIES,
  type GolfDocument,
} from '@/lib/types/golf';
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
      return <FileSpreadsheetIcon className={cn('text-green-500', className)} />;
    case 'document':
      return <FileTextIcon className={cn('text-blue-600', className)} />;
    case 'text':
      return <FileTextIcon className={cn('text-gray-500', className)} />;
    default:
      return <FileIcon className={cn('text-gray-400', className)} />;
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
  const [isHovered, setIsHovered] = useState(false);

  const categoryLabel = DOCUMENT_CATEGORIES.find(c => c.value === document.category)?.label || document.category;

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
      link.download = document.original_file_name || document.title;
      link.click();
    }
  }, [document, onDownload]);

  return (
    <Card
      className={cn(
        'group transition-all duration-200 hover:shadow-md hover:border-primary/20',
        className
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          {/* File Icon */}
          <div className="flex-shrink-0 p-3 bg-muted/50 rounded-lg group-hover:bg-muted transition-colors">
            <FileTypeIcon mimeType={document.file_type} className="h-8 w-8" />
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
                    {getFileTypeLabel(document.file_type)}
                  </span>
                  <span className="text-muted-foreground">•</span>
                  <span className="text-sm text-muted-foreground">
                    {formatFileSize(document.file_size)}
                  </span>
                </div>
              </div>

              {/* Quick Actions */}
              <div className={cn(
                'flex items-center gap-1 transition-opacity',
                isHovered ? 'opacity-100' : 'opacity-0'
              )}>
                {onPreview && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={handlePreview}
                    title="Preview"
                  >
                    <EyeIcon className="h-4 w-4" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={handleDownload}
                  title="Download"
                >
                  <DownloadIcon className="h-4 w-4" />
                </Button>

                {/* More actions dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-sm">
                      <MoreVerticalIcon className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    {onPreview && (
                      <DropdownMenuItem onClick={handlePreview}>
                        <EyeIcon className="h-4 w-4 mr-2" />
                        Preview
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={handleDownload}>
                      <DownloadIcon className="h-4 w-4 mr-2" />
                      Download
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => window.open(document.file_url, '_blank')}>
                      <ExternalLinkIcon className="h-4 w-4 mr-2" />
                      Open in Browser
                    </DropdownMenuItem>

                    {onViewHistory && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => onViewHistory(document)}>
                          <HistoryIcon className="h-4 w-4 mr-2" />
                          Version History
                        </DropdownMenuItem>
                      </>
                    )}

                    {isCoach && (
                      <>
                        <DropdownMenuSeparator />
                        {onUploadVersion && (
                          <DropdownMenuItem onClick={() => onUploadVersion(document)}>
                            <UploadIcon className="h-4 w-4 mr-2" />
                            Upload New Version
                          </DropdownMenuItem>
                        )}
                        {onEdit && (
                          <DropdownMenuItem onClick={() => onEdit(document)}>
                            <PencilIcon className="h-4 w-4 mr-2" />
                            Edit Details
                          </DropdownMenuItem>
                        )}
                        {onDelete && (
                          <DropdownMenuItem
                            onClick={() => onDelete(document)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2Icon className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        )}
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
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
              {/* Version Badge */}
              {document.current_version > 1 && (
                <Badge variant="secondary" className="gap-1">
                  <HistoryIcon className="h-3 w-3" />
                  v{document.current_version}
                </Badge>
              )}

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
                  document.player_visible
                    ? 'text-green-600 border-green-200 bg-green-50 dark:bg-green-950'
                    : 'text-amber-600 border-amber-200 bg-amber-50 dark:bg-amber-950'
                )}
              >
                {document.player_visible ? (
                  <>
                    <GlobeIcon className="h-3 w-3" />
                    Visible to Players
                  </>
                ) : (
                  <>
                    <LockIcon className="h-3 w-3" />
                    Coaches Only
                  </>
                )}
              </Badge>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between mt-3 pt-3 border-t text-xs text-muted-foreground">
              <span>
                Updated {formatDistanceToNow(new Date(document.updated_at), { addSuffix: true })}
              </span>
              {document.uploader?.full_name && (
                <span>by {document.uploader.full_name}</span>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default DocumentCard;
