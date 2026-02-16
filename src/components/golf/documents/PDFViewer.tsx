'use client';

import { useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ZoomInIcon,
  ZoomOutIcon,
  Maximize2Icon,
  DownloadIcon,
  Loader2Icon,
} from 'lucide-react';

interface PDFViewerProps {
  url: string;
  fileName?: string;
  onFullScreen?: () => void;
  onDownload?: () => void;
  className?: string;
}

export function PDFViewer({
  url,
  fileName,
  onFullScreen,
  onDownload,
  className,
}: PDFViewerProps) {
  const [currentPage, setCurrentPage] = useState(1);
   
  const [totalPages, _setTotalPages] = useState(1);
  const [scale, setScale] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // For PDF.js we'd normally use react-pdf library
  // Since we want a simple implementation, we'll use the browser's built-in PDF viewer via iframe
  // or embed the PDF directly

  const handleZoomIn = useCallback(() => {
    setScale(prev => Math.min(prev + 0.25, 3));
  }, []);

  const handleZoomOut = useCallback(() => {
    setScale(prev => Math.max(prev - 0.25, 0.5));
  }, []);

  const handlePrevPage = useCallback(() => {
    setCurrentPage(prev => Math.max(prev - 1, 1));
  }, []);

  const handleNextPage = useCallback(() => {
    setCurrentPage(prev => Math.min(prev + 1, totalPages));
  }, [totalPages]);

  const handleDownload = useCallback(() => {
    if (onDownload) {
      onDownload();
    } else {
      // Default download behavior
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName || 'document.pdf';
      link.click();
    }
  }, [url, fileName, onDownload]);

  useEffect(() => {
    setIsLoading(true);
    setError(null);
  }, [url]);

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-muted/50 border-b">
        <div className="flex items-center gap-2">
          {/* Page Navigation */}
          <Button
            variant="outline"
            size="icon-sm"
            onClick={handlePrevPage}
            disabled={currentPage <= 1}
          >
            <ChevronLeftIcon className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground min-w-[80px] text-center">
            Page {currentPage} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={handleNextPage}
            disabled={currentPage >= totalPages}
          >
            <ChevronRightIcon className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center gap-2">
          {/* Zoom Controls */}
          <Button
            variant="outline"
            size="icon-sm"
            onClick={handleZoomOut}
            disabled={scale <= 0.5}
          >
            <ZoomOutIcon className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground min-w-[50px] text-center">
            {Math.round(scale * 100)}%
          </span>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={handleZoomIn}
            disabled={scale >= 3}
          >
            <ZoomInIcon className="h-4 w-4" />
          </Button>

          <div className="w-px h-6 bg-border mx-2" />

          {/* Actions */}
          {onFullScreen && (
            <Button
              variant="outline"
              size="icon-sm"
              onClick={onFullScreen}
              title="Full Screen"
              aria-label="Full screen"
            >
              <Maximize2Icon className="h-4 w-4" />
            </Button>
          )}
          <Button
            variant="outline"
            size="icon-sm"
            onClick={handleDownload}
            title="Download"
            aria-label="Download"
          >
            <DownloadIcon className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* PDF Content */}
      <div className="flex-1 overflow-auto bg-muted/30 relative">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/50 z-10">
            <Loader2Icon className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center p-4">
              <p className="text-destructive mb-2">{error}</p>
              <Button variant="outline" onClick={handleDownload}>
                Download Instead
              </Button>
            </div>
          </div>
        )}
        <div
          className="flex items-start justify-center p-4 min-h-full"
          style={{ transform: `scale(${scale})`, transformOrigin: 'top center' }}
        >
          {/* Using iframe for PDF rendering - browser's native PDF viewer */}
          <iframe
            src={`${url}#page=${currentPage}&toolbar=0&navpanes=0`}
            className="w-full h-[800px] border-0 rounded-md shadow-lg bg-white"
            onLoad={() => setIsLoading(false)}
            onError={() => {
              setIsLoading(false);
              setError('Failed to load PDF. The file may be corrupted or inaccessible.');
            }}
            title={fileName || 'PDF Document'}
          />
        </div>
      </div>

      {/* Footer with file info */}
      {fileName && (
        <div className="px-4 py-2 border-t bg-muted/30">
          <span className="text-sm text-muted-foreground truncate">{fileName}</span>
        </div>
      )}
    </div>
  );
}

export default PDFViewer;
