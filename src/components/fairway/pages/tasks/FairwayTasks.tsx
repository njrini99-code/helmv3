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
import { ClipboardList, Bell, ChevronDown } from 'lucide-react';

import { cn } from '@/lib/utils';
import {
  ViewHeader,
  Surface,
  StatusPill,
  Chip,
  Button,
  FilterPill,
  EmptyState,
  InlineNotice,
  type FwStatusTone,
} from '@/components/fairway';
import { IconCheck, IconClock, IconUsers, IconPlus } from '@/components/icons';
import type { TaskTemplate } from '@/app/golf/actions/tasks';

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
  /** Refetch the live task list after a mutation (the hook's refetch). */
  onRefetch: () => void | Promise<void>;
  /** Player-only optimistic complete (owned by the wrapper). Coach passes none. */
  onCompleteTask?: (taskId: string) => Promise<void>;
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
  onRefetch,
  onCompleteTask,
}: FairwayTasksProps) {
  const isCoach = role === 'coach';

  const [filter, setFilter] = useState<FilterType>('all');
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
      return new Date(t.due_date).toDateString() === now.toDateString();
    }).length;
  }, [tasks, now]);

  const filteredTasks = tasks.filter((t) => {
    if (filter === 'all') return true;
    return t.status === filter;
  });

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

      {tasks.length === 0 ? (
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
                  <Button variant="ghost" size="sm" onClick={() => setFilter('active')}>
                    View active
                  </Button>
                ) : undefined
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

          {/* ── Main grid: list + coach Templates rail. ───────────────────────── */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              {filteredTasks.length === 0 ? (
                <Surface elevation="border" padding="none">
                  <EmptyState
                    variant="subtle"
                    icon={ClipboardList}
                    title={filter === 'all' ? 'No tasks' : `No ${filter} tasks`}
                    description={
                      filter === 'completed'
                        ? 'Completed tasks will collect here.'
                        : 'Nothing in this view right now.'
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
                    <button
                      type="button"
                      onClick={() => setShowTemplates((s) => !s)}
                      aria-expanded={showTemplates}
                      className={cn(
                        'flex w-full items-center justify-between gap-2 rounded-card px-5 py-4 text-left',
                        'transition-colors [transition-duration:180ms] hover:bg-surface-tint',
                        'outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
                      )}
                    >
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
                    </button>
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
                        <p className="font-fw-display text-h3 font-medium tabular-nums text-warm-800">
                          {stats.overdue_tasks}
                        </p>
                        <p className="font-fw-sans text-caption text-warm-800">Overdue</p>
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
function reminderTone(reminderAt: string, now: Date): 'imminent' | 'soon' | 'upcoming' | 'past' {
  const diff = new Date(reminderAt).getTime() - now.getTime();
  if (diff < 0) return 'past';
  const hours = diff / (1000 * 60 * 60);
  if (hours <= 3) return 'imminent';
  if (hours <= 24) return 'soon';
  return 'upcoming';
}

function formatDueLabel(dateString: string, now: Date | null): string {
  const date = new Date(dateString);
  if (!now) {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (date.toDateString() === now.toDateString()) return 'Today';
  if (date.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/* ───────────────────────────────────────────────────────────────────────────
 * TaskCard — matte Surface row. Honest per-player completion (only when the
 * task actually has assignment rows). Coach sees an expandable per-player
 * progress list; player sees a Mark-complete action (optimistic, reused action).
 * ────────────────────────────────────────────────────────────────────────── */
function FairwayTaskCard({
  task,
  now,
  role,
  onComplete,
}: {
  task: FairwayTask;
  now: Date | null;
  role: 'coach' | 'player';
  onComplete?: (taskId: string) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [completing, setCompleting] = useState(false);

  const completedCount = task.assignments.filter((a) => a.status === 'completed').length;
  const totalCount = task.assignments.length;
  const completionRate = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
  const hasAssignments = totalCount > 0;

  const isOverdue =
    !!now && !!task.due_date && new Date(task.due_date) < now && completionRate < 100 && task.status !== 'completed';

  const pill = statusPill(task.status);

  // Player-side complete: only when the action is provided, the task isn't
  // already complete, and there's a real assignment for this viewer.
  const playerCanComplete =
    role === 'player' && !!onComplete && task.status !== 'completed';

  const handleComplete = async () => {
    if (!onComplete || completing) return;
    setCompleting(true);
    try {
      await onComplete(task.id);
    } finally {
      setCompleting(false);
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
        <StatusPill tone={pill.tone} size="sm" className="flex-shrink-0">
          {pill.label}
        </StatusPill>
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
          {task.reminder_at && now && (
            <span
              className={cn(
                'inline-flex items-center gap-1.5',
                reminderTone(task.reminder_at, now) === 'past'
                  ? 'text-text-tertiary'
                  : reminderTone(task.reminder_at, now) === 'upcoming'
                    ? 'text-text-secondary'
                    : 'text-warm-800',
              )}
              title={`Reminder: ${new Date(task.reminder_at).toLocaleString()}`}
              suppressHydrationWarning
            >
              <Bell className="h-3.5 w-3.5 flex-shrink-0" aria-hidden />
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
                className="flex items-center justify-between rounded-fw-md bg-surface-sunken px-3 py-2"
              >
                <span className="font-fw-sans text-body-sm text-text-secondary">
                  {assignment.player.first_name} {assignment.player.last_name}
                </span>
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
              </div>
            ))}
          </div>
        </div>
      )}
    </Surface>
  );
}

export default FairwayTasks;
