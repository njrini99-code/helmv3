'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { AnimatedNumber } from '@/components/ui/animated-number';
import {
  Plus,
  Search,
  ArrowUpDown,
  GraduationCap,
} from 'lucide-react';
import { RecruitCard } from './RecruitCard';
import { RecruitFormSheet } from './RecruitFormSheet';
import { RECRUIT_STATUSES } from './RecruitStatusChip';
import type { Recruit, RecruitStatus } from '@/app/golf/actions/recruiting';

interface RecruitingPageClientProps {
  initialRecruits: Recruit[];
  loadError?: string | null;
}

type StatusFilter = 'all' | RecruitStatus;
type SortKey = 'updated' | 'name' | 'class';

const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: 'updated', label: 'Recently updated' },
  { value: 'name', label: 'Name (A–Z)' },
  { value: 'class', label: 'Class year' },
];

export function RecruitingPageClient({
  initialRecruits,
  loadError = null,
}: RecruitingPageClientProps) {
  const router = useRouter();
  // setRecruits left out — we lean on router.refresh() so the list always
  // matches server-truth after a save/delete instead of mutating local state.
  const recruits = initialRecruits;
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('updated');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Recruit | null>(null);
  const [isPending, startTransition] = useTransition();

  // Counts per status (drives the stat strip + filter chips)
  const counts = useMemo(() => {
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

  const visible = useMemo(() => {
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
    // Optimistic refresh — re-fetch from server via revalidate.
    startTransition(() => {
      router.refresh();
    });
    // Light optimism: clear any stale local state once server state arrives via
    // the parent server component re-render. We don't bother mutating
    // `recruits` here because the page is server-rendered and revalidated.
  };

  return (
    <>
      {/* Hero block removed — page already gets its <h1> from <LargeTitleHeader>
          in the parent server component (matches Calendar / Roster / etc.).
          The "Add prospect" CTA moves into the toolbar below. */}

      {loadError && (
        <div className="px-5 py-3 rounded-2xl bg-rose-50/70 ring-1 ring-rose-200/50 text-body-sm text-rose-700">
          Couldn&apos;t load your prospect list — {loadError}. Try refreshing.
        </div>
      )}

      {/* Funnel strip — sculptural plates, low chrome */}
      <section
        aria-label="Funnel snapshot"
        className="grid grid-cols-2 sm:grid-cols-4 gap-3 md:gap-4 mt-6"
      >
        {RECRUIT_STATUSES.map((s) => {
          const active = filter === s.value;
          const count = counts[s.value];
          return (
            <button
              key={s.value}
              type="button"
              onClick={() => setFilter(active ? 'all' : (s.value as StatusFilter))}
              className={cn(
                'group relative flex flex-col items-start gap-1.5 px-5 py-4 rounded-3xl surface-matte',
                'transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]',
                'hover:-translate-y-[2px] hover:shadow-[0_2px_4px_rgba(58,50,40,0.04),0_24px_44px_rgba(58,50,40,0.07)]',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/30',
                active && 'ring-1 ring-primary-500/35',
              )}
            >
              <span className={cn(
                'inline-flex items-center text-eyebrow font-medium uppercase tracking-[0.12em]',
                s.softText,
              )}>
                <span className={cn('inline-block w-1.5 h-1.5 rounded-full mr-2', s.dot)} />
                {s.label}
              </span>
              <span className="text-h1 md:text-display leading-none font-light text-warm-900 tabular-nums tracking-[-0.025em]">
                <AnimatedNumber value={count} />
              </span>
              <span className="text-eyebrow text-warm-500">
                {active ? 'Filtering' : s.description}
              </span>
            </button>
          );
        })}
      </section>

      {/* Toolbar — borderless notebook search + soft pill controls */}
      <section className="mt-7 flex flex-col md:flex-row items-stretch md:items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-1 top-1/2 -translate-y-1/2 w-4 h-4 text-warm-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, hometown, email, or notes…"
            className="w-full pl-7 input-notebook"
            aria-label="Search prospects"
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setFilter('all')}
            disabled={filter === 'all'}
            className={cn(
              'pill-soft',
              filter === 'all' && 'opacity-50 cursor-default'
            )}
          >
            All ({counts.all})
          </button>
          <div className="relative">
            <ArrowUpDown className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-warm-400 pointer-events-none" />
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="pl-8 pr-8 py-2 rounded-full text-caption font-medium text-warm-700 bg-cream-100/80 ring-1 ring-warm-200/55 hover:ring-warm-300/70 focus:outline-none focus:ring-2 focus:ring-primary-300/45 transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] appearance-none"
              aria-label="Sort prospects"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
            className={cn(
              'group inline-flex items-center gap-2 px-5 py-2 rounded-full text-body-sm font-medium tracking-[-0.005em]',
              'bg-primary-600/95 text-white',
              'shadow-[0_3px_10px_rgba(22,163,74,0.18)]',
              'transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-primary-700 hover:shadow-[0_6px_18px_rgba(22,163,74,0.24)]'
            )}
          >
            <Plus className="w-3.5 h-3.5 transition-transform duration-500 group-hover:rotate-90" />
            Add prospect
          </button>
        </div>
      </section>

      <section className="mt-7" aria-busy={isPending}>
        {visible.length === 0 ? (
          <EmptyState
            isFiltered={recruits.length > 0}
            onAdd={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-5 md:gap-6">
            {visible.map((r) => (
              <RecruitCard
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
      </section>

      <RecruitFormSheet
        open={formOpen}
        recruit={editing}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        onSaved={handleSaved}
      />
    </>
  );
}

function EmptyState({ isFiltered, onAdd }: { isFiltered: boolean; onAdd: () => void }) {
  return (
    <div className="surface-matte rounded-3xl px-6 py-16 text-center">
      <div className="w-16 h-16 rounded-2xl bg-primary-50/70 flex items-center justify-center mx-auto mb-5">
        <GraduationCap className="w-7 h-7 text-primary-700" />
      </div>
      <h3 className="text-h2 md:text-h1 font-light tracking-[-0.025em] text-warm-900 mb-2">
        {isFiltered ? 'No prospects match' : 'Start your prospect list'}
      </h3>
      <p className="text-body-sm text-warm-500 max-w-md mx-auto mb-7 leading-relaxed">
        {isFiltered
          ? 'Try a different status, sort, or search term.'
          : 'Add high-school golfers you’re tracking. Notes, contact info, and status all live here.'}
      </p>
      {!isFiltered && (
        <button
          type="button"
          onClick={onAdd}
          className={cn(
            'group inline-flex items-center gap-2 px-6 py-3 rounded-full',
            'bg-primary-600/95 text-white text-body-sm font-medium tracking-[-0.005em]',
            'shadow-[0_4px_14px_rgba(22,163,74,0.18)]',
            'transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-primary-700 hover:shadow-[0_8px_22px_rgba(22,163,74,0.24)]'
          )}
        >
          <Plus className="w-4 h-4 transition-transform duration-500 group-hover:rotate-90" />
          Add your first prospect
        </button>
      )}
    </div>
  );
}
