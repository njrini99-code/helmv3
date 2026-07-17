'use client';

import { useState, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { logError } from '@/lib/error-logging';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/fairway';
import { IconUpload, IconTrash, IconLoader, IconAlertCircle } from '@/components/icons';

interface AvatarUploadProps {
  currentAvatarUrl?: string | null;
  name: string;
  onUploadComplete: (url: string) => void;
  onRemove?: () => void;
  bucket?: string;
  maxSizeMB?: number;
}

export function AvatarUpload({
  currentAvatarUrl,
  name,
  onUploadComplete,
  onRemove,
  bucket = 'avatars',
  maxSizeMB = 2,
}: AvatarUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentAvatarUrl || null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset error
    setError(null);

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }

    // Validate file size
    const maxBytes = maxSizeMB * 1024 * 1024;
    if (file.size > maxBytes) {
      setError(`File size must be less than ${maxSizeMB}MB`);
      return;
    }

    // Create preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setPreviewUrl(reader.result as string);
    };
    reader.readAsDataURL(file);

    // Upload to Supabase Storage
    setUploading(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        throw new Error('You must be logged in to upload files');
      }

      // Generate unique filename in user's folder
      const fileExt = file.name.split('.').pop();
      const fileName = `avatar-${Date.now()}.${fileExt}`;
      const filePath = `${user.id}/${fileName}`;

      // Upload file
      const { error: uploadError, data } = await supabase.storage
        .from(bucket)
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: true,
        });

      if (uploadError) {
        throw uploadError;
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from(bucket)
        .getPublicUrl(data.path);

      onUploadComplete(publicUrl);
    } catch (err) {
      console.error('Upload error:', err);
      setError(err instanceof Error ? err.message : 'Failed to upload image');
      setPreviewUrl(currentAvatarUrl || null); // Revert preview on error
      logError(
        err instanceof Error ? err : new Error(String(err)),
        { component: 'AvatarUpload', action: 'upload-avatar', sport: 'shared', bucket },
        'high'
      );
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemove = () => {
    setPreviewUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    onRemove?.();
  };

  return (
    <div className="flex items-center gap-4">
      {/* Avatar Preview */}
      <div className="relative">
        <Avatar
          src={previewUrl}
          name={name}
          size="2xl"
          className="ring-4 ring-surface shadow-soft"
        />
        {uploading && (
          <div className="absolute inset-0 flex items-center justify-center rounded-[10px] bg-text-primary/50">
            <IconLoader size={24} className="animate-spin text-text-on-accent" aria-hidden />
            <span className="sr-only">Uploading…</span>
          </div>
        )}
      </div>

      {/* Upload Controls */}
      <div className="flex-1 space-y-2">
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            disabled={uploading}
            className="hidden"
            id="avatar-upload"
          />
          <Button
            variant="secondary"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            busy={uploading}
            leftIcon={<IconUpload size={16} aria-hidden />}
          >
            {previewUrl ? 'Change Photo' : 'Upload Photo'}
          </Button>

          {previewUrl && onRemove && (
            <Button
              variant="danger"
              size="sm"
              onClick={handleRemove}
              disabled={uploading}
              leftIcon={<IconTrash size={16} aria-hidden />}
            >
              Remove
            </Button>
          )}
        </div>

        {error && (
          <p className="flex items-center gap-1.5 font-fw-sans text-body-sm text-fw-danger">
            <IconAlertCircle size={15} className="shrink-0" aria-hidden />
            {error}
          </p>
        )}

        <p className="font-fw-sans text-caption text-text-tertiary">
          JPG, PNG or GIF. Max {maxSizeMB}MB.
        </p>
      </div>
    </div>
  );
}
