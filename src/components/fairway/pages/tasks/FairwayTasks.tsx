'use client';

/**
 * ============================================================================
 * Fairway · pages/tasks · FairwayTasks  (ADDITIVE · FLAG-GATED)
 * ----------------------------------------------------------------------------
 * The flag-on redesign of the SHARED coach+player /golf/dashboard/tasks route —
 * the team's "to-dos" surface. A PRESENTATION-ONLY re-skin onto the warm-matte
 * Fairway design system: the page keeps the EXACT same data path (the
 * useTaskRealtime live subscription + loadPlayers) and the SAME transform into
 * the legacy `Task` shape; every mutation reuses the legacy task server actions
 * by their exact import paths.
 *
 * ── ROLE FORK ───────────────────────────────────────────────────────────────
 *   • Coach  — sees the team's tasks, an honest per-task assignment progress
 *              read-out, a Create-task CTA, and the Templates rail.
 *   • Player — sees the tasks assigned to them, and can mark a task complete
 *              (optimistic, via the unchanged completeTask action). No create.
 *
 * ── MENTAL-MODEL ORDER (triage → is-it-working → what's-next) ───────────────
 *   1. Overdue banner (only when stats.overdue_tasks > 0 — never fabricated).
 *   2. Filter pills (All / Active / Completed) with HONEST counts.
 *   3. The task list as matte Surface rows; coach also gets a Templates rail.
 *
 * ── CRITICAL HONESTY ────────────────────────────────────────────────────────
 *   The completion read-out only renders when a task actually has assignment
 *   rows (totalCount > 0). Team-wide tasks (no per-player assignment in this
 *   view's data) never show a fake "0 of 0". Empty lists use EmptyState. Numbers
 *   are tabular-nums. Due dates / reminders render only when present (em-dash
 *   never needed — absent rows are simply omitted).
 *
 * Tokens ONLY: bg-canvas/surface/sunken, text-text, font-fw-display/sans/mono,
 * rounded-card/rounded-fw-md, shadow-flat/soft, accent, fw-warning/fw-danger/
 * fw-success, border-border. No glass / backdrop-blur / legacy warm-/primary- classes.
 *
 * ADDITIVE + GATED — imported only behind the isRedesignEnabled() fork in
 * tasks/page.tsx. Renders inside a `.fairway-ds` scope on a `bg-canvas` page.
 * ========================================================================== */

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ClipboardList, Bell, ChevronDown } from 'lucide-react';

import { cn } from '@/lib/utils';
import {
  ViewHeader,
  Surface,
  StatusPill,
  Chip,
  Button,
  IconButton,
  FilterPill,
  EmptyState,
  InlineNotice,
  SearchField,
  ModalShell,
  Form,
  FormField,
  Input,
  PopoverPanel,
  fairwayToast,
  type FwStatusTone,
} from '@/components/fairway';
import {
  IconCheck,
  IconClock,
  IconUsers,
  IconPlus,
  IconMoreVertical,
  IconBell,
  IconTrash,
  IconMessage,
} from '@/components/icons';
import {
  deleteTask,
  setTaskReminder,
  clearTaskReminder,
  type TaskTemplate,
} from '@/app/golf/actions/tasks';

import { FairwayCreateTaskModal } from './FairwayCreateTaskModal';
import { FairwayCreateFromTemplateModal } from './FairwayCreateFromTemplateModal';
import { FairwayTaskTemplateList } from './FairwayTaskTemplateList';

/* ───────────────────────────────────────────────────────────────────────────
 * Types — the SAME shapes the legacy page builds + passes to TasksList/TaskCard.
 * ────────────────────────────────────────────────────────────────────────── */
export interface TaskAssignment {
  id: string;
  status: string;
  completed_at: string | null;
  player: {
    id: string;
    first_name: string;
    last_name: string;
  };
}

export interface FairwayTask {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  status: string; // 'active' | 'completed' (legacy-normalized)
  created_at: string;
  reminder_at: string | null;
  category: string | null;
  assignments: TaskAssignment[];
}

export interface FairwayTaskStats {
  total_tasks: number;
  completed_tasks: number;
  pending_tasks: number;
  in_progress_tasks: number;
  overdue_tasks: number;
  completion_rate: number;
}

export interface FairwayTaskPlayer {
  id: string;
  first_name: string | null;
  last_name: string | null;
}

type FilterType = 'all' | 'active' | 'completed';

