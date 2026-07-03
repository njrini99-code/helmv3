'use client';

import { useState, useId } from 'react';
import { IconX, IconUpload, IconFile } from '@/components/icons';
import { Button, IconButton } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
} from '@/components/ui/drawer';

interface UploadNewVersionModalProps {
  open: boolean;
  onClose: () => void;
  documentTitle: string;
  currentFileType: string | null;
  onUpload: (file: File, changeNotes: string) => Promise<void>;
}

/**
 * Format file size for display
 */
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

export function UploadNewVersionModal({
  open,
  onClose,
  documentTitle,
  currentFileType,
  onUpload,
}: UploadNewVersionModalProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [changeNotes, setChangeNotes] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const uid = useId();

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setError(null);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);

    const file = e.dataTransfer.files?.[0];
    if (file) {
      setSelectedFile(file);
      setError(null);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

  const handleSubmit = async () => {
    if (!selectedFile) {
      setError('Please select a file');
      return;
    }

    setUploading(true);
    setError(null);

    try {
      await onUpload(selectedFile, changeNotes);
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload new version');
    } finally {
      setUploading(false);
    }
  };

  const handleClose = () => {
    setSelectedFile(null);
    setChangeNotes('');
    setError(null);
    setDragOver(false);
    onClose();
  };

  return (
    <Drawer
      open={open}
      onOpenChange={(next) => {
        if (!next && !uploading) handleClose();
      }}
    >
      <DrawerContent
        className="sm:max-w-lg sm:mx-auto sm:rounded-3xl p-0 overflow-hidden"
        aria-labelledby="upload-version-title"
      >
        {/* Header — P306: Fairway tokens (warm-matte) only. */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle">
          <div>
            <DrawerTitle id="upload-version-title" className="text-body-lg font-medium text-text-primary tracking-[-0.012em]">
              Upload New Version
            </DrawerTitle>
            <p className="text-sm text-text-tertiary mt-0.5">{documentTitle}</p>
          </div>
          <IconButton variant="default"
            onClick={handleClose}
            disabled={uploading}
            aria-label="Close"
            className="p-2 hover:bg-surface-tint active:bg-surface-sunken rounded-lg transition-colors disabled:opacity-50"
          >
            <IconX size={20} />
          </IconButton>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Error */}
          {error && (
            <div className="p-3 bg-fw-danger-bg border border-fw-danger/30 rounded-lg text-sm text-fw-danger">
              {error}
            </div>
          )}

          {/* File type hint */}
          {currentFileType && (
            <div className="p-3 bg-surface-tint border border-border-subtle rounded-lg text-sm text-text-secondary">
              Current file type: <strong className="text-text-primary">{currentFileType}</strong>
              <br />
              <span className="text-text-tertiary">
                Tip: For best compatibility, upload the same file type.
              </span>
            </div>
          )}

          {/* Drop zone */}
          {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className={`
              relative border-2 border-dashed rounded-xl p-8 text-center transition-all
              ${dragOver
                ? 'border-accent-400 bg-accent-50'
                : selectedFile
                  ? 'border-accent-500 bg-accent-50/50'
                  : 'border-border-subtle hover:border-border-strong'
              }
            `}
          >
            <Input
              type="file"
              onChange={handleFileSelect}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              accept="application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,image/*,text/plain,video/mp4,video/webm,video/quicktime"
            />

            {selectedFile ? (
              <div>
                <div className="w-12 h-12 bg-accent-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <IconFile size={24} className="text-accent-600" />
                </div>
                <p className="font-medium text-text-primary">{selectedFile.name}</p>
                <p className="text-sm text-text-tertiary mt-1">
                  {formatFileSize(selectedFile.size)}
                </p>
                <Button variant="ghost"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedFile(null);
                  }}
                  className="mt-3 text-sm text-text-tertiary hover:text-text-secondary underline"
                >
                  Choose different file
                </Button>
              </div>
            ) : (
              <div>
                <div className="w-12 h-12 bg-surface-sunken rounded-full flex items-center justify-center mx-auto mb-3">
                  <IconUpload size={24} className="text-text-tertiary" />
                </div>
                <p className="font-medium text-text-secondary">
                  Drop file here or click to browse
                </p>
                {/* P306 — the "max 2MB" cap was inaccurate (no such limit is
                    enforced and the page advertises no cap). Reconciled to the
                    accepted-types guidance the Fairway page shows. */}
                <p className="text-sm text-text-tertiary mt-1">
                  PDF, images, Office documents, and videos
                </p>
              </div>
            )}
          </div>

          {/* Change notes */}
          <div>
            <label htmlFor={`${uid}-notes`} className="block text-sm font-medium text-text-secondary mb-2">
              Change Notes (optional)
            </label>
            <Textarea
              id={`${uid}-notes`}
              value={changeNotes}
              onChange={(e) => setChangeNotes(e.target.value)}
              placeholder="Describe what changed in this version..."
              rows={3}
              aria-label="Change notes"
              autoCapitalize="sentences"
              autoCorrect="on"
              className="w-full px-4 py-2.5 border border-border-subtle rounded-lg text-base lg:text-sm focus:outline-none focus:border-accent-500 focus:ring-2 focus:ring-border-focus/30 text-text-primary placeholder:text-text-tertiary resize-none bg-surface"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border-subtle bg-surface-tint rounded-b-2xl">
          <Button variant="ghost"
            onClick={handleClose}
            disabled={uploading}
            className="px-4 py-2 text-text-secondary font-medium hover:bg-surface-tint active:bg-surface-sunken rounded-lg transition-colors disabled:opacity-50"
          >
            Cancel
          </Button>
          <Button variant="primary"
            onClick={handleSubmit}
            disabled={!selectedFile || uploading}
            className="px-4 py-2 bg-accent-500 hover:bg-accent-600 text-text-on-accent font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {uploading ? (
              <>
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-text-on-accent skeleton-shimmer" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-text-on-accent skeleton-shimmer" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-text-on-accent skeleton-shimmer" style={{ animationDelay: '300ms' }} />
                </span>
                Uploading...
              </>
            ) : (
              <>
                <IconUpload size={18} />
                Upload Version
              </>
            )}
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
