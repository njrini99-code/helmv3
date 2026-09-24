'use client';

/**
 * ============================================================================
 * Fairway · Rounds · FairwayCoursePicker — "choose a course" as a pushed screen
 * ----------------------------------------------------------------------------
 * Owner decision D-PICKER (2026-09-23): the picker is a full-screen
 * navigation-stack PUSH, not a sheet. It slides in from the trailing edge over
 * the setup screen, carries its search field in the nav bar, and the tee list
 * is the NEXT screen on the same stack (pushed from the right, popped by the
 * back button, the Escape key, or — on the tee screen — nothing else).
 *
 *   • Courses screen — nav bar (close · title · search), then vertical grouped
 *     lists: "Recently played", "Team courses" (minus anything already in
 *     Recently played), and the whole "Course library" A–Z with letter
 *     headers and a section index rail. Searching collapses to one results
 *     list. The earlier horizontal 65-card carousels are gone (RE-P7).
 *   • Tees screen — the tee cards for the chosen course.
 *
 * Mechanics:
 *   • Radix Dialog underneath: focus trap, body scroll lock, and focus RESTORE
 *     to whatever opened the picker (RE-P5 — focus used to land on <body>).
 *   • Escape pops ONE level: tees → courses, then courses → closed (RE-P5).
 *   • The screen stays mounted for PICKER_EXIT_MS after `open` goes false so
 *     the slide-out plays with the content the player was looking at (the
 *     "flicker" contract — see the close-sequence test). A tee pick closes
 *     first and hands the tee to the parent only after that exit.
 *   • A library-load failure is an inline "Couldn't load · Retry" notice, not
 *     a misleading "No courses yet" (RE-P3).
 *   • Tees are prefetched on pointer-down so a tap on a course usually lands on
 *     real tee cards instead of a skeleton (RE-P6).
 *
 * Public props are unchanged: the qualifier create/edit screens share this.
 * ========================================================================== */

import {
  useCallback, useEffect, useMemo, useRef, useState, type ReactNode,
} from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { m, AnimatePresence } from 'framer-motion';
import { useReducedMotionGuard } from '@/lib/coachhelm/v3/motion';
import { cn } from '@/lib/utils';
import { Button } from '@/components/fairway/controls/button';
import { fairwayToast } from '@/components/fairway/feedback/ToastStack';
import { Skeleton, EmptyState, InlineNotice } from '@/components/fairway/feedback';
import { fwHaptic } from '@/lib/fairway/haptics';
import { logError } from '@/lib/error-logging';
import {
  IconSearch, IconPlus, IconChevronLeft, IconChevronRight, IconFlag, IconX, IconMapPin,
} from '@/components/icons';
import { CourseImage, formatCourseName } from '@/components/golf/courses/CourseImage';
import { CourseFormDrawer } from '@/components/golf/courses/CourseFormDrawer';
import { TeeFormDrawer } from '@/components/golf/courses/TeeFormDrawer';
import { FairwayTeeCard } from './FairwayTeeCard';
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
  /**
   * May the viewer CREATE library rows (a course, or a tee set on one)?
   * Course-library MANAGEMENT is coach-only — createCourse/createTee both sit
   * behind requireCoachActor (actions/course-library.ts), so rendering the
   * affordance to a player produces a guaranteed rejection.
   *
   * Defaults CLOSED because the highest-traffic call site is the player-only
   * new-round flow. Coach-only callers (qualifier create/edit) opt in.
   *
   * Players are not losing the capability: closing the picker and typing the
   * course name on the setup screen still grows the shared catalog, via
   * contributeCourseFromRound — the deliberate player-open growth path that
   * skips this same gate.
   */
  canManageLibrary?: boolean;
}

type Stage = 'courses' | 'tees';

/**
 * How long the pushed screen keeps rendering after `open` goes false: the
 * slide-out. A tee pick closes the picker first and hands the tee to the
 * parent only after this, so the setup screen does not restructure (hero
 * swap, scorecard mount + entrance) underneath a screen that is still moving.
 * Under reduced motion the hand-off is immediate.
 */
export const PICKER_EXIT_MS = 500;

/** iOS push curve (UINavigationController-like). */
const PUSH_EASE = [0.32, 0.72, 0, 1] as const;
/** A pick that opens within this window of mount is the landing screen: no slide. */
const LANDING_WINDOW_MS = 600;
/** Show the A–Z rail only when the list is long enough to need it. */
const INDEX_RAIL_MIN = 12;

