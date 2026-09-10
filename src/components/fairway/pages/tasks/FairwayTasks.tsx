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
 * ── FACELIFT COMPOSITION (docs/design/fairway-facelift/screens/tasks.md) ────
 *   ViewHeader (eyebrow/h1/subtitle/meta, primary "Create task", "From
 *   template" folded into the header overflow Menu) → StatMatrix (Open ·
 *   Active · Completed · Overdue — the Overdue cell is danger-toned and, when
 *   >0, a real button that jumps to the Active filter) → Toolbar (search ·
 *   status Segmented · ONE category FilterPill/PopoverPanel replacing the old
 *   eight loose pills) → ONE matte Surface of seam rows (title · assignee
 *   progress · due · category Chip · overflow). A row click expands an inline
 *   DrillPanel on desktop or opens a matte bottom Sheet on phone with the same
 *   description/assignees content. The old overdue warning card, the
 *   Templates rail card, and the Quick-stats mini-cards are gone — the
 *   StatMatrix and the header overflow now carry that weight.
 *
 * ── ROLE FORK ───────────────────────────────────────────────────────────────
 *   • Coach  — sees the team's tasks, an honest per-task assignment progress
 *              read-out, a Create-task CTA, and From-template in the overflow.
 *   • Player — sees the tasks assigned to them, and can mark a task complete
 *              (optimistic, via the unchanged completeTask action). No create.
 *              The player's "Mark complete" stays visible on the row itself at
 *              every width (unlike the coach's manage kebab, which the phone
 *              row folds away) — the screen spec is written from the coach's
 *              vantage point and never addresses the player's primary action,
 *              so this reading preserves the one-tap complete flow rather than
 *              relegating it behind an extra tap into the detail sheet.
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

import { useEffect, useId, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ClipboardList, Bell, Check, ChevronDown, ListFilter } from 'lucide-react';

