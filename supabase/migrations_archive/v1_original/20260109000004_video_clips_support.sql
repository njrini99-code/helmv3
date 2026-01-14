-- Migration: Add video clipping support
-- Purpose: Enable players to create clips from existing videos

-- Add clip-related columns to videos table
ALTER TABLE videos
ADD COLUMN IF NOT EXISTS is_clip BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS parent_video_id UUID REFERENCES videos(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS clip_start_time NUMERIC,
ADD COLUMN IF NOT EXISTS clip_end_time NUMERIC;

-- Create index for finding clips of a video
CREATE INDEX IF NOT EXISTS idx_videos_parent_video_id
ON videos(parent_video_id)
WHERE parent_video_id IS NOT NULL;

-- Create index for filtering clips vs full videos
CREATE INDEX IF NOT EXISTS idx_videos_is_clip
ON videos(is_clip)
WHERE is_clip = true;

-- Add constraint: clip times must be valid
ALTER TABLE videos
ADD CONSTRAINT valid_clip_times
CHECK (
  (is_clip = false) OR
  (is_clip = true AND clip_start_time IS NOT NULL AND clip_end_time IS NOT NULL AND clip_start_time < clip_end_time)
);

-- Add constraint: clips must have a parent
ALTER TABLE videos
ADD CONSTRAINT clips_must_have_parent
CHECK (
  (is_clip = false AND parent_video_id IS NULL) OR
  (is_clip = true AND parent_video_id IS NOT NULL)
);

-- Comment
COMMENT ON COLUMN videos.is_clip IS 'True if this is a clip from another video';
COMMENT ON COLUMN videos.parent_video_id IS 'Reference to the original full video this clip was created from';
COMMENT ON COLUMN videos.clip_start_time IS 'Start time of the clip in seconds';
COMMENT ON COLUMN videos.clip_end_time IS 'End time of the clip in seconds';
