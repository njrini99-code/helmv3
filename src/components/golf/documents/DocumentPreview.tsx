'use client';

import React, { useState, useCallback, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getPreviewStrategy, formatFileSize, type GolfDocument, type DocumentVersion } from '@/lib/types/golf';
import { getPreviewUrl, getTextFileContent } from '@/app/golf/actions/documents';
import { PDFViewer } from './PDFViewer';
import { ImagePreview } from './ImagePreview';
import { TextPreview } from './TextPreview';
import {
  XIcon,
  DownloadIcon,
  ExternalLinkIcon,
  Loader2Icon,
  AlertCircleIcon,
  FileIcon,
  FileTextIcon,
  FileImageIcon,
  FileVideoIcon,
  FileSpreadsheetIcon,
} from 'lucide-react';

interface DocumentPreviewProps {
  golfDocument?: GolfDocument | null;
  version?: DocumentVersion | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onVersionSelect?: (version: DocumentVersion) => void;
}

function FileTypeIcon({ mimeType, className }: { mimeType: string; className?: string }) {
  if (mimeType === 'application/pdf') {
    return <FileTextIcon className={cn('text-red-500', className)} />;
  }
  if (mimeType.startsWith('image/')) {
    return <FileImageIcon className={cn('text-blue-500', className)} />;
  }
  if (mimeType.startsWith('video/')) {
    return <FileVideoIcon className={cn('text-purple-500', className)} />;
  }
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || mimeType === 'text/csv') {
    return <FileSpreadsheetIcon className={cn('text-green-500', className)} />;
  }
  if (mimeType.startsWith('text/') || mimeType === 'application/json') {
    return <FileTextIcon className={cn('text-gray-500', className)} />;
  }
  return <FileIcon className={cn('text-gray-400', className)} />;
}

