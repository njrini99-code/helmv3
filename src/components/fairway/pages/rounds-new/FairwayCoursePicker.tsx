'use client';

/**
 * ============================================================================
 * Fairway · Rounds · FairwayCoursePicker — the premium "choose a course" screen
 * ----------------------------------------------------------------------------
 * The first thing you see after tapping "New round" in the redesign shell. A
 * full-screen, cinematic course chooser that replaces the plain TeePickerDrawer
 * list (flag-OFF still falls back to that list — see new-round-client.tsx).
 *
 * TWO STAGES, one sheet:
 *   • Stage A — a dark warm-black "cockpit" header (the figure) over a cream
 *     canvas (the ground) carrying an image-forward COVERFLOW: a native
 *     scroll-snap track of featured CourseCards where the centered card is
 *     full-size/opacity and its neighbours scale down, dim, and tilt by their
 *     distance from centre. The transforms are bound to scroll position via
 *     framer-motion `useScroll`/`useTransform` — compositor-driven, no
 *     per-frame layout reads, no React re-renders (the imperative
 *     getBoundingClientRect approach thrashed layout). The final slide is a
 *     dashed "Add a course" tile.
 *   • Stage B — choose a tee at the picked course. Reuses TeePickRow/SkeletonRows
 *     from TeePickerDrawer (single source of truth for that row), then returns
 *     the tee's TeeRoundDefaults via onPick so the round form pre-fills pars/
 *     yards and links golf_rounds.tee_id. The round still snapshots its holes.
 *
 * Motion runs under the dashboard's <LazyMotion features={domAnimation}> (m.*
 * + AnimatePresence). Every motion is gated on useReducedMotion — the coverflow
 * flattens to a plain full-opacity snap list, slides become opacity-only.
 * Accessibility follows the ARIA APG carousel pattern (region + roledescription,
 * per-slide group + position label, focusable track, polite live region).
 * Public props are IDENTICAL to TeePickerDrawer so the two are drop-in swappable.
 * ========================================================================== */

import {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import {
  m, AnimatePresence, useReducedMotion, useScroll, useTransform, useMotionValueEvent,
  type MotionValue,
} from 'framer-motion';
import { cn } from '@/lib/utils';
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer';
import { Button } from '@/components/fairway/controls/button';
import { useToast } from '@/components/ui/sonner';
import {
  IconSearch, IconPlus, IconChevronLeft, IconArrowLeft, IconArrowRight, IconFlag,
} from '@/components/icons';
import { CourseCard } from '@/components/golf/courses/CourseCard';
import { CourseFormDrawer } from '@/components/golf/courses/CourseFormDrawer';
import { TeeFormDrawer } from '@/components/golf/courses/TeeFormDrawer';
import { TeePickRow, SkeletonRows } from '@/components/golf/courses/TeePickerDrawer';
import {
  listCourses, getCourseDetail, getTeeRoundDefaults, type TeeRoundDefaults,
} from '@/app/golf/actions/course-library';
import { normalizeName } from '@/lib/golf/course-library';
import type { GolfCourse, GolfCourseTee } from '@/lib/types/golf-course';

export interface FairwayCoursePickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (defaults: TeeRoundDefaults) => void;
}

type Stage = 'courses' | 'tees';

