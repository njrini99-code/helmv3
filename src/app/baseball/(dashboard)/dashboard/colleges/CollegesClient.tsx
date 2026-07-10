'use client';

// =============================================================================
// CollegesClient — the player's "discover colleges" search surface, migrated
// onto "The Living Annual" kit (Lane 3 · THE PASSPORT, green ink —
// ui-migration-map.md `college-interest`/`profile` row: SectionMasthead +
// PaperCard + editorial).
//
// PRESENTATION ONLY. `useColleges`/`useStates`/`useConferences` (the org
// query + interest-toggle state) are unchanged; only the render moved to the
// kit — a skeleton grid replaces the spinner, and the error/empty states
// compose `<EditorsLetter>` instead of a bespoke `<EmptyState>`.
// =============================================================================

import { useState, useMemo } from 'react';
import { CollegeCard } from '@/components/features/college-card';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { IconSearch } from '@/components/icons';
import { useColleges, useStates, useConferences } from '@/hooks/use-colleges';
import { cn } from '@/lib/utils';
import { SectionMasthead, PaperCard, EditorsLetter, Reveal } from '@/components/baseball/living-annual';

const PAGE_SHELL = 'mx-auto w-full max-w-[1536px] px-4 py-8 sm:px-6';

const divisions = [
  { value: '', label: 'All Divisions' },
  { value: 'D1', label: 'Division I' },
  { value: 'D2', label: 'Division II' },
  { value: 'D3', label: 'Division III' },
  { value: 'NAIA', label: 'NAIA' },
  { value: 'JUCO', label: 'Junior College' },
];

function CollegesGridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
        <PaperCard key={i} className="p-5">
          <div className="flex items-start gap-4">
            <Skeleton variant="circular" width={48} height={48} />
            <div className="flex-1 space-y-2">
              <Skeleton variant="text" width="70%" height={16} />
              <Skeleton variant="text" width="50%" height={11} />
              <Skeleton variant="text" width="40%" height={16} className="mt-2" />
            </div>
          </div>
        </PaperCard>
      ))}
    </div>
  );
}

export default function CollegesClient() {
  const [division, setDivision] = useState('');
  const [stateFilter, setStateFilter] = useState('');
  const [conferenceFilter, setConferenceFilter] = useState('');
  const [search, setSearch] = useState('');

  const { colleges, interests, loading, error, refetch, toggleInterest } = useColleges({
    division: division || undefined,
    state: stateFilter || undefined,
    conference: conferenceFilter || undefined,
    search: search || undefined
  });

  const { states } = useStates();
  const { conferences } = useConferences();

  const stateOptions = useMemo(() => [
    { value: '', label: 'All States' },
    ...states.map(s => ({ value: s, label: s }))
  ], [states]);

  const conferenceOptions = useMemo(() => [
    { value: '', label: 'All Conferences' },
    ...conferences.map(c => ({ value: c, label: c }))
  ], [conferences]);

  const interestedCount = interests.size;

  return (
    <div className={cn(PAGE_SHELL, 'space-y-8')}>
      <SectionMasthead eyebrow="THE PASSPORT · COLLEGE SEARCH" title="Discover Colleges" ink="team">
        <p className="max-w-prose font-annual text-body-sm text-text-secondary">
          {colleges.length} colleges{interestedCount > 0 ? ` · ${interestedCount} in your interests` : ''}
        </p>
      </SectionMasthead>

      {/* Filters */}
      <PaperCard className="p-5">
        <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="relative min-w-[200px] flex-1 sm:max-w-md">
            <IconSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, city, or state..."
              className="pl-9"
            />
          </div>
          <div className="grid grid-cols-3 gap-3 sm:flex">
            <Select options={divisions} value={division} onChange={setDivision} className="sm:w-36" />
            <Select options={stateOptions} value={stateFilter} onChange={setStateFilter} className="sm:w-36" />
            <Select options={conferenceOptions} value={conferenceFilter} onChange={setConferenceFilter} className="sm:w-48" />
          </div>
        </div>
      </PaperCard>

      {/* Results */}
      {loading ? (
        <CollegesGridSkeleton />
      ) : error ? (
        <EditorsLetter
          ink="team"
          title="Couldn't load colleges"
          body={error}
          action={
            <Button variant="secondary" size="sm" onClick={refetch}>
              Retry
            </Button>
          }
        />
      ) : colleges.length === 0 ? (
        <EditorsLetter
          ink="team"
          title="No colleges found."
          body="Try adjusting your search or filters."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {colleges.map((college, i) => (
            <Reveal key={college.id} staggerIndex={Math.min(i, 10)}>
              <CollegeCard
                college={college}
                isInterested={interests.has(college.id)}
                onInterestToggle={toggleInterest}
              />
            </Reveal>
          ))}
        </div>
      )}
    </div>
  );
}
