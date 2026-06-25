'use client';

import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { IconUpload, IconVideo } from '@/components/icons';
import { cn } from '@/lib/utils';
import { batchUploadStaffVideos } from '@/app/baseball/actions/video-classes';

interface RosterEntry {
  id: string;
  player: {
    id: string;
    first_name: string | null;
    last_name: string | null;
  };
}

interface BatchVideoUploadProps {
  roster: RosterEntry[];
}

interface UploadSuccess {
  playerNames: string[];
  videoTitle: string;
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

export function BatchVideoUpload({ roster }: BatchVideoUploadProps) {
  const { user } = useAuth();
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<UploadSuccess | null>(null);
  const [form, setForm] = useState({
    title: '',
    description: '',
    video_type: '',
  });

  const players = useMemo(() => {
    return roster
      .map((member) => ({
        id: member.player.id,
        name: `${member.player.first_name ?? ''} ${member.player.last_name ?? ''}`.trim(),
      }))
      .filter((player) => player.name.length > 0);
  }, [roster]);

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
    setSuccess(null);
    if (!form.title) {
      const name = selectedFile.name
        .replace(/\.[^/.]+$/, '')
        .replace(/[-_]/g, ' ')
        .replace(/\b\w/g, (l) => l.toUpperCase());
      setForm((prev) => ({ ...prev, title: name }));
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) handleFileSelect(selectedFile);
  };

  const togglePlayer = (playerId: string) => {
    setSelectedPlayers((prev) =>
      prev.includes(playerId)
        ? prev.filter((id) => id !== playerId)
        : [...prev, playerId],
    );
  };

  const selectAll = () => setSelectedPlayers(players.map((p) => p.id));
  const clearSelection = () => setSelectedPlayers([]);