export function FairwayCoursePicker({ open, onOpenChange, onPick }: FairwayCoursePickerProps) {
  const { showToast } = useToast();
  const reduceMotion = !!useReducedMotion();

  const [stage, setStage] = useState<Stage>('courses');
  const [courses, setCourses] = useState<GolfCourse[]>([]);
  const [loadingCourses, setLoadingCourses] = useState(false);
  const [query, setQuery] = useState('');

  const [selected, setSelected] = useState<GolfCourse | null>(null);
  const [tees, setTees] = useState<GolfCourseTee[]>([]);
  const [loadingTees, setLoadingTees] = useState(false);
  const [picking, setPicking] = useState(false);

  const [createCourseOpen, setCreateCourseOpen] = useState(false);
  const [createTeeOpen, setCreateTeeOpen] = useState(false);

  const refreshCourses = useCallback(async (): Promise<GolfCourse[]> => {
    setLoadingCourses(true);
    try {
      const next = await listCourses({ limit: 200 });
      setCourses(next);
      return next;
    } catch {
      showToast('Could not load the course library', 'error');
      return [];
    } finally {
      setLoadingCourses(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (!open) {
      setStage('courses');
      setSelected(null);
      setTees([]);
      setQuery('');
      return;
    }
    void refreshCourses();
  }, [open, refreshCourses]);

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return courses;
    const nq = normalizeName(q);
    const raw = q.toLowerCase();
    return courses.filter((c) =>
      `${c.name} ${c.city ?? ''} ${c.state ?? ''}`.toLowerCase().includes(raw) ||
      (c.normalized_name ?? normalizeName(c.name)).includes(nq),
    );
  }, [courses, query]);

  const loadTees = useCallback(async (course: GolfCourse) => {
    setLoadingTees(true);
    setTees([]);
    try {
      const detail = await getCourseDetail(course.id);
      setTees(detail?.tees ?? []);
    } catch {
      showToast('Could not load tees for that course', 'error');
    } finally {
      setLoadingTees(false);
    }
  }, [showToast]);

  const selectCourse = useCallback(async (course: GolfCourse) => {
    setSelected(course);
    setStage('tees');
    await loadTees(course);
  }, [loadTees]);

  const backToCourses = useCallback(() => {
    setStage('courses');
    setSelected(null);
    setTees([]);
  }, []);

  const pickTee = useCallback(async (tee: GolfCourseTee) => {
    setPicking(true);
    try {
      const defaults = await getTeeRoundDefaults(tee.id);
      if (!defaults) { showToast('Could not load that tee', 'error'); return; }
      onPick(defaults);
      onOpenChange(false);
    } catch {
      showToast('Could not load that tee', 'error');
    } finally {
      setPicking(false);
    }
  }, [onPick, onOpenChange, showToast]);

  // A freshly created course has no tees — drop the user straight into its tee
  // stage so adding the tee they're about to play is the obvious next step.
  const handleCourseCreated = useCallback(async (course: GolfCourse) => {
    setCreateCourseOpen(false);
    const next = await refreshCourses();
    const fresh = next.find((c) => c.id === course.id) ?? course;
    await selectCourse(fresh);
  }, [refreshCourses, selectCourse]);

  const heroTitle = stage === 'tees' && selected ? selected.name : 'Choose a course.';
  const heroDesc = stage === 'tees'
    ? 'Pick the tee set you played — it pre-fills your pars and yardages.'
    : 'Pick from the shared library, or add a new course in seconds.';

  const stageMotion = reduceMotion
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.12 } }
    : {
        initial: { opacity: 0, y: 10 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -8 },
        transition: { duration: 0.22, ease: [0.16, 1, 0.3, 1] as const },
      };

  return (
    <>
      {/* shouldScaleBackground off: the sheet is full-screen (background scale is
          invisible) and it avoids compounding transforms when CourseForm/TeeForm
          drawers stack on top. */}
      <Drawer open={open} onOpenChange={onOpenChange} shouldScaleBackground={false}>
        <DrawerContent
          className={cn(
            // Full-screen on mobile — override the base sheet's mt-24 top gap
            // (a bottom-anchored fixed element + mt-24 would clip the top 6rem).
            'mt-0 h-[100dvh] max-h-[100dvh] w-screen max-w-none rounded-none p-0',
            'sm:mx-auto sm:mt-24 sm:h-auto sm:max-h-[92vh] sm:w-full sm:max-w-3xl sm:rounded-fw-lg',
          )}
        >
          <DrawerTitle className="sr-only">
            {stage === 'tees' && selected ? `Choose a tee at ${selected.name}` : 'Choose a course'}
          </DrawerTitle>

          <div className="flex min-h-0 flex-1 flex-col px-4 pb-4 pt-1 sm:px-6 sm:pb-6">
            {/* Cinematic dark cockpit header (the figure). */}
            <header className="on-dark relative overflow-hidden rounded-card bg-nav-bg px-6 py-6 text-nav-text shadow-soft sm:px-7">
              <div aria-hidden className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-accent-500/15 blur-[70px]" />
              <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/[0.06]" />

              <div className="relative flex items-start gap-3">
                {stage === 'tees' && (
                  // eslint-disable-next-line helm/no-raw-button -- compact icon back-affordance on the dark header
                  <button
                    type="button"
                    onClick={backToCourses}
                    aria-label="Back to courses"
                    className="mt-0.5 inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-nav-text/80 transition-colors hover:bg-white/10 hover:text-nav-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
                  >
                    <IconChevronLeft size={18} aria-hidden />
                  </button>
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-fw-sans text-eyebrow font-semibold uppercase tracking-[0.18em] text-nav-accent">
                    New round · Course
                  </p>
                  <h1 className="mt-2 truncate font-fw-display text-h2 font-semibold leading-tight tracking-[-0.01em] text-nav-text">
                    {heroTitle}
                  </h1>
                  <p className="mt-2 max-w-lg font-fw-sans text-body-sm text-nav-text-dim">{heroDesc}</p>
                </div>
              </div>

              {/* Search — Stage A only, sunk into the dark band. */}
              {stage === 'courses' && (
                <div className="relative mt-5">
                  <IconSearch size={16} aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-nav-text/55" />
                  {/* eslint-disable-next-line helm/no-raw-input -- native type=search with a leading icon, dark-band styled */}
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search courses…"
                    aria-label="Search courses"
                    className="h-11 w-full rounded-full border border-white/10 bg-white/[0.06] pl-10 pr-4 text-body text-nav-text placeholder:text-nav-text/45 focus:border-accent-500/60 focus:outline-none focus:ring-2 focus:ring-accent-500/30"
                  />
                </div>
              )}
            </header>

            {/* Body (the ground) — stage transition. */}
            <div className="relative mt-4 flex min-h-0 flex-1 flex-col">
              <AnimatePresence mode="wait" initial={false}>
                <m.div key={stage} {...stageMotion} className="flex min-h-0 flex-1 flex-col">
                  {stage === 'courses'
                    ? <CoursesStage
                        loading={loadingCourses}
                        courses={courses}
                        filtered={filtered}
                        query={query}
                        reduceMotion={reduceMotion}
                        onSelect={(id) => {
                          const c = courses.find((x) => x.id === id);
                          if (c) void selectCourse(c);
                        }}
                        onCreate={() => setCreateCourseOpen(true)}
                      />
                    : <TeesStage
                        loading={loadingTees}
                        tees={tees}
                        picking={picking}
                        onPick={pickTee}
                        onAddTee={() => setCreateTeeOpen(true)}
                      />}
                </m.div>
              </AnimatePresence>
            </div>
          </div>
        </DrawerContent>
      </Drawer>

      {/* Grow the shared catalog from inside the flow. */}
      <CourseFormDrawer
        open={createCourseOpen}
        onOpenChange={setCreateCourseOpen}
        mode="create"
        onSaved={(course) => { void handleCourseCreated(course); }}
      />

      {/* Add the tee you're about to play to a (often freshly created) course. */}
      {selected && (
        <TeeFormDrawer
          open={createTeeOpen}
          onOpenChange={setCreateTeeOpen}
          mode="create"
          courseId={selected.id}
          onSaved={() => { setCreateTeeOpen(false); if (selected) void loadTees(selected); }}
        />
      )}
    </>
  );
}

// ── Stage A: the cinematic coverflow ────────────────────────────────────────

// Premium falloff (centre → neighbour). Eased via the useTransform ranges; flat
// scale + opacity + a SUBTLE 3D tilt keeps neighbour photos legible (Material 3
// doesn't rotate at all; full Apple ±45° would foreshorten the image content).
const CF_SCALE_EDGE = 0.86;   // neighbour scale (centre = 1)
const CF_OPACITY_EDGE = 0.55; // neighbour opacity (centre = 1)
const CF_ROTATE = 12;         // deg tilt at one card away
const CF_TRANSLATE_Z = -55;   // px push-back at one card away

function CoursesStage({
  loading, courses, filtered, query, reduceMotion, onSelect, onCreate,
}: {
  loading: boolean;
  courses: GolfCourse[];
  filtered: GolfCourse[];
  query: string;
  reduceMotion: boolean;
  onSelect: (courseId: string) => void;
  onCreate: () => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const { scrollXProgress } = useScroll({ container: trackRef });

  const count = filtered.length + 1; // courses + the "add a course" tile
  const [active, setActive] = useState(0);

  useMotionValueEvent(scrollXProgress, 'change', (p) => {
    const idx = count > 1 ? Math.round(p * (count - 1)) : 0;
    const clamped = Math.max(0, Math.min(count - 1, idx));
    setActive((prev) => (prev !== clamped ? clamped : prev));
  });

  // Reset to the first slide when the result set changes.
  useEffect(() => { setActive(0); }, [filtered.length]);

  const scrollToIndex = useCallback((i: number) => {
    const track = trackRef.current;
    if (!track) return;
    const clamped = Math.max(0, Math.min(track.children.length - 1, i));
    const el = track.children[clamped] as HTMLElement | undefined;
    el?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', inline: 'center', block: 'nearest' });
  }, [reduceMotion]);

  // Progress rail (never fully empty so it reads as a track, not a glitch).
  const railScaleX = useTransform(scrollXProgress, [0, 1], [0.08, 1]);

  const enter = (i: number) =>
    reduceMotion
      ? {}
      : {
          initial: { opacity: 0, y: 18 },
          animate: { opacity: 1, y: 0 },
          transition: { type: 'spring' as const, stiffness: 300, damping: 26, delay: Math.min(i, 7) * 0.05 },
        };

  if (loading) {
    return (
      <div className="flex gap-4 overflow-hidden px-[6vw] py-3 sm:px-[16%]">
        {[0, 1].map((i) => (
          <div
            key={i}
            className="aspect-[16/10] w-[88vw] flex-shrink-0 animate-pulse rounded-fw-lg bg-surface-sunken sm:aspect-[2/1] sm:w-full"
          />
        ))}
      </div>
    );
  }

  if (courses.length === 0) {
    return <EmptyCourses onCreate={onCreate} />;
  }

  if (filtered.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
        <p className="font-fw-sans text-body text-text-secondary">
          No courses match “{query.trim()}”.
        </p>
        <p className="mt-1 font-fw-sans text-body-sm text-text-tertiary">
          Add it to the shared library so it’s there next time.
        </p>
        <Button variant="primary" className="mt-5" onClick={onCreate}>
          <IconPlus size={16} aria-hidden /> Add “{query.trim()}”
        </Button>
      </div>
    );
  }

  const activeName = active < filtered.length ? filtered[active]?.name ?? 'Course' : 'Add a course';

  return (
    <div className="relative flex flex-1 flex-col justify-center">
      <CarouselArrow side="left" show={active > 0} onClick={() => scrollToIndex(active - 1)} />
      <CarouselArrow side="right" show={active < count - 1} onClick={() => scrollToIndex(active + 1)} />

      <div
        ref={trackRef}
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a scrollable region MUST be focusable for keyboard scrolling; Safari (unlike Chrome) does not add this implicitly (WCAG 2.1.1, ACT 0ssw9k)
        tabIndex={0}
        role="region"
        aria-roledescription="carousel"
        aria-label="Course library"
        className={cn(
          'flex snap-x snap-mandatory items-stretch gap-4 overflow-x-auto overscroll-x-contain scroll-smooth',
          'px-[6vw] py-3 sm:px-[16%]',
          'focus-visible:outline-none',
          '[scrollbar-width:none] [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:hidden',
          'motion-reduce:scroll-auto',
        )}
      >
        {filtered.map((course, i) => (
          <CoverflowSlide
            key={course.id}
            index={i}
            count={count}
            progress={scrollXProgress}
            reduceMotion={reduceMotion}
            ariaLabel={`${course.name}, ${i + 1} of ${count}`}
            enter={enter(i)}
          >
            <CourseCard course={course} variant="featured" priority={i === 0} onSelect={onSelect} />
          </CoverflowSlide>
        ))}

        {/* Final slide — add a new course. */}
        <CoverflowSlide
          index={filtered.length}
          count={count}
          progress={scrollXProgress}
          reduceMotion={reduceMotion}
          ariaLabel={`Add a course, ${count} of ${count}`}
          enter={enter(filtered.length)}
        >
          <CreateCourseTile onClick={onCreate} />
        </CoverflowSlide>
      </div>

      {/* Scroll affordance + screen-reader position. */}
      <div className="mt-3 flex flex-col items-center gap-2">
        <div className="h-1 w-24 overflow-hidden rounded-full bg-border-subtle">
          <m.div
            aria-hidden
            className="h-full w-full origin-left rounded-full bg-accent-500 motion-reduce:hidden"
            style={{ scaleX: railScaleX }}
          />
        </div>
        <p className="font-fw-sans text-caption text-text-tertiary">
          {active + 1} of {count} · swipe to browse
        </p>
        <p className="sr-only" aria-live="polite" aria-atomic="true">
          {activeName}, {active + 1} of {count}
        </p>
      </div>
    </div>
  );
}

/**
 * One coverflow slide. The OUTER box is the untransformed scroll-snap item (so
 * snap geometry stays stable); the entrance layer owns the spring fade-in +
 * perspective; the inner layer binds scale/opacity/rotateY/translateZ to scroll
 * position. Splitting entrance (mount) from coverflow (scroll) avoids fighting
 * over the same animated properties.
 */
function CoverflowSlide({
  index, count, progress, reduceMotion, ariaLabel, enter, children,
}: {
  index: number;
  count: number;
  progress: MotionValue<number>;
  reduceMotion: boolean;
  ariaLabel: string;
  enter: Record<string, unknown>;
  children: React.ReactNode;
}) {
  const center = count > 1 ? index / (count - 1) : 0;
  const step = count > 1 ? 1 / (count - 1) : 1;
  const input = [center - step, center, center + step];

  // Hooks must run unconditionally; we just don't apply the output under reduced motion.
  const scale = useTransform(progress, input, [CF_SCALE_EDGE, 1, CF_SCALE_EDGE]);
  const opacity = useTransform(progress, input, [CF_OPACITY_EDGE, 1, CF_OPACITY_EDGE]);
  const rotateY = useTransform(progress, input, [CF_ROTATE, 0, -CF_ROTATE]);
  const z = useTransform(progress, input, [CF_TRANSLATE_Z, 0, CF_TRANSLATE_Z]);

  return (
    <div
      role="group"
      aria-roledescription="slide"
      aria-label={ariaLabel}
      className="snap-always shrink-0 basis-[88vw] snap-center sm:basis-[clamp(420px,68%,560px)]"
    >
      <m.div {...enter} className="[perspective:1200px]">
        <m.div
          className="origin-center [transform-style:preserve-3d]"
          style={reduceMotion ? undefined : { scale, opacity, rotateY, z }}
        >
          {children}
        </m.div>
      </m.div>
    </div>
  );
}

function CarouselArrow({ side, show, onClick }: { side: 'left' | 'right'; show: boolean; onClick: () => void }) {
  return (
    // eslint-disable-next-line helm/no-raw-button -- floating carousel control, hidden on touch
    <button
      type="button"
      onClick={onClick}
      aria-label={side === 'left' ? 'Previous course' : 'Next course'}
      tabIndex={show ? 0 : -1}
      className={cn(
        'absolute top-1/2 z-10 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full sm:flex',
        'border border-border-subtle bg-surface/90 text-text-secondary shadow-soft backdrop-blur',
        'transition-[opacity,transform] [transition-duration:var(--fw-dur-fast)] hover:scale-105 hover:text-text-primary active:scale-95',
        'motion-reduce:transition-none motion-reduce:hover:scale-100',
        side === 'left' ? 'left-0' : 'right-0',
        show ? 'opacity-100' : 'pointer-events-none opacity-0',
      )}
    >
      {side === 'left' ? <IconArrowLeft size={18} aria-hidden /> : <IconArrowRight size={18} aria-hidden />}
    </button>
  );
}

function CreateCourseTile({ onClick }: { onClick: () => void }) {
  return (
    // eslint-disable-next-line helm/no-raw-button -- full-bleed tile matching the featured CourseCard footprint
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group flex aspect-[16/10] w-full flex-col items-center justify-center gap-3 rounded-fw-lg text-center sm:aspect-[2/1]',
        'border-2 border-dashed border-border-strong bg-surface-sunken',
        'transition-[transform,border-color,background-color] [transition-duration:var(--fw-dur-base)] [transition-timing-function:var(--fw-ease-glide)]',
        'hover:-translate-y-1 hover:border-accent-500 hover:bg-accent-50/60 active:translate-y-0',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500',
        'motion-reduce:transition-none motion-reduce:hover:translate-y-0',
      )}
    >
      <span className="grid h-12 w-12 place-items-center rounded-full bg-surface text-primary-600 shadow-flat transition-[transform,background-color,color] [transition-duration:var(--fw-dur-base)] group-hover:scale-110 group-hover:bg-accent-500 group-hover:text-white motion-reduce:group-hover:scale-100">
        <IconPlus size={22} aria-hidden />
      </span>
      <span className="font-fw-display text-title-3 font-semibold text-text-primary">Add a course</span>
      <span className="max-w-[16rem] font-fw-sans text-body-sm text-text-tertiary">
        Can’t find it? Add the facility to the shared library.
      </span>
    </button>
  );
}

