'use client';

/**
 * Fairway · Recruiting HQ — coach prospect tracker.
 *
 * Orchestrator: header + add CTA → funnel snapshot (filter plates) → toolbar
 * (search + reset + sort) → card grid → honest empties → edit drawer.
 *
 * State model is server-truth + router.refresh() after a save/delete (no
 * mutable local array); filter/search/sort are client useMemo over the fetched
 * list. The derivation logic (counts, search, sort) is ported byte-for-byte
 * from the legacy RecruitingPageClient — only the rendering is restyled.
 */

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Search, GraduationCap } from 'lucide-react';

import { Button } from '@/components/fairway/controls/button';
import { FilterPill } from '@/components/fairway/controls/filter-pill';
import { Segmented } from '@/components/fairway/controls/segmented';
import { StatusPill } from '@/components/fairway/controls/status-pill';
import { Surface } from '@/components/fairway/surfaces/surface';
import { Input } from '@/components/fairway/forms/Input';
import { EmptyState } from '@/components/fairway/feedback/EmptyState';
import { InlineNotice } from '@/components/fairway/feedback/InlineNotice';
import type { Recruit, RecruitStatus } from '@/app/golf/actions/recruiting';
import { FairwayRecruitCard } from './FairwayRecruitCard';
import { FairwayRecruitFormSheet } from './FairwayRecruitFormSheet';
import { RECRUIT_STATUS_META } from './recruit-status';

export interface FairwayRecruitingPageProps {
  initialRecruits: Recruit[];
  loadError?: string | null;
}

type StatusFilter = 'all' | RecruitStatus;
type SortKey = 'updated' | 'name' | 'class';

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'updated', label: 'Recently updated' },
  { value: 'name', label: 'Name A–Z' },
  { value: 'class', label: 'Class year' },
];