  const handleUpload = async () => {
    if (!user) {
      setError('You must be signed in to upload videos.');
      return;
    }
    if (!file) {
      setError('Select a video file to upload.');
      return;
    }
    if (selectedPlayers.length === 0) {
      setError('Select at least one player to attach this video.');
      return;
    }
    if (!form.title.trim()) {
      setError('Please enter a video title.');
      return;
    }

    setUploading(true);
    setError(null);
    setSuccess(null);

    // Only the storage client is needed client-side; DB writes go through the server action.
    const supabase = createClient();

    const fileExt = file.name.split('.').pop()?.toLowerCase() ?? 'mp4';
    const fileName = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${fileExt}`;

    try {
      const uploadResult = await supabase.storage
        .from('baseball_videos')
        .upload(fileName, file, { cacheControl: '3600', upsert: false });

      if (uploadResult.error) {
        setError(uploadResult.error.message ?? 'Storage upload failed. Please try again.');
        return;
      }

      const { data: urlData } = supabase.storage
        .from('baseball_videos')
        .getPublicUrl(fileName);
      const publicUrl = urlData.publicUrl;

      const result = await batchUploadStaffVideos({
        title: form.title.trim(),
        description: form.description.trim() || null,
        videoType: form.video_type || null,
        url: publicUrl,
        playerIds: selectedPlayers,
      });

      if (!result.success) {
        // Server action failed — remove the just-uploaded storage object so it
        // does not become an orphan.
        await supabase.storage.from('baseball_videos').remove([fileName]);
        setError(result.error ?? 'Could not save the video records. Please try again.');
        return;
      }

      const uploadedPlayerNames = players
        .filter((p) => selectedPlayers.includes(p.id))
        .map((p) => p.name);

      setSuccess({ playerNames: uploadedPlayerNames, videoTitle: form.title.trim() });
      setSelectedPlayers([]);
      setFile(null);
      setForm({ title: '', description: '', video_type: '' });
    } catch {
      // Clean up orphaned storage file if something unexpected threw.
      await supabase.storage.from('baseball_videos').remove([fileName]).catch(() => undefined);
      setError('Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card variant="glass">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-warm-900">Batch Video Upload</h2>
            <p className="text-sm leading-relaxed text-warm-500 mt-1">
              Upload a single video and attach it to multiple players at once.
            </p>
          </div>
          <div className="h-10 w-10 rounded-xl bg-warm-100 flex items-center justify-center">
            <IconVideo size={20} className="text-warm-600" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}

        <AnimatePresence>
          {success && (
            <motion.div
              key="upload-success"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 space-y-1"
            >
              <p className="text-sm font-medium text-green-800">
                &ldquo;{success.videoTitle}&rdquo; saved for {success.playerNames.length}{' '}
                {success.playerNames.length === 1 ? 'player' : 'players'}:
              </p>
              <ul className="text-sm text-green-700 list-disc list-inside space-y-0.5">
                {success.playerNames.map((name) => (
                  <li key={name}>{name}</li>
                ))}
              </ul>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="space-y-4">
            <Input
              label="Video Title"
              value={form.title}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, title: event.target.value }))
              }
              placeholder="Spring game highlights"
              required
            />
            <div>
              <label
                htmlFor="bvu-video-type"
                className="block text-sm font-medium text-warm-700 mb-1"
              >
                Video Type
              </label>
              <select
                id="bvu-video-type"
                value={form.video_type}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, video_type: event.target.value }))
                }
                className="w-full px-4 py-2.5 rounded-lg border border-warm-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 text-warm-900 bg-white transition-colors"
              >
                <option value="">Select type</option>
                {videoTypes.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>
            <Textarea
              label="Description (Optional)"
              value={form.description}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, description: event.target.value }))
              }
              placeholder="Notes about this video..."
              rows={3}
            />
            <div>
              <label
                htmlFor="bvu-video-file"
                className="block text-sm font-medium text-warm-700 mb-1"
              >
                Video File
              </label>
              <input
                id="bvu-video-file"
                type="file"
                accept="video/mp4,video/quicktime,video/webm,video/x-msvideo"
                onChange={handleInputChange}
                className="w-full text-sm text-warm-600 file:mr-4 file:rounded-lg file:border-0 file:bg-warm-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-warm-700 hover:file:bg-warm-200"
              />
              {file && <p className="text-xs text-warm-500 mt-1">{file.name}</p>}
            </div>
          </div>

          <div className="border border-warm-200 rounded-lg">
            <div className="flex items-center justify-between px-4 py-3 border-b border-warm-200 bg-warm-50">
              <p className="text-sm font-medium text-warm-700">
                Select Players ({selectedPlayers.length})
              </p>
              <div className="flex items-center gap-1 text-xs">
                <Button
                  variant="ghost"
                  size="sm"
                  type="button"
                  onClick={selectAll}
                  className="px-2 min-h-0 h-auto py-1 text-primary-600 hover:text-primary-700 hover:bg-primary-50 font-medium"
                >
                  Select All
                </Button>
                <span className="text-warm-300">|</span>
                <Button
                  variant="ghost"
                  size="sm"
                  type="button"
                  onClick={clearSelection}
                  className="px-2 min-h-0 h-auto py-1 text-warm-600 hover:text-warm-700 font-medium"
                >
                  Clear
                </Button>
              </div>
            </div>
            <div className="max-h-60 overflow-y-auto divide-y divide-warm-100">
              {players.length === 0 ? (
                <p className="text-sm text-warm-400 p-4 text-center">No active players found</p>
              ) : (
                players.map((player) => (
                  <label
                    key={player.id}
                    className={cn(
                      'flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-warm-50 active:bg-warm-100',
                      selectedPlayers.includes(player.id) && 'bg-primary-50',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={selectedPlayers.includes(player.id)}
                      onChange={() => togglePlayer(player.id)}
                      className="w-4 h-4 rounded border-warm-300 text-primary-600 focus:ring-primary-500"
                    />
                    <span className="text-sm text-warm-900">{player.name}</span>
                  </label>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={handleUpload} isLoading={uploading} disabled={uploading}>
            <IconUpload size={16} className="mr-2" />
            Upload Video
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
