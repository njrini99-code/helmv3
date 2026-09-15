/**
 * ============================================================================
 * Tasks · pure logic (docs/design/fairway-facelift/screens/tasks.v3.md)
 * ----------------------------------------------------------------------------
 * Every derivation the tasks field sheet needs, with no JSX and no React, so
 * the arithmetic is unit-testable without a DOM.
 *
 * NOTHING HERE READS A CLOCK. The caller passes `today` as a bare
 * `YYYY-MM-DD` string resolved once, which is what keeps the server render and
 * the client's first paint identical, and what lets every region of the page
 * (masthead, stage, ledger, table) classify the same task the same way.
 *
 * Date-only columns are parsed at LOCAL midnight. `new Date('YYYY-MM-DD')`
 * reads a bare date as UTC midnight, so any zone behind UTC (all of the US)
 * resolves it to the PREVIOUS local calendar day — the bug that used to make
 * a task due today read as overdue.
 * ========================================================================== */

import type { VerdictPart } from '@/components/fairway/pages/dashboard/coach-home-logic';

/* ───────────────────────────────────────────────────────────────────────────
 * The shapes the page renders from — the SAME objects the legacy page builds
 * and passes down (golf_tasks rows + their golf_task_assignments join).
 * Declared here rather than in the component so the logic module owns no
 * import back into JSX; FairwayTasks re-exports them for its existing callers.
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
  status: string; // 'active' | 'completed' (legacy-normalized by page.tsx)
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

/**
 * Sentinel for the "Uncategorized" bucket. A real category is free text from
 * `golf_tasks.category`, so a bare 'uncategorized' could collide with one a
 * coach actually typed. The leading space keeps it distinct, and every render
 * site prints its own label, so the sentinel is never shown to anyone.
 */
export const UNCATEGORIZED = ' uncategorized';

/** Sentinel lane id for open dated work that carries no assignment row at all.
 *  `createTask` only inserts assignment rows when `assignToPlayerIds` is
 *  non-empty (app/golf/actions/tasks.ts), so a team-wide task legitimately has
 *  none. It gets its own terminal lane rather than borrowing somebody's name. */
export const TEAM_LANE = ' team-wide';

export const TEAM_LANE_NAME = 'Team-wide, no assignee';

/* ── Days ─────────────────────────────────────────────────────────────────── */

export const DAY_MS = 86_400_000;
const YEAR_MS = 365 * DAY_MS;

/**
 * How far from today a due date may sit and still be plottable.
 *
 * Not defensive decoration: production carries golf rows with impossible dates
 * (a qualifier dated year 60824), and a single one stretches the axis across
 * millennia, collapsing every real mark to a hairline at one edge. A row
 * excluded here still counts in its lane's Load, in the ledger and in the
 * table — it loses its position on the axis, never its existence.
 */
export const DOMAIN_LIMIT_YEARS = 5;

/** The day part of a stored value: `2026-09-10T12:00:00Z` and `2026-09-10`
 *  both answer `2026-09-10`. */
export function dayOf(value: string): string {
  return value.split('T')[0] ?? value;
}

/** A date-only column as a LOCAL-midnight timestamp. Never `new Date(str)`. */
export function localMidnight(value: string): number {
  const [y, m, d] = dayOf(value).split('-').map(Number);
  if (!y || !m || !d) return Number.NaN;
  return new Date(y, m - 1, d).getTime();
}

export function isPlottable(value: string | null | undefined, today: string): boolean {
  if (!value) return false;
  const at = localMidnight(value);
  const now = localMidnight(today);
  if (!Number.isFinite(at) || !Number.isFinite(now)) return false;
  return Math.abs(at - now) <= DOMAIN_LIMIT_YEARS * YEAR_MS;
}

/**
 * Whole days a due date is late, relative to `today`. Zero on the due day
 * itself and negative before it.
 *
 * A task is NOT late on the day it is due: it has until the end of that day.
 * The predicate this feeds (`daysLate >= 1`) is therefore strictly stronger
 * than the shipped `parseDueDate(due) < now`, which flipped a task to overdue
 * at one minute past midnight on its own due date.
 */
export function daysLate(dueDate: string, today: string): number {
  const due = localMidnight(dueDate);
  const now = localMidnight(today);
  if (!Number.isFinite(due) || !Number.isFinite(now)) return Number.NaN;
  return Math.round((now - due) / DAY_MS);
}

