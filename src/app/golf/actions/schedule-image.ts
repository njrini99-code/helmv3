'use server';

import { createClient } from '@/lib/supabase/server';
import { withAdminObserved } from '@/lib/admin/observed-action';
import { gateUserAction, VISION_EXTRACT_RATE_LIMIT } from '@/lib/auth/action-rate-limit';
import { logServerError, logServerException } from '@/lib/server-error-logger';
import { classifyProviderFault, providerFaultSeverity } from '@/lib/admin/provider-fault';
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

  // DS-06: auth was the only gate on the one call in the app that runs a vision
  // model over ~12MB of images — twice per invocation (reconcileDays does a
  // second pass). recordVisionSpend only logs after the fact and never blocks,
  // so an authenticated caller (including the shared demo account) could loop
  // this and burn model spend. Hourly per-user cap, before any model call.
  const gate = await gateUserAction(
    'schedule_vision',
    user.id,
    VISION_EXTRACT_RATE_LIMIT,
    'Too many schedule uploads. Please try again later.',
  );
  if (!gate.allowed) {
    return { success: false, error: gate.error };
  }

  try {
    // Attribution for the spend ledger only. `maybeSingle` and a plain `??
    // null`: a coach importing on a player's behalf has no golf_players row,
    // and that must log an unattributed call rather than fail the import.
    const { data: player } = await supabase
      .from('golf_players')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    const extraction = await extractScheduleFromImage(images, player?.id ?? null);

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
    // "Try again in a moment" was a lie on an exhausted model account: the
    // student's screenshot was fine, retrying could never work, and the reason
    // it failed was a billing state nobody on this side of the screen can fix.
    // Say so, and point at the one route that still works today.
    const fault = classifyProviderFault(error);
    if (fault) {
      void logServerError(
        `schedule image import unavailable: ${fault.summary}`,
        {
          action: 'schedule_image.extractClassesFromScheduleImage',
          source: 'server_action',
          sport: 'golf',
          feature: 'academics_classes',
          featureArea: 'classes',
          errorCode: fault.code,
          skipSentry: providerFaultSeverity(fault).skipSentry,
          extra: { providerFaultKind: fault.kind, provider: fault.provider },
        },
        providerFaultSeverity(fault).severity,
      );
      return {
        success: false,
        error: `${fault.summary} Your schedule can still be added with the Paste Text option.`,
      };
    }

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