export function DocumentPreview({
  golfDocument,
  version,
  open,
  onOpenChange,
}: DocumentPreviewProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // isFullScreen state used in toggleFullScreen callback
  const [, setIsFullScreen] = useState(false);

  // Determine the active file info
  const activeFile = version || (golfDocument ? {
    file_name: golfDocument.title,
    file_size: golfDocument.file_size,
    mime_type: golfDocument.file_type,
    storage_path: '',
  } : null);

  const mimeType = activeFile?.mime_type || '';
  const fileName = activeFile?.file_name || '';
  const fileSize = activeFile?.file_size || 0;

  const previewStrategy = getPreviewStrategy(mimeType);

  // Load preview content
  useEffect(() => {
    async function loadPreview() {
      if (!open || !golfDocument) return;

      setIsLoading(true);
      setError(null);
      setPreviewUrl(null);
      setTextContent(null);

      try {
        // Get the preview URL
        const versionNumber = version?.version_number;
        const { data, error: urlError } = await getPreviewUrl(golfDocument.id, versionNumber);

        if (urlError) throw new Error(urlError);
        if (!data) throw new Error('No preview URL available');

        setPreviewUrl(data.url);

        // For text files, also fetch the content
        if (previewStrategy === 'custom' && mimeType.startsWith('text/') || mimeType === 'application/json') {
          const { data: content, error: contentError } = await getTextFileContent(golfDocument.id, versionNumber);
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
  }, [open, golfDocument, version, previewStrategy, mimeType]);

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
        <div className="flex items-center justify-center h-[60vh]">
          <div className="text-center">
            <Loader2Icon className="h-12 w-12 animate-spin text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">Loading preview...</p>
          </div>
        </div>
      );
    }

    if (error) {
      return (
        <div className="flex items-center justify-center h-[60vh]">
          <div className="text-center max-w-md">
            <AlertCircleIcon className="h-12 w-12 text-destructive mx-auto mb-4" />
            <p className="text-destructive font-medium mb-2">Preview unavailable</p>
            <p className="text-muted-foreground text-sm mb-4">{error}</p>
            <div className="flex gap-2 justify-center">
              <Button variant="secondary" onClick={handleDownload}>
                <DownloadIcon className="h-4 w-4 mr-2" />
                Download
              </Button>
              {previewUrl && (
                <Button variant="secondary" onClick={handleOpenExternal}>
                  <ExternalLinkIcon className="h-4 w-4 mr-2" />
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
          <p className="text-muted-foreground">No preview available</p>
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
        // Text/JSON/Markdown/CSV
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
        // Break to default download fallback for unhandled custom types
        break;

      case 'native':
        // Images
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
        // Video
        if (mimeType.startsWith('video/')) {
          return (
            <div className="flex flex-col h-[70vh]">
              <div className="flex-1 flex items-center justify-center bg-black rounded-md overflow-hidden">
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
                  <DownloadIcon className="h-4 w-4 mr-2" />
                  Download
                </Button>
              </div>
            </div>
          );
        }
        // Audio
        if (mimeType.startsWith('audio/')) {
          return (
            <div className="flex flex-col items-center justify-center h-[40vh]">
              <FileTypeIcon mimeType={mimeType} className="h-16 w-16 mb-4" />
              <p className="text-lg font-medium mb-4">{fileName}</p>
              <audio src={previewUrl} controls className="w-full max-w-md mb-4">
                Your browser does not support the audio element.
              </audio>
              <Button variant="secondary" size="sm" onClick={handleDownload}>
                <DownloadIcon className="h-4 w-4 mr-2" />
                Download
              </Button>
            </div>
          );
        }
        // Break to default download fallback for unhandled native types
        break;

      case 'iframe':
        // Office documents via Google Docs Viewer
        return (
          <div className="h-[70vh]">
            <div className="flex flex-col h-full">
              <div className="flex justify-end gap-2 mb-2">
                <Button variant="secondary" size="sm" onClick={handleDownload}>
                  <DownloadIcon className="h-4 w-4 mr-2" />
                  Download
                </Button>
                <Button variant="secondary" size="sm" onClick={handleOpenExternal}>
                  <ExternalLinkIcon className="h-4 w-4 mr-2" />
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
        // Fallback - show download option
        break;
    }

    // Default fallback for all unhandled cases
    return (
      <div className="flex flex-col items-center justify-center h-[40vh]">
        <FileTypeIcon mimeType={mimeType} className="h-16 w-16 mb-4" />
        <p className="text-lg font-medium mb-2">{fileName}</p>
        <p className="text-sm text-muted-foreground mb-4">
          {formatFileSize(fileSize)}
        </p>
        <p className="text-sm text-muted-foreground mb-4">
          Preview not available for this file type
        </p>
        <div className="flex gap-2">
          <Button onClick={handleDownload}>
            <DownloadIcon className="h-4 w-4 mr-2" />
            Download
          </Button>
          <Button variant="secondary" onClick={handleOpenExternal}>
            <ExternalLinkIcon className="h-4 w-4 mr-2" />
            Open in Browser
          </Button>
        </div>
      </div>
    );
  };

  if (!golfDocument) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-5xl h-[90vh] flex flex-col p-0"
      >
        {/* Header */}
        <DialogHeader className="px-6 py-4 border-b flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileTypeIcon mimeType={mimeType} className="h-6 w-6" />
              <div>
                <DialogTitle className="text-lg">{golfDocument.title}</DialogTitle>
                <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                  <span>{formatFileSize(fileSize)}</span>
                  {version && (
                    <>
                      <span>•</span>
                      <span className="font-medium">v{version.version_number}</span>
                    </>
                  )}
                  {/* Version display removed - current_version not available in schema */}
                </div>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="px-2"
              onClick={() => onOpenChange(false)}
            >
              <XIcon className="h-5 w-5" />
            </Button>
          </div>
        </DialogHeader>

        {/* Content */}
        <div className="flex-1 overflow-auto px-6 py-4">
          {renderPreview()}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default DocumentPreview;