export interface FairwayTasksProps {
  /** Resolved viewer role (gates the create CTA + Templates rail + complete action). */
  role: 'coach' | 'player';
  /** The team id (null when unresolved — coach create/templates stay hidden). */
  teamId: string | null;
  /** Live tasks, already transformed into the legacy Task shape by the page. */
  tasks: FairwayTask[];
  /** Live task stats from the realtime hook (overdue count drives the banner). */
  stats: FairwayTaskStats;
  /** Roster players, for the coach create / template assignment flows. */
  players: FairwayTaskPlayer[];
  /**
   * P292 — whether the roster fetch itself failed (vs a genuinely empty roster).
   * Threaded to the create modal so it shows an honest "couldn't load the roster"
   * notice instead of "No players yet", and warns before an all-members create
   * that would assign to nobody.
   */
  playersError?: boolean;
  /**
   * Live-fetch error from useTaskRealtime (P283). When set, the list renders an
   * honest, recoverable error state instead of letting the failure fall through
   * to the "No tasks yet" empty state (which would mask an outage). Null/undefined
   * when the fetch succeeded.
   */
  error?: string | null;
  /** Refetch the live task list after a mutation (the hook's refetch). */
  onRefetch: () => void | Promise<void>;
  /**
   * Player-only complete (owned by the wrapper). Coach passes none.
   * P284 — returns the completeTask ActionResult so the card can show honest
   * success/failure feedback (completeTask resolves `{ success:false }` on a soft
   * failure rather than throwing). A bare `void` resolution is treated as success.
   */
  onCompleteTask?: (taskId: string) => Promise<CompleteResult | void>;
}

/** The subset of completeTask's ActionResult the card needs (P284). */
type CompleteResult = { success: boolean; error?: string };

/**
 * P284 — pure decision for the player "Mark complete" feedback. completeTask
 * resolves an ActionResult that may report `success: false` WITHOUT throwing, so
 * a void/undefined resolution and an explicit `{ success: true }` both count as
 * success. Exported for deterministic unit tests.
 *
 *  - success  → a confirmation toast, no rollback.
 *  - failure  → an error toast (the action's message, or a fallback) + rollback.
 */
export function completionFeedback(
  result: CompleteResult | void | undefined,
): { kind: 'success'; message: string } | { kind: 'error'; message: string; rollback: true } {
  if (result && result.success === false) {
    return {
      kind: 'error',
      message: result.error ?? 'Could not mark the task complete.',
      rollback: true,
    };
  }
  return { kind: 'success', message: 'Marked complete.' };
}

/* ───────────────────────────────────────────────────────────────────────────
 * Component
 * ────────────────────────────────────────────────────────────────────────── */
