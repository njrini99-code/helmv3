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
  /** `path` is the object key in the bucket, for discardCourseImageUpload() when the save fails. */
  | { ok: true; url: string; path: string }
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
  return { ok: true, url: data.publicUrl, path };
}

/**
 * Remove an object uploadCourseImage() just put in the bucket, when the save that
 * should have pointed golf_courses.image_url at it was refused (a player before
 * golf_set_course_image is applied, a rejected URL, an RPC error). Without this
 * the file stays in the public bucket with nothing referencing it.
 *
 * Storage RLS (course_images_owner_delete) lets the uploader delete their own
 * object, which is always the case here. Best-effort: never throws, and callers
 * must only call it on an explicit `success: false` — never on a thrown or lost
 * response, where the save may in fact have landed.
 */
export async function discardCourseImageUpload(path: string): Promise<void> {
  if (!path) return;
  try {
    const supabase = createClient();
    await supabase.storage.from(COURSE_IMAGE_BUCKET).remove([path]);
  } catch {
    /* best-effort: an orphaned object is untidy, never user-facing */
  }
}
