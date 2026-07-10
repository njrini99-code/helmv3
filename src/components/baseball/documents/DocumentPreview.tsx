'use client';

import React, { useState, useCallback, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { getPreviewUrl, getTextFileContent } from '@/app/baseball/actions/documents';
import type { BaseballDocument, BaseballDocumentVersion } from '@/app/baseball/actions/documents';
// Reuse golf preview sub-components since they're generic
import { PDFViewer } from '@/components/golf/documents/PDFViewer';
import { ImagePreview } from '@/components/golf/documents/ImagePreview';
import { TextPreview } from '@/components/golf/documents/TextPreview';
import {
  IconX,
  IconDownload,
  IconExternalLink,
  IconFile,
  IconFileText,
  IconImage,
  IconVideo,
  IconFileSpreadsheet,
} from '@/components/icons';

// Preview strategy
type PreviewStrategy = 'custom' | 'native' | 'iframe' | 'download';

function getPreviewStrategy(mimeType: string): PreviewStrategy {
  if (mimeType === 'application/pdf') return 'custom';
  if (mimeType.startsWith('text/') || mimeType === 'application/json') return 'custom';
  if (mimeType.startsWith('image/')) return 'native';
  if (mimeType.startsWith('video/')) return 'native';
  if (mimeType.startsWith('audio/')) return 'native';
  if (
    mimeType.includes('word') ||
    mimeType.includes('spreadsheet') ||
    mimeType.includes('excel') ||
    mimeType.includes('powerpoint') ||
    mimeType.includes('presentation')
  ) {
    return 'iframe';
  }
  return 'download';
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function FileTypeIcon({ mimeType, className }: { mimeType: string; className?: string }) {
  if (mimeType === 'application/pdf') return <IconFileText className={cn('text-pursuit', className)} />;
  if (mimeType.startsWith('image/')) return <IconImage className={cn('text-warm-500', className)} />;
  if (mimeType.startsWith('video/')) return <IconVideo className={cn('text-primary-600', className)} />;
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || mimeType === 'text/csv') return <IconFileSpreadsheet className={cn('text-primary-500', className)} />;
  if (mimeType.startsWith('text/') || mimeType === 'application/json') return <IconFileText className={cn('text-warm-500', className)} />;
  return <IconFile className={cn('text-warm-400', className)} />;
}

interface DocumentPreviewProps {
  document?: BaseballDocument | null;
  version?: BaseballDocumentVersion | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DocumentPreview({
  document: baseballDocument,
  version,
  open,
  onOpenChange,
}: DocumentPreviewProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [, setIsFullScreen] = useState(false);

  // Determine the active file info
  const activeFile = version || (baseballDocument ? {
    file_name: baseballDocument.title,
    file_size: baseballDocument.file_size,
    mime_type: baseballDocument.file_type,
    storage_path: '',
  } : null);

  const mimeType = activeFile?.mime_type || '';
  const fileName = activeFile?.file_name || (baseballDocument?.title ?? '');
  const fileSize = activeFile?.file_size || 0;

  const previewStrategy = getPreviewStrategy(mimeType);

  // Load preview content
  useEffect(() => {
    async function loadPreview() {
      if (!open || !baseballDocument) return;

      setIsLoading(true);
      setError(null);
      setPreviewUrl(null);
      setTextContent(null);

      try {
        const versionNumber = version?.version_number;
        const { data, error: urlError } = await getPreviewUrl(baseballDocument.id, versionNumber);

        if (urlError) throw new Error(urlError);
        if (!data) throw new Error('No preview URL available');

        setPreviewUrl(data.url);

        // For text files, also fetch the content
        if (previewStrategy === 'custom' && (mimeType.startsWith('text/') || mimeType === 'application/json')) {
          const { data: content, error: contentError } = await getTextFileContent(baseballDocument.id, versionNumber);
          if (!contentError && content) {
            setTextContent(content);
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load preview');
      } finally {
        setIsLoading(false);
      }
    }

    loadPreview();
  }, [open, baseballDocument, version, previewStrategy, mimeType]);

  const handleDownload = useCallback(() => {
    if (previewUrl) {
      const link = window.document.createElement('a');
      link.href = previewUrl;
      link.download = fileName;
      link.click();
    }
  }, [previewUrl, fileName]);

  const handleOpenExternal = useCallback(() => {
    if (previewUrl) {
      window.open(previewUrl, '_blank');
    }
  }, [previewUrl]);

  const toggleFullScreen = useCallback(() => {
    if (!window.document.fullscreenElement) {
      window.document.documentElement.requestFullscreen();
      setIsFullScreen(true);
    } else {
      window.document.exitFullscreen();
      setIsFullScreen(false);
    }
  }, []);

  const renderPreview = (): React.ReactNode => {
    if (isLoading) {
      return (
        <div className="h-[60vh] p-4">
          <Skeleton variant="card" className="h-full w-full" />
        </div>
      );
    }

    if (error) {
      return (
        <div className="flex items-center justify-center h-[60vh]">
          <div className="text-center max-w-md">
            <div className="w-12 h-12 rounded-full bg-[var(--notice-error-ink)]/10 flex items-center justify-center mx-auto mb-4">
              <IconFile size={24} className="text-[color:var(--notice-error-ink)]" />
            </div>
            <p className="text-[color:var(--notice-error-ink)] font-medium mb-2">Preview unavailable</p>
            <p className="text-warm-500 text-sm mb-4">{error}</p>
            <div className="flex gap-2 justify-center">
              <Button variant="secondary" onClick={handleDownload}>
                <IconDownload size={16} className="mr-2" />
                Download
              </Button>
              {previewUrl && (
                <Button variant="secondary" onClick={handleOpenExternal}>
                  <IconExternalLink size={16} className="mr-2" />
                  Open in Browser
                </Button>
              )}
            </div>
          </div>
        </div>
      );
    }

    if (!previewUrl) {
      return (
        <div className="flex items-center justify-center h-[60vh]">
          <p className="text-warm-500">No preview available</p>
        </div>
      );
    }

    switch (previewStrategy) {
      case 'custom':
        if (mimeType === 'application/pdf') {
          return (
            <div className="h-[70vh]">
              <PDFViewer
                url={previewUrl}
                fileName={fileName}
                onFullScreen={toggleFullScreen}
                onDownload={handleDownload}
              />
            </div>
          );
        }
        if (mimeType.startsWith('text/') || mimeType === 'application/json') {
          return (
            <div className="h-[70vh]">
              <TextPreview
                content={textContent || undefined}
                url={textContent ? undefined : previewUrl}
                fileName={fileName}
                mimeType={mimeType}
                onFullScreen={toggleFullScreen}
                onDownload={handleDownload}
              />
            </div>
          );
        }
        break;

      case 'native':
        if (mimeType.startsWith('image/')) {
          return (
            <div className="h-[70vh]">
              <ImagePreview
                url={previewUrl}
                fileName={fileName}
                onFullScreen={toggleFullScreen}
                onDownload={handleDownload}
              />
            </div>
          );
        }
        if (mimeType.startsWith('video/')) {
          return (
            <div className="flex flex-col h-[70vh]">
              <div className="flex-1 flex items-center justify-center bg-black rounded-md overflow-hidden">
                {/* eslint-disable-next-line jsx-a11y/media-has-caption -- user-uploaded document, no captions available */}
                <video
                  src={previewUrl}
                  controls
                  className="max-w-full max-h-full"
                  autoPlay={false}
                >
                  Your browser does not support the video tag.
                </video>
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <Button variant="secondary" size="sm" onClick={handleDownload}>
                  <IconDownload size={16} className="mr-2" />
                  Download
                </Button>
              </div>
            </div>
          );
        }
        if (mimeType.startsWith('audio/')) {
          return (
            <div className="flex flex-col items-center justify-center h-[40vh]">
              <FileTypeIcon mimeType={mimeType} className="h-16 w-16 mb-4" />
              <p className="text-lg font-medium mb-4">{fileName}</p>
              {/* eslint-disable-next-line jsx-a11y/media-has-caption -- user-uploaded document, no captions available */}
              <audio src={previewUrl} controls className="w-full max-w-md mb-4">
                Your browser does not support the audio element.
              </audio>
              <Button variant="secondary" size="sm" onClick={handleDownload}>
                <IconDownload size={16} className="mr-2" />
                Download
              </Button>
            </div>
          );
        }
        break;

      case 'iframe':
        return (
          <div className="h-[70vh]">
            <div className="flex flex-col h-full">
              <div className="flex justify-end gap-2 mb-2">
                <Button variant="secondary" size="sm" onClick={handleDownload}>
                  <IconDownload size={16} className="mr-2" />
                  Download
                </Button>
                <Button variant="secondary" size="sm" onClick={handleOpenExternal}>
                  <IconExternalLink size={16} className="mr-2" />
                  Open External
                </Button>
              </div>
              <div className="flex-1 border rounded-md overflow-hidden">
                <iframe
                  src={`https://docs.google.com/viewer?url=${encodeURIComponent(previewUrl)}&embedded=true`}
                  className="w-full h-full border-0"
                  title={fileName}
                />
              </div>
            </div>
          </div>
        );

      case 'download':
      default:
        break;
    }

    // Default fallback
    return (
      <div className="flex flex-col items-center justify-center h-[40vh]">
        <FileTypeIcon mimeType={mimeType} className="h-16 w-16 mb-4" />
        <p className="text-lg font-medium mb-2">{fileName}</p>
        <p className="text-sm text-warm-500 mb-4">{formatFileSize(fileSize)}</p>
        <p className="text-sm text-warm-500 mb-4">Preview not available for this file type</p>
        <div className="flex gap-2">
          <Button onClick={handleDownload}>
            <IconDownload size={16} className="mr-2" />
            Download
          </Button>
          <Button variant="secondary" onClick={handleOpenExternal}>
            <IconExternalLink size={16} className="mr-2" />
            Open in Browser
          </Button>
        </div>
      </div>
    );
  };

  if (!baseballDocument) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl h-[90vh] flex flex-col p-0">
        {/* Header */}
        <DialogHeader className="px-6 py-4 border-b flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileTypeIcon mimeType={mimeType} className="h-6 w-6" />
              <div>
                <DialogTitle className="text-lg">{baseballDocument.title}</DialogTitle>
                <div className="flex items-center gap-2 text-sm text-warm-500 mt-1">
                  <span>{formatFileSize(fileSize)}</span>
                  {version && (
                    <>
                      <span>-</span>
                      <span className="font-medium">v{version.version_number}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="px-2"
              onClick={() => onOpenChange(false)}
              aria-label="Close preview"
            >
              <IconX size={20} />
            </Button>
          </div>
        </DialogHeader>

        {/* Content */}
        <div className="flex-1 overflow-auto px-6 py-4">{renderPreview()}</div>
      </DialogContent>
    </Dialog>
  );
}

export default DocumentPreview;
