'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { CourseCard } from './CourseCard';
import { CourseDetailDrawer } from './CourseDetailDrawer';
import { CourseFormDrawer } from './CourseFormDrawer';
import { Button } from '@/components/ui/button';
import { IconSearch, IconPlus, IconFlag } from '@/components/icons';
import { normalizeName } from '@/lib/golf/course-library';
import type { GolfCourse, GolfTeamSavedCourseWithCourse } from '@/lib/types/golf-course';

export interface CourseLibraryClientProps {
  courses: GolfCourse[];
  teeCounts: Record<string, number>;
  savedCourses: GolfTeamSavedCourseWithCourse[];
  /** Coaches may save courses to the team library + manage tees. */
  canManageTeam: boolean;
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
}: CourseLibraryClientProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const trimmed = query.trim();
  const searching = trimmed.length > 0;

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
        <Button variant="primary" onClick={() => setCreateOpen(true)} className="self-start sm:self-auto">
          <IconPlus size={16} aria-hidden /> Add course
        </Button>
      </header>

      {/* ── Search ───────────────────────────────────────────── */}
      <div className="relative mb-8 max-w-md">
        <IconSearch
          size={16}
          aria-hidden
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-tertiary"
        />
        {/* eslint-disable-next-line helm/no-raw-input -- native type=search with a leading icon */}
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search courses…"
          aria-label="Search courses"
          className={cn(
            'h-11 w-full rounded-fw-sm border border-border-subtle bg-surface-sunken pl-10 pr-3',
            'font-fw-sans text-body text-text-primary placeholder:text-text-tertiary',
            'transition-colors [transition-duration:var(--fw-dur-fast)]',
            'focus:border-border-focus focus:outline-none focus:ring-2 focus:ring-primary-500/30',
          )}
        />
      </div>

      {courses.length === 0 ? (
        <EmptyState onAdd={() => setCreateOpen(true)} />
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
          {savedRest.length > 0 && (
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
          )}

          {/* All courses */}
          <Section title="All courses">
            <Grid>
              {courses.map((c) => (
                <CourseCard
                  key={c.id}
                  course={c}
                  teeCount={teeCounts[c.id]}
                  onSelect={setSelectedCourseId}
                />
              ))}
            </Grid>
          </Section>
        </div>
      )}

      {/* Detail drawer */}
      <CourseDetailDrawer
        courseId={selectedCourseId}
        open={selectedCourseId !== null}
        onOpenChange={(o) => !o && setSelectedCourseId(null)}
        canManageTeam={canManageTeam}
        savedCourseIds={new Set(savedCourses.map((s) => s.course_id))}
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

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-fw-lg border border-dashed border-border-subtle bg-surface px-6 py-16 text-center">
      <span className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full bg-primary-50 text-primary-600">
        <IconFlag size={24} aria-hidden />
      </span>
      <h3 className="font-fw-display text-title-3 font-semibold text-text-primary">No courses yet</h3>
      <p className="mt-1 max-w-sm text-body-sm text-text-secondary">
        Add the courses your team plays. Each course can hold multiple tee sets with their own pars and yardages.
      </p>
      <Button variant="primary" onClick={onAdd} className="mt-5">
        <IconPlus size={16} aria-hidden /> Add your first course
      </Button>
    </div>
  );
}
