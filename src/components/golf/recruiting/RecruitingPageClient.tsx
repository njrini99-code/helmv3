'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
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
        <div className="px-4 py-3 rounded-2xl bg-rose-50 border border-rose-200 text-sm text-rose-700">
          Couldn&apos;t load your prospect list — {loadError}. Try refreshing.
        </div>
      )}

      {/* Stat strip */}
      <section
        aria-label="Funnel snapshot"
        className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5"
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
                'group relative flex flex-col items-start gap-1 px-4 py-3.5 rounded-2xl',
                'bg-white/80 backdrop-blur-xl border border-white/40 shadow-[0_2px_10px_rgba(16,24,40,0.04)]',
                'transition-all duration-200',
                'hover:shadow-[0_6px_20px_rgba(16,24,40,0.07)] hover:-translate-y-[1px]',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40',
                active && 'ring-2 ring-primary-500/40',
              )}
            >
              <span className={cn(
                'text-[10px] font-semibold uppercase tracking-[0.1em]',
                s.softText,
              )}>
                <span className={cn('inline-block w-1.5 h-1.5 rounded-full mr-1.5 align-middle', s.dot)} />
                {s.label}
              </span>
              <span className="text-[28px] leading-none font-semibold text-warm-900 tabular-nums">
                {count}
              </span>
              <span className="text-[11px] text-warm-500">
                {active ? 'Filtering' : s.description}
              </span>
            </button>
          );
        })}
      </section>

      {/* Toolbar */}
      <section className="mt-2 flex flex-col md:flex-row items-stretch md:items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-warm-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, hometown, email, or notes…"
            className={cn(
              'w-full pl-9 pr-3 py-2.5 rounded-xl',
              'bg-white/80 backdrop-blur-xl border border-white/40 shadow-[0_2px_10px_rgba(16,24,40,0.04)]',
              'text-sm text-warm-900 placeholder:text-warm-400',
              'focus:outline-none focus:ring-2 focus:ring-primary-100 focus:bg-white',
              'transition-colors',
            )}
            aria-label="Search prospects"
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setFilter('all')}
            disabled={filter === 'all'}
            className={cn(
              'px-3 py-2 rounded-xl text-xs font-semibold transition-colors',
              filter === 'all'
                ? 'bg-warm-100 text-warm-500 cursor-default'
                : 'bg-white/80 text-warm-700 hover:bg-white border border-white/40',
            )}
          >
            All ({counts.all})
          </button>
          <div className="relative">
            <ArrowUpDown className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-warm-400 pointer-events-none" />
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className={cn(
                'pl-7 pr-7 py-2 rounded-xl bg-white/80 backdrop-blur-xl border border-white/40 shadow-[0_2px_10px_rgba(16,24,40,0.04)]',
                'text-xs font-semibold text-warm-700',
                'focus:outline-none focus:ring-2 focus:ring-primary-100 transition-colors',
              )}
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
              'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl',
              'bg-primary-600 text-white text-xs font-semibold',
              'hover:bg-primary-700 active:scale-[0.99] transition-all',
            )}
          >
            <Plus className="w-3.5 h-3.5" />
            Add prospect
          </button>
        </div>
      </section>

      {/* Card grid */}
      <section className="mt-5" aria-busy={isPending}>
        {visible.length === 0 ? (
          <EmptyState
            isFiltered={recruits.length > 0}
            onAdd={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
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
    <div className="bg-white/70 backdrop-blur-xl rounded-2xl border border-white/40 shadow-glass px-6 py-14 text-center">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-100 to-primary-200 flex items-center justify-center mx-auto mb-4 shadow-sm">
        <GraduationCap className="w-7 h-7 text-primary-700" />
      </div>
      <h3 className="text-2xl font-semibold text-warm-900 mb-1.5">
        {isFiltered ? 'No prospects match' : 'Start your prospect list'}
      </h3>
      <p className="text-sm text-warm-500 max-w-sm mx-auto mb-5">
        {isFiltered
          ? 'Try a different status, sort, or search term.'
          : 'Add high-school golfers you’re tracking. Notes, contact info, and status all live here.'}
      </p>
      {!isFiltered && (
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-primary-600 text-white text-sm font-semibold hover:bg-primary-700 active:scale-[0.99] transition-all shadow-[0_4px_18px_rgba(22,163,74,0.28)]"
        >
          <Plus className="w-4 h-4" />
          Add your first prospect
        </button>
      )}
    </div>
  );
}
