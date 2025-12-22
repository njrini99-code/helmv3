'use client';

import { useState, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { IconVideo, IconX } from '@/components/icons';
import { cn } from '@/lib/utils';

interface VideoUploadProps {
  onUploadComplete?: (video: any) => void;
  onCancel?: () => void;
}

const videoTypes = [
  { value: 'game_footage', label: 'Game Footage' },
  { value: 'skills_video', label: 'Skills Video' },
  { value: 'bullpen', label: 'Bullpen Session' },
  { value: 'batting_practice', label: 'Batting Practice' },
  { value: 'fielding', label: 'Fielding Drills' },
  { value: 'running', label: '60-Yard Dash / Running' },
  { value: 'throwing', label: 'Throwing / Arm Strength' },
  { value: 'highlight_reel', label: 'Highlight Reel' },
  { value: 'showcase', label: 'Showcase Event' },
  { value: 'other', label: 'Other' },
];

export function VideoUpload({ onUploadComplete, onCancel }: VideoUploadProps) {
  const { user, player } = useAuthStore();
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const [form, setForm] = useState({
    title: '',
    description: '',
    video_type: '',
    is_primary: false,
  });

  const validateFile = (selectedFile: File): boolean => {
    const validTypes = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-msvideo'];
    if (!validTypes.includes(selectedFile.type)) {
      setError('Please select a valid video file (MP4, MOV, WebM, or AVI)');
      return false;
    }
    if (selectedFile.size > 100 * 1024 * 1024) {
      setError('Video must be less than 100MB');
      return false;
    }
    return true;
  };

  const handleFileSelect = (selectedFile: File) => {
    if (!validateFile(selectedFile)) return;
    setFile(selectedFile);
    setError(null);
    const url = URL.createObjectURL(selectedFile);
    setPreview(url);
    if (!form.title) {
      const name = selectedFile.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      setForm(f => ({ ...f, title: name }));
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) handleFileSelect(selectedFile);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) handleFileSelect(droppedFile);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  const clearFile = () => {
    setFile(null);
    if (preview) {
      URL.revokeObjectURL(preview);
      setPreview(null);
    }
    setProgress(0);
    setError(null);
  };

  const handleUpload = async () => {
    if (!file || !player || !user) return;
    if (!form.title.trim()) {
      setError('Please enter a title');
      return;
    }

    setUploading(true);
    setProgress(0);
    setError(null);

    try {
      const fileExt = file.name.split('.').pop()?.toLowerCase() || 'mp4';
      const fileName = user.id + '/' + Date.now() + '-' + Math.random().toString(36).substr(2, 9) + '.' + fileExt;

      const result = await supabase.storage.from('videos').upload(fileName, file, {
        cacheControl: '3600',
        upsert: false,
      });

      if (result.error) throw result.error;
      setProgress(70);

      const urlData = supabase.storage.from('videos').getPublicUrl(fileName);
      const publicUrl = urlData.data.publicUrl;

      if (form.is_primary) {
        await supabase.from('videos').update({ is_primary: false }).eq('player_id', player.id);
      }

      const insertResult = await supabase.from('videos').insert({
        player_id: player.id,
        title: form.title.trim(),
        description: form.description.trim() || null,
        video_type: form.video_type || null,
        url: publicUrl,
        is_primary: form.is_primary,
        duration: null,
      }).select().single();

      if (insertResult.error) throw insertResult.error;
      setProgress(90);

      await supabase.from('players').update({ has_video: true }).eq('id', player.id);
      setProgress(100);

      if (preview) URL.revokeObjectURL(preview);
      onUploadComplete?.(insertResult.data);
    } catch (err: any) {
      console.error('Upload error:', err);
      setError(err.message || 'Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <h3 className="font-semibold text-slate-900">Upload Video</h3>
        {onCancel && (
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-cream-100">
            <IconX size={20} />
          </button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {!file ? (
          <div
            onClick={() => fileInputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className={cn(
              'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all',
              dragOver ? 'border-brand-500 bg-brand-50' : 'border-border hover:border-brand-400 hover:bg-cream-50'
            )}
          >
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-cream-100 flex items-center justify-center">
              <IconVideo size={32} className="text-slate-400" />
            </div>
            <p className="text-sm font-medium text-slate-900 mb-1">
              {dragOver ? 'Drop video here' : 'Click or drag to upload video'}
            </p>
            <p className="text-xs text-slate-500">MP4, MOV, WebM, or AVI up to 100MB</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="video/mp4,video/quicktime,video/webm,video/x-msvideo"
              onChange={handleInputChange}
              className="hidden"
            />
          </div>
        ) : (
          <div className="space-y-4">
            {preview && (
              <div className="relative rounded-xl overflow-hidden bg-black aspect-video">
                <video src={preview} controls className="w-full h-full" />
                <button onClick={clearFile} className="absolute top-3 right-3 p-2 bg-black/60 rounded-full text-white hover:bg-black/80 transition-colors">
                  <IconX size={16} />
                </button>
              </div>
            )}
            <Input
              label="Title *"
              value={form.title}
              onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="e.g., Fall Scrimmage Highlights"
              error={!form.title && error ? 'Title is required' : undefined}
            />
            <Select
              label="Video Type"
              options={videoTypes}
              value={form.video_type}
              onChange={(value) => setForm(f => ({ ...f, video_type: value }))}
              placeholder="Select type (optional)"
            />
            <Textarea
              label="Description"
              value={form.description}
              onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Add context about this video - date, event, what to look for..."
              rows={3}
            />
            <label className="flex items-center gap-3 cursor-pointer p-3 rounded-lg hover:bg-cream-50 transition-colors">
              <input
                type="checkbox"
                checked={form.is_primary}
                onChange={(e) => setForm(f => ({ ...f, is_primary: e.target.checked }))}
                className="w-5 h-5 text-brand-600 rounded border-border focus:ring-brand-500"
              />
              <div>
                <span className="text-sm font-medium text-slate-900">Set as primary video</span>
                <p className="text-xs text-slate-500">This video will be shown first on your profile</p>
              </div>
            </label>
            {error && (
              <div className="p-3 bg-red-50 border border-red-100 rounded-lg">
                <p className="text-sm leading-relaxed text-red-600">{error}</p>
              </div>
            )}
            {uploading && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">Uploading...</span>
                  <span className="font-medium text-slate-900">{progress}%</span>
                </div>
                <div className="w-full bg-cream-200 rounded-full h-2 overflow-hidden">
                  <div className="bg-brand-600 h-2 rounded-full transition-all duration-300" style={{ width: progress + '%' }} />
                </div>
              </div>
            )}
            <div className="flex justify-end gap-3 pt-2">
              {onCancel && (
                <Button variant="secondary" onClick={onCancel} disabled={uploading}>
                  Cancel
                </Button>
              )}
              <Button onClick={handleUpload} loading={uploading} disabled={!form.title.trim()}>
                {uploading ? 'Uploading...' : 'Upload Video'}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