import { cn } from '@/lib/utils';
import { useMediaQuery } from '@/hooks/use-media-query';
import { InsetGroup } from '@/components/fairway/surfaces';
import { fwHaptic } from '@/lib/fairway/haptics';
import {
  ViewHeader,
  Surface,
  Chip,
  Button,
  IconButton,
  EmptyState,
  InlineNotice,
  SearchField,
  ModalShell,
  Form,
  FormField,
  Input,
  PopoverPanel,
  Menu,
  Sheet,
  Toolbar,
  StatMatrix,
  DrillPanel,
  Progress,
  PressTarget,
  fairwayToast,
  type StatMatrixItem,
} from '@/components/fairway';
import {
  IconCheck,
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
/** Status options — the desktop Segmented and the phone status Sheet share them. */
const STATUS_OPTIONS: { value: FilterType; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
];

export interface FairwayTasksProps {
  /** Resolved viewer role (gates the create CTA + Templates rail + complete action). */
  role: 'coach' | 'player';
  /** The team id (null when unresolved — coach create/templates stay hidden). */
  teamId: string | null;
  /** Live tasks, already transformed into the legacy Task shape by the page. */
  tasks: FairwayTask[];
  /** Live task stats from the realtime hook (overdue count drives the StatMatrix). */
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

/**
 * Sentinel for the "Uncategorized" chip. A real category is free text from
 * `golf_tasks.category`, so a bare 'uncategorized' could collide with a
 * category a coach actually typed. The leading space keeps it distinct, and
 * the chip renders its own label, so the sentinel is never shown to anyone.
 */
const UNCATEGORIZED = ' uncategorized';

/** Breakpoint at which a row's detail opens inline (DrillPanel) instead of a
 *  bottom Sheet. Matches Tailwind's `sm` (640px) — the same threshold the row
 *  cells themselves use to reveal the progress/category columns. */
const DESKTOP_QUERY = '(min-width: 640px)';

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
  // Phone: the status Segmented lives in a Sheet behind one "Status" control.
  const [statusSheetOpen, setStatusSheetOpen] = useState(false);
  // P287 — text search (title/description) + category narrowing for coaches at scale.
  const [query, setQuery] = useState('');
  // Multi-select category filter (screens/tasks.md CONTAINERS TO REMOVE #2): a
  // task matches when its category is in this set, OR the set is empty.
  const [categoryFilters, setCategoryFilters] = useState<string[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [templateSheetOpen, setTemplateSheetOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<TaskTemplate | null>(null);

  // A single client `now` so overdue + relative-date labels match SSR.
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
  }, []);

  // Honest counts — the SAME predicates the legacy page used.
  const activeCount = tasks.filter((t) => t.status === 'active').length;
  const completedCount = tasks.filter((t) => t.status === 'completed').length;

  // P287 — distinct task categories + per-category counts (honest: derived only
  // from real task data). `categoryCounts` also carries the Uncategorized bucket
  // under the UNCATEGORIZED sentinel key.
  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of tasks) {
      const key = t.category ?? UNCATEGORIZED;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [tasks]);
  const categories = useMemo(
    () =>
      Array.from(categoryCounts.keys())
        .filter((c) => c !== UNCATEGORIZED)
        .sort((a, b) => a.localeCompare(b)),
    [categoryCounts],
  );
  const hasUncategorized = categoryCounts.has(UNCATEGORIZED);

  // Stale category selections (the only task with that category was deleted)
  // must not silently hide the whole list — drop them when they no longer exist.
  useEffect(() => {
    setCategoryFilters((prev) => {
      const valid = prev.filter((c) => (c === UNCATEGORIZED ? hasUncategorized : categories.includes(c)));
      return valid.length === prev.length ? prev : valid;
    });
  }, [categories, hasUncategorized]);

  // P287 — status + text search + category, all honest predicates.
  const filteredTasks = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tasks.filter((t) => {
      if (filter !== 'all' && t.status !== filter) return false;
      if (categoryFilters.length > 0) {
        const matches = categoryFilters.some((c) => (c === UNCATEGORIZED ? !t.category : t.category === c));
        if (!matches) return false;
      }
      if (q) {
        const haystack = `${t.title} ${t.description ?? ''}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [tasks, filter, categoryFilters, query]);

  // ── StatMatrix — Open (total) · Active · Completed · Overdue. The Overdue
  // cell is the single "tap to triage" affordance that used to be a separate
  // warning card (screens/tasks.md CONTAINERS TO REMOVE #1).
  const overdueCount = stats.overdue_tasks;
  const statItems: StatMatrixItem[] = [
    { label: 'Open', value: tasks.length },
    { label: 'Active', value: activeCount },
    { label: 'Completed', value: completedCount, tone: 'accent' },
    {
      label: 'Overdue',
      tone: overdueCount > 0 ? 'danger' : 'neutral',
      value:
        overdueCount > 0 ? (
          <PressTarget
            onClick={() => setFilter('active')}
            aria-label="View overdue tasks"
            className={cn(
              'relative -m-1 rounded-fw-sm p-1 font-fw-sans text-h2 font-semibold leading-none tracking-[-0.01em] text-fw-danger-ink tabular-nums',
              'bg-transparent hover:bg-fw-danger-bg active:bg-fw-danger-bg',
              "before:absolute before:-inset-2 before:content-['']",
            )}
          >
            {overdueCount}
          </PressTarget>
        ) : (
          overdueCount
        ),
    },
  ];

  const createCta =
    isCoach && teamId ? (
      // P293-mobile — Button's non-asChild content wraps ALL children in one
      // bare <span> (see the Button CHILDREN CONTRACT doc comment). Passing
      // the icon and label as two sibling children put an `<svg>` (Tailwind
      // preflight sets `svg { display: block }`) next to inline text inside
      // that shared span — the block-level icon forced its own line, stacking
      // the "+" above "Create task" on mobile. `leftIcon` is the documented
      // fix: it renders the icon as its own flex item in the button's own
      // `inline-flex items-center gap-2` row instead of inside the label span.
      <Button variant="primary" onClick={() => setCreateOpen(true)} leftIcon={<IconPlus size={16} />}>
        Create task
      </Button>
    ) : undefined;

  const templateOverflow =
    isCoach && teamId ? (
      <Menu
        trigger={
          <IconButton variant="ghost" size="md" aria-label="More task actions">
            <IconMoreVertical size={18} />
          </IconButton>
        }
        align="end"
        ariaLabel="More task actions"
      >
        <Menu.Item icon={<ClipboardList size={16} />} onSelect={() => setTemplateSheetOpen(true)}>
          From template
        </Menu.Item>
      </Menu>
    ) : undefined;

  const categoryFilterMenu =
    categories.length > 0 || hasUncategorized ? (
      <Toolbar.FilterMenu
        label="Category"
        options={[
          ...categories.map((cat) => ({ value: cat, label: cat, count: categoryCounts.get(cat) })),
          ...(hasUncategorized
            ? [{ value: UNCATEGORIZED, label: 'Uncategorized', count: categoryCounts.get(UNCATEGORIZED) }]
            : []),
        ]}
        selected={categoryFilters}
        onToggle={(value) =>
          setCategoryFilters((prev) =>
            prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
          )
        }
        onClear={() => setCategoryFilters([])}
      />
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
        meta={tasks.length > 0 ? <span className="tabular-nums">{tasks.length} open</span> : undefined}
        primaryAction={createCta}
        secondaryActions={templateOverflow}
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
                  // Same fix as the masthead CTA above — `leftIcon`, not two
                  // sibling children (see the comment there for why).
                  <Button variant="primary" onClick={() => setCreateOpen(true)} leftIcon={<IconPlus size={16} />}>
                    Create task
                  </Button>
                ) : undefined
              }
            />
          </Surface>
        </div>
      ) : (
        <div className="mt-8 flex flex-col gap-6">
          {/* ── StatMatrix — Open · Active · Completed · Overdue. ─────────────── */}
          <StatMatrix items={statItems} />

          {/* ── Toolbar — search · status Segmented · ONE category filter. ────── */}
          <Toolbar
            search={
              <SearchField
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onClear={() => setQuery('')}
                placeholder="Search tasks by title or description"
                aria-label="Search tasks"
              />
            }
            viewToggle={
              // Desktop only; on phone the same options open from the
              // "Status" control in the filters line (tasks.mobile.md #1).
              <div className="hidden sm:contents">
                <Toolbar.ViewToggle
                  options={STATUS_OPTIONS}
                  value={filter}
                  onValueChange={setFilter}
                  aria-label="Filter tasks by status"
                />
              </div>
            }
            filters={
              <>
                {categoryFilterMenu}
                <Button
                  variant="secondary"
                  size="sm"
                  className="shrink-0 sm:hidden"
                  leftIcon={<ListFilter className="h-4 w-4" aria-hidden />}
                  aria-haspopup="dialog"
                  aria-expanded={statusSheetOpen}
                  onClick={() => setStatusSheetOpen(true)}
                >
                  Status · {STATUS_OPTIONS.find((o) => o.value === filter)?.label ?? 'All'}
                </Button>
              </>
            }
          />

          {/* ── The task list: ONE matte Surface of seam rows. ────────────────── */}
          {filteredTasks.length === 0 ? (
            <Surface elevation="border" padding="none">
              <EmptyState
                variant="subtle"
                icon={ClipboardList}
                title={
                  query.trim() || categoryFilters.length > 0
                    ? 'No matching tasks'
                    : filter === 'all'
                      ? 'No tasks'
                      : `No ${filter} tasks`
                }
                description={
                  query.trim() || categoryFilters.length > 0
                    ? 'No tasks match your search or category filter. Try clearing them.'
                    : filter === 'completed'
                      ? 'Completed tasks will collect here.'
                      : 'Nothing in this view right now.'
                }
                action={
                  query.trim() || categoryFilters.length > 0 ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setQuery('');
                        setCategoryFilters([]);
                      }}
                    >
                      Clear filters
                    </Button>
                  ) : undefined
                }
              />
            </Surface>
          ) : (
            <Surface elevation="border" padding="none" className="divide-y divide-border-subtle overflow-hidden">
              {filteredTasks.map((task) => (
                <FairwayTaskRow
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
            </Surface>
          )}
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
          categories={categories}
        />
      )}

      {/* ── Phone status Sheet — the Segmented's three options as seam rows.
          Matte (a docked utility sheet), closes on pick. ──────────────────── */}
      <Sheet open={statusSheetOpen} onOpenChange={setStatusSheetOpen} title="Filter tasks by status">
        <Sheet.Body className="px-4 pb-4">
          <InsetGroup variant="matte" aria-label="Task status">
            {STATUS_OPTIONS.map((opt) => {
              const selected = filter === opt.value;
              return (
                <InsetGroup.Row
                  key={opt.value}
                  as="button"
                  aria-pressed={selected}
                  trailing={selected ? <Check className="text-accent-700" aria-hidden /> : undefined}
                  onClick={() => {
                    if (!selected) fwHaptic('selection');
                    setFilter(opt.value);
                    setStatusSheetOpen(false);
                  }}
                >
                  <span className={cn('font-fw-sans text-body-sm', selected ? 'font-semibold text-text-primary' : 'text-text-secondary')}>
                    {opt.label}
                  </span>
                </InsetGroup.Row>
              );
            })}
          </InsetGroup>
        </Sheet.Body>
      </Sheet>

      {/* ── Templates Sheet (coach) — header overflow's "From template". ────── */}
      {isCoach && teamId && (
        <Sheet
          open={templateSheetOpen}
          onOpenChange={setTemplateSheetOpen}
          side="right"
          mobileSide="bottom"
          title="Templates"
          description="Start a task from a saved template."
        >
          <Sheet.Body>
            <FairwayTaskTemplateList
              teamId={teamId}
              onSelectTemplate={(t) => {
                setTemplateSheetOpen(false);
                setSelectedTemplate(t);
              }}
            />
          </Sheet.Body>
        </Sheet>
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
 * helper (never `new Date(due_date)` directly) so the row's due column, the
 * overdue tint, and the sort checks all agree on the same calendar day.
 * Exported for the regression test. A full timestamp (already carrying a time
 * component) parses exactly as `new Date` would — only the bare date-only
 * case needs the local-construction fix.
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
 * FairwayTaskRow — one seam row in the tasks Surface. Honest per-player
 * completion (only when the task actually has assignment rows). A click on
 * the row's main cells expands an inline DrillPanel on desktop or opens a
 * matte bottom Sheet on phone with the same description/assignees content.
 * The coach's manage kebab (reminder / delete) sits beside the row on
 * desktop only; the player's Mark-complete stays visible at every width.
 * ────────────────────────────────────────────────────────────────────────── */
function FairwayTaskRow({
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
  const isDesktop = useMediaQuery(DESKTOP_QUERY);
  const detailId = useId();
  const [expanded, setExpanded] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [completing, setCompleting] = useState(false);
  // P290 — true optimistic completion. We flip the row locally the instant the
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

  // The status the row SHOWS (optimistic completion wins until reconciled).
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
    // make this row's due label disagree with the masthead's honest counts
    // for the identical stored value.
    parseDueDate(task.due_date) < now &&
    completionRate < 100 &&
    displayStatus !== 'completed';

  // Player-side complete: only when the action is provided and the task isn't
  // already complete (and isn't optimistically completing).
  const playerCanComplete =
    role === 'player' && !!onComplete && displayStatus !== 'completed';

  // Only offer the row expand when there is something to show in it — an
  // empty DrillPanel/Sheet is a dead end, not an affordance.
  const canExpand = !!task.description || !!task.reminder_at || (role === 'coach' && hasAssignments);

  const handleRowActivate = () => {
    if (isDesktop) {
      setExpanded((v) => !v);
    } else {
      setSheetOpen(true);
    }
  };

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
    } catch (err) {
      // A genuinely thrown error — roll back the optimistic flip and tell the player.
      setOptimisticDone(false);
      fairwayToast.error(err instanceof Error ? err.message : 'Could not mark the task complete.');
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
    } catch (err) {
      fairwayToast.error(err instanceof Error ? err.message : 'Failed to set the reminder.');
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
    } catch (err) {
      fairwayToast.error(err instanceof Error ? err.message : 'Failed to clear the reminder.');
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
    } catch (err) {
      fairwayToast.error(err instanceof Error ? err.message : 'Failed to delete the task.');
    } finally {
      setDeleting(false);
    }
  };

  // Shared description/assignees content for the desktop DrillPanel AND the
  // phone Sheet — one body, two chrome levels (screens/tasks.md: "row click →
  // inline DrillPanel: description, assignees, actions").
  const detailBody = (
    <div className="flex flex-col gap-4">
      {task.reminder_at && (
        <span
          className={cn(
            'inline-flex w-fit items-center gap-1.5 font-fw-sans text-caption',
            reminderTone(task.reminder_at, now) === 'past'
              ? 'text-text-tertiary'
              : reminderTone(task.reminder_at, now) === 'upcoming'
                ? 'text-text-secondary'
                : 'text-text-primary',
          )}
          suppressHydrationWarning
        >
          <Bell className="h-3.5 w-3.5 flex-shrink-0" aria-hidden />
          {formatReminderLabel(task.reminder_at, now)}
        </span>
      )}

      {task.description && (
        <p className="font-fw-sans text-body-sm text-text-secondary">{task.description}</p>
      )}

      {role === 'coach' && hasAssignments && (
        <div>
          <p className="mb-2 font-fw-sans text-eyebrow font-semibold uppercase tracking-[0.12em] text-text-tertiary">
            Assignees
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
    </div>
  );

  return (
    <div data-slot="task-row-group">
      <div className="flex items-stretch">
        <PressTarget
          aria-expanded={canExpand ? expanded : undefined}
          aria-controls={canExpand ? detailId : undefined}
          disabled={!canExpand}
          onClick={canExpand ? handleRowActivate : undefined}
          className={cn(
            'flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left sm:gap-4 sm:px-6',
            canExpand && 'cursor-pointer [@media(hover:hover)]:hover:bg-surface-tint',
            expanded && 'bg-accent-50',
          )}
        >
          <div className="min-w-0 flex-1">
            <p className="truncate font-fw-sans text-body font-medium text-text-primary">
              {task.title}
            </p>
            {/* Phone: progress rides under the title (the desktop cell below is
                `hidden sm:block`) — title · progress · due (tasks.mobile.md #2).
                Never a fake 0/0. */}
            {hasAssignments && (
              <div className="mt-1 flex items-center gap-2 sm:hidden">
                <div className="w-16">
                  <Progress
                    value={completionRate}
                    size="sm"
                    tone={completionRate === 100 ? 'success' : 'accent'}
                    label={`${task.title}: ${completedCount} of ${totalCount} assignees completed`}
                  />
                </div>
                <span className="font-fw-sans text-caption tabular-nums text-text-tertiary">
                  {completedCount}/{totalCount}
                </span>
              </div>
            )}
          </div>

          {/* Assignee progress — n/total + a slim Progress bar. Never a fake
              0/0: the cell stays blank for team-wide tasks with no per-player
              assignment rows. */}
          <div className="hidden w-28 flex-shrink-0 sm:block">
            {hasAssignments && (
              <div className="flex flex-col gap-1">
                <span className="font-fw-sans text-caption tabular-nums text-text-tertiary">
                  {completedCount}/{totalCount}
                </span>
                <Progress
                  value={completionRate}
                  size="sm"
                  tone={completionRate === 100 ? 'success' : 'accent'}
                  label={`${task.title} — ${completedCount} of ${totalCount} assignees completed`}
                />
              </div>
            )}
          </div>

          {/* Due — tabular, toned danger when overdue. */}
          <div className="w-16 flex-shrink-0 text-right sm:w-20 sm:text-left">
            {task.due_date && (
              <span
                className={cn(
                  'font-fw-sans text-body-sm tabular-nums',
                  isOverdue ? 'font-medium text-fw-danger-ink' : 'text-text-secondary',
                )}
                suppressHydrationWarning
              >
                {formatDueLabel(task.due_date, now)}
              </span>
            )}
          </div>

          {/* Category — desktop only; the phone row compresses to title ·
              progress · due (screens/tasks.md). Still reachable on phone via
              the row's own Sheet, which restates it in its header. */}
          <div className="hidden w-28 flex-shrink-0 sm:flex sm:items-center">
            {task.category && (
              <Chip tone="neutral" size="sm">
                {task.category}
              </Chip>
            )}
          </div>

          {canExpand && (
            <ChevronDown
              aria-hidden="true"
              className={cn(
                'hidden h-4 w-4 flex-shrink-0 text-text-tertiary transition-transform duration-150 sm:block',
                'motion-reduce:transition-none',
                expanded && 'rotate-180',
              )}
            />
          )}
        </PressTarget>

        {/* Trailing slot: the coach's manage kebab (desktop only — folds into
            the phone Sheet's own actions) OR the player's Mark-complete,
            which stays visible at every width (see the ROLE FORK doc above). */}
        {canManage ? (
          <div className="hidden flex-shrink-0 items-center pr-3 sm:flex sm:pr-4">
            <PopoverPanel
              side="bottom"
              align="end"
              surface="matte"
              width="sm"
              ariaLabel={`Manage task: ${task.title}`}
              trigger={
                <IconButton variant="ghost" size="sm" aria-label={`Manage task: ${task.title}`}>
                  <IconMoreVertical size={18} />
                </IconButton>
              }
            >
              <PopoverPanel.Item onClick={openReminderModal}>
                <IconBell size={18} className="text-text-tertiary" />
                {task.reminder_at ? 'Update reminder' : 'Set reminder'}
              </PopoverPanel.Item>
              {task.reminder_at && (
                <PopoverPanel.Item onClick={() => void handleClearReminder()} disabled={clearingReminder}>
                  <IconBell size={18} className="text-text-tertiary" />
                  Clear reminder
                </PopoverPanel.Item>
              )}
              <PopoverPanel.Separator />
              <PopoverPanel.Item
                onClick={() => setPendingDelete(true)}
                className="text-fw-danger-ink hover:bg-fw-danger-bg hover:text-fw-danger-ink"
              >
                <IconTrash size={18} className="text-fw-danger-ink" />
                Delete task
              </PopoverPanel.Item>
            </PopoverPanel>
          </div>
        ) : playerCanComplete ? (
          <div className="flex flex-shrink-0 items-center pr-3 sm:pr-4">
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
          </div>
        ) : null}
      </div>

      {/* Desktop — inline DrillPanel under the row. */}
      {isDesktop && canExpand && expanded && (
        <div id={detailId} className="border-t border-border-subtle bg-surface-sunken p-3 sm:p-4">
          <DrillPanel
            title={task.title}
            backLabel="Collapse"
            onBack={() => setExpanded(false)}
            chip={
              task.category ? (
                <Chip tone="neutral" size="sm">
                  {task.category}
                </Chip>
              ) : undefined
            }
          >
            {detailBody}
          </DrillPanel>
        </div>
      )}

      {/* Phone — the same content in a matte bottom Sheet. */}
      {!isDesktop && canExpand && (
        <Sheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          title={task.title}
          description={task.category ?? undefined}
        >
          <Sheet.Body>{detailBody}</Sheet.Body>
        </Sheet>
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
    </div>
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
