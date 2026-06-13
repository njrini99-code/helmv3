'use client';

import { cn } from '@/lib/utils';
import { CourseImage } from './CourseImage';
import { IconMapPin, IconFlag, IconStar, IconChevronRight } from '@/components/icons';
import type { GolfCourse } from '@/lib/types/golf-course';

/**
 * Image-forward course card (inspiration: Dribbble golf-course libraries). Two
 * shapes:
 *   • featured — large cinematic card, title overlaid on a scrimmed photo.
 *   • standard — grid/carousel card, photo on top with the title beneath.
 * The photo (or scenic placeholder) is the hero; metadata stays quiet.
 */

function locationLabel(course: GolfCourse): string | null {
  const parts = [course.city, course.state].filter(Boolean);
  return parts.length ? parts.join(', ') : null;
}

export interface CourseCardProps {
  course: GolfCourse;
  teeCount?: number;
  variant?: 'featured' | 'standard';
  pinned?: boolean;
  /** Secondary line, e.g. "Played 4×" or "Last played Jun 2". */
  meta?: string;
  onSelect?: (courseId: string) => void;
  className?: string;
  priority?: boolean;
}

export function CourseCard({
  course,
  teeCount,
  variant = 'standard',
  pinned = false,
  meta,
  onSelect,
  className,
  priority = false,
}: CourseCardProps) {
  const location = locationLabel(course);
  const teeLabel =
    typeof teeCount === 'number' ? `${teeCount} ${teeCount === 1 ? 'tee' : 'tees'}` : null;

  const handle = () => onSelect?.(course.id);

  if (variant === 'featured') {
    return (
      // eslint-disable-next-line helm/no-raw-button -- full-bleed cinematic card needs a single clickable surface
      <button
        type="button"
        onClick={handle}
        aria-label={`Open ${course.name}`}
        className={cn(
          'group relative block w-full overflow-hidden rounded-fw-lg text-left',
          'shadow-soft ring-1 ring-black/5',
          'transition-[transform,box-shadow] [transition-duration:var(--fw-dur-base)] [transition-timing-function:var(--fw-ease-glide)]',
          'hover:-translate-y-1 hover:shadow-pop active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500',
          'motion-reduce:transition-none motion-reduce:hover:translate-y-0',
          className,
        )}
      >
        <div className="relative aspect-[16/10] w-full sm:aspect-[2/1]">
          <CourseImage
            name={course.name}
            imageUrl={course.image_url}
            scrim
            priority={priority}
            sizes="(max-width: 768px) 100vw, 720px"
            className="transition-transform [transition-duration:var(--fw-dur-slow)] [transition-timing-function:var(--fw-ease-glide)] group-hover:scale-[1.06] motion-reduce:group-hover:scale-100"
          />
          {pinned && (
            <span className="absolute left-4 top-4 inline-flex items-center gap-1 rounded-full bg-black/35 px-2.5 py-1 text-caption font-medium text-white backdrop-blur-sm">
              <IconStar size={12} aria-hidden /> Pinned
            </span>
          )}
          <div className="absolute inset-x-0 bottom-0 p-5">
            <h3 className="line-clamp-2 font-fw-display text-title-2 font-semibold tracking-tight text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.5)]">
              {course.name}
            </h3>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-body-sm text-white/85">
              {location && (
                <span className="inline-flex items-center gap-1">
                  <IconMapPin size={13} aria-hidden /> {location}
                </span>
              )}
              {teeLabel && (
                <span className="inline-flex items-center gap-1">
                  <IconFlag size={13} aria-hidden /> {teeLabel}
                </span>
              )}
              {meta && <span className="text-white/70">{meta}</span>}
            </div>
          </div>
        </div>
      </button>
    );
  }

  // standard
  return (
    // eslint-disable-next-line helm/no-raw-button -- card is a single clickable surface
    <button
      type="button"
      onClick={handle}
      aria-label={`Open ${course.name}`}
      className={cn(
        'group relative flex w-full flex-col overflow-hidden rounded-fw-card text-left',
        'bg-surface border border-border-subtle shadow-flat',
        'transition-[transform,box-shadow] [transition-duration:var(--fw-dur-base)] [transition-timing-function:var(--fw-ease-glide)]',
        'hover:-translate-y-0.5 hover:shadow-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500',
        'motion-reduce:transition-none motion-reduce:hover:translate-y-0',
        className,
      )}
    >
      <div className="relative aspect-[3/2] w-full">
        <CourseImage
          name={course.name}
          imageUrl={course.image_url}
          priority={priority}
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 360px"
          className="transition-transform [transition-duration:var(--fw-dur-slow)] [transition-timing-function:var(--fw-ease-glide)] group-hover:scale-[1.04] motion-reduce:group-hover:scale-100"
        />
        {pinned && (
          <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-black/35 px-2 py-0.5 text-caption font-medium text-white backdrop-blur-sm">
            <IconStar size={11} aria-hidden /> Pinned
          </span>
        )}
      </div>
      <div className="flex flex-1 items-center gap-2 px-4 py-3">
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-fw-sans text-body font-semibold tracking-[-0.01em] text-text-primary">
            {course.name}
          </h3>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0 text-caption text-text-tertiary">
            {location && (
              <span className="inline-flex min-w-0 items-center gap-1">
                <IconMapPin size={12} aria-hidden className="flex-shrink-0" />
                <span className="truncate">{location}</span>
              </span>
            )}
            {teeLabel && (
              <span className="inline-flex items-center gap-1">
                <IconFlag size={12} aria-hidden /> {teeLabel}
              </span>
            )}
          </div>
          {meta && <p className="mt-0.5 truncate text-caption text-text-tertiary">{meta}</p>}
        </div>
        <IconChevronRight
          size={16}
          aria-hidden
          className="flex-shrink-0 text-text-tertiary transition-transform [transition-duration:var(--fw-dur-fast)] group-hover:translate-x-0.5"
        />
      </div>
    </button>
  );
}
