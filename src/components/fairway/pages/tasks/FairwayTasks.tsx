'use client';

/**
 * ============================================================================
 * Fairway · pages/tasks · FairwayTasks — the tasks field sheet
 * ----------------------------------------------------------------------------
 * The SHARED coach+player /golf/dashboard/tasks route, rebuilt to
 * docs/design/fairway-facelift/LANGUAGE.md and screens/tasks.v3.md: a bare
 * masthead on the canvas, ONE Surface holding the stage instrument, a bare
 * ledger row of unequal hairline-divided columns, then a dense table.
 *
 * What changed, and why. The previous pass was a masthead, a StatMatrix of
 * four stat cells, a standalone Toolbar and one Surface of seam rows: four
 * regions, three of them boxes, and between them they answered "what is on
 * the list". The question a coach actually opens this page with is who is
 * behind on the work I assigned, how late are they, and what has no due date
 * or no owner at all. The stage answers it; everything else is typeset around
 * it. No new query: every field read here was already arriving on the row.
 *
 * ── ROLE FORK ───────────────────────────────────────────────────────────────
 *   • Coach  — the team's tasks, one stage lane per player who owes open dated
 *              work plus a terminal lane for work nobody owns, a Create-task
 *              CTA, From-template in the overflow, and per-task manage.
 *   • Player — their own tasks in one lane labelled "You", first-person copy,
 *              and Mark complete at every width. No create, no team lane: a
 *              team-wide task they were never assigned is not theirs to be
 *              behind on.
 *
 * ── ONE CLOCK, ONE PREDICATE ────────────────────────────────────────────────
 *   `today` arrives as a bare YYYY-MM-DD string from the caller and NOTHING
 *   here reads a clock during render. Every overdue classification, every
 *   days-late figure and every date label on the page goes through
 *   tasks-field-logic.ts, so the masthead, the stage, the ledger and the table
 *   cannot disagree about which tasks are late or by how much. That includes
 *   the counts: they are derived from `tasks` rather than read from the hook's
 *   own fetch-time `stats`, which classified a task due TODAY as overdue
 *   (`new Date('YYYY-MM-DD')` is UTC midnight, which is yesterday in every US
 *   zone).
 *
 * ── HONESTY ─────────────────────────────────────────────────────────────────
 *   A failed read never renders as the empty state. A null is never a zero.
 *   A team-wide overdue task has no assignee to name, so the verdict says so
 *   rather than borrowing somebody's name. A task with an impossible due date
 *   loses its place on the axis and keeps its place in every count.
 * ========================================================================== */

import { useEffect, useMemo, useState } from 'react';
import { ClipboardList } from 'lucide-react';

import {
  Surface,
  Button,
  IconButton,
  EmptyState,
  InlineNotice,
  SearchField,
  Segmented,
  Menu,
  Sheet,
  Toolbar,
  fairwayToast,
} from '@/components/fairway';
import { IconPlus, IconMoreVertical } from '@/components/icons';
import type { TaskTemplate } from '@/app/golf/actions/tasks';
import {
  VerdictLine,
  FieldReadouts,
  SectionHead,
  type ReadoutItem,
} from '@/components/fairway/pages/dashboard/coach-home-parts';

import { FairwayCreateTaskModal } from './FairwayCreateTaskModal';
import { FairwayCreateFromTemplateModal } from './FairwayCreateFromTemplateModal';
import { FairwayTaskTemplateList } from './FairwayTaskTemplateList';
import { DueField } from './DueField';
import {
  CategoryLedgerRow,
  LedgerColumn,
  LedgerEmpty,
  LedgerRow,
  TaskDetail,
  TasksTable,
} from './tasks-parts';
import {
  UNCATEGORIZED,
  allCategories,
  buildTasksVerdict,
  canExpand,
  dueDomain,
  dueFieldCap,
  dueLanes,
  filterTasks,
  isOpen,
  openByCategory,
  openCount,
  openItems,
  overdueCount,
  overdueLedger,
  undatedOpenTasks,
  worstOffender,
  type FairwayTask,
  type FairwayTaskPlayer,
  type FairwayTaskStats,
} from './tasks-field-logic';

