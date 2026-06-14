'use client';

/**
 * ============================================================================
 * Fairway · Rounds · FairwayCoursePicker — the premium "choose a course" screen
 * ----------------------------------------------------------------------------
 * The first thing you see after tapping "New round" in the redesign shell. A
 * full-screen, cinematic course chooser that replaces the plain TeePickerDrawer
 * list (flag-OFF still falls back to that list — see new-round-client.tsx).
 *
 * TWO STAGES, one full-page surface (the picker IS the page, not an overlay):
 *   • Stage A — a dark warm-black "cockpit" header (the figure) over a cream
 *     canvas (the ground) carrying THREE labelled feeds, ONE image-forward
 *     COVERFLOW carousel each: "Recently played", "Team courses", and the full
 *     "Course library" (which ends in a dashed "Add a course" tile). Searching
 *     collapses to a single results carousel. Each coverflow is a native
 *     scroll-snap track of featured CourseCards where the centred card is
 *     full-size/opacity and its neighbours scale down, dim, and tilt by their
 *     distance from centre. The coverflow transforms are written IMPERATIVELY
 *     (one rAF per scroll frame) to each slide's inner element — deliberately
 *     NOT via framer-motion useScroll/useTransform, which require the scroll
 *     container ref to be hydrated at hook-call time and crash under concurrent
 *     React when the track is conditionally rendered (React #310).
 *   • Stage B — choose a tee at the picked course. Reuses TeePickRow/SkeletonRows
 *     from TeePickerDrawer (single source of truth for that row), then returns
 *     the tee's TeeRoundDefaults via onPick so the round form pre-fills pars/
 *     yards and links golf_rounds.tee_id. The round still snapshots its holes.
 *
 * Only framer-motion usage is the `m` entrance + AnimatePresence stage swap +
 * useReducedMotion (all proven safe under the dashboard LazyMotion). Every
 * motion is reduced-motion gated (coverflow flattens to a plain snap list).
 * Accessibility follows the ARIA APG carousel pattern (region + roledescription,
 * per-slide group + position, focusable track, polite live region).
 * Public props are IDENTICAL to TeePickerDrawer so the two are drop-in swappable.
 * ========================================================================== */

