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
 *   • Stage A — an airy header over a cream canvas carrying THREE labelled feeds,
 *     ONE image-forward carousel each: "Recently played", "Team courses", and the
 *     full "Course library" (which ends in a dashed "Add a course" tile). Searching
 *     collapses to a single results carousel. Each shelf is a plain native
 *     scroll-snap track of featured CourseCards (peek the next card), with desktop
 *     arrows and a staggered entrance — deliberately NO per-frame coverflow
 *     transforms and NO framer-motion useScroll/useTransform on the track. That
 *     earlier coverflow crashed under concurrent React when the conditionally
 *     rendered track ref wasn't hydrated at hook-call time (React #310); pure
 *     native scroll holds 60fps, keeps the whole card a reliable tap target, and
 *     can't reintroduce that hook-order hazard. Edge-triggered arrow state only.
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
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import { m, AnimatePresence, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer';
import { Button } from '@/components/fairway/controls/button';
import { useToast } from '@/components/ui/sonner';
import {
  IconSearch, IconPlus, IconChevronLeft, IconArrowLeft, IconArrowRight, IconFlag, IconX,
} from '@/components/icons';
import { Skeleton, EmptyState } from '@/components/fairway/feedback';
import { CourseCard } from '@/components/golf/courses/CourseCard';
import { formatCourseName } from '@/components/golf/courses/CourseImage';
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
  // #146 — starts true (not false) so the very first paint after opening
  // shows the shelf skeleton instead of one frame of the wrong state (the
  // library/recent/team feeds are all still empty arrays at that point, so a
  // `false` initial value briefly rendered the "No courses yet" empty state,
  // or a blank void, ahead of the real skeleton the loading effect turns on).
  const [loadingCourses, setLoadingCourses] = useState(true);
  const [query, setQuery] = useState('');

  const [selected, setSelected] = useState<GolfCourse | null>(null);
  const [tees, setTees] = useState<GolfCourseTee[]>([]);
  const [loadingTees, setLoadingTees] = useState(false);
  const [picking, setPicking] = useState(false);
  // Monotonic token so a fast second course tap can't have its (slower) tee
  // response overwrite the newer selection's tees.
  const teeReqRef = useRef(0);

  const [createCourseOpen, setCreateCourseOpen] = useState(false);
  const [createTeeOpen, setCreateTeeOpen] = useState(false);

  const refreshCourses = useCallback(async (): Promise<GolfCourse[]> => {
    setLoadingCourses(true);
    try {
      // Three independent feeds, one carousel each — ALL best-effort so one
      // failing feed never blanks the others (e.g. a transient library error
      // shouldn't also hide the recent/team shelves that loaded fine).
      const [lib, rec, tm] = await Promise.all([
        listCourses({ limit: 200 }).catch(() => null),
        getRecentlyPlayedCourses(12).catch(() => [] as GolfCourse[]),
        getTeamSavedCourses().then((rows) => rows.map((r) => r.course)).catch(() => [] as GolfCourse[]),
      ]);
      // Only the library failing (null) is worth surfacing — recent/team degrade silently.
      if (lib === null && rec.length === 0 && tm.length === 0) {
        showToastRef.current('Could not load the course library', 'error');
      }
      const library = lib ?? [];
      setCourses(library);
      setRecent(rec);
      setTeam(tm);
      return library;
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
      // Guard the empty-normalized case (e.g. "no", "#") — includes('') is true
      // for every row, which would falsely "match" the whole library.
      (nq.length > 0 && (c.normalized_name ?? normalizeName(c.name)).includes(nq)),
    );
  }, [courses, query]);

  const loadTees = useCallback(async (course: GolfCourse) => {
    const req = ++teeReqRef.current;
    setLoadingTees(true);
    setTees([]);
    try {
      const detail = await getCourseDetail(course.id);
      if (teeReqRef.current !== req) return; // superseded by a newer selection
      setTees(detail?.tees ?? []);
    } catch {
      if (teeReqRef.current === req) showToastRef.current('Could not load tees for that course', 'error');
    } finally {
      if (teeReqRef.current === req) setLoadingTees(false);
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

  const heroTitle = stage === 'tees' && selected ? formatCourseName(selected.name) : 'Choose a course';
  const heroDesc = stage === 'tees'
    ? 'Pick the tee set you played — it pre-fills your pars and yardages.'
    : 'Pick from your library, or add a new course in seconds.';

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
            {stage === 'tees' && selected ? `Choose a tee at ${formatCourseName(selected.name)}` : 'Choose a course'}
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
            {/* Airy, premium header — bold title + clean search on the cream canvas. */}
            <header className="px-1">
              <div className="flex items-start gap-2.5">
                {stage === 'tees' && (
                  // eslint-disable-next-line helm/no-raw-button -- compact back affordance
                  <button
                    type="button"
                    onClick={backToCourses}
                    aria-label="Back to courses"
                    className="-ml-1 mt-1 inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-surface-sunken hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-600 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                  >
                    <IconChevronLeft size={20} aria-hidden />
                  </button>
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-fw-sans text-eyebrow font-semibold uppercase tracking-[0.18em] text-accent-700">
                    {stage === 'tees' ? 'New round · Tee' : 'New round'}
                  </p>
                  <h1 className="mt-1.5 truncate font-fw-display text-h1 font-semibold tracking-[-0.02em] text-text-primary">
                    {heroTitle}
                  </h1>
                  <p className="mt-1.5 max-w-md font-fw-sans text-body text-text-secondary">{heroDesc}</p>
                </div>
              </div>

              {/* Search — Stage A only. */}
              {stage === 'courses' && (
                <div className="relative mt-5">
                  <IconSearch size={18} aria-hidden className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-text-tertiary" />
                  {/* eslint-disable-next-line helm/no-raw-input -- native type=search with a leading icon */}
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search courses…"
                    aria-label="Search courses"
                    className="h-12 w-full rounded-full border border-border-subtle bg-surface pl-11 pr-4 font-fw-sans text-body text-text-primary shadow-flat placeholder:text-text-tertiary focus:border-accent-500 focus:outline-none focus:ring-4 focus:ring-accent-500/25"
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

// ── Stage A: sectioned course shelves ───────────────────────────────────────

/**
 * Stage A — the "choose a course" screen. Three independent feeds, ONE course
 * shelf each: Recently played, Team courses, and the full Course library (which
 * carries the "Add a course" tile). Searching collapses to a single results
 * shelf across the whole library.
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
    // Shape-matched to the real browse layout (labelled shelves of featured
    // cards) so there is ZERO layout shift when the feeds resolve: the tiles use
    // the EXACT slideCls footprint (aspect-[3/2], w-[80vw] max-w-[360px] sm:w-[340px])
    // and the same track padding/gap as CourseCarousel. Shimmer, not animate-pulse.
    return (
      <div role="status" aria-busy="true" aria-live="polite" className="flex flex-col gap-7">
        <span className="sr-only">Loading courses…</span>
        {[0, 1].map((shelf) => (
          <div key={shelf} className="flex flex-col">
            <div className="mb-2 px-1">
              <Skeleton className="h-3 w-28 rounded-full" />
            </div>
            <div className="flex gap-4 overflow-hidden px-1 py-2">
              {[0, 1, 2].map((i) => (
                <Skeleton
                  key={i}
                  className="aspect-[3/2] w-[80vw] max-w-[360px] flex-shrink-0 rounded-[1.5rem] sm:w-[340px]"
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  const q = query.trim();

  // Search mode — one results carousel across the whole library.
  if (q) {
    if (filtered.length === 0) {
      return (
        <EmptyState
          variant="subtle"
          icon={<IconFlag aria-hidden />}
          title={`No courses match “${q}”.`}
          description="Add it to the shared library so it’s there next time."
          action={
            <Button variant="primary" className="min-w-0" onClick={onCreate}>
              <IconPlus size={16} aria-hidden />
              <span className="truncate">Add “{q}”</span>
            </Button>
          }
        />
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

/** Eyebrow label + count above a shelf; aligned to the shelf's left edge. */
function CourseSection({ label, count, children }: { label: string; count: number; children: React.ReactNode }) {
  return (
    <section className="flex flex-col">
      <div className="mb-2 flex items-baseline justify-between px-1">
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
 * One horizontal course shelf: featured cards on a left-aligned scroll-snap
 * track (peek the next card), arrows on desktop, a tasteful staggered entrance.
 * No per-frame transforms — pure native scroll, so it holds 60fps and the whole
 * card stays a clean, reliable tap target (→ tee stage). Reduced-motion safe.
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
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  // Edge-triggered only: flips when you reach/leave an end, so no per-frame
  // re-render mid-scroll. A plain scrollLeft read — no layout writes, no thrash.
  const updateArrows = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setCanLeft((p) => { const n = el.scrollLeft > 8; return p !== n ? n : p; });
    setCanRight((p) => { const n = el.scrollLeft < max - 8; return p !== n ? n : p; });
  }, []);

  useEffect(() => { updateArrows(); }, [updateArrows, courses.length, withCreateTile]);
  useEffect(() => {
    window.addEventListener('resize', updateArrows);
    return () => window.removeEventListener('resize', updateArrows);
  }, [updateArrows]);

  const scrollByCards = (dir: 1 | -1) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.min(el.clientWidth * 0.85, 340), behavior: reduceMotion ? 'auto' : 'smooth' });
  };

  const enter = (i: number) =>
    reduceMotion
      ? {}
      : {
          initial: { opacity: 0, y: 14 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] as const, delay: Math.min(i, 5) * 0.04 },
        };

  const count = courses.length + (withCreateTile ? 1 : 0);
  const slideCls = 'w-[80vw] max-w-[360px] flex-shrink-0 snap-start sm:w-[340px]';

  return (
    <div className="relative">
      <CarouselArrow side="left" show={canLeft} onClick={() => scrollByCards(-1)} />
      <CarouselArrow side="right" show={canRight} onClick={() => scrollByCards(1)} />

      <div
        ref={trackRef}
        onScroll={updateArrows}
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a scrollable region MUST be focusable for keyboard scrolling; Safari (unlike Chrome) does not add this implicitly (WCAG 2.1.1, ACT 0ssw9k)
        tabIndex={0}
        role="region"
        aria-roledescription="carousel"
        aria-label={regionLabel}
        className={cn(
          'flex snap-x snap-mandatory items-stretch gap-4 overflow-x-auto overscroll-x-contain scroll-smooth',
          'px-1 py-2',
          'rounded-[1.5rem] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-600 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
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
            aria-label={`${formatCourseName(course.name)}, ${i + 1} of ${count}`}
            className={slideCls}
          >
            <CourseCard course={course} variant="featured" priority={i === 0} onSelect={onSelect} />
          </m.div>
        ))}

        {/* Final slide — add a new course (library shelf only). */}
        {withCreateTile && onCreate && (
          <m.div
            key="__create"
            {...enter(courses.length)}
            role="group"
            aria-roledescription="slide"
            aria-label={`Add a course, ${count} of ${count}`}
            className={slideCls}
          >
            <CreateCourseTile onClick={onCreate} />
          </m.div>
        )}
      </div>
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
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-600 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
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
        'group flex aspect-[3/2] w-full flex-col items-center justify-center gap-3 rounded-[1.5rem] text-center',
        'border-2 border-dashed border-border-strong bg-surface-sunken',
        'transition-[transform,border-color,background-color] [transition-duration:var(--fw-dur-base)] [transition-timing-function:var(--fw-ease-glide)]',
        'hover:-translate-y-1.5 hover:border-accent-500 hover:bg-accent-50/60 active:-translate-y-0.5',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-600 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
        'motion-reduce:transition-none motion-reduce:hover:translate-y-0',
      )}
    >
      <span className="grid h-12 w-12 place-items-center rounded-full bg-surface text-accent-700 shadow-flat transition-[transform,background-color,color] [transition-duration:var(--fw-dur-base)] group-hover:scale-110 group-hover:bg-accent-500 group-hover:text-white motion-reduce:group-hover:scale-100">
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
    <EmptyState
      variant="default"
      className="flex-1"
      icon={<IconFlag aria-hidden />}
      title="No courses yet"
      description="Add the first course to the shared library — everyone on your team can play it from here."
      action={
        <Button variant="primary" onClick={onCreate}>
          <IconPlus size={16} aria-hidden /> Add a course
        </Button>
      }
    />
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
        <EmptyState
          variant="subtle"
          icon={<IconFlag aria-hidden />}
          title="No tee sets yet"
          description="Add the tee you played to start the round and grow the course for your team."
          action={
            <Button variant="primary" onClick={onAddTee}>
              <IconPlus size={16} aria-hidden /> Add a tee set
            </Button>
          }
        />
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
