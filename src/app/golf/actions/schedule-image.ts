'use server';

import { createClient } from '@/lib/supabase/server';
import { withAdminObserved } from '@/lib/admin/observed-action';
import { logServerException } from '@/lib/server-error-logger';
import {
  extractScheduleFromImage,
  mapExtractionToParsedClasses,
  type ScheduleImageInput,
} from '@/lib/golf/schedule-vision';
import type { ParsedClass } from '@/lib/utils/schedule-parser';

export interface ScheduleImageResult {
  success: boolean;
  classes?: ParsedClass[];
  warnings?: string[];
  error?: string;
}

const ALLOWED_MEDIA_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]);

// The client downscales/re-encodes before upload, so these are backstops
// against a bypassing caller, not limits a real user should ever hit.
const MAX_IMAGES = 6;
const MAX_TOTAL_BASE64_CHARS = 16 * 1024 * 1024; // ~12MB of image data

/**
 * Reads a screenshot/photo of a class schedule and returns classes in the
 * same ParsedClass shape the PDF/text parser produces, so the existing
 * confirm → save → calendar-sync pipeline is reused unchanged.
 *
 * `images` is usually a single image; a tall scrolling capture arrives as
 * sequential overlapping slices (the model is told to merge them).
 */
async function extractClassesFromScheduleImageImpl(
  images: ScheduleImageInput[],
): Promise<ScheduleImageResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'You must be signed in to import a schedule.' };
  }

  if (!Array.isArray(images) || images.length === 0 || images.length > MAX_IMAGES) {
    return { success: false, error: 'Please upload one schedule image.' };
  }
  let totalChars = 0;
  for (const img of images) {
    if (!img || typeof img.base64 !== 'string' || !ALLOWED_MEDIA_TYPES.has(img.mediaType)) {
      return {
        success: false,
        error: 'Unsupported image type. Please upload a PNG, JPG, or WebP screenshot.',
      };
    }
    totalChars += img.base64.length;
  }
  if (totalChars === 0 || totalChars > MAX_TOTAL_BASE64_CHARS) {
    return {
      success: false,
      error: 'That image is too large to process. Please upload an image under 12MB.',
    };
  }

  try {
    const extraction = await extractScheduleFromImage(images);

    if (!extraction.is_class_schedule) {
      const kind = extraction.document_kind.trim();
      return {
        success: false,
        error: `This doesn't look like a class schedule${kind ? ` (it reads as: ${kind})` : ''}. Please upload a screenshot of your class schedule.`,
      };
    }

    const mapped = mapExtractionToParsedClasses(extraction);
    if (mapped.classes.length === 0) {
      return {
        success: false,
        error:
          'No classes could be read from this image. Try a clearer, closer screenshot — or use the Paste Text option.',
      };
    }

    return { success: true, classes: mapped.classes, warnings: mapped.warnings };
  } catch (error) {
    void logServerException(error, {
      action: 'schedule_image.extractClassesFromScheduleImage',
      source: 'server_action',
      sport: 'golf',
      feature: 'academics_classes',
      featureArea: 'classes',
    });
    return {
      success: false,
      error:
        "Couldn't read this image right now. Please try again in a moment, or use the Paste Text option.",
    };
  }
}

// Helm Bridge observability wrapper (foundation coverage contract — every
// non-CRM golf action is withAdminObserved-wrapped with its FeatureKey). The
// impl above already returns friendly errors (and logs swallowed ones via
// logServerException); this wrapper adds the standard action-level trace.
const observedExtractClassesFromScheduleImage = withAdminObserved(
  'extractClassesFromScheduleImage',
  { sport: 'golf', feature: 'academics_classes', featureArea: 'classes' },
  extractClassesFromScheduleImageImpl,
);

export async function extractClassesFromScheduleImage(
  images: ScheduleImageInput[],
): Promise<ScheduleImageResult> {
  return observedExtractClassesFromScheduleImage(images);
}