export type {
  FairwayTask,
  TaskAssignment,
  FairwayTaskStats,
  FairwayTaskPlayer,
} from './tasks-field-logic';

type FilterType = 'all' | 'active' | 'completed';
const STATUS_OPTIONS: { value: FilterType; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
];

type StageView = 'all' | 'behind';

/** Where an open detail panel was opened from, so a stage mark and a table row
 *  for the same task never expand two panels at once. */
type DetailSource = 'stage' | 'overdue' | 'undated' | 'table';

export interface FairwayTasksProps {
  /** Resolved viewer role (gates the create CTA, the team lane and copy). */
  role: 'coach' | 'player';
  /** The team id (null when unresolved — coach create/templates stay hidden). */
  teamId: string | null;
  /** Live tasks, already transformed into the legacy Task shape by the page. */
  tasks: FairwayTask[];
  /**
   * Live task stats from the realtime hook. ACCEPTED BUT NOT RENDERED: every
   * number on this page is derived from `tasks` against the same `today`, so
   * no two regions can disagree. The hook computes its own fetch-time `now`
   * and reads a bare date as UTC midnight, which counts a task due today as
   * overdue in any zone behind UTC; the derived counts here do not.
   */
  stats: FairwayTaskStats;
  /** Roster players, for the coach create / template assignment flows. */
  players: FairwayTaskPlayer[];
  /** The calendar day the page reads, `YYYY-MM-DD`. Resolved once by the
   *  caller; nothing in this tree reads a clock during render. */
  today: string;
  /**
   * P292 — whether the roster fetch itself failed (vs a genuinely empty
   * roster). Threaded to the create modal so it shows an honest notice.
   */
  playersError?: boolean;
  /**
   * Live-fetch error from useTaskRealtime (P283). When set, the page renders
   * an honest, recoverable error state instead of letting the failure fall
   * through to "No tasks yet", which would mask an outage.
   */
  error?: string | null;
  /** Refetch the live task list after a mutation (the hook's refetch). */
  onRefetch: () => void | Promise<void>;
  /** Player-only complete (owned by the wrapper). Coach passes none. */
  onCompleteTask?: (taskId: string) => Promise<CompleteResult | void>;
}

/** The subset of completeTask's ActionResult the page needs (P284). */
type CompleteResult = { success: boolean; error?: string };