/* ── Task predicates ──────────────────────────────────────────────────────── */

/** Open = not completed. `page.tsx` normalizes status to exactly
 *  'active' | 'completed', so this is the same set as `status === 'active'`. */
export function isOpen(task: Pick<FairwayTask, 'status'>): boolean {
  return task.status !== 'completed';
}

/** THE overdue predicate. Every count, list, bar and tint on the page reads
 *  this one function, so no two regions can disagree about which tasks are
 *  late — including the masthead, which used to read the hook's own
 *  fetch-time `stats.overdue_tasks` instead. */
export function isOverdue(task: Pick<FairwayTask, 'status' | 'due_date'>, today: string): boolean {
  if (!isOpen(task) || !task.due_date) return false;
  const late = daysLate(task.due_date, today);
  return Number.isFinite(late) && late >= 1;
}

export function openTasks(tasks: readonly FairwayTask[]): FairwayTask[] {
  return tasks.filter(isOpen);
}

export function openCount(tasks: readonly FairwayTask[]): number {
  return tasks.reduce((n, t) => (isOpen(t) ? n + 1 : n), 0);
}

export function overdueCount(tasks: readonly FairwayTask[], today: string): number {
  return tasks.reduce((n, t) => (isOverdue(t, today) ? n + 1 : n), 0);
}

export function undatedOpenTasks(tasks: readonly FairwayTask[]): FairwayTask[] {
  return tasks.filter((t) => isOpen(t) && !t.due_date);
}

/**
 * Whether a task has anything to show in its detail panel. A bare task with
 * only a title and a due date opens an empty panel, so its affordance is
 * disabled rather than dead — the same rule the shipped row already applies,
 * and the default state for the team-wide lane, which has no assignments by
 * definition.
 */
export function canExpand(task: FairwayTask, role: 'coach' | 'player'): boolean {
  return (
    !!task.description ||
    !!task.reminder_at ||
    (role === 'coach' && task.assignments.length > 0)
  );
}

/* ── Normalized open work ─────────────────────────────────────────────────── */

/**
 * One unit of open work on the field.
 *
 * Assignment rows and assignment-less team-wide tasks are normalized into the
 * SAME shape here, which is what makes "one function, two call sites"
 * structural rather than coincidental: the masthead's worst offender and every
 * lane's "Worst late" figure are both `worstOffender()` over a list of these.
 */
export interface OpenItem {
  /** Unique across the page: the assignment id, or `task:<id>` for a lane-less task. */
  key: string;
  taskId: string;
  title: string;
  /** The task's own due day, or null when it carries no due date. */
  dueDate: string | null;
  laneId: string;
  laneName: string;
  /** Null on the team-wide lane, which has no player to link or name. */
  playerId: string | null;
}

export interface LateItem extends OpenItem {
  dueDate: string;
  daysLate: number;
}

function playerName(player: TaskAssignment['player'], role: 'coach' | 'player'): string {
  const name = `${player.first_name ?? ''} ${player.last_name ?? ''}`.trim();
  if (name) return name;
  // The player view's synthetic assignment row carries empty names
  // (use-task-realtime.ts), so it is labelled for what it is rather than
  // rendered as a blank identity cell.
  if (role === 'player') return 'You';
  // A coach-side join that did not resolve. Say so; never invent a name.
  return 'Unnamed player';
}

/**
 * Every open piece of work, one entry per person who still owes it.
 *
 * A team-wide task (no assignment rows) contributes ONE entry on the terminal
 * lane. A player-role viewer gets no team-wide lane: a task they were never
 * individually assigned is not theirs to be behind on.
 */
export function openItems(tasks: readonly FairwayTask[], role: 'coach' | 'player'): OpenItem[] {
  const items: OpenItem[] = [];
  for (const task of tasks) {
    if (!isOpen(task)) continue;
    const dueDate = task.due_date ? dayOf(task.due_date) : null;
    if (task.assignments.length === 0) {
      if (role === 'player') continue;
      items.push({
        key: `task:${task.id}`,
        taskId: task.id,
        title: task.title,
        dueDate,
        laneId: TEAM_LANE,
        laneName: TEAM_LANE_NAME,
        playerId: null,
      });
      continue;
    }
    for (const assignment of task.assignments) {
      if (assignment.status === 'completed') continue;
      items.push({
        key: assignment.id,
        taskId: task.id,
        title: task.title,
        dueDate,
        laneId: assignment.player.id || TEAM_LANE,
        laneName: playerName(assignment.player, role),
        playerId: assignment.player.id || null,
      });
    }
  }
  return items;
}

