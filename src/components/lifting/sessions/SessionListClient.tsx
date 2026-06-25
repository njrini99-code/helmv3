'use client';

// =============================================================================
// src/components/lifting/sessions/SessionListClient.tsx
//
// Helm Lifting Lab — session list. Native Lab UI consuming HelmLifting* types.
// Recent sessions (last 30 days) grouped by date with athlete names, status
// badges, and quick-action lifecycle buttons for staff.
// =============================================================================

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { toast } from 'sonner';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { IconDumbbell, IconCheck, IconX, IconSearch } from '@/components/icons';
import { advanceSessionLifecycle } from '@/app/lifting/actions/sessions';
import type {
  HelmLiftingSessionRow,
  HelmLiftingSessionStatus,
} from '@/lib/types/helm-lifting-data';

interface SessionListItem extends HelmLiftingSessionRow {
  athlete_first_name: string | null;
  athlete_last_name: string | null;
  athlete_position: string | null;
}

interface Props {
  sessions: SessionListItem[];
  orgId: string;
  canEdit: boolean;
  loading?: boolean;
}

function SessionListSkeleton() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-28" />
          <Skeleton className="h-4 w-44" />
        </div>
        <Skeleton className="h-10 w-28 rounded-xl" />
      </div>
      {/* Filter bar skeleton */}
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-9 w-56 rounded-xl" />
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-20 rounded-full" />
        ))}
      </div>
      {/* Session groups */}
      {Array.from({ length: 2 }).map((_, g) => (
        <div key={g} className="space-y-2">
          <Skeleton className="h-3.5 w-32" />
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="rounded-2xl border border-warm-100 bg-white/70 backdrop-blur-xl px-4 py-3 flex items-center justify-between"
                style={{ animationDelay: `${(g * 3 + i) * 50}ms` }}
              >
                <div className="space-y-1.5">
                  <Skeleton className="h-4 w-36" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <div className="flex items-center gap-2">
                  <Skeleton className="h-5 w-20 rounded-full" />
                  <Skeleton className="h-7 w-24 rounded-lg" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

const STATUS_META: Record<HelmLiftingSessionStatus, { label: string; cls: string }> = {
  assigned: { label: 'Not started', cls: 'bg-warm-50 text-warm-600 border-warm-200' },
  started: { label: 'In progress', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  completed: { label: 'Complete', cls: 'bg-primary-50 text-primary-700 border-primary-200' },
  modified: { label: 'Modified', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  missed: { label: 'Missed', cls: 'bg-red-50 text-red-600 border-red-200' },
  excused: { label: 'Excused', cls: 'bg-warm-50 text-warm-500 border-warm-200' },
};

export function SessionListClient({ sessions, orgId, canEdit, loading = false }: Props) {
  // All hooks must be called unconditionally before any early return.
  const prefersReducedMotion = useReducedMotion();
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return sessions.filter((s) => {
      const name = [s.athlete_first_name, s.athlete_last_name].filter(Boolean).join(' ').toLowerCase();
      const matchSearch = !q || name.includes(q) || (s.title ?? '').toLowerCase().includes(q);
      const matchStatus = statusFilter === 'all' || s.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [sessions, search, statusFilter]);

  // Group by date.
  const grouped = useMemo(() => {
    const map = new Map<string, SessionListItem[]>();
    for (const s of filtered) {
      const arr = map.get(s.scheduled_date) ?? [];
      arr.push(s);
      map.set(s.scheduled_date, arr);
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [filtered]);

  // Early return after all hooks have been called.
  if (loading) return <SessionListSkeleton />;

  function handleAdvance(sessionId: string, newStatus: 'started' | 'completed' | 'missed' | 'excused' | 'modified') {
    startTransition(async () => {
      const result = await advanceSessionLifecycle({ orgId, sessionId, newStatus });
      if (!result.success) toast.error(result.error ?? 'Failed to update session.');
    });
  }

  function formatDate(ymd: string) {
    const d = new Date(`${ymd}T12:00:00`);
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-warm-900">Sessions</h1>
          <p className="mt-0.5 text-sm text-warm-500">Last 30 days · {sessions.length} session{sessions.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && (
            <Link href="/lifting/dashboard/sessions/live">
              <Button variant="ghost">Live room</Button>
            </Link>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative w-56">
          <IconSearch size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-warm-400" />
          <Input
            className="pl-8"
            placeholder="Search athletes…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {(['all', 'assigned', 'started', 'completed', 'missed', 'excused'] as const).map((st) => (
          <button
            key={st}
            type="button"
            onClick={() => setStatusFilter(st)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              statusFilter === st
                ? 'border-primary-400 bg-primary-50 text-primary-700'
                : 'border-warm-200 bg-white text-warm-600 hover:border-warm-300'
            }`}
          >
            {st === 'all' ? 'All' : STATUS_META[st as HelmLiftingSessionStatus]?.label ?? st}
          </button>
        ))}
      </div>

      {/* Session list */}
      <AnimatePresence mode="wait">
        {sessions.length === 0 ? (
          <motion.div
            key="empty-sessions"
            initial={prefersReducedMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            <EmptyState
              icon={<IconDumbbell size={32} className="text-warm-300" />}
              title="No sessions yet"
              description="Publish a program to your athletes and their sessions will appear here."
            />
          </motion.div>
        ) : filtered.length === 0 ? (
          <motion.div
            key="empty-filter"
            initial={prefersReducedMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            <EmptyState title="No matching sessions" description="Try a different filter or search term." />
          </motion.div>
        ) : (
          <motion.div
            key="session-list"
            initial={prefersReducedMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="space-y-6"
          >
            {grouped.map(([date, daysSessions]) => (
              <section key={date}>
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-warm-400">{formatDate(date)}</h2>
                <div className="space-y-2">
                  {daysSessions.map((session, idx) => {
                    const athleteName = [session.athlete_first_name, session.athlete_last_name]
                      .filter(Boolean).join(' ') || 'Unnamed athlete';
                    const meta = STATUS_META[session.status];
                    return (
                      <motion.div
                        key={session.id}
                        layout
                        initial={prefersReducedMotion ? false : { opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.18, delay: prefersReducedMotion ? 0 : idx * 0.04, ease: [0.25, 0.46, 0.45, 0.94] }}
                      >
                        <Card variant="flat" className="overflow-hidden">
                          <CardContent className="flex items-center justify-between p-4">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="min-w-0">
                                <p className="font-medium text-warm-900 truncate">{athleteName}</p>
                                <p className="text-xs text-warm-500 truncate">
                                  {session.title ?? 'Lift session'}
                                  {session.athlete_position ? ` · ${session.athlete_position}` : ''}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0 ml-4">
                              <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${meta.cls}`}>
                                {meta.label}
                              </span>
                              {canEdit && session.status === 'started' && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="gap-1 text-primary-600 focus-visible:ring-2 focus-visible:ring-primary-500/50"
                                  disabled={isPending}
                                  onClick={() => handleAdvance(session.id, 'completed')}
                                >
                                  <IconCheck size={14} /> Complete
                                </Button>
                              )}
                              {canEdit && session.status === 'assigned' && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="gap-1 text-red-600 focus-visible:ring-2 focus-visible:ring-red-500/50"
                                  disabled={isPending}
                                  onClick={() => handleAdvance(session.id, 'missed')}
                                >
                                  <IconX size={14} /> Miss
                                </Button>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      </motion.div>
                    );
                  })}
                </div>
              </section>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