/**
 * P284 — pure decision for the player "Mark complete" feedback. completeTask
 * resolves an ActionResult that may report `success: false` WITHOUT throwing,
 * so a void/undefined resolution and an explicit `{ success: true }` both
 * count as success. Exported for deterministic unit tests.
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

export function FairwayTasks({
  role,
  teamId,
  tasks,
  players,
  today,
  playersError = false,
  error,
  onRefetch,
  onCompleteTask,
}: FairwayTasksProps) {
  const isCoach = role === 'coach';

  // P283 — a true fetch failure. Track an in-flight retry so "Try again" shows
  // progress and can't be double-fired.
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
  const [query, setQuery] = useState('');
  const [categoryFilters, setCategoryFilters] = useState<string[]>([]);
  const [stageView, setStageView] = useState<StageView>('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [templateSheetOpen, setTemplateSheetOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<TaskTemplate | null>(null);
  const [detail, setDetail] = useState<{ id: string; source: DetailSource } | null>(null);

  // P290 — true optimistic completion. The row flips the instant the player
  // taps, then the realtime prop reconciles. Folding it into the task list
  // (rather than into one row's own state) keeps the counts, the stage and the
  // table telling the same story for that beat.
  const [optimisticDone, setOptimisticDone] = useState<string[]>([]);
  const [completingId, setCompletingId] = useState<string | null>(null);

  const viewTasks = useMemo(() => {
    if (optimisticDone.length === 0) return tasks;
    const done = new Set(optimisticDone);
    return tasks.map((t) => (done.has(t.id) ? { ...t, status: 'completed' } : t));
  }, [tasks, optimisticDone]);

  // Drop an optimistic flip once the source of truth catches up.
  useEffect(() => {
    setOptimisticDone((prev) => {
      if (prev.length === 0) return prev;
      const next = prev.filter((id) => tasks.some((t) => t.id === id && t.status !== 'completed'));
      return next.length === prev.length ? prev : next;
    });
  }, [tasks]);

  const openTaskCount = useMemo(() => openCount(viewTasks), [viewTasks]);
  const completedCount = viewTasks.length - openTaskCount;
  const overdueTaskCount = useMemo(() => overdueCount(viewTasks, today), [viewTasks, today]);
  const completionRate = viewTasks.length > 0 ? Math.round((completedCount / viewTasks.length) * 100) : 0;

  // The masthead's worst offender and every lane's "Worst late" figure are the
  // SAME function over the same normalized items, so the sentence can never
  // disagree with the instrument under it. The masthead's set is narrowed to
  // items that have a player to name; when that leaves nothing while overdue
  // work exists, the verdict says "all team-wide" rather than borrowing a name.
  const items = useMemo(() => openItems(viewTasks, role), [viewTasks, role]);
  const worst = useMemo(
    () => worstOffender(items.filter((i) => i.playerId !== null), today),
    [items, today],
  );

  const { categories, hasUncategorized } = useMemo(() => allCategories(viewTasks), [viewTasks]);
  const categoryCount = categories.length + (hasUncategorized ? 1 : 0);

  const verdict = useMemo(
    () =>
      buildTasksVerdict({
        role,
        hasError: !!error,
        totalTasks: viewTasks.length,
        openTasks: openTaskCount,
        overdueTasks: overdueTaskCount,
        completionRate,
        worst,
      }),
    [role, error, viewTasks.length, openTaskCount, overdueTaskCount, completionRate, worst],
  );

  const lanes = useMemo(() => dueLanes(viewTasks, today, role), [viewTasks, today, role]);
  const shownLanes = useMemo(
    () => (stageView === 'behind' ? lanes.filter((l) => l.worst) : lanes),
    [lanes, stageView],
  );
  const domain = useMemo(() => dueDomain(shownLanes, today), [shownLanes, today]);
  const cap = useMemo(() => dueFieldCap(shownLanes), [shownLanes]);

  const overdueRows = useMemo(() => overdueLedger(viewTasks, today), [viewTasks, today]);
  const categoryRows = useMemo(() => openByCategory(viewTasks), [viewTasks]);
  const undatedRows = useMemo(() => undatedOpenTasks(viewTasks), [viewTasks]);

  const readouts: ReadoutItem[] = useMemo(
    () => [
      // No deltas anywhere on this page: nothing persists a historical snapshot
      // of these counts, so a trend here would be fabricated.
      { key: 'open', label: 'Open', value: String(openTaskCount), note: ' ' },
      {
        key: 'overdue',
        label: 'Overdue',
        value: String(overdueTaskCount),
        note: overdueTaskCount > 0 ? 'past their due date' : ' ',
      },
      {
        key: 'completed',
        label: 'Completed',
        value: String(completionRate),
        unit: '%',
        // The field is lifetime, not windowed; never say "this week".
        note: 'of all tasks',
      },
      {
        key: 'undated',
        label: 'No due date',
        value: String(undatedRows.length),
        // This readout exists so the stage's exclusion is never silent.
        note: undatedRows.length > 0 ? 'excluded from the field' : ' ',
      },
    ],
    [openTaskCount, overdueTaskCount, completionRate, undatedRows.length],
  );

  // Stale category selections (the only task with that category was deleted)
  // must not silently hide the whole table.
  useEffect(() => {
    setCategoryFilters((prev) => {
      const valid = prev.filter((c) => (c === UNCATEGORIZED ? hasUncategorized : categories.includes(c)));
      return valid.length === prev.length ? prev : valid;
    });
  }, [categories, hasUncategorized]);

  // Search, status and category narrow the TABLE only. The stage and the
  // ledger always reflect the full dataset.
  const tableRows = useMemo(
    () => filterTasks(viewTasks, { status: filter, query, categories: categoryFilters }),
    [viewTasks, filter, query, categoryFilters],
  );

  const expandable = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const t of viewTasks) map.set(t.id, canExpand(t, role));
    return (task: FairwayTask) => map.get(task.id) ?? false;
  }, [viewTasks, role]);

  const taskById = useMemo(() => {
    const map = new Map<string, FairwayTask>();
    for (const t of viewTasks) map.set(t.id, t);
    return map;
  }, [viewTasks]);

  const toggleDetail = (source: DetailSource) => (taskId: string) =>
    setDetail((prev) => (prev && prev.id === taskId && prev.source === source ? null : { id: taskId, source }));

  const detailOpen = (source: DetailSource, taskId: string) =>
    !!detail && detail.source === source && detail.id === taskId;

  const stageDetail = detail?.source === 'stage' ? taskById.get(detail.id) ?? null : null;

  const handleComplete = async (taskId: string) => {
    if (!onCompleteTask || completingId) return;
    setCompletingId(taskId);
    setOptimisticDone((prev) => (prev.includes(taskId) ? prev : [...prev, taskId]));
    try {
      const feedback = completionFeedback(await onCompleteTask(taskId));
      if (feedback.kind === 'error') {
        setOptimisticDone((prev) => prev.filter((id) => id !== taskId));
        fairwayToast.error(feedback.message);
        return;
      }
      fairwayToast.success(feedback.message);
    } catch (err) {
      setOptimisticDone((prev) => prev.filter((id) => id !== taskId));
      fairwayToast.error(err instanceof Error ? err.message : 'Could not mark the task complete.');
    } finally {
      setCompletingId(null);
    }
  };

  const createCta =
    isCoach && teamId ? (
      // `leftIcon`, not two sibling children: Button wraps all children in one
      // span, and Tailwind's preflight makes an svg display:block, which used
      // to stack the "+" above the label on phone.
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

  const modals = (
    <>
      {isCoach && teamId ? (
        <FairwayCreateTaskModal
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          onTaskCreated={onRefetch}
          teamId={teamId}
          players={players}
          playersError={playersError}
          categories={categories}
        />
      ) : null}

      {isCoach && teamId ? (
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
      ) : null}

      {isCoach && teamId && selectedTemplate ? (
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
      ) : null}
    </>
  );

  const masthead = (
    <>
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <p className="font-fw-sans text-eyebrow uppercase tracking-[0.09em] text-text-tertiary">Tasks</p>
        <div className="flex flex-shrink-0 items-center gap-2">
          {createCta}
          {templateOverflow}
        </div>
      </div>
      <h1 className="mt-2 font-fw-display text-display font-semibold leading-[1.05] tracking-[-0.02em] text-text-primary">
        {isCoach ? 'Team to-dos.' : 'Your to-dos.'}
      </h1>
      <div className="mt-3">
        <VerdictLine parts={verdict} />
      </div>
      {viewTasks.length > 0 ? (
        <p className="mt-3 font-fw-mono text-caption tabular-nums text-text-tertiary">
          {viewTasks.length} total · {categoryCount} {categoryCount === 1 ? 'category' : 'categories'}
        </p>
      ) : null}
    </>
  );

  // ── A failed read, and the true zero state, keep the masthead and nothing
  //    else: there is no field to draw, no ledger to fill, no table to head.
  if (error || viewTasks.length === 0) {
    return (
      <div className="mx-auto w-full max-w-[1280px] px-4 py-6 pb-24 md:px-6 md:py-8">
        {masthead}
        <div className="mt-8">
          {error ? (
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
          ) : (
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
                    <Button variant="primary" onClick={() => setCreateOpen(true)} leftIcon={<IconPlus size={16} />}>
                      Create task
                    </Button>
                  ) : undefined
                }
              />
            </Surface>
          )}
        </div>
        {modals}
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 py-6 pb-24 md:px-6 md:py-8">
      {/* ── 1 · MASTHEAD, bare on the canvas ────────────────────────────── */}
      {masthead}

      {/* ── 2 · THE STAGE, the one Surface ──────────────────────────────── */}
      <Surface elevation="shadow" padding="none" className="mt-10 overflow-hidden">
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_15rem] xl:divide-x xl:divide-border-subtle">
          <div className="min-w-0 p-4 md:p-6">
            <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
              <div className="min-w-0">
                <p className="font-fw-sans text-eyebrow uppercase tracking-[0.07em] text-text-tertiary">
                  Outstanding work
                </p>
                <h2 className="mt-1 font-fw-display text-h2 font-semibold text-text-primary">Due field</h2>
                <p className="mt-1 max-w-[62ch] font-fw-sans text-body-sm text-text-secondary">
                  One lane per person who still owes dated work. An amber bar rises with the days a task is
                  late; a grey stroke is a date not yet reached. Load counts every open task on that lane,
                  dated or not.
                </p>
              </div>
              {lanes.length > 0 ? (
                <Segmented
                  size="sm"
                  options={[
                    { value: 'all', label: 'All lanes' },
                    { value: 'behind', label: 'Behind' },
                  ]}
                  value={stageView}
                  onValueChange={(v) => setStageView(v as StageView)}
                  aria-label="Which lanes to plot"
                />
              ) : null}
            </div>

            <div className="mt-5">
              {shownLanes.length > 0 ? (
                <DueField
                  lanes={shownLanes}
                  domain={domain}
                  cap={cap}
                  today={today}
                  rowsLabel={isCoach ? 'Player' : 'Lane'}
                  ariaLabel="Open tasks by due date"
                  onOpenTask={toggleDetail('stage')}
                />
              ) : (
                <p className="font-fw-sans text-body-sm text-text-secondary">
                  {lanes.length > 0
                    ? 'No lane is behind right now. Switch to All lanes to see what is scheduled.'
                    : openTaskCount === 0
                      ? `Nothing open right now. ${completedCount} completed.`
                      : 'No open task carries a due date yet. Every one of them is listed under "No due date" in the ledger below.'}
                </p>
              )}
            </div>

            {/* A mark opens the same detail a table row opens, here under the
                field it was opened from, so nothing jumps the page. */}
            {stageDetail ? (
              <div className="mt-4">
                <TaskDetail task={stageDetail} role={role} today={today} />
              </div>
            ) : null}
          </div>

          {/* Below xl the readouts read first: the four numbers are the glance,
              the field is what you scroll into. At xl they take the rail. */}
          <div className="order-first border-b border-border-subtle p-4 md:p-6 xl:order-none xl:border-b-0">
            <FieldReadouts items={readouts} />
          </div>
        </div>
      </Surface>

      {/* ── 3 · THE LEDGER ROW, bare, hairline-divided ──────────────────── */}
      <div className="mt-12 grid grid-cols-1 gap-y-10 md:grid-cols-2 md:gap-x-8 xl:grid-cols-12 xl:gap-x-0 xl:gap-y-0 xl:divide-x xl:divide-border-subtle">
        {/* 5 / 3 / 4, not 5 / 4 / 3: the narrow column has to hold the
            SHORTEST content, and category names are one or two words while
            task titles are a sentence. */}
        <LedgerColumn title="Overdue now" className="xl:col-span-5 xl:pr-8">
          {overdueRows.length === 0 ? (
            <LedgerEmpty>
              {openTaskCount === 0 ? 'Nothing open right now.' : 'Nothing is past its due date.'}
            </LedgerEmpty>
          ) : (
            overdueRows.map(({ task, daysLate: late }) => (
              <LedgerRow
                key={task.id}
                title={task.title}
                fact={`${late}d`}
                factTone="urgent"
                aside={task.category ?? undefined}
                onOpen={expandable(task) ? () => toggleDetail('overdue')(task.id) : undefined}
                expanded={detailOpen('overdue', task.id)}
                detailId={`overdue-detail-${task.id}`}
              >
                <TaskDetail task={task} role={role} today={today} />
              </LedgerRow>
            ))
          )}
        </LedgerColumn>

        <LedgerColumn title="By category" className="xl:col-span-3 xl:px-8">
          {categoryRows.length === 0 ? (
            <LedgerEmpty>Nothing open to group.</LedgerEmpty>
          ) : (
            categoryRows.map((row) => (
              <CategoryLedgerRow
                key={row.value}
                label={row.label}
                count={row.count}
                selected={categoryFilters.length === 1 && categoryFilters[0] === row.value}
                onSelect={() =>
                  setCategoryFilters((prev) => (prev.length === 1 && prev[0] === row.value ? [] : [row.value]))
                }
              />
            ))
          )}
        </LedgerColumn>

        <LedgerColumn title="No due date" className="md:col-span-2 xl:col-span-4 xl:pl-8">
          {undatedRows.length === 0 ? (
            <LedgerEmpty>Every open task has a due date.</LedgerEmpty>
          ) : (
            undatedRows.map((task) => {
              const n = task.assignments.length;
              return (
                <LedgerRow
                  key={task.id}
                  title={task.title}
                  fact={n > 0 ? String(n) : undefined}
                  aside={n > 0 ? (n === 1 ? 'assignee' : 'assignees') : 'team-wide'}
                  onOpen={expandable(task) ? () => toggleDetail('undated')(task.id) : undefined}
                  expanded={detailOpen('undated', task.id)}
                  detailId={`undated-detail-${task.id}`}
                >
                  <TaskDetail task={task} role={role} today={today} />
                </LedgerRow>
              );
            })
          )}
        </LedgerColumn>
      </div>

      {/* ── 4 · THE TABLE ───────────────────────────────────────────────── */}
      <div className="mt-12">
        <SectionHead title="Tasks" count={tableRows.length} />
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="min-w-[12rem] flex-1 md:max-w-sm">
            <SearchField
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onClear={() => setQuery('')}
              placeholder="Search tasks by title or description"
              aria-label="Search tasks"
            />
          </div>
          <Segmented
            size="sm"
            options={STATUS_OPTIONS}
            value={filter}
            onValueChange={setFilter}
            aria-label="Filter tasks by status"
          />
          {categories.length > 0 || hasUncategorized ? (
            <Toolbar.FilterMenu
              label="Category"
              options={[
                ...categories.map((cat) => ({ value: cat, label: cat })),
                ...(hasUncategorized ? [{ value: UNCATEGORIZED, label: 'Uncategorized' }] : []),
              ]}
              selected={categoryFilters}
              onToggle={(value) =>
                setCategoryFilters((prev) =>
                  prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
                )
              }
              onClear={() => setCategoryFilters([])}
            />
          ) : null}
        </div>

        {tableRows.length === 0 ? (
          <div className="mt-6">
            <EmptyState
              variant="subtle"
              title={query.trim() || categoryFilters.length > 0 ? 'No matching tasks' : `No ${filter} tasks`}
              description={
                query.trim() || categoryFilters.length > 0
                  ? 'No task matches that search and filter. Clear them to see the full list.'
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
          </div>
        ) : (
          <div className="mt-4">
            <TasksTable
              rows={tableRows}
              role={role}
              today={today}
              canManage={isCoach && !!teamId}
              expandable={expandable}
              openTaskId={detail?.source === 'table' ? detail.id : null}
              onToggle={toggleDetail('table')}
              onManaged={onRefetch}
              completingId={completingId}
              onComplete={onCompleteTask ? handleComplete : undefined}
              isCompleted={(task) => !isOpen(task)}
            />
          </div>
        )}
      </div>

      {modals}
    </div>
  );
}