/** Every item that is genuinely late today, worst first. */
export function lateItems(items: readonly OpenItem[], today: string): LateItem[] {
  const late: LateItem[] = [];
  for (const item of items) {
    if (!item.dueDate) continue;
    const days = daysLate(item.dueDate, today);
    if (!Number.isFinite(days) || days < 1) continue;
    late.push({ ...item, dueDate: item.dueDate, daysLate: days });
  }
  return late.sort((a, b) => b.daysLate - a.daysLate || a.title.localeCompare(b.title));
}

/**
 * The single worst offender in a set of open work.
 *
 * TWO CALL SITES, ONE FUNCTION: the masthead calls it over every overdue item
 * that has a player to name, and each lane calls it over its own items for the
 * stage's "Worst late" column. The masthead therefore cannot disagree with the
 * instrument underneath it.
 */
export function worstOffender(items: readonly OpenItem[], today: string): LateItem | null {
  return lateItems(items, today)[0] ?? null;
}

/* ── The stage: Due field ─────────────────────────────────────────────────── */

export interface DueMark {
  key: string;
  taskId: string;
  /** `YYYY-MM-DD`, guaranteed plottable. */
  date: string;
  /** Zero or negative before the due day; whole days late after it. */
  daysLate: number;
  overdue: boolean;
  /** The whole fact, for the tooltip and the screen reader. */
  label: string;
  /** False when the task's detail panel would be empty. */
  expandable: boolean;
}

export interface DueLane {
  id: string;
  name: string;
  /** The player's roster page; null on the team-wide lane, which has none. */
  href: string | null;
  isTeamLane: boolean;
  /** Every open item on the lane, dated or not: the true workload. Can exceed
   *  the number of marks, because an undated item draws nothing. */
  load: number;
  /** The lane's own worst currently-overdue item, or null when none is late. */
  worst: LateItem | null;
  /** The next date this lane owes something, when nothing on it is late yet. */
  nextDue: string | null;
  marks: DueMark[];
  /** The lane has dated work whose date falls outside the plottable window, so
   *  its strip is honestly empty rather than silently short. */
  offAxis: boolean;
}

export const rosterHref = (playerId: string) => `/golf/dashboard/roster/${playerId}`;

/** `YYYY-MM-DD` to `Sep 10`, assembled from the string's own parts. No Date
 *  parsing and no locale table, so the server string and the client's first
 *  paint are the same string. */
const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function shortDate(value: string): string {
  const [, m, d] = dayOf(value).split('-');
  const month = MONTH_ABBR[Number(m) - 1];
  return month && d ? `${month} ${Number(d)}` : value;
}

/** What a due date reads as, relative to today. */
export function dueLabel(value: string, today: string): string {
  const days = daysLate(value, today);
  if (days === 0) return 'Today';
  if (days === -1) return 'Tomorrow';
  return shortDate(value);
}

/** The one sentence a mark carries, for its tooltip and its screen reader
 *  text, so the fact lands even when no detail panel opens. */
export function markLabel(title: string, dueDate: string, today: string): string {
  const days = daysLate(dueDate, today);
  if (days >= 1) return `${title} — due ${shortDate(dueDate)}, ${days} ${days === 1 ? 'day' : 'days'} late`;
  if (days === 0) return `${title} — due today`;
  const ahead = -days;
  return `${title} — due ${shortDate(dueDate)}, in ${ahead} ${ahead === 1 ? 'day' : 'days'}`;
}

/**
 * Lanes for the stage, worst-first.
 *
 * Only players who actually owe open dated work get a lane: a twenty-player
 * roster where six carry outstanding work shows six lanes, not twenty empty
 * strips. There is no cap — this stage is the whole point of the page.
 */
