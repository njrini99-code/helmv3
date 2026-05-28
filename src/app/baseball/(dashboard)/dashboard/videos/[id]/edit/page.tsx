import { createClient } from '@/lib/supabase/server';
import { notFound, redirect } from 'next/navigation';
import { VideoClipperClient } from './video-clipper-client';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function VideoEditPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();

  // Get current user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/baseball/login');
  }

  // Get the video
  const { data: video, error } = await supabase
    .from('baseball_videos')
    .select('*, player:baseball_players(*)')
    .eq('id', id)
    .single();

  if (error || !video) {
    notFound();
  }

  // Verify ownership - user must own this video's player
  const { data: player } = await supabase
    .from('baseball_players')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (!player || video.player_id !== player.id) {
    redirect('/baseball/dashboard/videos');
  }

  return (
    <div className="min-h-dvh bg-cream">
      <div className="max-w-[720px] mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="mb-6">
          <a
            href="/baseball/dashboard/videos"
            className="inline-flex items-center gap-2 text-sm text-warm-500 hover:text-warm-700 mb-4"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Videos
          </a>
          <h1 className="text-2xl font-semibold text-warm-900">Create Clip</h1>
          <p className="text-warm-500 mt-1">
            Select a portion of &quot;{video.title}&quot; to create a highlight clip
          </p>
        </div>

        {/* Video Clipper */}
        <VideoClipperClient video={video} />
      </div>
    </div>
  );
}
