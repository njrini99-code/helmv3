-- Video Storage Infrastructure
-- Run this in Supabase SQL Editor

-- Create storage buckets
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('videos', 'videos', true, 104857600, ARRAY['video/mp4', 'video/quicktime', 'video/webm', 'video/x-msvideo']),
  ('thumbnails', 'thumbnails', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp']),
  ('avatars', 'avatars', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

-- Storage policies for videos
CREATE POLICY "Users can upload own videos" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'videos' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Videos are public" ON storage.objects
FOR SELECT TO public
USING (bucket_id = 'videos');

CREATE POLICY "Users can delete own videos" ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'videos' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Storage policies for thumbnails
CREATE POLICY "Users can upload thumbnails" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'thumbnails' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Thumbnails are public" ON storage.objects
FOR SELECT TO public
USING (bucket_id = 'thumbnails');

-- Storage policies for avatars
CREATE POLICY "Users can upload own avatar" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can update own avatar" ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Avatars are public" ON storage.objects
FOR SELECT TO public
USING (bucket_id = 'avatars');

-- Function to increment video views
CREATE OR REPLACE FUNCTION increment_video_view(vid_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE videos SET view_count = view_count + 1 WHERE id = vid_id;

  INSERT INTO video_views (video_id, viewer_id)
  VALUES (vid_id, auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