export function FairwayCoursePicker({
  open, onOpenChange, onPick, canManageLibrary = false,
}: FairwayCoursePickerProps) {
  const reduceMotion = useReducedMotionGuard();

  const [stage, setStage] = useState<Stage>('courses');
  /** +1 = push (courses → tees), −1 = pop. Drives the horizontal slide. */
  const [direction, setDirection] = useState<1 | -1>(1);
  const [courses, setCourses] = useState<GolfCourse[]>([]);     // full shared library
  const [recent, setRecent] = useState<GolfCourse[]>([]);       // this player's recently played
  const [team, setTeam] = useState<GolfCourse[]>([]);           // the team's saved courses
  // #146 — starts true so the very first paint after opening is the skeleton,
  // never one frame of the empty state.
  const [loadingCourses, setLoadingCourses] = useState(true);
  // RE-P3: the library feed failed. Shown inline with a Retry, whether or not
  // the recent/team feeds loaded — never as "No courses yet".
  const [libraryFailed, setLibraryFailed] = useState(false);
  const [query, setQuery] = useState('');

  const [selected, setSelected] = useState<GolfCourse | null>(null);
  const [tees, setTees] = useState<GolfCourseTee[]>([]);
  const [loadingTees, setLoadingTees] = useState(false);
  const [picking, setPicking] = useState(false);
  // Monotonic token so a fast second course tap can't have its (slower) tee
  // response overwrite the newer selection's tees.
  const teeReqRef = useRef(0);
  // RE-P6: tee lists fetched on pointer-down (or already seen this session).
  const teeCacheRef = useRef(new Map<string, Promise<GolfCourseTee[]>>());
  const teeResolvedRef = useRef(new Map<string, GolfCourseTee[]>());

  const [createCourseOpen, setCreateCourseOpen] = useState(false);
  const [createTeeOpen, setCreateTeeOpen] = useState(false);

  // Keep the screen mounted through its slide-out (see PICKER_EXIT_MS).
  const [present, setPresent] = useState(open);
  useEffect(() => {
    if (open) {
      setPresent(true);
      return;
    }
    const t = setTimeout(() => setPresent(false), reduceMotion ? 0 : PICKER_EXIT_MS);
    return () => clearTimeout(t);
  }, [open, reduceMotion]);
  const shown = open || present;

  // The New Round page opens the picker as its landing screen. A push that
  // plays on page load reads as a glitch, so an open inside the first moments
  // after mount appears in place.
  const [landing, setLanding] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setLanding(false), LANDING_WINDOW_MS);
    return () => clearTimeout(t);
  }, []);
  const [slideIn, setSlideIn] = useState(false);
  // The title only slides on a push/pop inside the stack, never on open.
  const [titleAnimates, setTitleAnimates] = useState(false);

  // Reset to the course list on OPEN, never on close: the screen keeps
  // rendering through its exit, and resetting on close swapped the tee list
  // back to "Choose a course" mid-slide (the owner's "flicker"). Done in
  // render (the prev-prop pattern) so the first open frame is already right.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setStage('courses');
      setDirection(1);
      setSelected(null);
      setTees([]);
      setQuery('');
      setLoadingTees(false);
      setPicking(false);
      setSlideIn(!landing);
      setTitleAnimates(false);
    }
  }

  // Set once any library load has landed. Reopening then shows the cached
  // lists while they refresh in the background instead of a skeleton.
  const hasLoadedCoursesRef = useRef(false);
  // A tee pick waiting for the exit before it reaches the parent.
  const pickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (pickTimerRef.current) clearTimeout(pickTimerRef.current);
  }, []);

  const refreshCourses = useCallback(async (): Promise<GolfCourse[]> => {
    if (!hasLoadedCoursesRef.current) setLoadingCourses(true);
    try {
      // Three independent feeds — ALL best-effort so one failing feed never
      // blanks the others.
      const [lib, rec, tm] = await Promise.all([
        listCourses({ limit: 200 }).catch((err: unknown) => {
          logError(err instanceof Error ? err : new Error(String(err)), { component: 'FairwayCoursePicker', action: 'load course library', featureArea: 'round_tracking', bypassStaleActionFilter: true }, 'medium');
          return null;
        }),
        getRecentlyPlayedCourses(12).catch(() => [] as GolfCourse[]),
        getTeamSavedCourses().then((rows) => rows.map((r) => r.course)).catch(() => [] as GolfCourse[]),
      ]);
      setLibraryFailed(lib === null);
      const library = lib ?? [];
      // A failed refresh keeps whatever library this session already showed.
      if (lib !== null || !hasLoadedCoursesRef.current) setCourses(library);
      setRecent(rec);
      setTeam(tm);
      hasLoadedCoursesRef.current = true;
      return library;
    } catch (err) {
      // A toast is not a record: log every unexpected failure here.
      logError(err instanceof Error ? err : new Error(String(err)), { component: 'FairwayCoursePicker', action: 'load course library', featureArea: 'round_tracking', bypassStaleActionFilter: true }, 'medium');
      setLibraryFailed(true);
      return [];
    } finally {
      setLoadingCourses(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    // Any tee response still in flight from the previous session is stale.
    teeReqRef.current += 1;
    teeCacheRef.current.clear();
    teeResolvedRef.current.clear();
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

  /** Start (or reuse) the tee fetch for a course. */
  const fetchTees = useCallback((courseId: string, fresh = false): Promise<GolfCourseTee[]> => {
    const cache = teeCacheRef.current;
    const hit = fresh ? undefined : cache.get(courseId);
    if (hit) return hit;
    const p = getCourseDetail(courseId).then((detail) => {
      const list = detail?.tees ?? [];
      teeResolvedRef.current.set(courseId, list);
      return list;
    });
    // A failed prefetch must not poison the next real tap.
    p.catch(() => { if (cache.get(courseId) === p) cache.delete(courseId); });
    cache.set(courseId, p);
    return p;
  }, []);

  const prefetchTees = useCallback((courseId: string) => {
    void fetchTees(courseId).catch(() => { /* surfaced by the real tap */ });
  }, [fetchTees]);

  /** Loads the course's tees into the tee screen; resolves with the list (null if superseded or failed). */
  const loadTees = useCallback(async (course: GolfCourse, fresh = false): Promise<GolfCourseTee[] | null> => {
    const req = ++teeReqRef.current;
    const ready = fresh ? undefined : teeResolvedRef.current.get(course.id);
    if (ready) {
      // Already fetched (prefetch landed first): no skeleton at all.
      setTees(ready);
      setLoadingTees(false);
      return ready;
    }
    setLoadingTees(true);
    setTees([]);
    try {
      const list = await fetchTees(course.id, fresh);
      if (teeReqRef.current !== req) return null; // superseded by a newer selection
      setTees(list);
      return list;
    } catch (err) {
      logError(err instanceof Error ? err : new Error(String(err)), { component: 'FairwayCoursePicker', action: 'load tees', featureArea: 'round_tracking', courseId: course.id, bypassStaleActionFilter: true }, 'medium');
      if (teeReqRef.current === req) fairwayToast.danger('Could not load tees for that course');
      return null;
    } finally {
      if (teeReqRef.current === req) setLoadingTees(false);
    }
  }, [fetchTees]);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  /** The courses screen's scroll offset, restored when the tee screen pops. */
  const coursesScrollRef = useRef(0);

  // pickTee is declared below selectCourse (it closes over `selected`); the
  // ref lets selectCourse call the current one.
  const pickTeeRef = useRef<((tee: GolfCourseTee, course?: GolfCourse) => Promise<void>) | null>(null);
  const selectCourse = useCallback(async (course: GolfCourse) => {
    if (scrollRef.current) {
      coursesScrollRef.current = scrollRef.current.scrollTop;
      scrollRef.current.scrollTop = 0;
    }
    setSelected(course);
    // RE-P6: a course with exactly one tee has nothing to choose. When the
    // prefetch already knows that, skip the tee screen and pick it; otherwise
    // the tee screen shows while the list loads and the lone tee is picked the
    // moment it arrives. Both go through pickTee's normal close sequence.
    const known = teeResolvedRef.current.get(course.id);
    if (known?.length === 1 && known[0]) {
      await pickTeeRef.current?.(known[0], course);
      return;
    }
    setDirection(1);
    setTitleAnimates(true);
    setStage('tees');
    const list = await loadTees(course);
    if (list?.length === 1 && list[0]) await pickTeeRef.current?.(list[0], course);
  }, [loadTees]);

  const backToCourses = useCallback(() => {
    setDirection(-1);
    setTitleAnimates(true);
    setStage('courses');
    setSelected(null);
    setTees([]);
    // Restore where the player was in the list once the courses screen is back.
    requestAnimationFrame(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = coursesScrollRef.current;
    });
  }, []);

  const pickTee = useCallback(async (tee: GolfCourseTee, courseOverride?: GolfCourse) => {
    // `selected` from this render can lag a same-tick selectCourse (the
    // single-tee auto-pick below), so the course can be passed in.
    const course = courseOverride ?? selected;
    setPicking(true);
    try {
      const defaults = await getTeeRoundDefaults(tee.id);
      if (!defaults) {
        // The tee exists in the list but the server returned nothing for it —
        // a data gap (deleted tee, RLS, missing holes), not a transport loss.
        logError(new Error('Tee defaults unavailable'), { component: 'FairwayCoursePicker', action: 'pick tee', featureArea: 'round_tracking', courseId: course?.id ?? null, teeId: tee.id, bypassStaleActionFilter: true }, 'medium');
        fairwayToast.danger('Could not load that tee');
        return;
      }
      // Carry the course's imagery out with the tee so the setup screen shows
      // the actual course photo instead of a name-derived stock scene.
      const picked: TeeRoundDefaults = {
        ...defaults,
        courseImageUrl: course?.image_url ?? null,
        courseNormalizedName: course?.normalized_name ?? null,
      };
      // Warm the course photo so the setup hero doesn't pop in from grey.
      if (picked.courseImageUrl && typeof Image !== 'undefined') {
        new Image().src = picked.courseImageUrl;
      }
      // Close FIRST, then hand the tee over once the screen has left.
      onOpenChange(false);
      const courseId = course?.id ?? null;
      if (pickTimerRef.current) clearTimeout(pickTimerRef.current);
      pickTimerRef.current = setTimeout(() => {
        pickTimerRef.current = null;
        try {
          onPick(picked);
        } catch (onPickErr) {
          // Anything the parent's onPick throws is logged as itself, not as a
          // tee-load failure.
          logError(
            onPickErr instanceof Error ? onPickErr : new Error(String(onPickErr)),
            {
              component: 'FairwayCoursePicker',
              action: 'onPick threw',
              featureArea: 'round_tracking',
              courseId,
              teeId: tee.id,
              bypassStaleActionFilter: true,
            },
            'medium',
          );
          fairwayToast.danger('Could not use that tee');
        }
      }, reduceMotion ? 0 : PICKER_EXIT_MS);
    } catch (err) {
      logError(err instanceof Error ? err : new Error(String(err)), { component: 'FairwayCoursePicker', action: 'pick tee', featureArea: 'round_tracking', courseId: course?.id ?? null, teeId: tee.id, bypassStaleActionFilter: true }, 'medium');
      fairwayToast.danger('Could not load that tee');
    } finally {
      setPicking(false);
    }
  }, [onPick, onOpenChange, selected, reduceMotion]);
  pickTeeRef.current = pickTee;

  // A freshly created course has no tees — push straight to its tee screen so
  // adding the tee they're about to play is the obvious next step.
  const handleCourseCreated = useCallback(async (course: GolfCourse) => {
    setCreateCourseOpen(false);
    const next = await refreshCourses();
    const fresh = next.find((c) => c.id === course.id) ?? course;
    await selectCourse(fresh);
  }, [refreshCourses, selectCourse]);

  const onTees = stage === 'tees' && !!selected;
  const heroTitle = onTees ? formatCourseName(selected.name) : 'Choose a course';
  const heroDesc = onTees
    ? 'Pick the tee set you played — it pre-fills your pars and yardages.'
    : 'Pick from your library, or add a new course in seconds.';

  // Horizontal push/pop between the two screens of the stack.
  const stageVariants = reduceMotion
    ? {
        enter: { opacity: 0 },
        center: { opacity: 1 },
        exit: { opacity: 0 },
      }
    : {
        enter: (dir: 1 | -1) => ({ x: dir > 0 ? '100%' : '-28%', opacity: dir > 0 ? 1 : 0.6 }),
        center: { x: 0, opacity: 1 },
        exit: (dir: 1 | -1) => ({ x: dir > 0 ? '-28%' : '100%', opacity: dir > 0 ? 0.6 : 1 }),
      };
  const stageTransition = reduceMotion
    ? { duration: 0.12 }
    : { duration: 0.36, ease: PUSH_EASE };

  // The whole picker pushes in from the trailing edge and pops back out.
  const screenInitial = reduceMotion ? { opacity: 0 } : { x: '100%' };
  const screenAnimate = reduceMotion
    ? { opacity: open ? 1 : 0 }
    : { x: open ? '0%' : '100%' };

  return (
    <>
      <Dialog.Root
        open={shown}
        onOpenChange={(next) => { if (!next && open) onOpenChange(false); }}
      >
        <Dialog.Portal>
          <Dialog.Content
            data-slot="course-picker"
            data-state-stage={stage}
            aria-describedby={undefined}
            // Escape pops ONE level: tees → courses; only the courses screen closes.
            onEscapeKeyDown={(e) => {
              if (stage === 'tees') {
                e.preventDefault();
                backToCourses();
              }
            }}
            className={cn(
              'fixed inset-x-0 top-0 z-50 flex h-[calc(100dvh-var(--keyboard-height,0px))] w-screen flex-col overflow-hidden outline-none',
              !open && 'pointer-events-none',
            )}
          >
            <Dialog.Title className="sr-only">
              {onTees ? `Choose a tee at ${formatCourseName(selected.name)}` : 'Choose a course'}
            </Dialog.Title>

            <m.div
              initial={slideIn ? screenInitial : false}
              animate={screenAnimate}
              transition={reduceMotion ? { duration: 0.12 } : { duration: PICKER_EXIT_MS / 1000, ease: PUSH_EASE }}
              className="flex min-h-0 flex-1 flex-col bg-canvas shadow-fw-modal"
            >
              {/* Nav bar: back/close, the screen's small title, and (courses
                  screen) the search field. Sticky chrome over the scroller. */}
              <div
                data-slot="course-picker-navbar"
                className="relative z-10 flex-shrink-0 border-b border-border-subtle bg-canvas/95 pt-[env(safe-area-inset-top,0px)] backdrop-blur"
              >
                <div className="mx-auto flex h-12 w-full max-w-3xl items-center gap-1 px-2 sm:px-4">
                  {onTees ? (
                    // eslint-disable-next-line helm/no-raw-button -- iOS nav-bar back item (chevron + parent title)
                    <button
                      type="button"
                      onClick={backToCourses}
                      aria-label="Back to courses"
                      className="inline-flex h-11 min-w-11 items-center gap-0.5 rounded-full pl-1 pr-3 font-fw-sans text-body font-medium text-accent-700 transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-600"
                    >
                      <IconChevronLeft size={22} aria-hidden />
                      <span>Courses</span>
                    </button>
                  ) : (
                    <span className="h-11 w-11" aria-hidden />
                  )}
                  <p
                    aria-hidden
                    className="min-w-0 flex-1 truncate text-center font-fw-sans text-body font-semibold text-text-primary"
                  >
                    {onTees ? 'Choose a tee' : 'New round'}
                  </p>
                  {/* eslint-disable-next-line helm/no-raw-button -- nav-bar close item */}
                  <button
                    type="button"
                    onClick={() => onOpenChange(false)}
                    aria-label="Close"
                    className="inline-flex h-11 w-11 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-surface-sunken hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-600"
                  >
                    <IconX size={20} aria-hidden />
                  </button>
                </div>

                {stage === 'courses' && (
                  <div className="mx-auto w-full max-w-3xl px-4 pb-3 sm:px-6">
                    <div className="relative">
                      <IconSearch size={18} aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-tertiary" />
                      {/* eslint-disable-next-line helm/no-raw-input -- native type=search in the nav bar */}
                      <input
                        type="search"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search courses"
                        aria-label="Search courses"
                        enterKeyHint="search"
                        autoComplete="off"
                        autoCorrect="off"
                        autoCapitalize="none"
                        spellCheck={false}
                        className="h-11 w-full rounded-full border border-border-subtle bg-surface pl-10 pr-4 font-fw-sans text-body text-text-primary shadow-flat placeholder:text-text-tertiary focus:border-accent-500 focus:outline-none focus:ring-4 focus:ring-accent-500/25"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div
                ref={scrollRef}
                data-slot="course-picker-scroll"
                className="relative flex min-h-0 w-full flex-1 flex-col overflow-y-auto overflow-x-hidden overscroll-contain pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)]"
              >
                {/* Top-aligned group, horizontally centered on wide screens
                    (UI-9: never m-auto, which floats short content). */}
                <div className="mx-auto flex w-full max-w-3xl flex-col px-4 pt-5 sm:px-6">
                  {/* The large title rides in with its screen but has no exit
                      copy: exactly one h1 is ever in the tree. */}
                  <m.header
                    key={`title-${stage}`}
                    custom={direction}
                    variants={stageVariants}
                    initial={titleAnimates ? 'enter' : false}
                    animate="center"
                    transition={stageTransition}
                    className="px-1"
                  >
                    <h1 className="break-words font-fw-display text-h1 font-semibold tracking-[-0.02em] text-text-primary">
                      {heroTitle}
                    </h1>
                    <p className="mt-1.5 max-w-md font-fw-sans text-body text-text-secondary">{heroDesc}</p>
                  </m.header>
                  <div className="relative mt-5 flex flex-col">
                    <AnimatePresence mode="popLayout" initial={false} custom={direction}>
                      <m.div
                        key={stage}
                        custom={direction}
                        variants={stageVariants}
                        initial="enter"
                        animate="center"
                        exit="exit"
                        transition={stageTransition}
                        className="flex w-full flex-col"
                      >
                        {stage === 'courses'
                          ? <CoursesStage
                              loading={loadingCourses}
                              libraryFailed={libraryFailed}
                              onRetryLibrary={() => { void refreshCourses(); }}
                              library={courses}
                              recent={recent}
                              team={team}
                              filtered={filtered}
                              query={query}
                              scrollRef={scrollRef}
                              onPrefetch={prefetchTees}
                              onSelect={(id) => {
                                const c = [...courses, ...recent, ...team].find((x) => x.id === id);
                                if (c) void selectCourse(c);
                              }}
                              onCreate={canManageLibrary ? () => setCreateCourseOpen(true) : undefined}
                            />
                          : <TeesStage
                              loading={loadingTees}
                              tees={tees}
                              picking={picking}
                              onPick={pickTee}
                              onAddTee={canManageLibrary ? () => setCreateTeeOpen(true) : undefined}
                            />}
                      </m.div>
                    </AnimatePresence>
                  </div>
                </div>
              </div>
            </m.div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Grow the shared catalog from inside the flow. Coach-only: both drawers
          submit into requireCoachActor-gated actions, so they stay unmounted
          rather than merely unreachable. They portal after the picker, so they
          stack above it at the same z-index. */}
      {canManageLibrary && (
        <CourseFormDrawer
          open={createCourseOpen}
          onOpenChange={setCreateCourseOpen}
          mode="create"
          onSaved={(course) => { void handleCourseCreated(course); }}
        />
      )}

      {/* Add the tee you're about to play to a (often freshly created) course. */}
      {canManageLibrary && selected && (
        <TeeFormDrawer
          open={createTeeOpen}
          onOpenChange={setCreateTeeOpen}
          mode="create"
          courseId={selected.id}
          onSaved={() => { setCreateTeeOpen(false); if (selected) void loadTees(selected, true); }}
        />
      )}
    </>
  );
}

// ── Courses screen ──────────────────────────────────────────────────────────

/** Index letter for a course: A–Z, anything else under '#'. */
function indexLetter(course: GolfCourse): string {
  const ch = formatCourseName(course.name).trim().charAt(0).toUpperCase();
  return ch >= 'A' && ch <= 'Z' ? ch : '#';
}

function CoursesStage({
  loading, libraryFailed, onRetryLibrary, library, recent, team, filtered, query,
  scrollRef, onPrefetch, onSelect, onCreate,
}: {
  loading: boolean;
  libraryFailed: boolean;
  onRetryLibrary: () => void;
  library: GolfCourse[];
  recent: GolfCourse[];
  team: GolfCourse[];
  filtered: GolfCourse[];
  query: string;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  onPrefetch: (courseId: string) => void;
  onSelect: (courseId: string) => void;
  /** Undefined for a viewer who may not manage the library — see canManageLibrary. */
  onCreate?: () => void;
}) {
  if (loading) {
    // Shape-matched to the real list rows (64px, thumbnail + two lines).
    return (
      <div role="status" aria-busy="true" aria-live="polite" className="flex flex-col gap-6">
        <span className="sr-only">Loading courses…</span>
        {[0, 1].map((section) => (
          <div key={section} className="flex flex-col">
            <div className="mb-2 px-1">
              <Skeleton className="h-3 w-28 rounded-full" />
            </div>
            <div className="overflow-hidden rounded-card border border-border-subtle bg-surface">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="flex h-16 items-center gap-3 px-3">
                  <Skeleton className="h-11 w-11 flex-shrink-0 rounded-md" />
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <Skeleton className="h-3.5 w-2/3 rounded-full" />
                    <Skeleton className="h-3 w-1/3 rounded-full" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  const failedNotice = libraryFailed ? (
    <InlineNotice
      tone="danger"
      title="Couldn't load the course library"
      action={
        <Button variant="secondary" size="sm" onClick={onRetryLibrary}>
          Retry
        </Button>
      }
      className="mb-6"
    >
      Check your connection and try again.
    </InlineNotice>
  ) : null;

  const q = query.trim();

  // Search mode — one results list across the whole library.
  if (q) {
    return (
      <div className="flex flex-col">
        {failedNotice}
        {filtered.length === 0 ? (
          onCreate ? (
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
          ) : (
            <EmptyState
              variant="subtle"
              icon={<IconFlag aria-hidden />}
              title={`No courses match “${q}”.`}
              description="Close this and type the course name on the setup screen, it’ll be added to the library when you save the round."
            />
          )
        ) : (
          <CourseSection label="Results" count={filtered.length}>
            <CourseList courses={filtered} onPrefetch={onPrefetch} onSelect={onSelect} />
          </CourseSection>
        )}
      </div>
    );
  }

  if (library.length === 0 && recent.length === 0 && team.length === 0) {
    // A failed library is not an empty one (RE-P3).
    return failedNotice ?? <EmptyCourses onCreate={onCreate} />;
  }

  const recentIds = new Set(recent.map((c) => c.id));
  const teamOnly = team.filter((c) => !recentIds.has(c.id));

  return (
    <div className="flex flex-col gap-7">
      {failedNotice}
      {recent.length > 0 && (
        <CourseSection label="Recently played" count={recent.length}>
          <CourseList courses={recent} onPrefetch={onPrefetch} onSelect={onSelect} />
        </CourseSection>
      )}
      {teamOnly.length > 0 && (
        <CourseSection label="Team courses" count={teamOnly.length}>
          <CourseList courses={teamOnly} onPrefetch={onPrefetch} onSelect={onSelect} />
        </CourseSection>
      )}
      {(library.length > 0 || onCreate) && (
        <CourseSection label="Course library" count={library.length}>
          <IndexedCourseList
            courses={library}
            scrollRef={scrollRef}
            onPrefetch={onPrefetch}
            onSelect={onSelect}
            onCreate={onCreate}
          />
        </CourseSection>
      )}
    </div>
  );
}

/** Eyebrow label + count above a grouped list. */
function CourseSection({ label, count, children }: { label: string; count: number; children: ReactNode }) {
  return (
    <section className="flex flex-col">
      <div className="mb-2 flex items-baseline justify-between px-1">
        <h2 className="font-fw-sans text-eyebrow font-semibold uppercase tracking-[0.16em] text-text-secondary">
          {label}
        </h2>
        <span className="font-fw-sans text-caption tabular-nums text-text-secondary">
          {count} {count === 1 ? 'course' : 'courses'}
        </span>
      </div>
      {children}
    </section>
  );
}

/** One grouped (inset) list of course rows. */
function CourseList({
  courses, onPrefetch, onSelect, children,
}: {
  courses: GolfCourse[];
  onPrefetch: (courseId: string) => void;
  onSelect: (courseId: string) => void;
  children?: ReactNode;
}) {
  return (
    <ul className="overflow-hidden rounded-card border border-border-subtle bg-surface">
      {courses.map((course) => (
        <li key={course.id} className="border-b border-border-subtle last:border-b-0">
          <CourseRow course={course} onPrefetch={onPrefetch} onSelect={onSelect} />
        </li>
      ))}
      {children}
    </ul>
  );
}

function CourseRow({
  course, onPrefetch, onSelect,
}: {
  course: GolfCourse;
  onPrefetch: (courseId: string) => void;
  onSelect: (courseId: string) => void;
}) {
  const name = formatCourseName(course.name);
  const location = [course.city, course.state].filter(Boolean).join(', ');
  return (
    // eslint-disable-next-line helm/no-raw-button -- full-width list row is a single tap target
    <button
      type="button"
      onPointerDown={() => onPrefetch(course.id)}
      onClick={() => onSelect(course.id)}
      aria-label={location ? `${name}, ${location}` : name}
      className="group flex min-h-16 w-full items-center gap-3 px-3 py-2.5 text-left transition-colors [transition-duration:var(--fw-dur-fast)] hover:bg-surface-sunken active:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-600"
    >
      <span className="relative h-11 w-11 flex-shrink-0 overflow-hidden rounded-md" aria-hidden>
        <CourseImage
          name={course.name}
          imageUrl={course.image_url}
          normalizedName={course.normalized_name}
          sizes="44px"
        />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-fw-sans text-body font-semibold text-text-primary">{name}</span>
        {location && (
          <span className="mt-0.5 inline-flex min-w-0 items-center gap-1 font-fw-sans text-caption text-text-secondary">
            <IconMapPin size={12} aria-hidden className="flex-shrink-0" />
            <span className="truncate">{location}</span>
          </span>
        )}
      </span>
      <IconChevronRight
        size={16}
        aria-hidden
        className="flex-shrink-0 text-text-secondary transition-transform [transition-duration:var(--fw-dur-fast)] group-hover:translate-x-0.5 motion-reduce:transition-none"
      />
    </button>
  );
}

/**
 * The full library, A–Z: a grouped list per letter plus a section index rail
 * (the iOS Contacts pattern) once the list is long enough to need one.
 */
function IndexedCourseList({
  courses, scrollRef, onPrefetch, onSelect, onCreate,
}: {
  courses: GolfCourse[];
  scrollRef: React.RefObject<HTMLDivElement | null>;
  onPrefetch: (courseId: string) => void;
  onSelect: (courseId: string) => void;
  onCreate?: () => void;
}) {
  const groups = useMemo(() => {
    const sorted = [...courses].sort((a, b) =>
      formatCourseName(a.name).localeCompare(formatCourseName(b.name), undefined, { sensitivity: 'base' }));
    const map = new Map<string, GolfCourse[]>();
    for (const c of sorted) {
      const k = indexLetter(c);
      const list = map.get(k);
      if (list) list.push(c);
      else map.set(k, [c]);
    }
    // '#' sorts last, like iOS.
    return [...map.entries()].sort(([a], [b]) => (a === '#' ? 1 : b === '#' ? -1 : a.localeCompare(b)));
  }, [courses]);

  const sectionRefs = useRef(new Map<string, HTMLElement>());
  const showRail = courses.length >= INDEX_RAIL_MIN && groups.length > 1;

  const jumpTo = (letter: string) => {
    const el = sectionRefs.current.get(letter);
    const scroller = scrollRef.current;
    if (!el || !scroller) return;
    fwHaptic('selection');
    const top = el.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - 8;
    scroller.scrollTo({ top, behavior: 'auto' });
  };

  return (
    <div className={cn('relative flex flex-col gap-4', showRail && 'pr-7')}>
      {groups.map(([letter, list]) => (
        <div
          key={letter}
          ref={(el) => { if (el) sectionRefs.current.set(letter, el); else sectionRefs.current.delete(letter); }}
          className="flex flex-col"
        >
          {groups.length > 1 && (
            <h3 className="mb-1 px-1 font-fw-sans text-caption font-semibold text-accent-700">{letter}</h3>
          )}
          <CourseList courses={list} onPrefetch={onPrefetch} onSelect={onSelect} />
        </div>
      ))}

      {onCreate && (
        // eslint-disable-next-line helm/no-raw-button -- dashed "add" row closing the library list
        <button
          type="button"
          onClick={onCreate}
          className="flex min-h-16 w-full items-center gap-3 rounded-card border-2 border-dashed border-border-strong bg-surface-sunken px-3 py-2.5 text-left transition-colors hover:border-accent-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-600"
        >
          <span className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-full bg-surface text-accent-700 shadow-flat">
            <IconPlus size={20} aria-hidden />
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="font-fw-sans text-body font-semibold text-text-primary">Add a course</span>
            <span className="font-fw-sans text-caption text-text-secondary">
              Can’t find it? Add the facility to the shared library.
            </span>
          </span>
        </button>
      )}

      {showRail && (
        <nav
          aria-label="Jump to letter"
          className="absolute right-0 top-0 flex h-full flex-col items-center"
        >
          <ol className="sticky top-2 flex flex-col items-center py-1">
            {groups.map(([letter]) => (
              <li key={letter}>
                {/* eslint-disable-next-line helm/no-raw-button -- section index rail item (iOS table index) */}
                <button
                  type="button"
                  onClick={() => jumpTo(letter)}
                  aria-label={`Jump to ${letter === '#' ? 'other' : letter}`}
                  className="flex h-5 w-6 items-center justify-center rounded font-fw-sans text-eyebrow text-accent-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-600"
                >
                  {letter}
                </button>
              </li>
            ))}
          </ol>
        </nav>
      )}
    </div>
  );
}

function EmptyCourses({ onCreate }: { onCreate?: () => void }) {
  return (
    <EmptyState
      variant="default"
      className="flex-1"
      icon={<IconFlag aria-hidden />}
      title="No courses yet"
      description={
        onCreate
          ? 'Add the first course to the shared library. Everyone on your team can play it from here.'
          : 'Close this and type the course name on the setup screen, it’ll be added to the library when you save the round.'
      }
      action={
        onCreate ? (
          <Button variant="primary" onClick={onCreate}>
            <IconPlus size={16} aria-hidden /> Add a course
          </Button>
        ) : undefined
      }
    />
  );
}

/**
 * Loading state for the tee grid. Shape-matched to FairwayTeeCard (two up from
 * `sm`, ~132px tall).
 */
function TeeCardSkeletons() {
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2" aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <li key={i} className="h-[132px] animate-pulse rounded-card bg-surface-sunken" />
      ))}
    </ul>
  );
}

// ── Tees screen ─────────────────────────────────────────────────────────────

function TeesStage({
  loading, tees, picking, onPick, onAddTee,
}: {
  loading: boolean;
  tees: GolfCourseTee[];
  picking: boolean;
  onPick: (tee: GolfCourseTee) => void;
  /** Undefined for a viewer who may not manage the library — createTee is
   *  behind the SAME requireCoachActor gate as createCourse. */
  onAddTee?: () => void;
}) {
  // Scale the length bars against the longest tee AT THIS COURSE.
  const longestYards = tees.reduce<number | null>(
    (max, t) => (typeof t.total_yards === 'number' && (max === null || t.total_yards > max) ? t.total_yards : max),
    null,
  );
  return (
    <div className="px-1 pb-2">
      {loading ? (
        <TeeCardSkeletons />
      ) : tees.length === 0 ? (
        <EmptyState
          variant="subtle"
          icon={<IconFlag aria-hidden />}
          title="No tee sets yet"
          description={
            onAddTee
              ? 'Add the tee you played to start the round and grow the course for your team.'
              : 'Go back and pick another course, or close this and enter your tees on the setup screen.'
          }
          action={
            onAddTee ? (
              <Button variant="primary" onClick={onAddTee}>
                <IconPlus size={16} aria-hidden /> Add a tee set
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          {/* One per row on a phone, two up from `sm`. */}
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {tees.map((tee) => (
              <li key={tee.id} className="min-w-0">
                <FairwayTeeCard
                  tee={tee}
                  longestYards={longestYards}
                  disabled={picking}
                  onClick={() => onPick(tee)}
                  className="h-full"
                />
              </li>
            ))}
          </ul>
          {onAddTee && (
            <div className="mt-4 flex justify-center">
              <Button variant="ghost" size="sm" onClick={onAddTee}>
                <IconPlus size={15} aria-hidden /> Add another tee set
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
