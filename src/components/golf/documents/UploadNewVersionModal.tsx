'use client';

import { useState } from 'react';
import { IconX, IconUpload, IconFile } from '@/components/icons';
import { Button, IconButton } from '@/components/ui/button';
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
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-warm-200">
          <div>
            <DrawerTitle id="upload-version-title" className="text-body-lg font-medium text-warm-900 tracking-[-0.012em]">
              Upload New Version
            </DrawerTitle>
            <p className="text-sm text-warm-500 mt-0.5">{documentTitle}</p>
          </div>
          <IconButton variant="default"
            onClick={handleClose}
            disabled={uploading}
            aria-label="Close"
            className="p-2 hover:bg-warm-100 active:bg-warm-200 rounded-lg transition-colors disabled:opacity-50"
          >
            <IconX size={20} />
          </IconButton>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Error */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
              {error}
            </div>
          )}

          {/* File type hint */}
          {currentFileType && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
              Current file type: <strong>{currentFileType}</strong>
              <br />
              <span className="text-blue-600">
                Tip: For best compatibility, upload the same file type.
              </span>
            </div>
          )}

          {/* Drop zone */}
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className={`
              relative border-2 border-dashed rounded-xl p-8 text-center transition-all
              ${dragOver
                ? 'border-primary-400 bg-primary-50'
                : selectedFile
                  ? 'border-primary-500 bg-primary-50/50'
                  : 'border-warm-200 hover:border-warm-300'
              }
            `}
          >
            <input
              type="file"
              onChange={handleFileSelect}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              accept="application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,image/*,text/plain,video/mp4,video/webm,video/quicktime"
            />

            {selectedFile ? (
              <div>
                <div className="w-12 h-12 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <IconFile size={24} className="text-primary-600" />
                </div>
                <p className="font-medium text-warm-900">{selectedFile.name}</p>
                <p className="text-sm text-warm-500 mt-1">
                  {formatFileSize(selectedFile.size)}
                </p>
                <Button variant="ghost"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedFile(null);
                  }}
                  className="mt-3 text-sm text-warm-500 hover:text-warm-700 underline"
                >
                  Choose different file
                </Button>
              </div>
            ) : (
              <div>
                <div className="w-12 h-12 bg-warm-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <IconUpload size={24} className="text-warm-400" />
                </div>
                <p className="font-medium text-warm-700">
                  Drop file here or click to browse
                </p>
                <p className="text-sm text-warm-400 mt-1">
                  PDF, images, Office documents, videos (max 2MB)
                </p>
              </div>
            )}
          </div>

          {/* Change notes */}
          <div>
            <label className="block text-sm font-medium text-warm-700 mb-2">
              Change Notes (optional)
            </label>
            <textarea
              value={changeNotes}
              onChange={(e) => setChangeNotes(e.target.value)}
              placeholder="Describe what changed in this version..."
              rows={3}
              aria-label="Change notes"
              autoCapitalize="sentences"
              autoCorrect="on"
              className="w-full px-4 py-2.5 border border-warm-200 rounded-lg text-base lg:text-sm focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/30 text-warm-900 placeholder:text-warm-400 resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-warm-200 bg-warm-50 rounded-b-2xl">
          <Button variant="ghost"
            onClick={handleClose}
            disabled={uploading}
            className="px-4 py-2 text-warm-700 font-medium hover:bg-warm-100 active:bg-warm-200 rounded-lg transition-colors disabled:opacity-50"
          >
            Cancel
          </Button>
          <Button variant="primary"
            onClick={handleSubmit}
            disabled={!selectedFile || uploading}
            className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {uploading ? (
              <>
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-white skeleton-shimmer" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-white skeleton-shimmer" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-white skeleton-shimmer" style={{ animationDelay: '300ms' }} />
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
