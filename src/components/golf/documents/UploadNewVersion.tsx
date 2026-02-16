'use client';

import { useState, useCallback, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatFileSize, type GolfDocument } from '@/lib/types/golf';
import { uploadNewVersion } from '@/app/golf/actions/documents';
import {
  UploadIcon,
  FileIcon,
  XIcon,
  Loader2Icon,
  CheckCircleIcon,
  AlertCircleIcon,
} from 'lucide-react';

interface UploadNewVersionProps {
  document: GolfDocument;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function UploadNewVersion({
  document,
  open,
  onOpenChange,
  onSuccess,
}: UploadNewVersionProps) {
  const [file, setFile] = useState<File | null>(null);
  const [changeNotes, setChangeNotes] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const nextVersion = (document.version_count || 1) + 1;

  const resetState = useCallback(() => {
    setFile(null);
    setChangeNotes('');
    setError(null);
    setSuccess(false);
    setUploadProgress(0);
  }, []);

  const handleClose = useCallback(() => {
    if (!isUploading) {
      resetState();
      onOpenChange(false);
    }
  }, [isUploading, resetState, onOpenChange]);

  const handleFileSelect = useCallback((selectedFile: File) => {
    setFile(selectedFile);
    setError(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      handleFileSelect(droppedFile);
    }
  }, [handleFileSelect]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      handleFileSelect(selectedFile);
    }
  }, [handleFileSelect]);

  const handleUpload = useCallback(async () => {
    if (!file) return;

    setIsUploading(true);
    setError(null);
    setUploadProgress(0);

    // Simulate progress (since we can't track actual upload progress with server actions)
    const progressInterval = setInterval(() => {
      setUploadProgress(prev => Math.min(prev + 10, 90));
    }, 200);

    try {
      const result = await uploadNewVersion(
        document.id,
        file,
        changeNotes || undefined
      );

      clearInterval(progressInterval);

      if (!result.success || result.error) {
        setError(result.error || 'Upload failed');
        setUploadProgress(0);
        return;
      }

      setUploadProgress(100);
      setSuccess(true);

      // Call success callback and close after a moment
      setTimeout(() => {
        onSuccess?.();
        handleClose();
      }, 1500);
    } catch {
      clearInterval(progressInterval);
      setError('An unexpected error occurred');
      setUploadProgress(0);
    } finally {
      setIsUploading(false);
    }
  }, [file, changeNotes, document.id, onSuccess, handleClose]);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Upload New Version</DialogTitle>
          <DialogDescription>
            Upload a new version of "{document.title}". This will become version {nextVersion}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Current version info */}
          <div className="p-3 bg-muted/50 rounded-lg text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Current version:</span>
              <span className="font-medium">v{document.version_count}</span>
            </div>
            <div className="flex items-center justify-between mt-1">
              <span className="text-muted-foreground">File type:</span>
              <span className="font-medium">{document.file_type}</span>
            </div>
          </div>

          {/* Drop zone */}
          <div
            className={cn(
              'relative border-2 border-dashed rounded-lg p-6 transition-colors',
              isDragging && 'border-primary bg-primary/5',
              file && 'border-solid border-primary-500 bg-primary-50 dark:bg-primary-950',
              error && 'border-destructive',
              !file && !isDragging && 'border-muted-foreground/25 hover:border-muted-foreground/50'
            )}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
          >
            <input
              ref={fileInputRef}
              type="file"
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              onChange={handleInputChange}
              disabled={isUploading}
            />

            {file ? (
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary-100 dark:bg-primary-900 rounded-lg">
                  <FileIcon className="h-6 w-6 text-primary-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{file.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {formatFileSize(file.size)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    setFile(null);
                  }}
                  disabled={isUploading}
                >
                  <XIcon className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="text-center">
                <UploadIcon className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
                <p className="font-medium">Drag and drop your file here</p>
                <p className="text-sm text-muted-foreground mt-1">
                  or click to browse
                </p>
              </div>
            )}
          </div>

          {/* Upload progress */}
          {isUploading && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Uploading...</span>
                <span>{uploadProgress}%</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Success message */}
          {success && (
            <div className="flex items-center gap-2 p-3 bg-primary-50 dark:bg-primary-950 text-primary-700 dark:text-primary-400 rounded-lg">
              <CheckCircleIcon className="h-5 w-5" />
              <span>Version {nextVersion} uploaded successfully!</span>
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-lg">
              <AlertCircleIcon className="h-5 w-5" />
              <span>{error}</span>
            </div>
          )}

          {/* Change notes */}
          <div className="space-y-2">
            <label htmlFor="changeNotes" className="text-sm font-medium">Change Notes (optional)</label>
            <textarea
              id="changeNotes"
              className="w-full px-3 py-2 text-sm border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              rows={3}
              placeholder="What changed in this version?"
              value={changeNotes}
              onChange={(e) => setChangeNotes(e.target.value)}
              disabled={isUploading}
            />
          </div>

          {/* New version preview */}
          <div className="flex items-center justify-between p-3 bg-primary/5 rounded-lg">
            <span className="text-sm text-muted-foreground">New version number:</span>
            <span className="font-bold text-primary">v{nextVersion}</span>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isUploading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleUpload}
            disabled={!file || isUploading || success}
          >
            {isUploading ? (
              <>
                <Loader2Icon className="h-4 w-4 mr-2 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <UploadIcon className="h-4 w-4 mr-2" />
                Upload v{nextVersion}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default UploadNewVersion;