import {
  useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState,
} from 'react';
import { m, AnimatePresence, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer';
import { Button } from '@/components/fairway/controls/button';
import { useToast } from '@/components/ui/sonner';
import {
  IconSearch, IconPlus, IconChevronLeft, IconArrowLeft, IconArrowRight, IconFlag, IconX,
} from '@/components/icons';
import { CourseCard } from '@/components/golf/courses/CourseCard';
import { CourseFormDrawer } from '@/components/golf/courses/CourseFormDrawer';
import { TeeFormDrawer } from '@/components/golf/courses/TeeFormDrawer';
import { TeePickRow, SkeletonRows } from '@/components/golf/courses/TeePickerDrawer';
import {
  listCourses, getRecentlyPlayedCourses, getTeamSavedCourses,
  getCourseDetail, getTeeRoundDefaults, type TeeRoundDefaults,
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
  // useToast() returns a FRESH object (new showToast identity) every render, so
  // depending on `showToast` in a useCallback re-creates that callback every
  // render. The course-load effect below keys off refreshCourses — an unstable
  // refreshCourses makes the effect re-fire every render, thrashing
  // loadingCourses and refetching the library in a loop. Keep the latest
  // showToast in a ref so the data callbacks stay referentially stable.
  const showToastRef = useRef(showToast);
  showToastRef.current = showToast;
  const reduceMotion = !!useReducedMotion();

  const [stage, setStage] = useState<Stage>('courses');
  const [courses, setCourses] = useState<GolfCourse[]>([]);     // full shared library
  const [recent, setRecent] = useState<GolfCourse[]>([]);       // this player's recently played
  const [team, setTeam] = useState<GolfCourse[]>([]);           // the team's saved courses
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
      // Three independent feeds, one carousel each. Recent/team are best-effort:
      // a player with no cloud-linked rounds or no saved team courses just sees
      // those sections hidden — the library always renders.
      const [lib, rec, tm] = await Promise.all([
        listCourses({ limit: 200 }),
        getRecentlyPlayedCourses(12).catch(() => [] as GolfCourse[]),
        getTeamSavedCourses().then((rows) => rows.map((r) => r.course)).catch(() => [] as GolfCourse[]),
      ]);
      setCourses(lib);
      setRecent(rec);
      setTeam(tm);
      return lib;
    } catch {
      showToastRef.current('Could not load the course library', 'error');
      return [];
    } finally {
      setLoadingCourses(false);
    }
  }, []);

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
      showToastRef.current('Could not load tees for that course', 'error');
    } finally {
      setLoadingTees(false);
    }
  }, []);

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
      if (!defaults) { showToastRef.current('Could not load that tee', 'error'); return; }
      onPick(defaults);
      onOpenChange(false);
    } catch {
      showToastRef.current('Could not load that tee', 'error');
    } finally {
      setPicking(false);
    }
  }, [onPick, onOpenChange]);

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
            // The picker IS the page, not a sheet floating over the setup:
            // full-viewport on every breakpoint with the opaque canvas covering
            // the setup entirely (mt-0 overrides the base sheet's mt-24 gap).
            'inset-0 mt-0 h-[100dvh] max-h-[100dvh] w-screen max-w-none rounded-none p-0',
          )}
        >
          <DrawerTitle className="sr-only">
            {stage === 'tees' && selected ? `Choose a tee at ${selected.name}` : 'Choose a course'}
          </DrawerTitle>

          {/* Close — always reachable; backs out to the setup screen. */}
          {/* eslint-disable-next-line helm/no-raw-button -- floating dismiss control on a full-screen surface */}
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label="Close"
            className="absolute right-4 top-4 z-20 inline-flex h-10 w-10 items-center justify-center rounded-full bg-surface/80 text-text-secondary shadow-soft backdrop-blur transition-[transform,color] [transition-duration:var(--fw-dur-fast)] hover:scale-105 hover:text-text-primary active:scale-95 sm:right-6 sm:top-6"
          >
            <IconX size={18} aria-hidden />
          </button>

          {/* Scroll wrapper centers the picker group (header + carousel) on the
              page; m-auto pins it to the viewport centre when it fits and lets
              it scroll when it doesn't. */}
          <div className="flex h-full w-full flex-col overflow-y-auto px-4 py-6 sm:px-6 sm:py-10">
            <div className="m-auto flex w-full max-w-3xl flex-col">
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
            <div className="relative mt-4 flex flex-col">
              <AnimatePresence mode="wait" initial={false}>
                <m.div key={stage} {...stageMotion} className="flex flex-col">
                  {stage === 'courses'
                    ? <CoursesStage
                        loading={loadingCourses}
                        library={courses}
                        recent={recent}
                        team={team}
                        filtered={filtered}
                        query={query}
                        reduceMotion={reduceMotion}
                        onSelect={(id) => {
                          const c = [...courses, ...recent, ...team].find((x) => x.id === id);
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

// ── Stage A: sectioned cinematic coverflows (imperative, hooks-safe) ─────────

// Premium falloff (centre → neighbour). Eased (centre plateau); flat scale +
// opacity + a SUBTLE 3D tilt keeps neighbour photos legible.
const CF_SCALE_DROP = 0.10;   // centre 1.00 → far 0.90 (subtle, premium)
const CF_OPACITY_DROP = 0.34; // centre 1.00 → far 0.66 (neighbours stay legible, not murky)
const CF_ROTATE = 9;          // deg tilt at the falloff edge (gentler)
const CF_REACH = 0.9;         // fraction of track width the falloff spans

/**
 * Stage A — the "choose a course" screen. Three independent feeds, ONE coverflow
 * carousel each: Recently played, Team courses, and the full Course library
 * (which carries the "Add a course" tile). Searching collapses to a single
 * results carousel across the whole library.
 */
function CoursesStage({
  loading, library, recent, team, filtered, query, reduceMotion, onSelect, onCreate,
}: {
  loading: boolean;
  library: GolfCourse[];
  recent: GolfCourse[];
  team: GolfCourse[];
  filtered: GolfCourse[];
  query: string;
  reduceMotion: boolean;
  onSelect: (courseId: string) => void;
  onCreate: () => void;
}) {
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

  const q = query.trim();

  // Search mode — one results carousel across the whole library.
  if (q) {
    if (filtered.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
          <p className="font-fw-sans text-body text-text-secondary">
            No courses match “{q}”.
          </p>
          <p className="mt-1 font-fw-sans text-body-sm text-text-tertiary">
            Add it to the shared library so it’s there next time.
          </p>
          <Button variant="primary" className="mt-5" onClick={onCreate}>
            <IconPlus size={16} aria-hidden /> Add “{q}”
          </Button>
        </div>
      );
    }
    return (
      <CourseCarousel
        courses={filtered}
        reduceMotion={reduceMotion}
        onSelect={onSelect}
        regionLabel={`Search results for ${q}`}
        withCreateTile
        onCreate={onCreate}
      />
    );
  }

  if (library.length === 0 && recent.length === 0 && team.length === 0) {
    return <EmptyCourses onCreate={onCreate} />;
  }

  // Browse mode — a labelled coverflow per feed.
  return (
    <div className="flex flex-col gap-7">
      {recent.length > 0 && (
        <CourseSection label="Recently played" count={recent.length}>
          <CourseCarousel courses={recent} reduceMotion={reduceMotion} onSelect={onSelect} regionLabel="Recently played courses" />
        </CourseSection>
      )}
      {team.length > 0 && (
        <CourseSection label="Team courses" count={team.length}>
          <CourseCarousel courses={team} reduceMotion={reduceMotion} onSelect={onSelect} regionLabel="Team courses" />
        </CourseSection>
      )}
      <CourseSection label="Course library" count={library.length}>
        <CourseCarousel
          courses={library}
          reduceMotion={reduceMotion}
          onSelect={onSelect}
          regionLabel="Course library"
          withCreateTile
          onCreate={onCreate}
        />
      </CourseSection>
    </div>
  );
}

/** Eyebrow label + count above a carousel; aligned to the centred card column. */
function CourseSection({ label, count, children }: { label: string; count: number; children: React.ReactNode }) {
  return (
    <section className="flex flex-col">
      <div className="mb-1 flex items-baseline justify-between px-[6vw] sm:px-[16%]">
        <h2 className="font-fw-sans text-eyebrow font-semibold uppercase tracking-[0.16em] text-text-secondary">
          {label}
        </h2>
        <span className="font-fw-sans text-caption text-text-tertiary">
          {count} {count === 1 ? 'course' : 'courses'}
        </span>
      </div>
      {children}
    </section>
  );
}

/**
 * One horizontal coverflow carousel: featured cards on a centred scroll-snap
 * track, scaled/dimmed/tilted by distance from centre — written IMPERATIVELY
 * (one rAF per scroll frame), deliberately NOT framer useScroll/useTransform
 * (those need the container ref hydrated at hook-call time and crashed prod with
 * React #310). Every hook runs unconditionally before any early return; the
 * whole thing is reduced-motion gated.
 */
function CourseCarousel({
  courses, reduceMotion, onSelect, regionLabel, withCreateTile = false, onCreate,
}: {
  courses: GolfCourse[];
  reduceMotion: boolean;
  onSelect: (courseId: string) => void;
  regionLabel: string;
  withCreateTile?: boolean;
  onCreate?: () => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const slideRefs = useRef<Array<HTMLDivElement | null>>([]);
  const progressRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);

  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);
  const [scrollable, setScrollable] = useState(false);

  // Coverflow: scale + dim + tilt each slide by its distance from the track's
  // centre. Transforms written straight to the DOM (one rAF per scroll frame).
  const paint = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;

    const tr = track.getBoundingClientRect();
    const center = tr.left + tr.width / 2;
    const reach = tr.width * CF_REACH || 1;

    if (!reduceMotion) {
      for (const el of slideRefs.current) {
        if (!el) continue;
        const r = el.getBoundingClientRect();
        const signed = (r.left + r.width / 2) - center;
        const norm = Math.min(Math.abs(signed) / reach, 1);
        const eased = 1 - (1 - norm) * (1 - norm); // ease-out: flat at centre
        const scale = 1 - eased * CF_SCALE_DROP;
        const rot = -Math.sign(signed) * eased * CF_ROTATE;
        el.style.transform = `perspective(1200px) scale(${scale.toFixed(4)}) rotateY(${rot.toFixed(2)}deg)`;
        el.style.opacity = (1 - eased * CF_OPACITY_DROP).toFixed(4);
      }
    }

    const max = track.scrollWidth - track.clientWidth;
    const sc = max > 8;
    setScrollable((p) => (p !== sc ? sc : p));
    setCanLeft((p) => { const n = track.scrollLeft > 8; return p !== n ? n : p; });
    setCanRight((p) => { const n = track.scrollLeft < max - 8; return p !== n ? n : p; });
    if (progressRef.current) {
      const p = max > 0 ? track.scrollLeft / max : 0;
      progressRef.current.style.transform = `scaleX(${Math.max(0.08, p).toFixed(4)})`;
    }
  }, [reduceMotion]);

  const onScroll = useCallback(() => {
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      paint();
    });
  }, [paint]);

  // Apply once after layout (entrance keeps cards invisible until then, so no
  // full-size flash) and whenever the result set changes.
  useLayoutEffect(() => {
    paint();
  }, [paint, courses.length, withCreateTile]);

  useEffect(() => {
    const onResize = () => paint();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [paint]);

  const scrollByCards = (dir: 1 | -1) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.min(el.clientWidth * 0.72, 520), behavior: reduceMotion ? 'auto' : 'smooth' });
  };

  const enter = (i: number) =>
    reduceMotion
      ? {}
      : {
          initial: { opacity: 0, y: 12 },
          animate: { opacity: 1, y: 0 },
          // Snappy reveal: a quick glide, minimal stagger (capped) so the row
          // lights up almost at once instead of crawling card-by-card.
          transition: { duration: 0.26, ease: [0.16, 1, 0.3, 1] as const, delay: Math.min(i, 4) * 0.03 },
        };

  const count = courses.length + (withCreateTile ? 1 : 0);
  slideRefs.current = []; // repopulated by the ref callbacks below this render

  return (
    <div className="relative">
      <CarouselArrow side="left" show={canLeft} onClick={() => scrollByCards(-1)} />
      <CarouselArrow side="right" show={canRight} onClick={() => scrollByCards(1)} />

      <div
        ref={trackRef}
        onScroll={onScroll}
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a scrollable region MUST be focusable for keyboard scrolling; Safari (unlike Chrome) does not add this implicitly (WCAG 2.1.1, ACT 0ssw9k)
        tabIndex={0}
        role="region"
        aria-roledescription="carousel"
        aria-label={regionLabel}
        className={cn(
          'flex snap-x snap-mandatory items-stretch gap-4 overflow-x-auto overscroll-x-contain scroll-smooth',
          'px-[6vw] py-3 sm:px-[16%]',
          'focus-visible:outline-none',
          '[scrollbar-width:none] [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:hidden',
          'motion-reduce:scroll-auto',
        )}
      >
        {courses.map((course, i) => (
          <m.div
            key={course.id}
            {...enter(i)}
            role="group"
            aria-roledescription="slide"
            aria-label={`${course.name}, ${i + 1} of ${count}`}
            className="snap-always shrink-0 basis-[88vw] snap-center sm:basis-[clamp(420px,68%,560px)]"
          >
            <div
              ref={(el) => { slideRefs.current[i] = el; }}
              className="origin-center will-change-transform [transform-style:preserve-3d]"
            >
              <CourseCard course={course} variant="featured" priority={i === 0} onSelect={onSelect} />
            </div>
          </m.div>
        ))}

        {/* Final slide — add a new course (library carousel only). */}
        {withCreateTile && onCreate && (
          <m.div
            key="__create"
            {...enter(courses.length)}
            role="group"
            aria-roledescription="slide"
            aria-label={`Add a course, ${count} of ${count}`}
            className="snap-always shrink-0 basis-[88vw] snap-center sm:basis-[clamp(420px,68%,560px)]"
          >
            <div
              ref={(el) => { slideRefs.current[courses.length] = el; }}
              className="origin-center will-change-transform [transform-style:preserve-3d]"
            >
              <CreateCourseTile onClick={onCreate} />
            </div>
          </m.div>
        )}
      </div>

      {/* Scroll affordance: a slim progress rail (only when there's overflow). */}
      {scrollable && (
        <div className="mt-3 flex justify-center">
          <div className="h-1 w-24 overflow-hidden rounded-full bg-border-subtle">
            <div
              ref={progressRef}
              aria-hidden
              className="h-full w-full origin-left rounded-full bg-accent-500 motion-reduce:hidden"
              style={{ transform: 'scaleX(0.08)' }}
            />
          </div>
        </div>
      )}
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
