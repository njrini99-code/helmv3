import Image from 'next/image';
import { cn } from '@/lib/utils';
import {
  resolveRealCourseImage,
  resolveDefaultCourseImage,
} from '@/lib/golf/course-image-assets';

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
  const src =
    (imageUrl && imageUrl.trim()) ||
    resolveRealCourseImage(name, normalizedName) ||
    resolveDefaultCourseImage(name);

  return (
    <div className={cn('relative isolate h-full w-full overflow-hidden bg-surface-sunken', className)}>
      <Image
        src={src}
        alt={`${name} course photo`}
        fill
        sizes={sizes}
        priority={priority}
        className="object-cover"
      />

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
