import { createClient } from '@/lib/supabase/client';
import {
  COURSE_IMAGE_BUCKET,
  MAX_COURSE_IMAGE_BYTES,
  ALLOWED_COURSE_IMAGE_MIME,
  courseImageExt,
} from '@/lib/golf/course-library';

/**
 * Client-side course-image upload. Uploads directly to the public course-images
 * bucket (RLS-enforced authenticated insert) so we never route ≤5 MB files
 * through the 2 MB server-action body limit, then returns the public URL for
 * setCourseImageUrl() to validate + persist.
 */
export type UploadCourseImageResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

export async function uploadCourseImage(
  courseId: string,
  file: File,
): Promise<UploadCourseImageResult> {
  if (!(ALLOWED_COURSE_IMAGE_MIME as readonly string[]).includes(file.type)) {
    return { ok: false, error: 'Use a JPG, PNG, WebP, or AVIF image' };
  }
  if (file.size > MAX_COURSE_IMAGE_BYTES) {
    return { ok: false, error: 'Image must be 5 MB or smaller' };
  }

  const supabase = createClient();
  const path = `courses/${courseId}/${crypto.randomUUID()}.${courseImageExt(file.type)}`;
  const { error } = await supabase.storage
    .from(COURSE_IMAGE_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false, cacheControl: '3600' });
  if (error) {
    return { ok: false, error: 'Upload failed. Please try again.' };
  }

  const { data } = supabase.storage.from(COURSE_IMAGE_BUCKET).getPublicUrl(path);
  return { ok: true, url: data.publicUrl };
}
