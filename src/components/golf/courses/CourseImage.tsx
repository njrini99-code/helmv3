'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/fairway/feedback/Skeleton';
import {
  resolveRealCourseImage,
  resolveDefaultCourseImage,
} from '@/lib/golf/course-image-assets';

const MINOR_WORDS = new Set([
  'a', 'an', 'and', 'at', 'by', 'for', 'in', 'of', 'on', 'or', 'the', 'to',
]);

/**
 * Normalizes a course name's casing for display (#157) — imported/enrichment
 * data sometimes lands ALL CAPS or all-lowercase, so sibling cards can show
 * wildly inconsistent casing next to properly-cased ones. Only fully-upper or
 * fully-lower TOKENS are re-cased; a token that's already mixed case (e.g.
 * "TPC", "McDowell") is left untouched so real acronyms and surnames survive.
 * Short all-caps tokens (<=3 letters, e.g. "GC", "TPC") are also left alone —
 * those are acronyms, not a name someone forgot to case.
 */
export function formatCourseName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return trimmed;
  return trimmed
    .split(/\s+/)
    .map((word, i) => {
      const letters = word.replace(/[^A-Za-z]/g, '');
      if (!letters) return word;
      const isAllUpper = word === word.toUpperCase() && word !== word.toLowerCase();
      const isAllLower = word === word.toLowerCase() && word !== word.toUpperCase();
      if (!isAllUpper && !isAllLower) return word; // already mixed-case — leave it
      const lower = word.toLowerCase();
      const isKnownWord = MINOR_WORDS.has(lower);
      // Short all-caps acronym (GC, TPC) — but only when it ISN'T also one of
      // the minor words ("AT", "THE" are 2-3 letters too, and those SHOULD
      // still get title/lower-cased like a normal word, not preserved as if
      // they were acronyms).
      if (isAllUpper && letters.length <= 3 && !isKnownWord) return word;
      if (i > 0 && isKnownWord) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

/**
 * The visual heart of every course surface. Resolves a real photo with a clear
 * precedence so a card is never a flat placeholder:
 *
 *   1. uploaded photo (`imageUrl`, a Supabase public URL) — a coach's own shot
 *   2. bundled real-course photo (matched on normalized name) — e.g. Pebble,
 *      Kiawah, Whistling Straits, where a genuinely good free photo exists
 *   3. cinematic default (deterministic by name) — a curated, free-for-commercial
 *      golf scene, so every course still looks scenic and distinct
 *
 * GRACEFUL DEGRADATION (client component): the uploaded URL is user-supplied and
 * the realistic failure path (deleted object, bucket perms, expired link). If it
 * 404s we fall through to the bundled real/default photo; if even that fails we
 * paint a warm accent gradient + the course initial, so a card is NEVER a broken
 * image box. Bundled assets are committed local .webp, so the gradient tier is a
 * belt-and-braces last resort.
 *
 * All imagery is free for commercial use (CC0 / public domain / CC BY / CC BY-SA);
 * see public/courses/CREDITS.md. A bottom scrim is available for overlaid text.
 */

export interface CourseImageProps {
  name: string;
  imageUrl?: string | null;
  /** Stored golf_normalize_name(name); enables real-course photo matching. */
  normalizedName?: string | null;
  /** Adds a bottom-up dark scrim for legible overlaid text (hero cards). */
  scrim?: boolean;
  /** next/image sizes hint. */
  sizes?: string;
  priority?: boolean;
  className?: string;
}

export function CourseImage({
  name,
  imageUrl,
  normalizedName,
  scrim = false,
  sizes = '(max-width: 768px) 100vw, 400px',
  priority = false,
  className,
}: CourseImageProps) {
  const uploaded = imageUrl && imageUrl.trim() ? imageUrl.trim() : null;
  const bundled = resolveRealCourseImage(name, normalizedName) || resolveDefaultCourseImage(name);

  const [uploadFailed, setUploadFailed] = useState(false);
  const [bundledFailed, setBundledFailed] = useState(false);
  // #32 — the photo itself (not just the courses list) can take a couple of
  // seconds to paint on a slow connection; track its own load so we can hold
  // a shimmer skeleton over the slot instead of a flat bg-surface-sunken box.
  const [loaded, setLoaded] = useState(false);

  const useUploaded = !!uploaded && !uploadFailed;
  const src = useUploaded ? uploaded! : bundled;
  // Final tier — both the upload (if any) and the bundled asset failed to load.
  const showGradient = (!uploaded || uploadFailed) && bundledFailed;

  // Re-arm the shimmer whenever the source tier changes (uploaded → bundled),
  // since that's a brand-new image request.
  useEffect(() => {
    setLoaded(false);
  }, [src]);

  return (
    <div className={cn('relative isolate h-full w-full overflow-hidden bg-surface-sunken', className)}>
      {showGradient ? (
        <div
          aria-hidden
          className="absolute inset-0 grid place-items-center bg-[linear-gradient(135deg,var(--fw-color-accent-200),var(--fw-color-accent-600))]"
        >
          <span className="font-fw-display text-5xl font-semibold text-white/90">
            {formatCourseName(name).charAt(0).toUpperCase() || '⛳'}
          </span>
        </div>
      ) : (
        <>
          {!loaded && (
            <Skeleton className="absolute inset-0 h-full w-full rounded-none" />
          )}
          <Image
            // Remount when the source tier changes so onError re-arms for the new src.
            key={src}
            src={src}
            alt={`${name} course photo`}
            fill
            sizes={sizes}
            priority={priority}
            className={cn('object-cover transition-opacity duration-300', loaded ? 'opacity-100' : 'opacity-0')}
            onLoad={() => setLoaded(true)}
            onError={() => {
              // Degrade one tier: uploaded → bundled → gradient.
              setLoaded(false);
              if (useUploaded) setUploadFailed(true);
              else setBundledFailed(true);
            }}
          />
        </>
      )}

      {scrim && (
        // Eased multi-stop bottom scrim — guarantees legible overlaid text across
        // any photo while keeping the top of the image clean.
        <div
          aria-hidden
          className="absolute inset-0 bg-[linear-gradient(to_top,rgba(8,18,12,0.82)_0%,rgba(8,18,12,0.58)_16%,rgba(8,18,12,0.28)_38%,rgba(8,18,12,0.07)_58%,transparent_72%)]"
        />
      )}
    </div>
  );
}