export function FairwayRecruitingPage({
  initialRecruits,
  loadError = null,
}: FairwayRecruitingPageProps) {
  const router = useRouter();
  // No mutable local array — lean on router.refresh() so the list always
  // matches server-truth after a save/delete.
  const recruits = initialRecruits;
  const [filter, setFilter] = React.useState<StatusFilter>('all');
  const [search, setSearch] = React.useState('');
  const [sort, setSort] = React.useState<SortKey>('updated');
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Recruit | null>(null);
  const [isPending, startTransition] = React.useTransition();

  // Counts per status (drives the funnel filter plates).
  const counts = React.useMemo(() => {
    const map: Record<StatusFilter, number> = {
      all: recruits.length,
      watched: 0,
      recruiting: 0,
      offered: 0,
      committed: 0,
    };
    for (const r of recruits) map[r.status] += 1;
    return map;
  }, [recruits]);

  const visible = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = recruits.filter((r) => {
      if (filter !== 'all' && r.status !== filter) return false;
      if (!q) return true;
      const name = `${r.first_name} ${r.last_name ?? ''}`.toLowerCase();
      return (
        name.includes(q) ||
        (r.hometown ?? '').toLowerCase().includes(q) ||
        (r.state ?? '').toLowerCase().includes(q) ||
        (r.email ?? '').toLowerCase().includes(q) ||
        (r.notes ?? '').toLowerCase().includes(q)
      );
    });

    list = [...list].sort((a, b) => {
      if (sort === 'name') {
        return `${a.first_name} ${a.last_name ?? ''}`.localeCompare(
          `${b.first_name} ${b.last_name ?? ''}`,
        );
      }
      if (sort === 'class') {
        return (a.hs_class ?? 9999) - (b.hs_class ?? 9999);
      }
      // 'updated'
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });

    return list;
  }, [recruits, filter, search, sort]);

  const handleSaved = () => {
    // Re-fetch from server via revalidate (server-truth, no local mutation).
    startTransition(() => {
      router.refresh();
    });
  };

  const openAdd = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const isFiltered = recruits.length > 0;

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-6 md:px-6 md:py-8">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-fw-sans text-eyebrow font-semibold uppercase tracking-[0.18em] text-accent-700">
            Recruiting HQ
          </p>
          <h1 className="mt-1 font-fw-display text-h1 font-semibold tracking-[-0.02em] text-text-primary">
            Your prospects.
          </h1>
          <p className="mt-1 font-fw-sans text-body-sm text-text-tertiary">
            Track prospects from first look to letter of intent.
          </p>
        </div>
        <Button variant="primary" leftIcon={<Plus className="h-4 w-4" />} onClick={openAdd}>
          Add prospect
        </Button>
      </div>

      {loadError ? (
        <InlineNotice tone="danger" title="Couldn’t load your prospect list" className="mb-4">
          {loadError}. Try refreshing.
        </InlineNotice>
      ) : null}

      {/* Funnel snapshot — one stat plate per status; click toggles the filter */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {RECRUIT_STATUS_META.map((s) => {
          const active = filter === s.value;
          return (
            <Surface
              key={s.value}
              elevation={active ? 'shadow' : 'border'}
              padding="none"
              className="overflow-hidden"
            >
              {/* Intentional raw <button>: the stat plate is the click target
                  wrapping warm Fairway chrome (Surface/StatusPill + a big mono
                  count). <Button> would impose pill-CTA chrome. Same exception
                  the sibling FairwayIntentControl / InlineNotice take. */}
              {/* eslint-disable-next-line helm/no-raw-button */}
              <button
                type="button"
                onClick={() => setFilter(active ? 'all' : (s.value as StatusFilter))}
                aria-pressed={active}
                className="flex w-full flex-col items-start gap-1.5 p-4 text-left transition-colors hover:bg-surface-tint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
              >
                <StatusPill tone={s.tone}>{s.label}</StatusPill>
                <span className="font-fw-mono text-h2 font-semibold leading-none tabular-nums text-text-primary">
                  {counts[s.value]}
                </span>
                <span className="font-fw-sans text-caption text-text-tertiary">
                  {active ? 'Filtering' : s.description}
                </span>
              </button>
            </Surface>
          );
        })}
      </div>

      {/* Toolbar — search + reset + sort */}
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center">
        <div className="flex-1">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, hometown, email, or notes…"
            aria-label="Search prospects"
            leading={<Search className="h-4 w-4" />}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FilterPill
            selected={filter === 'all'}
            count={counts.all}
            onClick={() => setFilter('all')}
            disabled={filter === 'all'}
          >
            All
          </FilterPill>
          <Segmented<SortKey>
            size="sm"
            aria-label="Sort prospects"
            value={sort}
            onValueChange={setSort}
            options={SORT_OPTIONS}
          />
        </div>
      </div>

      {/* Grid + honest empties */}
      <div aria-busy={isPending}>
        {visible.length === 0 ? (
          <Surface elevation="border" padding="none">
            <EmptyState
              variant={isFiltered ? 'search' : 'default'}
              icon={GraduationCap}
              title={isFiltered ? 'No prospects match' : 'Start your prospect list'}
              description={
                isFiltered
                  ? 'Try a different status, sort, or search term.'
                  : 'Add high-school golfers you’re tracking. Notes, contact info, and status all live here.'
              }
              action={
                isFiltered ? undefined : (
                  <Button variant="primary" leftIcon={<Plus className="h-4 w-4" />} onClick={openAdd}>
                    Add your first prospect
                  </Button>
                )
              }
            />
          </Surface>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visible.map((r) => (
              <FairwayRecruitCard
                key={r.id}
                recruit={r}
                onClick={() => {
                  setEditing(r);
                  setFormOpen(true);
                }}
              />
            ))}
          </div>
        )}
      </div>

      <FairwayRecruitFormSheet
        open={formOpen}
        recruit={editing}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        onSaved={handleSaved}
      />
    </div>
  );
}

export default FairwayRecruitingPage;
