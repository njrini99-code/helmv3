'use client';

import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { CourseCard } from './CourseCard';
import { CourseDetailDrawer } from './CourseDetailDrawer';
import { CourseFormDrawer } from './CourseFormDrawer';
import { Button } from '@/components/fairway/controls/button';
import { IconSearch, IconPlus, IconFlag, IconStar, IconX } from '@/components/icons';
import { normalizeName } from '@/lib/golf/course-library';
import type { GolfCourse, GolfTeamSavedCourseWithCourse } from '@/lib/types/golf-course';

export interface CourseLibraryClientProps {
  courses: GolfCourse[];
  teeCounts: Record<string, number>;
  savedCourses: GolfTeamSavedCourseWithCourse[];
  /** Coaches may save courses to the team library + manage tees. */
  canManageTeam: boolean;
  /** #913 part 2 — only a super admin may edit/remove a shared LIBRARY course
   *  (one with no human creator). Everything else keeps open contribution. */
  isSuperAdmin: boolean;
}

function playedMeta(saved: GolfTeamSavedCourseWithCourse): string | undefined {
  if (saved.times_played > 0) return `Played ${saved.times_played}×`;
  if (saved.default_tee) return `Default: ${saved.default_tee.tee_name}`;
  return undefined;
}

export function CourseLibraryClient({
  courses,
  teeCounts,
  savedCourses,
  canManageTeam,
  isSuperAdmin,
}: CourseLibraryClientProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  // Defer the value that drives filtering so a large library doesn't re-render
  // the whole grid on every keystroke (the input itself stays instant). (P342)
  const deferredQuery = useDeferredValue(query);
  const trimmed = deferredQuery.trim();
  const searching = trimmed.length > 0;

  // ⌘K / Ctrl-K / "/" focuses the search — the frequent action gets a shortcut
  // (Nielsen #7 flexibility & efficiency). "/" is ignored while typing in a
  // field so it never hijacks normal text entry. (P342)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const cmdK = (e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K');
      const slash =
        e.key === '/' &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        !(
          e.target instanceof HTMLElement &&
          (e.target.tagName === 'INPUT' ||
            e.target.tagName === 'TEXTAREA' ||
            e.target.tagName === 'SELECT' ||
            e.target.isContentEditable)
        );
      if (cmdK || slash) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Saved-course state (pin + default tee) keyed by course id, for the detail drawer.
  const savedById = useMemo(
    () => new Map(savedCourses.map((s) => [s.course_id, s])),
    [savedCourses],
  );

  const filtered = useMemo(() => {
    if (!searching) return courses;
    const nq = normalizeName(trimmed);
    const raw = trimmed.toLowerCase();
    return courses.filter((c) => {
      const hay = `${c.name} ${c.city ?? ''} ${c.state ?? ''}`.toLowerCase();
      return hay.includes(raw) || (c.normalized_name ?? normalizeName(c.name)).includes(nq);
    });
  }, [courses, trimmed, searching]);

  // Hero = top saved course, else the first course in the library.
  const heroSaved = savedCourses[0];
  const heroCourse = heroSaved?.course ?? courses[0];
  const savedRest = heroSaved ? savedCourses.slice(1) : savedCourses;

  // Dedupe the shelves: a premium catalog never shows the same course twice in
  // one view. The hero card and the "Your team's courses" rail render specific
  // courses above the "More courses" grid, so exclude those ids from the grid.
  const shownAboveIds = useMemo(() => {
    const ids = new Set<string>();
    if (heroCourse) ids.add(heroCourse.id);
    for (const s of savedRest) ids.add(s.course_id);
    return ids;
  }, [heroCourse, savedRest]);

  const restCourses = useMemo(
    () => courses.filter((c) => !shownAboveIds.has(c.id)),
    [courses, shownAboveIds],
  );

  const refresh = () => router.refresh();

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-16 pt-6 sm:px-6 lg:px-8">
      {/* ── Header ───────────────────────────────────────────── */}
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-fw-display text-title-1 font-semibold tracking-tight text-text-primary">
            Courses
          </h1>
          <p className="mt-1 text-body-sm text-text-secondary">
            {courses.length} {courses.length === 1 ? 'course' : 'courses'} in the cloud library
          </p>
        </div>
        {canManageTeam && (
          <Button variant="primary" onClick={() => setCreateOpen(true)} className="self-start sm:self-auto">
            <IconPlus size={16} aria-hidden /> Add course
          </Button>
        )}
      </header>

      {/* ── Search ───────────────────────────────────────────── */}
      <div className="relative mb-8 max-w-md">
        <IconSearch
          size={16}
          aria-hidden
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-tertiary"
        />
        {/* eslint-disable-next-line helm/no-raw-input -- native type=text with a leading icon + custom clear (consistent across browsers/iOS) */}
        <input
          ref={searchRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search courses…"
          aria-label="Search courses"
          autoComplete="off"
          enterKeyHint="search"
          className={cn(
            'h-11 w-full rounded-fw-sm border border-border-subtle bg-surface-sunken pl-10',
            query ? 'pr-10' : 'pr-3',
            'font-fw-sans text-body text-text-primary placeholder:text-text-tertiary',
            'transition-colors [transition-duration:var(--fw-dur-fast)]',
            'focus:border-border-focus focus:outline-none focus:ring-2 focus:ring-primary-500/30',
          )}
        />
        {query && (
          // Custom clear control: the native type=search "×" is inconsistent
          // across browsers/iOS, so we render our own visible, keyboard-reachable
          // one. (P342)
          // eslint-disable-next-line helm/no-raw-button -- self-contained search clear affordance inside the input shell
          <button
            type="button"
            onClick={() => {
              setQuery('');
              searchRef.current?.focus();
            }}
            aria-label="Clear search"
            className={cn(
              'absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-fw-sm',
              'text-text-tertiary transition-colors [transition-duration:var(--fw-dur-fast)]',
              'hover:bg-surface hover:text-text-secondary',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
            )}
          >
            <IconX size={15} aria-hidden />
          </button>
        )}
      </div>

      {courses.length === 0 ? (
        <EmptyState onAdd={() => setCreateOpen(true)} canManage={canManageTeam} />
      ) : searching ? (
        <Section title={`${filtered.length} ${filtered.length === 1 ? 'result' : 'results'}`}>
          {filtered.length === 0 ? (
            <p className="py-8 text-center text-body-sm text-text-tertiary">
              No courses match “{trimmed}”.
            </p>
          ) : (
            <Grid>
              {filtered.map((c) => (
                <CourseCard
                  key={c.id}
                  course={c}
                  teeCount={teeCounts[c.id]}
                  onSelect={setSelectedCourseId}
                />
              ))}
            </Grid>
          )}
        </Section>
      ) : (
        <div className="space-y-10">
          {/* Hero */}
          {heroCourse && (
            <CourseCard
              course={heroCourse}
              teeCount={teeCounts[heroCourse.id]}
              variant="featured"
              priority
              pinned={heroSaved?.pinned ?? false}
              meta={heroSaved ? playedMeta(heroSaved) : undefined}
              onSelect={setSelectedCourseId}
            />
          )}

          {/* Saved / team courses */}
          {savedRest.length > 0 ? (
            <Section title="Your team's courses">
              <Grid>
                {savedRest.map((s) => (
                  <CourseCard
                    key={s.id}
                    course={s.course}
                    teeCount={teeCounts[s.course_id]}
                    pinned={s.pinned}
                    meta={playedMeta(s)}
                    onSelect={setSelectedCourseId}
                  />
                ))}
              </Grid>
            </Section>
          ) : (
            // Coach with no saved courses: make the team-library capability
            // discoverable up front (recognition over recall) rather than only
            // after opening a course's detail drawer. (P346)
            canManageTeam &&
            savedCourses.length === 0 && (
              <Section title="Your team's courses">
                <div className="flex items-start gap-3 rounded-fw-lg border border-dashed border-border-subtle bg-surface px-5 py-4">
                  <span
                    aria-hidden
                    className="mt-0.5 inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-primary-50 text-primary-600"
                  >
                    <IconStar size={16} />
                  </span>
                  <p className="text-body-sm text-text-secondary">
                    Save courses your team plays for one-tap access. Open any course below and
                    choose <span className="font-medium text-text-primary">Save to team</span>.
                  </p>
                </div>
              </Section>
            )
          )}

          {/* More courses — everything not already surfaced as the hero or in
              the team rail above (deduped so no course renders twice). */}
          {restCourses.length > 0 && (
            <Section title={shownAboveIds.size > 0 ? 'More courses' : 'All courses'}>
              <Grid>
                {restCourses.map((c) => (
                  <CourseCard
                    key={c.id}
                    course={c}
                    teeCount={teeCounts[c.id]}
                    onSelect={setSelectedCourseId}
                  />
                ))}
              </Grid>
            </Section>
          )}
        </div>
      )}

      {/* Detail drawer */}
      <CourseDetailDrawer
        courseId={selectedCourseId}
        open={selectedCourseId !== null}
        onOpenChange={(o) => !o && setSelectedCourseId(null)}
        canManageTeam={canManageTeam}
        isSuperAdmin={isSuperAdmin}
        savedCourseIds={new Set(savedCourses.map((s) => s.course_id))}
        savedById={savedById}
        onChanged={refresh}
      />

      {/* Create course */}
      <CourseFormDrawer
        open={createOpen}
        onOpenChange={setCreateOpen}
        mode="create"
        onSaved={(course) => {
          refresh();
          setCreateOpen(false);
          setSelectedCourseId(course.id); // jump straight into the new course
        }}
      />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 font-fw-sans text-body-sm font-semibold uppercase tracking-[0.06em] text-text-tertiary">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
  );
}

function EmptyState({ onAdd, canManage }: { onAdd: () => void; canManage: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-fw-lg border border-dashed border-border-subtle bg-surface px-6 py-16 text-center">
      <span className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full bg-primary-50 text-primary-600">
        <IconFlag size={24} aria-hidden />
      </span>
      <h3 className="font-fw-display text-title-3 font-semibold text-text-primary">No courses yet</h3>
      <p className="mt-1 max-w-sm text-body-sm text-text-secondary">
        {canManage
          ? 'Add the courses your team plays. Each course can hold multiple tee sets with their own pars and yardages.'
          : 'Your coach hasn’t added any courses yet.'}
      </p>
      {canManage && (
        <Button variant="primary" onClick={onAdd} className="mt-5">
          <IconPlus size={16} aria-hidden /> Add your first course
        </Button>
      )}
    </div>
  );
}