export function FairwayTasks({
  role,
  teamId,
  tasks,
  stats,
  players,
  playersError = false,
  error,
  onRefetch,
  onCompleteTask,
}: FairwayTasksProps) {
  const isCoach = role === 'coach';
  // P283 — true fetch failure. Track an in-flight retry so the "Try again" action
  // shows progress and can't be double-fired.
  const [retrying, setRetrying] = useState(false);
  const handleRetry = async () => {
    if (retrying) return;
    setRetrying(true);
    try {
      await onRefetch();
    } finally {
      setRetrying(false);
    }
  };

  const [filter, setFilter] = useState<FilterType>('all');
  // P287 — text search (title/description) + category narrowing for coaches at scale.
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  // P293 — when on Active, the overdue banner sorts overdue tasks to the top.
  const [overdueFirst, setOverdueFirst] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<TaskTemplate | null>(null);

  // A single client `now` so overdue + relative-date labels match SSR.
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
  }, []);

  // Honest counts — the SAME predicates the legacy page used.
  const activeCount = tasks.filter((t) => t.status === 'active').length;
  const completedCount = tasks.filter((t) => t.status === 'completed').length;
  const dueTodayCount = useMemo(() => {
    if (!now) return 0;
    return tasks.filter((t) => {
      if (t.status !== 'active' || !t.due_date) return false;
      // P295 — local-safe date-only parse (see parseDueDate below); a raw
      // `new Date(t.due_date)` here reads a date-only due_date as UTC
      // midnight and under-counts "due today" by a day in US timezones.
      return parseDueDate(t.due_date).toDateString() === now.toDateString();
    }).length;
  }, [tasks, now]);

  // P287 — distinct task categories (honest: derived only from real task data).
  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const t of tasks) {
      if (t.category) set.add(t.category);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [tasks]);

  // A stale category filter (the only task with that category was deleted) must
  // not silently hide the whole list — drop it when it no longer exists.
  useEffect(() => {
    if (categoryFilter && !categories.includes(categoryFilter)) {
      setCategoryFilter(null);
    }
  }, [categories, categoryFilter]);

  // P287 — status + text search + category, all honest predicates.
  const filteredTasks = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matched = tasks.filter((t) => {
      if (filter !== 'all' && t.status !== filter) return false;
      if (categoryFilter && t.category !== categoryFilter) return false;
      if (q) {
        const haystack = `${t.title} ${t.description ?? ''}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });

    // P293 — on Active, surface overdue tasks to the top when requested. Stable:
    // overdue rows float up, the rest keep the hook's due_date asc order.
    if (overdueFirst && now) {
      const isOverdueRow = (t: FairwayTask) =>
        t.status !== 'completed' &&
        !!t.due_date &&
        // P295 — same local-safe parse as everywhere else in this file.
        parseDueDate(t.due_date) < now;
      return [...matched].sort((a, b) => Number(isOverdueRow(b)) - Number(isOverdueRow(a)));
    }
    return matched;
  }, [tasks, filter, categoryFilter, query, overdueFirst, now]);

  // ── Masthead meta — honest count chips, rendered ONLY when > 0. ──────────────
  const meta =
    tasks.length > 0 ? (
      <>
        {dueTodayCount > 0 && <span className="tabular-nums">{dueTodayCount} due today</span>}
        {dueTodayCount > 0 && activeCount > 0 && <span aria-hidden="true">·</span>}
        {activeCount > 0 && <span className="tabular-nums">{activeCount} open</span>}
      </>
    ) : undefined;

  const createCta =
    isCoach && teamId ? (
      <Button variant="primary" onClick={() => setCreateOpen(true)}>
        <IconPlus size={16} />
        <span>Create task</span>
      </Button>
    ) : undefined;

  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 py-6 md:px-6 md:py-8 pb-24">
      {/* ── ONE MASTHEAD ─────────────────────────────────────────────────────── */}
      <ViewHeader
        eyebrow="Tasks"
        title={isCoach ? 'Team to-dos.' : 'Your to-dos.'}
        description={
          isCoach
            ? 'Assign and track the work that keeps the team moving.'
            : 'View and complete the tasks your coach assigned you.'
        }
        meta={meta}
        primaryAction={createCta}
      />

      {error ? (
        // ── FETCH FAILURE — never masquerade as the empty state (P283). ───────
        <div className="mt-8">
          <InlineNotice
            tone="danger"
            title="Couldn't load tasks"
            action={
              <Button variant="ghost" size="sm" busy={retrying} disabled={retrying} onClick={handleRetry}>
                Try again
              </Button>
            }
          >
            Something went wrong loading your tasks. Check your connection and try again.
          </InlineNotice>
        </div>
      ) : tasks.length === 0 ? (
        // ── FULL-EMPTY — no tasks at all ─────────────────────────────────────
        <div className="mt-8">
          <Surface elevation="shadow" padding="lg">
            <EmptyState
              icon={ClipboardList}
              title="No tasks yet"
              description={
                isCoach
                  ? 'Create a task to assign work and track who has completed it.'
                  : 'Tasks your coach assigns will show up here.'
              }
              action={
                isCoach && teamId ? (
                  <Button variant="primary" onClick={() => setCreateOpen(true)}>
                    <IconPlus size={16} />
                    <span>Create task</span>
                  </Button>
                ) : undefined
              }
            />
          </Surface>
        </div>
      ) : (
        <div className="mt-8 flex flex-col gap-6">
          {/* ── Overdue banner — honest; only when overdue tasks exist. ───────── */}
          {stats.overdue_tasks > 0 && (
            <InlineNotice
              tone="warning"
              title={`${stats.overdue_tasks} overdue ${
                stats.overdue_tasks === 1 ? 'task needs' : 'tasks need'
              } attention`}
              action={
                filter !== 'active' ? (
                  // Not yet on Active — jump there to triage the overdue items.
                  <Button variant="ghost" size="sm" onClick={() => setFilter('active')}>
                    View active
                  </Button>
                ) : (
                  // P293 — already on Active: keep the banner actionable by sorting
                  // the overdue tasks to the top (toggleable so it never traps focus).
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setOverdueFirst((v) => !v)}
                    aria-pressed={overdueFirst}
                  >
                    {overdueFirst ? 'Clear sort' : 'Show overdue first'}
                  </Button>
                )
              }
            >
              Review tasks that are past their due date.
            </InlineNotice>
          )}

          {/* ── Filter pills — HONEST counts. ─────────────────────────────────── */}
          <div className="flex flex-wrap items-center gap-2">
            <FilterPill
              selected={filter === 'all'}
              showCheck={false}
              count={tasks.length}
              onClick={() => setFilter('all')}
            >
              All
            </FilterPill>
            <FilterPill
              selected={filter === 'active'}
              showCheck={false}
              count={activeCount}
              onClick={() => setFilter('active')}
            >
              Active
            </FilterPill>
            <FilterPill
              selected={filter === 'completed'}
              showCheck={false}
              count={completedCount}
              onClick={() => setFilter('completed')}
            >
              Completed
            </FilterPill>
          </div>

          {/* ── P287 — Search + category narrowing. ───────────────────────────── */}
          <div className="flex flex-col gap-3">
            <div className="max-w-md">
              <SearchField
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onClear={() => setQuery('')}
                placeholder="Search tasks by title or description"
                aria-label="Search tasks"
              />
            </div>
            {categories.length > 0 && (
              <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter by category">
                <FilterPill
                  selected={categoryFilter === null}
                  showCheck={false}
                  onClick={() => setCategoryFilter(null)}
                >
                  All categories
                </FilterPill>
                {categories.map((cat) => (
                  <FilterPill
                    key={cat}
                    selected={categoryFilter === cat}
                    showCheck={false}
                    onClick={() => setCategoryFilter((c) => (c === cat ? null : cat))}
                  >
                    {cat}
                  </FilterPill>
                ))}
              </div>
            )}
          </div>

          {/* ── Main grid: list + coach Templates rail. ───────────────────────── */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              {filteredTasks.length === 0 ? (
                <Surface elevation="border" padding="none">
                  <EmptyState
                    variant="subtle"
                    icon={ClipboardList}
                    title={
                      query.trim() || categoryFilter
                        ? 'No matching tasks'
                        : filter === 'all'
                          ? 'No tasks'
                          : `No ${filter} tasks`
                    }
                    description={
                      query.trim() || categoryFilter
                        ? 'No tasks match your search or category filter. Try clearing them.'
                        : filter === 'completed'
                          ? 'Completed tasks will collect here.'
                          : 'Nothing in this view right now.'
                    }
                    action={
                      query.trim() || categoryFilter ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setQuery('');
                            setCategoryFilter(null);
                          }}
                        >
                          Clear filters
                        </Button>
                      ) : undefined
                    }
                  />
                </Surface>
              ) : (
                <div className="flex flex-col gap-3">
                  {filteredTasks.map((task) => (
                    <FairwayTaskCard
                      key={task.id}
                      task={task}
                      now={now}
                      role={role}
                      onComplete={onCompleteTask}
                      // P285 — coach task management (delete / reminder). Only wired
                      // when the viewer is a coach with a resolved team.
                      canManage={isCoach && !!teamId}
                      onManaged={onRefetch}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* ── Templates rail — coach only. ────────────────────────────────── */}
            {isCoach && teamId && (
              <aside className="lg:col-span-1">
                <div className="sticky top-6 flex flex-col gap-4">
                  <Surface elevation="border" padding="none">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setShowTemplates((s) => !s)}
                      aria-expanded={showTemplates}
                      className={cn(
                        'block h-auto min-h-0 w-full rounded-card border-0 px-5 py-4 text-left font-normal',
                        'transition-colors [transition-duration:180ms] hover:bg-surface-tint',
                        'outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
                      )}
                    >
                      <span className="flex w-full items-center justify-between gap-2">
                        <span className="flex items-center gap-2">
                          <ClipboardList className="h-[18px] w-[18px] text-text-tertiary" aria-hidden />
                          <span className="font-fw-sans text-body font-medium text-text-primary">
                            Templates
                          </span>
                        </span>
                        <ChevronDown
                          className={cn(
                            'h-[18px] w-[18px] text-text-tertiary transition-transform [transition-duration:180ms] motion-reduce:transition-none',
                            showTemplates && 'rotate-180',
                          )}
                          aria-hidden
                        />
                      </span>
                    </Button>
                    {showTemplates && (
                      <div className="border-t border-border-subtle p-5">
                        <FairwayTaskTemplateList
                          teamId={teamId}
                          onSelectTemplate={(t) => setSelectedTemplate(t)}
                        />
                      </div>
                    )}
                  </Surface>

                  {/* Quick stats — honest, tabular. */}
                  <Surface elevation="border" padding="md">
                    <p className="font-fw-sans text-eyebrow font-semibold uppercase tracking-[0.12em] text-text-tertiary">
                      Quick stats
                    </p>
                    <div className="mt-3 grid grid-cols-2 gap-3">
                      <StatTile label="Active" value={activeCount} />
                      <StatTile label="Completed" value={completedCount} tone="accent" />
                    </div>
                    {stats.overdue_tasks > 0 && (
                      <div className="mt-3 rounded-fw-md bg-fw-warning-bg px-4 py-3 text-center">
                        {/* P288 — on-system text tokens (no legacy warm-* class). The
                            warning surface is carried by bg-fw-warning-bg; the numerals
                            stay readable on it (text-primary ≈ 13:1, text-secondary ≈ 4.9:1,
                            both clear WCAG AA — text-fw-warning would only be ~2:1 here). */}
                        <p className="font-fw-display text-h3 font-medium tabular-nums text-text-primary">
                          {stats.overdue_tasks}
                        </p>
                        <p className="font-fw-sans text-caption text-text-secondary">Overdue</p>
                      </div>
                    )}
                  </Surface>
                </div>
              </aside>
            )}
          </div>
        </div>
      )}

      {/* ── Create-task modal (coach). ──────────────────────────────────────── */}
      {isCoach && teamId && (
        <FairwayCreateTaskModal
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          onTaskCreated={onRefetch}
          teamId={teamId}
          players={players}
          playersError={playersError}
        />
      )}

      {/* ── Create-from-template modal (coach). ─────────────────────────────── */}
      {isCoach && teamId && selectedTemplate && (
        <FairwayCreateFromTemplateModal
          open={!!selectedTemplate}
          onClose={() => setSelectedTemplate(null)}
          onTaskCreated={() => {
            void onRefetch();
            setSelectedTemplate(null);
          }}
          template={selectedTemplate}
          teamId={teamId}
          players={players}
        />
      )}
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────────────────
 * StatTile — a quiet matte mini-stat for the coach rail.
 * ────────────────────────────────────────────────────────────────────────── */
function StatTile({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: number;
  tone?: 'neutral' | 'accent';
}) {
  return (
    <div className="rounded-fw-md bg-surface-sunken px-4 py-3 text-center">
      <p
        className={cn(
          'font-fw-display text-h3 font-medium tabular-nums',
          tone === 'accent' ? 'text-accent-700' : 'text-text-primary',
        )}
      >
        {value}
      </p>
      <p className="font-fw-sans text-caption text-text-tertiary">{label}</p>
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────────────────
 * Status → Fairway StatusPill config. Token tones only.
 * ────────────────────────────────────────────────────────────────────────── */
function statusPill(status: string): { tone: FwStatusTone; label: string } {
  return status === 'completed'
    ? { tone: 'success', label: 'Completed' }
    : { tone: 'accent', label: 'Active' };
}

/* ───────────────────────────────────────────────────────────────────────────
 * Reminder urgency → token tone (mirrors the legacy ReminderIcon thresholds,
 * but on Fairway tokens: fw-warning for soon/imminent, tertiary for upcoming/past).
 * ────────────────────────────────────────────────────────────────────────── */
function reminderTone(
  reminderAt: string,
  now: Date | null,
): 'imminent' | 'soon' | 'upcoming' | 'past' {
  // P294 — before hydration (now === null) we cannot know urgency, so default to
  // the quiet `upcoming` tone. This lets the Bell render on first paint (no
  // pop-in) and only deepens to imminent/soon after `now` resolves.
  if (!now) return 'upcoming';
  const diff = new Date(reminderAt).getTime() - now.getTime();
  if (diff < 0) return 'past';
  const hours = diff / (1000 * 60 * 60);
  if (hours <= 3) return 'imminent';
  if (hours <= 24) return 'soon';
  return 'upcoming';
}

/**
 * P295 — parse a stored `due_date` LOCAL-safe. A pure date-only value
 * ("YYYY-MM-DD", no time/offset) is what `createTask` stores, and
 * `new Date('YYYY-MM-DD')` parses that as UTC-midnight per the ECMA-262 date
 * time string spec — NOT local midnight. In any negative-UTC-offset zone
 * (all of the US) that instant falls on the PREVIOUS local calendar day, so a
 * due date of "today" reads back as "yesterday" and a Today/Tomorrow label
 * flips a day early. Every due-date read in this file must go through this
 * helper (never `new Date(due_date)` directly) so the list card, the
 * masthead's "due today" count, and the overdue/sort checks all agree on the
 * same calendar day. Exported for the regression test. A full timestamp
 * (already carrying a time component) parses exactly as `new Date` would —
 * only the bare date-only case needs the local-construction fix.
 */
export function parseDueDate(dueDate: string): Date {
  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dueDate);
  if (dateOnlyMatch) {
    const [, y, m, d] = dateOnlyMatch;
    return new Date(Number(y), Number(m) - 1, Number(d));
  }
  return new Date(dueDate);
}

function formatDueLabel(dateString: string, now: Date | null): string {
  const date = parseDueDate(dateString);
  if (!now) {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (date.toDateString() === now.toDateString()) return 'Today';
  if (date.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/* A visible, non-color, non-icon-only reminder label (e.g. "Reminder · Today
 * 9:00 AM"). Pairs the relative day with the time so the affordance is announced
 * to screen readers and never relies on the Bell glyph or tone color alone. */
function formatReminderLabel(dateString: string, now: Date | null): string {
  const time = new Date(dateString).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
  return `Reminder · ${formatDueLabel(dateString, now)} ${time}`;
}

/* ───────────────────────────────────────────────────────────────────────────
 * TaskCard — matte Surface row. Honest per-player completion (only when the
 * task actually has assignment rows). Coach sees an expandable per-player
 * progress list plus a manage menu (reminder / delete); player sees a
 * Mark-complete action that flips OPTIMISTICALLY (reused completeTask action).
 * ────────────────────────────────────────────────────────────────────────── */
function FairwayTaskCard({
  task,
  now,
  role,
  onComplete,
  canManage = false,
  onManaged,
}: {
  task: FairwayTask;
  now: Date | null;
  role: 'coach' | 'player';
  onComplete?: (taskId: string) => Promise<CompleteResult | void>;
  /** Coach-only: enable the reminder/delete manage menu. */
  canManage?: boolean;
  /** Refetch the live list after a coach mutation. */
  onManaged?: () => void | Promise<void>;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [completing, setCompleting] = useState(false);
  // P290 — true optimistic completion. We flip the card locally the instant the
  // player taps, then let the realtime prop reconcile. `optimisticDone` clears
  // automatically once the authoritative task.status catches up (effect below),
  // and rolls back if the action fails.
  const [optimisticDone, setOptimisticDone] = useState(false);

  // P285 — coach manage state.
  const [pendingDelete, setPendingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [reminderValue, setReminderValue] = useState('');
  const [savingReminder, setSavingReminder] = useState(false);
  const [clearingReminder, setClearingReminder] = useState(false);

  // Reconcile the optimistic flip with the source of truth.
  useEffect(() => {
    if (task.status === 'completed' && optimisticDone) {
      setOptimisticDone(false);
    }
  }, [task.status, optimisticDone]);

  // The status the card SHOWS (optimistic completion wins until reconciled).
  const displayStatus = optimisticDone ? 'completed' : task.status;

  const completedCount = task.assignments.filter((a) => a.status === 'completed').length;
  const totalCount = task.assignments.length;
  const completionRate = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
  const hasAssignments = totalCount > 0;

  const isOverdue =
    !!now &&
    !!task.due_date &&
    // P295 — local-safe parse: `new Date(task.due_date)` reads a date-only
    // due_date as UTC midnight, which under negative UTC offsets (all of the
    // US) resolves to the PREVIOUS local day — the same bug that used to
    // make this card's due label disagree with the masthead's "due today"
    // count for the identical stored value.
    parseDueDate(task.due_date) < now &&
    completionRate < 100 &&
    displayStatus !== 'completed';

  const pill = statusPill(displayStatus);

  // Player-side complete: only when the action is provided and the task isn't
  // already complete (and isn't optimistically completing).
  const playerCanComplete =
    role === 'player' && !!onComplete && displayStatus !== 'completed';

  const handleComplete = async () => {
    if (!onComplete || completing) return;
    setCompleting(true);
    setOptimisticDone(true); // flip immediately — no spinner wait
    try {
      // P284 — completeTask resolves an ActionResult { success, error } on a soft
      // failure (RLS denial, "not assigned", network) rather than throwing. The pure
      // completionFeedback() decides: a `success: false` rolls back + error-toasts
      // just like a thrown error, and a success (explicit or bare void) confirms with
      // a toast (it was previously silent). The realtime refetch reconciles state.
      const feedback = completionFeedback(await onComplete(task.id));
      if (feedback.kind === 'error') {
        setOptimisticDone(false);
        fairwayToast.error(feedback.message);
        return;
      }
      fairwayToast.success(feedback.message);
    } catch (error) {
      // A genuinely thrown error — roll back the optimistic flip and tell the player.
      setOptimisticDone(false);
      fairwayToast.error(
        error instanceof Error ? error.message : 'Could not mark the task complete.',
      );
    } finally {
      setCompleting(false);
    }
  };

  /* ---- P285 · coach manage actions (reuse the unchanged server actions) ---- */

  const openReminderModal = () => {
    // Seed the picker from the existing reminder (as a local datetime-local value).
    setReminderValue(task.reminder_at ? toDateTimeLocal(task.reminder_at) : '');
    setReminderOpen(true);
  };

  const handleSaveReminder = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!reminderValue) {
      fairwayToast.warning('Pick a date and time for the reminder.');
      return;
    }
    setSavingReminder(true);
    try {
      const result = await setTaskReminder(task.id, new Date(reminderValue).toISOString());
      if (result.success) {
        fairwayToast.success('Reminder set.');
        setReminderOpen(false);
        await onManaged?.();
      } else {
        fairwayToast.error(result.error ?? 'Failed to set the reminder.');
      }
    } catch (error) {
      fairwayToast.error(
        error instanceof Error ? error.message : 'Failed to set the reminder.',
      );
    } finally {
      setSavingReminder(false);
    }
  };

  const handleClearReminder = async () => {
    setClearingReminder(true);
    try {
      const result = await clearTaskReminder(task.id);
      if (result.success) {
        fairwayToast.success('Reminder cleared.');
        await onManaged?.();
      } else {
        fairwayToast.error(result.error ?? 'Failed to clear the reminder.');
      }
    } catch (error) {
      fairwayToast.error(
        error instanceof Error ? error.message : 'Failed to clear the reminder.',
      );
    } finally {
      setClearingReminder(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const result = await deleteTask(task.id);
      if (result.success) {
        fairwayToast.success('Task deleted.');
        setPendingDelete(false);
        await onManaged?.();
      } else {
        fairwayToast.error(result.error ?? 'Failed to delete the task.');
      }
    } catch (error) {
      fairwayToast.error(
        error instanceof Error ? error.message : 'Failed to delete the task.',
      );
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Surface elevation="border" padding="md" className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h3 className="font-fw-sans text-body-lg font-medium text-text-primary [text-wrap:balance]">
            {task.title}
          </h3>
          {task.description && (
            <p className="line-clamp-2 font-fw-sans text-body-sm text-text-tertiary">
              {task.description}
            </p>
          )}
        </div>
        <div className="flex flex-shrink-0 items-center gap-1.5">
          <StatusPill tone={pill.tone} size="sm">
            {pill.label}
          </StatusPill>
          {/* P285 — coach task management: reminder + delete, via the existing
              setTaskReminder / clearTaskReminder / deleteTask server actions. */}
          {canManage && (
            <PopoverPanel
              side="bottom"
              align="end"
              surface="matte"
              width="sm"
              ariaLabel={`Manage task: ${task.title}`}
              trigger={
                <IconButton
                  variant="ghost"
                  size="sm"
                  aria-label={`Manage task: ${task.title}`}
                >
                  <IconMoreVertical size={18} />
                </IconButton>
              }
            >
              <PopoverPanel.Item onClick={openReminderModal}>
                <IconBell size={18} className="text-text-tertiary" />
                {task.reminder_at ? 'Update reminder' : 'Set reminder'}
              </PopoverPanel.Item>
              {task.reminder_at && (
                <PopoverPanel.Item
                  onClick={() => void handleClearReminder()}
                  disabled={clearingReminder}
                >
                  <IconBell size={18} className="text-text-tertiary" />
                  Clear reminder
                </PopoverPanel.Item>
              )}
              <PopoverPanel.Separator />
              <PopoverPanel.Item
                onClick={() => setPendingDelete(true)}
                className="text-fw-danger hover:bg-fw-danger-bg hover:text-fw-danger"
              >
                <IconTrash size={18} className="text-fw-danger" />
                Delete task
              </PopoverPanel.Item>
            </PopoverPanel>
          )}
        </div>
      </div>

      {/* Progress — ONLY when the task has assignment rows (never a fake 0/0). */}
      {hasAssignments && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between font-fw-sans text-caption text-text-tertiary">
            <span className="flex items-center gap-1.5">
              <IconUsers size={14} />
              <span className="tabular-nums">
                {completedCount} of {totalCount} completed
              </span>
            </span>
            <span className="font-medium tabular-nums text-text-secondary">
              {Math.round(completionRate)}%
            </span>
          </div>
          <div
            className="h-1.5 overflow-hidden rounded-full bg-surface-sunken"
            role="progressbar"
            aria-valuenow={Math.round(completionRate)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-full bg-accent-500 transition-[width] duration-300 motion-reduce:transition-none"
              style={{ width: `${completionRate}%` }}
            />
          </div>
        </div>
      )}

      {/* Meta row: due date · reminder · category */}
      {(task.due_date || task.reminder_at || task.category) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 font-fw-sans text-body-sm">
          {task.due_date && (
            <span
              className={cn(
                'inline-flex items-center gap-1.5 tabular-nums',
                isOverdue ? 'text-fw-danger' : 'text-text-secondary',
              )}
              suppressHydrationWarning
            >
              <IconClock size={14} className="flex-shrink-0" />
              {formatDueLabel(task.due_date, now)}
            </span>
          )}
          {/* P294 — render whenever a reminder exists (not gated on `now`), so the
              Bell never pops in after hydration. Urgency color deepens once `now`
              resolves; the label degrades to an absolute date pre-hydration. */}
          {task.reminder_at && (
            <span
              className={cn(
                'inline-flex items-center gap-1.5',
                reminderTone(task.reminder_at, now) === 'past'
                  ? 'text-text-tertiary'
                  : reminderTone(task.reminder_at, now) === 'upcoming'
                    ? 'text-text-secondary'
                    : // P288 — imminent/soon: strongest emphasis via an on-system token
                      // (text-primary ≈ 13:1 on the card surface; no legacy warm-* class).
                      'text-text-primary',
              )}
              suppressHydrationWarning
            >
              <Bell className="h-3.5 w-3.5 flex-shrink-0" aria-hidden />
              <span>{formatReminderLabel(task.reminder_at, now)}</span>
            </span>
          )}
          {task.category && (
            <Chip tone="neutral" size="sm">
              {task.category}
            </Chip>
          )}
        </div>
      )}

      {/* Footer actions */}
      <div className="flex items-center justify-between gap-3">
        {/* Coach: expand the per-player progress (only meaningful with assignments). */}
        {role === 'coach' && hasAssignments ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded((e) => !e)}
            rightIcon={
              <ChevronDown
                className={cn(
                  'h-4 w-4 transition-transform [transition-duration:180ms] motion-reduce:transition-none',
                  expanded && 'rotate-180',
                )}
                aria-hidden
              />
            }
          >
            {expanded ? 'Hide details' : 'View details'}
          </Button>
        ) : (
          <span aria-hidden />
        )}

        {/* Player: mark complete (optimistic, reused completeTask action). */}
        {playerCanComplete && (
          <Button
            variant="secondary"
            size="sm"
            busy={completing}
            disabled={completing}
            onClick={handleComplete}
            leftIcon={<IconCheck size={15} />}
          >
            Mark complete
          </Button>
        )}
      </div>

      {/* Expanded per-player progress (coach). */}
      {role === 'coach' && expanded && hasAssignments && (
        <div className="border-t border-border-subtle pt-4">
          <p className="mb-3 font-fw-sans text-eyebrow font-semibold uppercase tracking-[0.12em] text-text-tertiary">
            Player progress
          </p>
          <div className="flex flex-col gap-1.5">
            {task.assignments.map((assignment) => (
              <div
                key={assignment.id}
                className="flex items-center justify-between gap-3 rounded-fw-md bg-surface-sunken px-3 py-2"
              >
                <span className="min-w-0 flex-1 truncate font-fw-sans text-body-sm text-text-secondary">
                  {assignment.player.first_name} {assignment.player.last_name}
                </span>
                <div className="flex flex-shrink-0 items-center gap-2">
                  {assignment.status === 'completed' ? (
                    <span className="inline-flex items-center gap-1.5 font-fw-sans text-caption font-medium text-accent-700">
                      <IconCheck size={15} />
                      Completed
                    </span>
                  ) : (
                    <span className="font-fw-sans text-caption font-medium text-text-tertiary">
                      Pending
                    </span>
                  )}
                  {assignment.player.id ? (
                    <IconButton
                      variant="ghost"
                      size="sm"
                      aria-label={`Message ${assignment.player.first_name} ${assignment.player.last_name}`}
                      onClick={() =>
                        router.push(`/golf/dashboard/messages?player=${assignment.player.id}`)
                      }
                    >
                      <IconMessage size={15} />
                    </IconButton>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* P285 — Reminder picker (coach). Reuses setTaskReminder verbatim. */}
      {canManage && (
        <ModalShell
          open={reminderOpen}
          onOpenChange={(next) => {
            if (!next && !savingReminder) setReminderOpen(false);
          }}
          size="sm"
          title={task.reminder_at ? 'Update reminder' : 'Set reminder'}
          description={`Choose when the team gets a nudge for "${task.title}".`}
        >
          <Form spacing="cozy" onSubmit={handleSaveReminder}>
            <FormField label="Reminder" help="The team is nudged at this time.">
              <Input
                type="datetime-local"
                name="reminderAt"
                value={reminderValue}
                onChange={(e) => setReminderValue(e.target.value)}
                required
              />
            </FormField>
            <ModalShell.Footer>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setReminderOpen(false)}
                disabled={savingReminder}
              >
                Cancel
              </Button>
              <Button type="submit" variant="primary" busy={savingReminder}>
                {task.reminder_at ? 'Update reminder' : 'Set reminder'}
              </Button>
            </ModalShell.Footer>
          </Form>
        </ModalShell>
      )}

      {/* P285 — Delete confirm (coach). DESTRUCTIVE — explicit confirm only. */}
      {canManage && (
        <ModalShell
          open={pendingDelete}
          onOpenChange={(next) => {
            if (!next && !deleting) setPendingDelete(false);
          }}
          size="sm"
          title="Delete task?"
          description={
            <>
              Delete <span className="font-medium text-text-primary">{task.title}</span>? This
              also removes every player&apos;s assignment for it and can&apos;t be undone.
            </>
          }
        >
          <ModalShell.Footer>
            <Button variant="ghost" onClick={() => setPendingDelete(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="danger" busy={deleting} onClick={handleDelete}>
              Delete task
            </Button>
          </ModalShell.Footer>
        </ModalShell>
      )}
    </Surface>
  );
}

/* Convert a stored ISO timestamp to the `datetime-local` input value
 * (YYYY-MM-DDTHH:mm) in the viewer's local time, so the picker pre-fills with
 * the existing reminder instead of an empty field. */
function toDateTimeLocal(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default FairwayTasks;
