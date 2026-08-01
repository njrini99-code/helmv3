'use client';

/**
 * Fairway · Recruiting HQ — coach prospect tracker.
 *
 * Orchestrator: ViewHeader masthead (eyebrow + title + add CTA) → funnel
 * snapshot (filter plates) → toolbar (search + reset + sort) → card grid →
 * honest empties → edit drawer.
 *
 * State model is server-truth + router.refresh() after a save/delete (no
 * mutable local array); filter/search/sort are client useMemo over the fetched
 * list. The derivation logic (counts, search, sort) is ported byte-for-byte
 * from the legacy RecruitingPageClient — only the rendering is restyled.
 */

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Plus, GraduationCap, RotateCw } from 'lucide-react';

import { Button } from '@/components/fairway/controls/button';
import { FilterPill } from '@/components/fairway/controls/filter-pill';
import { Segmented } from '@/components/fairway/controls/segmented';
import { StatusPill } from '@/components/fairway/controls/status-pill';
import { Surface } from '@/components/fairway/surfaces/surface';
import { SearchField } from '@/components/fairway/command/search-field';
import { EmptyState } from '@/components/fairway/feedback/EmptyState';
import { InlineNotice } from '@/components/fairway/feedback/InlineNotice';
import { ViewHeader } from '@/components/fairway/view-header/view-header';
import { useLocalStorage } from '@/hooks/use-local-storage';
import { cn } from '@/lib/utils';
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
  // P124 — remember the coach's last sort + filter across visits. useLocalStorage
  // is hydration-safe (returns the default during SSR, the stored value after
  // mount) so the first paint never mismatches the server-rendered markup.
  const [filter, setFilter] = useLocalStorage<StatusFilter>(
    'fw-recruiting-filter',
    'all',
  );
  const [search, setSearch] = React.useState('');
  const [sort, setSort] = useLocalStorage<SortKey>('fw-recruiting-sort', 'updated');
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Recruit | null>(null);
  const [isPending, startTransition] = React.useTransition();
  // P127 — focus + SR cues across the save → sheet-close → router.refresh() churn.
  const addButtonRef = React.useRef<HTMLButtonElement>(null);
  const returnFocusAfterClose = React.useRef(false);
  const [statusMessage, setStatusMessage] = React.useState('');

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

  // P127 — after the sheet closes, vaul/Radix tries to restore focus to whatever
  // was focused before it opened (the edited card), but that card is removed by
  // router.refresh(), so focus falls to document.body. Once the sheet is closed
  // we deterministically steer focus to the stable "Add prospect" control. vaul's
  // focus restore can land late (after its exit animation), so we re-assert focus
  // briefly until the button actually holds it, winning the race either way.
  React.useEffect(() => {
    if (formOpen || !returnFocusAfterClose.current) return;
    returnFocusAfterClose.current = false;
    const start = Date.now();
    let raf = 0;
    const claim = () => {
      const btn = addButtonRef.current;
      const active = document.activeElement;
      // Only reclaim while focus is "lost" to the document body (the bug state)
      // or still held by vaul's own restore guard — never yank focus away from a
      // real control the user has since tabbed to (that would be a focus trap).
      const focusIsLost =
        !active || active === document.body || active.getAttribute('data-radix-focus-guard') !== null;
      if (btn && active !== btn && focusIsLost) btn.focus();
      // Re-claim for a short window so we outlast vaul's late (post-animation) restore.
      if ((!active || active === document.body) && Date.now() - start < 400) {
        raf = window.requestAnimationFrame(claim);
      }
    };
    raf = window.requestAnimationFrame(claim);
    return () => window.cancelAnimationFrame(raf);
  }, [formOpen]);

  const handleSaved = () => {
    // Announce the result for screen-reader users (more durable than the
    // transient toast) and arm the post-close focus return above.
    setStatusMessage('Prospect list updated.');
    returnFocusAfterClose.current = true;
    // Re-fetch from server via revalidate (server-truth, no local mutation).
    startTransition(() => {
      router.refresh();
    });
  };

  const handleRetry = () => {
    // P117 — a real, working retry for the load-error surface.
    startTransition(() => {
      router.refresh();
    });
  };

  const openAdd = () => {
    setEditing(null);
    setFormOpen(true);
  };

  // P120 — one-tap escape from a filtered/searched dead-end.
  const resetFilters = () => {
    setFilter('all');
    setSearch('');
    setSort('updated');
  };

  const isFiltered = recruits.length > 0;
  // P119 — distinguish "nothing yet" from real metrics: the funnel plates show
  // authoritative zeros only when there's actually data behind them.
  const hasRecruits = recruits.length > 0;

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-6 md:px-6 md:py-8">
      {/* Masthead — the one canonical ViewHeader primitive (eyebrow + title +
          description + primary CTA), pixel-identical to every other feature page. */}
      <ViewHeader
        className="mb-6"
        eyebrow="Recruiting HQ"
        title="Your prospects."
        description="Track prospects from first look to letter of intent."
        primaryAction={
          <Button
            ref={addButtonRef}
            variant="primary"
            leftIcon={<Plus className="h-4 w-4" />}
            onClick={openAdd}
          >
            Add prospect
          </Button>
        }
      />

      {/* P127 — polite live region: durable SR cue after a save/delete + refresh,
          beyond the transient toast. Visually hidden; announced on change. */}
      <p className="sr-only" role="status" aria-live="polite">
        {statusMessage}
      </p>

      {loadError ? (
        /* P117 — a load failure is NOT an empty list. Render a dedicated error
           surface with a real, working Retry; suppress the funnel/toolbar/grid
           (and the cheerful "Add your first prospect" CTA) entirely so a failure
           is never masked as "nothing here yet". */
        <InlineNotice
          tone="danger"
          title="Couldn’t load your prospect list"
          action={
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<RotateCw className="h-4 w-4" />}
              busy={isPending}
              onClick={handleRetry}
            >
              Try again
            </Button>
          }
        >
          {loadError} Your prospects are safe — this is just a display hiccup.
        </InlineNotice>
      ) : (
        <>
          {/* Funnel snapshot — one stat plate per status; click toggles the
              filter. P119: with no recruits the four counts are all 0; dim them
              so they read as "nothing yet", not authoritative metrics, and let
              the empty state below carry the single message. */}
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
                    disabled={!hasRecruits}
                    className="flex w-full flex-col items-start gap-1.5 p-4 text-left transition-colors hover:bg-surface-tint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:cursor-default disabled:hover:bg-transparent"
                  >
                    <StatusPill tone={s.tone}>{s.label}</StatusPill>
                    <span
                      className={cn(
                        'font-fw-mono text-h2 font-semibold leading-none tabular-nums',
                        // P119: a real value is authoritative; an all-zero plate
                        // (no data) is de-emphasized so it doesn't read as a metric.
                        hasRecruits ? 'text-text-primary' : 'text-text-tertiary/60',
                      )}
                    >
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

          {/* Toolbar — search (with clear) + filter + labeled sort.
              P126: a flex-wrap row crammed the All pill + a 3-segment control at
              360px. The sort now sits in its own labeled row that stacks below the
              search on mobile and only rejoins it inline at md, so it never wraps
              to a cramped second line and never needs horizontal scroll. */}
          <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center">
            <div className="flex-1">
              <SearchField
                size="sm"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onClear={() => setSearch('')}
                placeholder="Search by name, hometown, email, or notes…"
                aria-label="Search prospects"
                enterKeyHint="search"
              />
            </div>
            <div className="flex items-center gap-2">
              <FilterPill
                selected={filter === 'all'}
                count={counts.all}
                onClick={() => setFilter('all')}
                disabled={filter === 'all'}
              >
                All
              </FilterPill>
            </div>
            {/* Sort — its own cluster with a visible "Sort" label (P126). The
                Segmented carries the SR group name via aria-label; the visible
                label is a redundant visual cue, so it's aria-hidden to avoid a
                double announcement. */}
            <div className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="shrink-0 font-fw-sans text-caption font-medium text-text-tertiary"
              >
                Sort
              </span>
              <Segmented<SortKey>
                size="sm"
                aria-label="Sort prospects"
                value={sort}
                onValueChange={setSort}
                options={SORT_OPTIONS}
                className="overflow-x-auto"
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
                    isFiltered ? (
                      /* P120 — one-tap reset of filter + search + sort. */
                      <Button variant="secondary" onClick={resetFilters}>
                        Clear filters
                      </Button>
                    ) : (
                      <Button
                        variant="primary"
                        leftIcon={<Plus className="h-4 w-4" />}
                        onClick={openAdd}
                      >
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
        </>
      )}

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