export function dueLanes(
  tasks: readonly FairwayTask[],
  today: string,
  role: 'coach' | 'player',
): DueLane[] {
  const items = openItems(tasks, role);
  const expandable = new Map<string, boolean>();
  for (const task of tasks) expandable.set(task.id, canExpand(task, role));

  const byLane = new Map<string, OpenItem[]>();
  for (const item of items) {
    const list = byLane.get(item.laneId) ?? [];
    list.push(item);
    byLane.set(item.laneId, list);
  }

  const lanes: DueLane[] = [];
  for (const [laneId, laneItems] of byLane) {
    const dated = laneItems.filter((i) => i.dueDate);
    // A lane with nothing dated draws no strip at all; its work is fully
    // accounted for by the "No due date" ledger column and readout.
    if (dated.length === 0) continue;
    const plottable = dated.filter((i) => isPlottable(i.dueDate, today));
    const worst = worstOffender(laneItems, today);
    const upcoming = plottable
      .filter((i) => daysLate(i.dueDate as string, today) < 1)
      .map((i) => i.dueDate as string)
      .sort();
    const isTeamLane = laneId === TEAM_LANE;
    lanes.push({
      id: laneId,
      name: laneItems[0]?.laneName ?? TEAM_LANE_NAME,
      href: isTeamLane || !laneItems[0]?.playerId ? null : rosterHref(laneItems[0].playerId as string),
      isTeamLane,
      load: laneItems.length,
      worst,
      nextDue: upcoming[0] ?? null,
      offAxis: plottable.length === 0,
      marks: plottable
        .map((i) => {
          const date = i.dueDate as string;
          const days = daysLate(date, today);
          return {
            key: i.key,
            taskId: i.taskId,
            date,
            daysLate: days,
            overdue: days >= 1,
            label: markLabel(i.title, date, today),
            expandable: expandable.get(i.taskId) ?? false,
          };
        })
        .sort((a, b) => a.date.localeCompare(b.date)),
    });
  }

  // Worst day-late first, then the heavier load, then alphabetically — the
  // same ordering rule the coach home's attention ledger uses. The team-wide
  // lane is always terminal, whatever its numbers say.
  lanes.sort((a, b) => {
    if (a.isTeamLane !== b.isTeamLane) return a.isTeamLane ? 1 : -1;
    const late = (b.worst?.daysLate ?? 0) - (a.worst?.daysLate ?? 0);
    if (late !== 0) return late;
    if (b.load !== a.load) return b.load - a.load;
    return a.name.localeCompare(b.name);
  });
  return lanes;
}

/** The axis span for whatever lanes are on screen. Today is always inside it,
 *  which is what lets the interior Today rule mean something. */
export function dueDomain(lanes: readonly DueLane[], today: string): { start: string; end: string } {
  let start = dayOf(today);
  let end = dayOf(today);
  for (const lane of lanes) {
    for (const mark of lane.marks) {
      if (localMidnight(mark.date) < localMidnight(start)) start = mark.date;
      if (localMidnight(mark.date) > localMidnight(end)) end = mark.date;
    }
  }
  return { start, end };
}

/**
 * Days late that reach full bar height, kept between 3 and 21.
 *
 * Clamped at both ends for the same reason `scoreFieldCap` is: one 90-day
 * stale task must not flatten every other bar to a hairline, and a single
 * 1-day-late task must still read as a real bar rather than a speck.
 */
export function dueFieldCap(lanes: readonly DueLane[]): number {
  let max = 0;
  for (const lane of lanes) for (const mark of lane.marks) max = Math.max(max, mark.daysLate);
  return Math.min(21, Math.max(3, max));
}

/* ── The masthead verdict ─────────────────────────────────────────────────── */

export interface TasksVerdictInput {
  role: 'coach' | 'player';
  /** The live fetch failed. Outranks every other state: the page must not
   *  quote a number it is simultaneously reporting as unreliable. */
  hasError: boolean;
  totalTasks: number;
  openTasks: number;
  overdueTasks: number;
  completionRate: number;
  /** The single worst offender WITH a player to name, or null when every
   *  overdue task is team-wide. Never a borrowed name. */
  worst: LateItem | null;
}

/** The masthead sentence. Missing facts follow a strict precedence: a load
 *  error outranks an empty list, which outranks a zero count. */
