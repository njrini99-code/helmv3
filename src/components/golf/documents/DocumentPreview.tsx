'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { ModalShell, Button } from '@/components/fairway';
import { cn } from '@/lib/utils';
import { getPreviewStrategy, formatFileSize, type GolfDocument, type DocumentVersion } from '@/lib/types/golf';
import { getPreviewUrl, getTextFileContent } from '@/app/golf/actions/documents';
import { PDFViewer } from './PDFViewer';
import { ImagePreview } from './ImagePreview';
import { TextPreview } from './TextPreview';
import {
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
import { openExternalUrl } from '@/lib/utils/capacitor';

interface DocumentPreviewProps {
  golfDocument?: GolfDocument | null;
  version?: DocumentVersion | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onVersionSelect?: (version: DocumentVersion) => void;
}

function FileTypeIcon({ mimeType, className }: { mimeType: string; className?: string }) {
  // P306 — Fairway tokens only (no raw text-red/blue/purple-500 leaks). The
  // --fw-* tokens resolve on :root so these read warm-matte under the live
  // Fairway page and stay on-system for the legacy/baseball callers too.
  if (mimeType === 'application/pdf') {
    return <FileTextIcon className={cn('text-fw-danger', className)} />;
  }
  if (mimeType.startsWith('image/')) {
    return <FileImageIcon className={cn('text-accent-600', className)} />;
  }
  if (mimeType.startsWith('video/')) {
    return <FileVideoIcon className={cn('text-accent-700', className)} />;
  }
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || mimeType === 'text/csv') {
    return <FileSpreadsheetIcon className={cn('text-fw-success', className)} />;
  }
  if (mimeType.startsWith('text/') || mimeType === 'application/json') {
    return <FileTextIcon className={cn('text-text-secondary', className)} />;
  }
  return <FileIcon className={cn('text-text-tertiary', className)} />;
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
  // True when the document genuinely has no version content to preview yet
  // (seed/legacy data, or an upload whose version record never landed) —
  // distinct from `error`, which means the lookup itself failed.
  const [noContent, setNoContent] = useState(false);
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
      setNoContent(false);
      setPreviewUrl(null);
      setTextContent(null);

      try {
        // Get the preview URL
        const versionNumber = version?.version_number;
        const { data, error: urlError, noContent: hasNoContent } = await getPreviewUrl(golfDocument.id, versionNumber);

        if (hasNoContent) {
          setNoContent(true);
          return;
        }
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
      openExternalUrl(previewUrl);
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
            <Loader2Icon className="h-12 w-12 animate-spin text-text-tertiary mx-auto mb-4" />
            <p className="font-fw-sans text-body text-text-secondary">Loading preview...</p>
          </div>
        </div>
      );
    }

    if (noContent) {
      // Honest emptiness, not a scare state: the document row exists but has
      // no version content behind it yet (seed/legacy data, or an upload
      // whose version record never landed) — there's genuinely nothing to
      // download or open either, so no dead-end action buttons here.
      return (
        <div className="flex flex-col items-center justify-center h-[40vh]">
          <FileTypeIcon mimeType={mimeType} className="h-16 w-16 mb-4" />
          <p className="font-fw-sans text-body-lg font-medium text-text-primary mb-2">{fileName}</p>
          <p className="font-fw-sans text-body-sm text-text-tertiary text-center max-w-sm">
            No preview available. This file doesn&apos;t have any content yet.
          </p>
        </div>
      );
    }

    if (error) {
      return (
        <div className="flex items-center justify-center h-[60vh]">
          <div className="text-center max-w-md">
            <AlertCircleIcon className="h-12 w-12 text-fw-danger mx-auto mb-4" />
            <p className="font-fw-sans text-body font-medium text-fw-danger mb-2">Preview unavailable</p>
            <p className="font-fw-sans text-body-sm text-text-tertiary mb-4">{error}</p>
            <div className="flex gap-2 justify-center">
              <Button variant="secondary" leftIcon={<DownloadIcon className="h-4 w-4" />} onClick={handleDownload}>
                Download
              </Button>
              {previewUrl && (
                <Button variant="secondary" leftIcon={<ExternalLinkIcon className="h-4 w-4" />} onClick={handleOpenExternal}>
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
          <p className="font-fw-sans text-body text-text-secondary">No preview available</p>
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
              <div className="flex-1 flex items-center justify-center bg-surface-sunken rounded-fw-md overflow-hidden">
                {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
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
                <Button variant="secondary" size="sm" leftIcon={<DownloadIcon className="h-4 w-4" />} onClick={handleDownload}>
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
              <p className="font-fw-sans text-body-lg font-medium text-text-primary mb-4">{fileName}</p>
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <audio src={previewUrl} controls className="w-full max-w-md mb-4">
                Your browser does not support the audio element.
              </audio>
              <Button variant="secondary" size="sm" leftIcon={<DownloadIcon className="h-4 w-4" />} onClick={handleDownload}>
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
                <Button variant="secondary" size="sm" leftIcon={<DownloadIcon className="h-4 w-4" />} onClick={handleDownload}>
                  Download
                </Button>
                <Button variant="secondary" size="sm" leftIcon={<ExternalLinkIcon className="h-4 w-4" />} onClick={handleOpenExternal}>
                  Open External
                </Button>
              </div>
              <div className="flex-1 border border-border-subtle rounded-fw-md overflow-hidden">
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
        <p className="font-fw-sans text-body-lg font-medium text-text-primary mb-2">{fileName}</p>
        <p className="font-fw-sans text-body-sm text-text-tertiary mb-4">
          {formatFileSize(fileSize)}
        </p>
        <p className="font-fw-sans text-body-sm text-text-tertiary mb-4">
          Preview not available for this file type
        </p>
        <div className="flex gap-2">
          <Button leftIcon={<DownloadIcon className="h-4 w-4" />} onClick={handleDownload}>
            Download
          </Button>
          <Button variant="secondary" leftIcon={<ExternalLinkIcon className="h-4 w-4" />} onClick={handleOpenExternal}>
            Open in Browser
          </Button>
        </div>
      </div>
    );
  };

  if (!golfDocument) return null;

  return (
    <ModalShell
      open={open}
      onOpenChange={onOpenChange}
      size="full"
      title={golfDocument.title}
      hideTitle
      className="h-[calc(100dvh-4rem)] max-w-[min(70rem,calc(100vw-2rem))] sm:h-[90vh]"
    >
      {/* Header — the primitive's own close affordance (top-right) is the
          ONLY close control; this block used to render a SECOND close Button
          on top of it, so the modal showed two overlapping X's (W4 audit).
          Don't re-add one here — pr-14 just keeps the title/metadata from
          running under the built-in close hit-target. */}
      <div className="flex items-center gap-3 px-6 pt-6 pb-4 pr-14 border-b border-border-subtle flex-shrink-0">
        <FileTypeIcon mimeType={mimeType} className="h-6 w-6" />
        <div className="min-w-0">
          <h2 className="truncate font-fw-display text-h3 font-medium text-text-primary">
            {golfDocument.title}
          </h2>
          <div className="flex items-center gap-2 font-fw-sans text-body-sm text-text-tertiary mt-1">
            <span className="tabular-nums">{formatFileSize(fileSize)}</span>
            {version && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-medium tabular-nums">v{version.version_number}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <ModalShell.Body className="flex-1 px-6 py-4">
        {renderPreview()}
      </ModalShell.Body>
    </ModalShell>
  );
}