function EmptyCourses({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
      <span className="mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-accent-50 text-accent-700">
        <IconFlag size={24} aria-hidden />
      </span>
      <h2 className="font-fw-display text-h3 font-semibold tracking-[-0.01em] text-text-primary">
        No courses yet
      </h2>
      <p className="mt-2 max-w-sm font-fw-sans text-body-sm text-text-tertiary">
        Add the first course to the shared library — everyone on your team can play it from here.
      </p>
      <Button variant="primary" className="mt-6" onClick={onCreate}>
        <IconPlus size={16} aria-hidden /> Add a course
      </Button>
    </div>
  );
}

// ── Stage B: choose a tee (rows reused from TeePickerDrawer) ─────────────────

function TeesStage({
  loading, tees, picking, onPick, onAddTee,
}: {
  loading: boolean;
  tees: GolfCourseTee[];
  picking: boolean;
  onPick: (tee: GolfCourseTee) => void;
  onAddTee: () => void;
}) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-2">
      {loading ? (
        <SkeletonRows />
      ) : tees.length === 0 ? (
        <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
          <span className="mb-4 grid h-12 w-12 place-items-center rounded-full bg-accent-50 text-accent-700">
            <IconFlag size={20} aria-hidden />
          </span>
          <p className="font-fw-sans text-body font-medium text-text-primary">No tee sets yet</p>
          <p className="mt-1 max-w-sm font-fw-sans text-body-sm text-text-tertiary">
            Add the tee you played to start the round and grow the course for your team.
          </p>
          <Button variant="primary" className="mt-5" onClick={onAddTee}>
            <IconPlus size={16} aria-hidden /> Add a tee set
          </Button>
        </div>
      ) : (
        <>
          <ul className="space-y-2">
            {tees.map((tee) => (
              <li key={tee.id}>
                <TeePickRow tee={tee} disabled={picking} onClick={() => onPick(tee)} />
              </li>
            ))}
          </ul>
          <div className="mt-4 flex justify-center">
            <Button variant="ghost" size="sm" onClick={onAddTee}>
              <IconPlus size={15} aria-hidden /> Add another tee set
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