export function buildTasksVerdict(input: TasksVerdictInput): VerdictPart[] {
  const { role, hasError, totalTasks, openTasks: open, overdueTasks, completionRate, worst } = input;
  const parts: VerdictPart[] = [];

  if (hasError) {
    parts.push({ text: "Couldn't load tasks." });
    return parts;
  }
  if (totalTasks === 0) {
    parts.push({ text: role === 'player' ? 'Nothing assigned yet.' : 'No tasks yet.' });
    return parts;
  }

  const tail = ` ${open} still open, ${completionRate}% of all tasks done.`;
  const playerTail = ` ${open} left, ${completionRate}% done.`;

  if (overdueTasks === 0) {
    parts.push({ text: 'Nothing overdue.' });
    parts.push({ text: role === 'player' ? playerTail : tail });
    return parts;
  }

  const plural = overdueTasks === 1 ? 'task' : 'tasks';

  if (role === 'player') {
    parts.push({ text: `${overdueTasks} of yours ${overdueTasks === 1 ? 'is' : 'are'} overdue.` });
    if (worst) {
      parts.push({
        text: ` Worst is ${worst.daysLate} ${worst.daysLate === 1 ? 'day' : 'days'} late on "${worst.title}."`,
      });
    }
    parts.push({ text: playerTail });
    return parts;
  }

  if (!worst) {
    // Overdue work exists but every piece of it is team-wide, so there is no
    // single assignee to flag. Say that, rather than naming somebody.
    parts.push({
      text: `${overdueTasks} ${plural} overdue, all team-wide with no single assignee to flag.`,
    });
    parts.push({ text: tail });
    return parts;
  }

  parts.push({ text: `${overdueTasks} ${plural} overdue. ` });
  parts.push({ text: worst.laneName, href: worst.playerId ? rosterHref(worst.playerId) : undefined });
  parts.push({
    text: ` is furthest behind, ${worst.daysLate} ${worst.daysLate === 1 ? 'day' : 'days'} late on "${worst.title}."`,
  });
  parts.push({ text: tail });
  return parts;
}

/* ── The ledger row ───────────────────────────────────────────────────────── */

export interface OverdueLedgerRow {
  task: FairwayTask;
  daysLate: number;
}

/** Ledger 1: the overdue tasks themselves, worst first. This is the one place
 *  the specific late TASKS are named; the stage only carries per-lane shape. */
export function overdueLedger(tasks: readonly FairwayTask[], today: string): OverdueLedgerRow[] {
  return tasks
    .filter((t) => isOverdue(t, today))
    .map((task) => ({ task, daysLate: daysLate(task.due_date as string, today) }))
    .sort((a, b) => b.daysLate - a.daysLate || a.task.title.localeCompare(b.task.title));
}

export interface CategoryRow {
  /** The filter value: a real category, or the UNCATEGORIZED sentinel. */
  value: string;
  label: string;
  count: number;
}

/** Ledger 2: open work by category. Recomputed on the OPEN subset, not on
 *  every task the team has ever had. The stage carries no category dimension
 *  at all; this is the only place it exists. */
export function openByCategory(tasks: readonly FairwayTask[]): CategoryRow[] {
  const counts = new Map<string, number>();
  for (const task of tasks) {
    if (!isOpen(task)) continue;
    const key = task.category ?? UNCATEGORIZED;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([value, count]) => ({
      value,
      label: value === UNCATEGORIZED ? 'Uncategorized' : value,
      count,
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/** Every distinct category on the team's tasks, for the table's filter menu. */
export function allCategories(tasks: readonly FairwayTask[]): { categories: string[]; hasUncategorized: boolean } {
  const set = new Set<string>();
  let hasUncategorized = false;
  for (const task of tasks) {
    if (task.category) set.add(task.category);
    else hasUncategorized = true;
  }
  return { categories: Array.from(set).sort((a, b) => a.localeCompare(b)), hasUncategorized };
}

/* ── The table ────────────────────────────────────────────────────────────── */

export interface TableFilter {
  status: 'all' | 'active' | 'completed';
  query: string;
  categories: string[];
}

/** Search, status and category narrow the TABLE only. The stage and the ledger
 *  always reflect the full dataset, so a typed search can never empty the
 *  instrument above them. */
export function filterTasks(tasks: readonly FairwayTask[], filter: TableFilter): FairwayTask[] {
  const q = filter.query.trim().toLowerCase();
  return tasks.filter((t) => {
    if (filter.status !== 'all' && t.status !== filter.status) return false;
    if (filter.categories.length > 0) {
      const matches = filter.categories.some((c) => (c === UNCATEGORIZED ? !t.category : t.category === c));
      if (!matches) return false;
    }
    if (q && !`${t.title} ${t.description ?? ''}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

export function assigneeProgress(task: FairwayTask): { completed: number; total: number } {
  const total = task.assignments.length;
  return { completed: task.assignments.filter((a) => a.status === 'completed').length, total };
}
