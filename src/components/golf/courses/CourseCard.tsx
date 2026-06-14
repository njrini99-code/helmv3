'use client';

import { cn } from '@/lib/utils';
import { CourseImage } from './CourseImage';
import { IconMapPin, IconFlag, IconStar, IconChevronRight, IconArrowRight } from '@/components/icons';
import type { GolfCourse } from '@/lib/types/golf-course';

/**
 * Image-forward course card (inspiration: premium golf-app course pickers —
 * real-photo hero, bold name overlaid, quiet metadata, one obvious tap target).
 *   • featured — tall cinematic card, title + meta overlaid on a scrimmed vista,
 *     with a glass "go" affordance. The whole card is the tap target.
 *   • standard — compact grid card, vista on top with the title beneath.
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
      // eslint-disable-next-line helm/no-raw-button -- full-bleed cinematic card is a single tap target
      <button
        type="button"
        onClick={handle}
        aria-label={`Open ${course.name}`}
        className={cn(
          'group relative block w-full overflow-hidden rounded-[1.5rem] text-left',
          'shadow-soft ring-1 ring-black/[0.06]',
          'transition-[transform,box-shadow] [transition-duration:var(--fw-dur-base)] [transition-timing-function:var(--fw-ease-glide)]',
          'hover:-translate-y-1.5 hover:shadow-pop active:-translate-y-0.5',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
          'motion-reduce:transition-none motion-reduce:hover:translate-y-0',
          className,
        )}
      >
        <div className="relative aspect-[4/5] w-full sm:aspect-[5/6]">
          <CourseImage
            name={course.name}
            imageUrl={course.image_url}
            scrim
            priority={priority}
            sizes="(max-width: 768px) 90vw, 380px"
            className="transition-transform [transition-duration:var(--fw-dur-slow)] [transition-timing-function:var(--fw-ease-glide)] group-hover:scale-[1.05] motion-reduce:group-hover:scale-100"
          />

          {/* Pinned marker (top-left) */}
          {pinned && (
            <span className="absolute left-3.5 top-3.5 inline-flex items-center gap-1 rounded-full bg-black/35 px-2.5 py-1 text-caption font-medium text-white ring-1 ring-white/15 backdrop-blur-sm">
              <IconStar size={12} aria-hidden /> Pinned
            </span>
          )}

          {/* Glass "go" affordance (top-right) — signals the whole card is tappable */}
          <span
            aria-hidden
            className="absolute right-3.5 top-3.5 grid h-9 w-9 place-items-center rounded-full bg-white/15 text-white ring-1 ring-white/25 backdrop-blur-md transition-[transform,background-color] [transition-duration:var(--fw-dur-fast)] group-hover:scale-110 group-hover:bg-white/30 motion-reduce:group-hover:scale-100"
          >
            <IconArrowRight size={16} aria-hidden />
          </span>

          {/* Bottom content */}
          <div className="absolute inset-x-0 bottom-0 p-4 sm:p-5">
            <h3 className="line-clamp-2 font-fw-display text-title-2 font-semibold leading-tight tracking-tight text-white [text-shadow:0_1px_4px_rgba(0,0,0,0.55)]">
              {course.name}
            </h3>
            {location && (
              <p className="mt-1.5 inline-flex items-center gap-1.5 font-fw-sans text-body-sm text-white/85 [text-shadow:0_1px_3px_rgba(0,0,0,0.45)]">
                <IconMapPin size={13} aria-hidden /> {location}
              </p>
            )}
            {(teeLabel || meta) && (
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                {teeLabel && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-caption font-medium text-white ring-1 ring-white/15 backdrop-blur-sm">
                    <IconFlag size={11} aria-hidden /> {teeLabel}
                  </span>
                )}
                {meta && (
                  <span className="inline-flex items-center rounded-full bg-white/15 px-2.5 py-1 text-caption font-medium text-white/90 ring-1 ring-white/15 backdrop-blur-sm">
                    {meta}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </button>
    );
  }

  // standard
  return (
    // eslint-disable-next-line helm/no-raw-button -- card is a single tap target
    <button
      type="button"
      onClick={handle}
      aria-label={`Open ${course.name}`}
      className={cn(
        'group relative flex w-full flex-col overflow-hidden rounded-fw-card text-left',
        'bg-surface border border-border-subtle shadow-flat',
        'transition-[transform,box-shadow] [transition-duration:var(--fw-dur-base)] [transition-timing-function:var(--fw-ease-glide)]',
        'hover:-translate-y-1 hover:shadow-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500',
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
          className="transition-transform [transition-duration:var(--fw-dur-slow)] [transition-timing-function:var(--fw-ease-glide)] group-hover:scale-[1.05] motion-reduce:group-hover:scale-100"
        />
        {pinned && (
          <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-black/35 px-2 py-0.5 text-caption font-medium text-white ring-1 ring-white/15 backdrop-blur-sm">
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
