'use client';

import { useState } from 'react';
import { IconX, IconUpload, IconFile } from '@/components/icons';
import { Button, IconButton } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { InkNotice } from '@/components/baseball/living-annual';

interface UploadNewVersionModalProps {
  open: boolean;
  onClose: () => void;
  documentTitle: string;
  currentFileType: string | null;
  onUpload: (file: File, changeNotes: string) => Promise<void>;
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
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

  if (!open) return null;

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <Button
        variant="ghost"
        type="button"
        aria-label="Close modal"
        className="absolute inset-0 h-auto min-h-0 w-full rounded-none p-0 bg-warm-900/50 backdrop-blur-sm hover:bg-warm-900/50 active:scale-100 cursor-default"
        onClick={handleClose}
      >
        <span className="sr-only">Close modal</span>
      </Button>

      {/* Modal */}
      <div className="relative bg-cream-50 rounded-2xl shadow-2xl max-w-lg w-full max-h-[85dvh] flex flex-col overflow-clip">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-warm-200 flex-shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-warm-900">Upload New Version</h2>
            <p className="text-sm text-warm-500 mt-0.5">{documentTitle}</p>
          </div>
          <IconButton variant="default" aria-label="Close"
            onClick={handleClose}
            disabled={uploading}
            className="p-2 hover:bg-warm-100 active:bg-warm-200 rounded-lg transition-colors disabled:opacity-50"
          >
            <IconX size={20} />
          </IconButton>
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-4">
          {/* Error */}
          {error && <InkNotice>{error}</InkNotice>}

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
          {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions -- drag-and-drop zone, no click interaction */}
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className={`
              relative border-2 border-dashed rounded-xl p-8 text-center transition-all
              ${
                dragOver
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
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedFile(null);
                  }}
                  className="mt-3 px-2 text-warm-500 hover:text-warm-700 hover:bg-transparent underline"
                >
                  Choose different file
                </Button>
              </div>
            ) : (
              <div>
                <div className="w-12 h-12 bg-warm-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <IconUpload size={24} className="text-warm-400" />
                </div>
                <p className="font-medium text-warm-700">Drop file here or click to browse</p>
                <p className="text-sm text-warm-400 mt-1">
                  PDF, images, Office documents, videos
                </p>
              </div>
            )}
          </div>

          {/* Change notes */}
          <div>
            <label htmlFor="unvm-change-notes" className="block text-sm font-medium text-warm-700 mb-2">
              Change Notes (optional)
            </label>
            <Textarea
              id="unvm-change-notes"
              value={changeNotes}
              onChange={(e) => setChangeNotes(e.target.value)}
              placeholder="Describe what changed in this version..."
              rows={3}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-warm-200 bg-warm-50 rounded-b-2xl flex-shrink-0">
          <Button
            variant="secondary"
            type="button"
            onClick={handleClose}
            disabled={uploading}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={!selectedFile}
            isLoading={uploading}
            leftIcon={<IconUpload size={18} />}
          >
            Upload Version
          </Button>
        </div>
      </div>
    </div>
  );
}

export default UploadNewVersionModal;
