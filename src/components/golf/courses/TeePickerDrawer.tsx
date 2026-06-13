'use client';

import { useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { CourseImage } from './CourseImage';
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer';
import { useToast } from '@/components/ui/sonner';
import { IconSearch, IconChevronRight, IconChevronLeft, IconFlag, IconMapPin } from '@/components/icons';
import {
  listCourses, getCourseDetail, getTeeRoundDefaults, type TeeRoundDefaults,
} from '@/app/golf/actions/course-library';
import { normalizeName } from '@/lib/golf/course-library';
import type { GolfCourse, GolfCourseTee } from '@/lib/types/golf-course';

/**
 * New-round tee picker: choose a course → choose a tee. On pick it returns the
 * tee's hole defaults (TeeRoundDefaults) so the round form can pre-fill pars/
 * yards and record golf_rounds.tee_id. The round still snapshots its own holes.
 */

const CATEGORY_LABEL: Record<string, string> = {
  mens: "Men's", womens: "Women's", tournament: 'Tournament', mixed: 'Mixed',
  senior: 'Senior', junior: 'Junior', custom: 'Custom',
};

export interface TeePickerDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (defaults: TeeRoundDefaults) => void;
}

export function TeePickerDrawer({ open, onOpenChange, onPick }: TeePickerDrawerProps) {
  const { showToast } = useToast();
  const [courses, setCourses] = useState<GolfCourse[]>([]);
  const [loadingCourses, setLoadingCourses] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<GolfCourse | null>(null);
  const [tees, setTees] = useState<GolfCourseTee[]>([]);
  const [loadingTees, setLoadingTees] = useState(false);
  const [picking, setPicking] = useState(false);

  // Load courses when opened; reset when closed.
  useEffect(() => {
    if (!open) {
      setSelected(null); setTees([]); setQuery('');
      return;
    }
    setLoadingCourses(true);
    listCourses({ limit: 200 })
      .then(setCourses)
      .finally(() => setLoadingCourses(false));
  }, [open]);

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

  const selectCourse = async (course: GolfCourse) => {
    setSelected(course);
    setLoadingTees(true);
    setTees([]);
    try {
      const detail = await getCourseDetail(course.id);
      setTees(detail?.tees ?? []);
    } finally {
      setLoadingTees(false);
    }
  };

  const pickTee = async (tee: GolfCourseTee) => {
    setPicking(true);
    try {
      const defaults = await getTeeRoundDefaults(tee.id);
      if (!defaults) { showToast('Could not load that tee', 'error'); return; }
      onPick(defaults);
      onOpenChange(false);
    } finally {
      setPicking(false);
    }
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="sm:mx-auto sm:max-w-lg sm:rounded-fw-lg">
        <DrawerTitle className="sr-only">
          {selected ? `Choose a tee at ${selected.name}` : 'Choose a course'}
        </DrawerTitle>

        <div className="flex max-h-[86vh] flex-col">
          {/* Header */}
          <div className="flex items-center gap-2 border-b border-border-subtle px-4 py-3">
            {selected ? (
              // eslint-disable-next-line helm/no-raw-button -- compact icon back-affordance in the sheet header
              <button
                type="button"
                onClick={() => { setSelected(null); setTees([]); }}
                aria-label="Back to courses"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-surface-sunken hover:text-text-primary"
              >
                <IconChevronLeft size={18} aria-hidden />
              </button>
            ) : null}
            <h2 className="font-fw-display text-title-3 font-semibold text-text-primary">
              {selected ? selected.name : 'Choose a course'}
            </h2>
          </div>

          {!selected ? (
            <>
              <div className="relative px-4 py-3">
                <IconSearch size={16} aria-hidden className="pointer-events-none absolute left-7 top-1/2 -translate-y-1/2 text-text-tertiary" />
                {/* eslint-disable-next-line helm/no-raw-input -- native type=search with a leading icon */}
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search courses…"
                  aria-label="Search courses"
                  className="h-11 w-full rounded-fw-sm border border-border-subtle bg-surface-sunken pl-9 pr-3 text-body text-text-primary placeholder:text-text-tertiary focus:border-border-focus focus:outline-none focus:ring-2 focus:ring-primary-500/30"
                />
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
                {loadingCourses ? (
                  <SkeletonRows />
                ) : filtered.length === 0 ? (
                  <p className="py-10 text-center text-body-sm text-text-tertiary">
                    {courses.length === 0 ? 'No courses in the library yet.' : 'No matches.'}
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {filtered.map((c) => (
                      <li key={c.id}>
                        <CourseRow course={c} onClick={() => selectCourse(c)} />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {loadingTees ? (
                <SkeletonRows />
              ) : tees.length === 0 ? (
                <p className="py-10 text-center text-body-sm text-text-tertiary">
                  This course has no tee sets yet. Add one from the course library first.
                </p>
              ) : (
                <ul className="space-y-2">
                  {tees.map((tee) => (
                    <li key={tee.id}>
                      <TeePickRow tee={tee} disabled={picking} onClick={() => pickTee(tee)} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function CourseRow({ course, onClick }: { course: GolfCourse; onClick: () => void }) {
  const location = [course.city, course.state].filter(Boolean).join(', ');
  return (
    // eslint-disable-next-line helm/no-raw-button -- compact selectable list row
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-fw-md border border-border-subtle bg-surface px-3 py-2.5 text-left transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
    >
      <div className="relative h-12 w-16 flex-shrink-0 overflow-hidden rounded-fw-sm">
        <CourseImage name={course.name} imageUrl={course.image_url} sizes="64px" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-fw-sans text-body font-medium text-text-primary">{course.name}</p>
        {location && (
          <p className="mt-0.5 inline-flex items-center gap-1 truncate text-caption text-text-tertiary">
            <IconMapPin size={11} aria-hidden /> {location}
          </p>
        )}
      </div>
      <IconChevronRight size={16} aria-hidden className="flex-shrink-0 text-text-tertiary" />
    </button>
  );
}

export function TeePickRow({ tee, disabled, onClick }: { tee: GolfCourseTee; disabled: boolean; onClick: () => void }) {
  const cat = tee.category ? CATEGORY_LABEL[tee.category] ?? tee.category : null;
  const facts = [
    typeof tee.total_par === 'number' ? `Par ${tee.total_par}` : null,
    typeof tee.total_yards === 'number' ? `${tee.total_yards.toLocaleString()} yds` : null,
  ].filter(Boolean);
  return (
    // eslint-disable-next-line helm/no-raw-button -- compact selectable list row
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex w-full items-center gap-3 rounded-fw-md border border-border-subtle bg-surface px-4 py-3 text-left',
        'transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500',
        'disabled:opacity-60',
      )}
    >
      <span aria-hidden className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-primary-50 text-primary-600">
        <IconFlag size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-fw-sans text-body font-medium text-text-primary">{tee.tee_name}</span>
          {cat && (
            <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-caption font-medium text-text-secondary">{cat}</span>
          )}
          {tee.is_draft && (
            <span className="rounded-full bg-warning/15 px-2 py-0.5 text-caption font-medium text-warning">Draft</span>
          )}
        </div>
        {facts.length > 0 && <p className="mt-0.5 text-caption text-text-tertiary">{facts.join(' · ')}</p>}
      </div>
      <IconChevronRight size={16} aria-hidden className="flex-shrink-0 text-text-tertiary" />
    </button>
  );
}

export function SkeletonRows() {
  return (
    <div className="space-y-2 pt-1">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-16 animate-pulse rounded-fw-md bg-surface-sunken" />
      ))}
    </div>
  );
}
