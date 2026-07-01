'use client';

import { useEffect, useRef } from 'react';
import { VideoPlayer } from '@/components/features/video-player';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { IconLink } from '@/components/icons';
import { useToast } from '@/components/ui/sonner';
import { incrementMyVideoView } from '@/app/baseball/actions/video-classes';

interface VideoDetailClientProps {
  videoId: string;
  videoUrl: string | null;
  thumbnailUrl: string | null;
  title: string;
  /** Clip bounds (seconds) when this row is a clip — url is the same file as
   * the parent video, so the player must seek/clamp to these bounds itself. */
  clipStart?: number | null;
  clipEnd?: number | null;
}

export function VideoDetailClient({
  videoId,
  videoUrl,
  thumbnailUrl,
  title,
  clipStart,
  clipEnd,
}: VideoDetailClientProps) {
  const { showToast } = useToast();
  const hasIncremented = useRef(false);

  // Increment view count once per page load (fire-and-forget)
  useEffect(() => {
    if (hasIncremented.current) return;
    hasIncremented.current = true;
    void incrementMyVideoView({ videoId }).catch(() => {});
  }, [videoId]);

  async function handleShare() {
    if (!videoUrl) return;
    try {
      await navigator.clipboard.writeText(videoUrl);
      showToast('Video link copied to clipboard', 'success');
    } catch {
      // Fallback for older browsers
      const ta = document.createElement('textarea');
      ta.value = videoUrl;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      showToast('Video link copied to clipboard', 'success');
    }
  }

  if (!videoUrl) {
    return (
      <Card variant="glass">
        <CardContent className="p-8 text-center text-warm-500">
          Video file is not available.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-2xl overflow-hidden bg-warm-900">
        <VideoPlayer
          src={videoUrl}
          thumbnail={thumbnailUrl}
          title={title}
          clipStart={clipStart ?? undefined}
          clipEnd={clipEnd ?? undefined}
        />
      </div>
      <div className="flex justify-end">
        <Button variant="secondary" size="sm" onClick={handleShare}>
          <IconLink size={14} className="mr-1.5" />
          Copy Link
        </Button>
      </div>
    </div>
  );
}
