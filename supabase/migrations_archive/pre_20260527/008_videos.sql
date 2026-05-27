-- ============================================================================
-- Migration: 008_videos.sql
-- Purpose: Videos and video clips
-- Consolidated from: 004_video_storage.sql, 20260109000004_add_video_clips.sql
-- ============================================================================

CREATE TABLE IF NOT EXISTS videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  video_type TEXT,
  url TEXT,
  thumbnail_url TEXT,
  duration INTEGER,
  view_count INTEGER DEFAULT 0,
  is_primary BOOLEAN DEFAULT FALSE,

  -- Clip support
  is_clip BOOLEAN DEFAULT FALSE,
  parent_video_id UUID REFERENCES videos(id) ON DELETE CASCADE,
  clip_start_time INTEGER, -- seconds
  clip_end_time INTEGER, -- seconds

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Video Views tracking
CREATE TABLE IF NOT EXISTS video_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  viewer_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_videos_player ON videos(player_id);
CREATE INDEX IF NOT EXISTS idx_videos_primary ON videos(player_id, is_primary) WHERE is_primary = TRUE;
CREATE INDEX IF NOT EXISTS idx_videos_parent ON videos(parent_video_id) WHERE parent_video_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_video_views_video ON video_views(video_id);
CREATE INDEX IF NOT EXISTS idx_video_views_date ON video_views(created_at DESC);
