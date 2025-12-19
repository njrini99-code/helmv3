'use client';

import { useState, useMemo } from 'react';
import { Header } from '@/components/layout/header';
import { CollegeCard } from '@/components/features/college-card';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/empty-state';
import { Loading } from '@/components/ui/loading';
import { IconBuilding, IconSearch } from '@/components/icons';
import { useColleges, useStates, useConferences } from '@/hooks/use-colleges';

const divisions = [
  { value: '', label: 'All Divisions' },
  { value: 'D1', label: 'Division I' },
  { value: 'D2', label: 'Division II' },
  { value: 'D3', label: 'Division III' },
  { value: 'NAIA', label: 'NAIA' },
  { value: 'JUCO', label: 'Junior College' },
];

export default function CollegesPage() {
  const [division, setDivision] = useState('');
  const [stateFilter, setStateFilter] = useState('');
  const [conferenceFilter, setConferenceFilter] = useState('');
  const [search, setSearch] = useState('');

  const { colleges, interests, loading, toggleInterest } = useColleges({
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
    <>
      <Header
        title="Discover Colleges"
        subtitle={`${colleges.length} colleges${interestedCount > 0 ? ` • ${interestedCount} in your interests` : ''}`}
      />
      <div className="p-8">
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-4 mb-6">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <IconSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, city, or state..."
              className="pl-9"
            />
          </div>
          <Select
            options={divisions}
            value={division}
            onChange={(value) => setDivision(value)}
            className="w-36"
          />
          <Select
            options={stateOptions}
            value={stateFilter}
            onChange={(value) => setStateFilter(value)}
            className="w-36"
          />
          <Select
            options={conferenceOptions}
            value={conferenceFilter}
            onChange={(value) => setConferenceFilter(value)}
            className="w-48"
          />
        </div>

        {/* Results */}
        {loading ? (
          <Loading />
        ) : colleges.length === 0 ? (
          <EmptyState
            icon={<IconBuilding size={24} />}
            title="No colleges found"
            description="Try adjusting your search or filters."
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {colleges.map((college) => (
              <CollegeCard
                key={college.id}
                college={college}
                isInterested={interests.has(college.id)}
                onInterestToggle={toggleInterest}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
