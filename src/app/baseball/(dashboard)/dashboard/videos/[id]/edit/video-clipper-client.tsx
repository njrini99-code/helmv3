'use client';

import { useRouter } from 'next/navigation';
import { VideoClipper } from '@/components/video/VideoClipper';
import type { Video } from '@/lib/types';

interface VideoClipperClientProps {
  video: Video;
}

export function VideoClipperClient({ video }: VideoClipperClientProps) {
  const router = useRouter();

  const handleClipCreated = (clip: Video) => {
    // Navigate to the new clip or back to videos
    router.push(`/baseball/dashboard/videos?created=${clip.id}`);
    router.refresh();
  };

  const handleCancel = () => {
    router.back();
  };

  return (
    <VideoClipper
      video={video}
      onClipCreated={handleClipCreated}
      onCancel={handleCancel}
    />
  );
}
