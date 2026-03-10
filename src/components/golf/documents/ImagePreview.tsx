'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  ZoomInIcon,
  ZoomOutIcon,
  RotateCwIcon,
  Maximize2Icon,
  DownloadIcon,
  RefreshCwIcon,
  Loader2Icon,
} from 'lucide-react';

interface ImagePreviewProps {
  url: string;
  fileName?: string;
  alt?: string;
  onFullScreen?: () => void;
  onDownload?: () => void;
  className?: string;
}

export function ImagePreview({
  url,
  fileName,
  alt,
  onFullScreen,
  onDownload,
  className,
}: ImagePreviewProps) {
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0 });

  const containerRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef({ x: 0, y: 0 });

  const handleZoomIn = useCallback(() => {
    setScale(prev => Math.min(prev * 1.25, 5));
  }, []);

  const handleZoomOut = useCallback(() => {
    setScale(prev => Math.max(prev / 1.25, 0.25));
  }, []);

  const handleRotate = useCallback(() => {
    setRotation(prev => (prev + 90) % 360);
  }, []);

  const handleReset = useCallback(() => {
    setScale(1);
    setRotation(0);
    setPosition({ x: 0, y: 0 });
  }, []);

  const handleDownload = useCallback(() => {
    if (onDownload) {
      onDownload();
    } else {
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName || 'image';
      link.click();
    }
  }, [url, fileName, onDownload]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (scale > 1) {
      setIsDragging(true);
      dragStartRef.current = {
        x: e.clientX - position.x,
        y: e.clientY - position.y,
      };
    }
  }, [scale, position]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDragging) {
      setPosition({
        x: e.clientX - dragStartRef.current.x,
        y: e.clientY - dragStartRef.current.y,
      });
    }
  }, [isDragging]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    if (e.deltaY < 0) {
      handleZoomIn();
    } else {
      handleZoomOut();
    }
  }, [handleZoomIn, handleZoomOut]);

  const handleImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    setIsLoading(false);
    const img = e.currentTarget;
    setImageDimensions({ width: img.naturalWidth, height: img.naturalHeight });
  }, []);

  useEffect(() => {
    setIsLoading(true);
    setError(null);
    handleReset();
  }, [url, handleReset]);

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-muted/50 border-b">
        <div className="flex items-center gap-2">
          {/* Zoom Controls */}
          <Button
            variant="outline"
            size="icon-sm"
            onClick={handleZoomOut}
            disabled={scale <= 0.25}
            title="Zoom Out"
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
            disabled={scale >= 5}
            title="Zoom In"
          >
            <ZoomInIcon className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center gap-2">
          {/* Transform Controls */}
          <Button
            variant="outline"
            size="icon-sm"
            onClick={handleRotate}
            title="Rotate 90 degrees"
          >
            <RotateCwIcon className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={handleReset}
            title="Reset View"
          >
            <RefreshCwIcon className="h-4 w-4" />
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

      {/* Image Content */}
      <div
        ref={containerRef}
        className={cn(
          'flex-1 overflow-hidden bg-muted/30 relative flex items-center justify-center',
          scale > 1 && 'cursor-grab',
          isDragging && 'cursor-grabbing'
        )}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      >
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

        <img
          src={url}
          alt={alt || fileName || 'Image preview'}
          className="max-w-full max-h-full object-contain transition-transform select-none"
          style={{
            transform: `scale(${scale}) rotate(${rotation}deg) translate(${position.x / scale}px, ${position.y / scale}px)`,
            transformOrigin: 'center center',
          }}
          onLoad={handleImageLoad}
          onError={() => {
            setIsLoading(false);
            setError('Failed to load image');
          }}
          draggable={false}
        />
      </div>

      {/* Footer with file info */}
      <div className="px-4 py-2 border-t bg-muted/30 flex items-center justify-between">
        <span className="text-sm text-muted-foreground truncate">
          {fileName}
        </span>
        {imageDimensions.width > 0 && (
          <span className="text-xs text-muted-foreground">
            {imageDimensions.width} x {imageDimensions.height}
          </span>
        )}
      </div>
    </div>
  );
}
