'use client';

/**
 * ============================================================================
 * Tasks · presentational parts (docs/design/fairway-facelift/screens/tasks.v3.md)
 * ----------------------------------------------------------------------------
 * The ledger columns, the shared task detail, the coach's manage menu and the
 * dense table. Everything that decides WHAT to show lives in
 * tasks-field-logic.ts; this file only decides how it looks.
 *
 * The table renders TWO branches, both always in the DOM, with CSS choosing:
 * a stacked list below `md` and the dense table at `md` and above. At 390px a
 * five-column table either scrolls sideways or truncates the column that
 * identifies the row, and both lose more than stacking does. Nothing here
 * reads a breakpoint at runtime.
 * ========================================================================== */

import { Fragment, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell } from 'lucide-react';

import { cn } from '@/lib/utils';
import {
  Button,
  IconButton,
  PopoverPanel,
  PressTarget,
  ModalShell,
  Form,
  FormField,
  Input,
  fairwayToast,
} from '@/components/fairway';
import { IconCheck, IconMoreVertical, IconBell, IconTrash, IconMessage } from '@/components/icons';
import { deleteTask, setTaskReminder, clearTaskReminder } from '@/app/golf/actions/tasks';

import {
  assigneeProgress,
  dayOf,
  dueLabel,
  isOverdue,
  type FairwayTask,
} from './tasks-field-logic';

const TH =
  'px-3 py-2 first:pl-0 last:pr-0 text-left font-fw-sans text-eyebrow font-medium uppercase tracking-[0.07em] text-text-tertiary';
const TD = 'px-3 py-2.5 first:pl-0 last:pr-0 align-middle font-fw-sans text-body-sm text-text-secondary';
const NUM = 'text-right font-fw-mono tabular-nums';

/* ── The ledger row ───────────────────────────────────────────────────────── */

export function LedgerColumn({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-3', className)}>
      <h2 className="font-fw-sans text-eyebrow uppercase tracking-[0.07em] text-text-tertiary">{title}</h2>
      <div className="flex flex-col">{children}</div>
    </div>
  );
}

export function LedgerEmpty({ children }: { children: React.ReactNode }) {
  return <p className="font-fw-sans text-body-sm text-text-tertiary">{children}</p>;
}

/**
 * One ledger row: a title that opens something, one fact about it, and an
 * optional trailing word. The title is a button, not a link: there is no
 * per-task route to navigate to, so "one row is one link" means one shared
 * detail affordance.
 */
export function LedgerRow({
  title,
  fact,
  factTone = 'quiet',
  aside,
  onOpen,
  expanded = false,
  detailId,
  children,
}: {
  title: string;
  fact?: string;
  factTone?: 'quiet' | 'urgent';
  aside?: string;
  onOpen?: () => void;
  expanded?: boolean;
  detailId?: string;
  children?: React.ReactNode;
}) {
  const factNode = fact ? (
    <span
      className={cn(
        'shrink-0 font-fw-mono text-caption tabular-nums',
        factTone === 'urgent' ? 'font-medium text-fw-warning-ink' : 'text-text-tertiary',
      )}
    >
      {fact}
    </span>
  ) : null;

  return (
    <div className="border-b border-border-subtle last:border-b-0">
      <div className="flex items-baseline justify-between gap-3 py-2">
        {onOpen ? (
          <PressTarget
            onClick={onOpen}
            aria-expanded={expanded}
            aria-controls={expanded ? detailId : undefined}
            className="min-w-0 flex-1 truncate text-left font-fw-sans text-body-sm font-medium text-text-primary hover:text-accent-700"
          >
            {title}
          </PressTarget>
        ) : (
          <span className="min-w-0 flex-1 truncate font-fw-sans text-body-sm font-medium text-text-primary">
            {title}
          </span>
        )}
        <div className="flex shrink-0 items-baseline gap-2.5">
          {aside ? <span className="font-fw-sans text-caption text-text-tertiary">{aside}</span> : null}
          {factNode}
        </div>
      </div>
      {expanded && children ? (
        <div id={detailId} className="pb-3">
          {children}
        </div>
      ) : null}
    </div>
  );
}

/** A category row: the name, its open count, and a link that narrows the table. */
export function CategoryLedgerRow({
  label,
  count,
  selected,
  onSelect,
}: {
  label: string;
  count: number;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <div className="border-b border-border-subtle last:border-b-0">
      <PressTarget
        onClick={onSelect}
        aria-pressed={selected}
        className={cn(
          'flex w-full items-baseline justify-between gap-3 py-2 text-left',
          selected ? 'text-accent-700' : 'text-text-primary',
        )}
      >
        <span className="min-w-0 flex-1 truncate font-fw-sans text-body-sm font-medium hover:text-accent-700">
          {label}
        </span>
        <span className="shrink-0 font-fw-mono text-caption tabular-nums text-text-tertiary">{count}</span>
      </PressTarget>
    </div>
  );
}

/* ── The shared task detail ───────────────────────────────────────────────── */

/** Whether the reminder has passed, relative to the day the page is reading.
 *  Day granularity only: nothing here reads a clock, so there is no honest
 *  "three hours away" to tone for. */
function reminderPast(reminderAt: string, today: string): boolean {
  return dayOf(reminderAt) < dayOf(today);
}

/** The reminder's own stored time. An explicit locale keeps the string
 *  deterministic; the zone still resolves to the viewer's, which is why the
 *  node suppresses hydration warnings the way the shipped row does. */
function reminderTime(reminderAt: string): string {
  const d = new Date(reminderAt);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

/**
 * The ONE detail body. Three call sites render it — a stage mark, a ledger row
 * and a table row — so a task reads identically wherever it is opened.
 */
export function TaskDetail({
  task,
  role,
  today,
  actions,
}: {
  task: FairwayTask;
  role: 'coach' | 'player';
  today: string;
  /** Rendered at the foot. The phone list passes the manage menu here, since
   *  the table's own Actions column is hidden at that width. */
  actions?: React.ReactNode;
}) {
  const router = useRouter();
  const hasAssignments = task.assignments.length > 0;

  return (
    <div className="flex flex-col gap-4 rounded-fw-md bg-surface-sunken p-3 md:p-4">
      {task.reminder_at ? (
        <span
          className={cn(
            'inline-flex w-fit items-center gap-1.5 font-fw-sans text-caption',
            reminderPast(task.reminder_at, today) ? 'text-text-tertiary' : 'text-text-secondary',
          )}
          suppressHydrationWarning
        >
          <Bell className="h-3.5 w-3.5 flex-shrink-0" aria-hidden />
          {`Reminder · ${dueLabel(dayOf(task.reminder_at), today)} ${reminderTime(task.reminder_at)}`}
        </span>
      ) : null}

      {task.description ? (
        <p className="font-fw-sans text-body-sm text-text-secondary">{task.description}</p>
      ) : null}

      {role === 'coach' && hasAssignments ? (
        <div>
          <p className="mb-2 font-fw-sans text-eyebrow font-semibold uppercase tracking-[0.12em] text-text-tertiary">
            Assignees
          </p>
          <div className="flex flex-col">
            {task.assignments.map((assignment) => (
              <div
                key={assignment.id}
                className="flex items-center justify-between gap-3 border-b border-border-subtle py-2 last:border-b-0"
              >
                <span className="min-w-0 flex-1 truncate font-fw-sans text-body-sm text-text-secondary">
                  {`${assignment.player.first_name} ${assignment.player.last_name}`.trim() || 'Unnamed player'}
                </span>
                <div className="flex flex-shrink-0 items-center gap-2">
                  {assignment.status === 'completed' ? (
                    <span className="inline-flex items-center gap-1.5 font-fw-sans text-caption font-medium text-accent-700">
                      <IconCheck size={15} />
                      Completed
                    </span>
                  ) : (
                    <span className="font-fw-sans text-caption font-medium text-text-tertiary">Pending</span>
                  )}
                  {assignment.player.id ? (
                    <IconButton
                      variant="ghost"
                      size="sm"
                      aria-label={`Message ${`${assignment.player.first_name} ${assignment.player.last_name}`.trim() || 'this player'}`}
                      onClick={() => router.push(`/golf/dashboard/messages?player=${assignment.player.id}`)}
                    >
                      <IconMessage size={15} />
                    </IconButton>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/* ── Coach manage: reminder + delete (the unchanged server actions) ───────── */

export function TaskManageMenu({
  task,
  onManaged,
}: {
  task: FairwayTask;
  onManaged?: () => void | Promise<void>;
}) {
  const [pendingDelete, setPendingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [reminderValue, setReminderValue] = useState('');
  const [savingReminder, setSavingReminder] = useState(false);
  const [clearingReminder, setClearingReminder] = useState(false);

  const openReminderModal = () => {
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

  return (
    <>
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
        {task.reminder_at ? (
          <PopoverPanel.Item onClick={() => void handleClearReminder()} disabled={clearingReminder}>
            <IconBell size={18} className="text-text-tertiary" />
            Clear reminder
          </PopoverPanel.Item>
        ) : null}
        <PopoverPanel.Separator />
        <PopoverPanel.Item
          onClick={() => setPendingDelete(true)}
          className="text-fw-danger-ink hover:bg-fw-danger-bg hover:text-fw-danger-ink"
        >
          <IconTrash size={18} className="text-fw-danger-ink" />
          Delete task
        </PopoverPanel.Item>
      </PopoverPanel>

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
            <Button type="button" variant="secondary" onClick={() => setReminderOpen(false)} disabled={savingReminder}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" busy={savingReminder}>
              {task.reminder_at ? 'Update reminder' : 'Set reminder'}
            </Button>
          </ModalShell.Footer>
        </Form>
      </ModalShell>

      {/* DESTRUCTIVE — explicit confirm only. */}
      <ModalShell
        open={pendingDelete}
        onOpenChange={(next) => {
          if (!next && !deleting) setPendingDelete(false);
        }}
        size="sm"
        title="Delete task?"
        description={
          <>
            Delete <span className="font-medium text-text-primary">{task.title}</span>? This also removes every
            player&apos;s assignment for it and can&apos;t be undone.
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
    </>
  );
}

/** Convert a stored ISO timestamp to the `datetime-local` input value in the
 *  viewer's local time, so the picker pre-fills with the existing reminder. */
function toDateTimeLocal(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function CompleteButton({
  task,
  busy,
  onComplete,
}: {
  task: FairwayTask;
  busy: boolean;
  onComplete: (taskId: string) => void;
}) {
  return (
    <Button
      variant="secondary"
      size="sm"
      busy={busy}
      disabled={busy}
      onClick={() => onComplete(task.id)}
      leftIcon={<IconCheck size={15} />}
    >
      Mark complete
    </Button>
  );
}

/* ── The table ────────────────────────────────────────────────────────────── */

export interface TasksTableProps {
  rows: FairwayTask[];
  role: 'coach' | 'player';
  today: string;
  canManage: boolean;
  /** Task ids whose detail panel has something in it. */
  expandable: (task: FairwayTask) => boolean;
  openTaskId: string | null;
  onToggle: (taskId: string) => void;
  onManaged?: () => void | Promise<void>;
  /** Player role only. */
  completingId?: string | null;
  onComplete?: (taskId: string) => void;
  isCompleted: (task: FairwayTask) => boolean;
}

export function TasksTable({
  rows,
  role,
  today,
  canManage,
  expandable,
  openTaskId,
  onToggle,
  onManaged,
  completingId = null,
  onComplete,
  isCompleted,
}: TasksTableProps) {
  return (
    <>
      {/* Phone: the same rows, stacked. Both branches stay in the DOM with CSS
          choosing between them, so nothing reads a breakpoint at runtime and
          the server and client markup agree. */}
      <ul data-slot="tasks-list-compact" className="flex flex-col md:hidden">
        {rows.map((task) => {
          const open = openTaskId === task.id;
          const canOpen = expandable(task);
          const { completed, total } = assigneeProgress(task);
          const overdue = isOverdue(task, today);
          const done = isCompleted(task);
          return (
            <li key={task.id} className="border-b border-border-subtle last:border-b-0">
              <div className="flex items-start gap-3 py-3">
                <PressTarget
                  disabled={!canOpen}
                  onClick={canOpen ? () => onToggle(task.id) : undefined}
                  aria-expanded={canOpen ? open : undefined}
                  aria-controls={canOpen && open ? `task-list-detail-${task.id}` : undefined}
                  className="flex min-w-0 flex-1 flex-col gap-1 text-left"
                >
                  <span
                    className={cn(
                      'font-fw-sans text-body-sm font-medium leading-tight',
                      done ? 'text-text-tertiary line-through' : 'text-text-primary',
                    )}
                  >
                    {task.title}
                  </span>
                  <span className="font-fw-mono text-caption tabular-nums text-text-tertiary">
                    {task.due_date ? (
                      <span className={cn(overdue && 'font-medium text-fw-warning-ink')}>
                        {dueLabel(task.due_date, today)}
                      </span>
                    ) : (
                      'No due date'
                    )}
                    {total > 0 ? ` · ${completed}/${total}` : ''}
                    {task.category ? ` · ${task.category}` : ''}
                  </span>
                </PressTarget>
                {role === 'player' && onComplete && !done ? (
                  <CompleteButton task={task} busy={completingId === task.id} onComplete={onComplete} />
                ) : null}
              </div>
              {open && canOpen ? (
                <div id={`task-list-detail-${task.id}`} className="pb-3">
                  <TaskDetail
                    task={task}
                    role={role}
                    today={today}
                    // The table's Actions column is hidden at this width, so a
                    // coach's manage menu folds in here instead of vanishing.
                    actions={canManage ? <TaskManageMenu task={task} onManaged={onManaged} /> : undefined}
                  />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      <div className="hidden md:block">
        <table data-slot="tasks-ledger" className="w-full border-collapse">
          <caption className="sr-only">Tasks</caption>
          <thead>
            <tr className="border-b border-border-strong">
              <th scope="col" className={TH}>
                Task
              </th>
              <th scope="col" className={cn(TH, NUM, 'hidden md:table-cell')}>
                Assignees
              </th>
              <th scope="col" className={cn(TH, NUM)}>
                Due
              </th>
              <th scope="col" className={cn(TH, 'hidden md:table-cell')}>
                Category
              </th>
              <th scope="col" className={cn(TH, 'hidden w-px md:table-cell')}>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((task) => {
              const open = openTaskId === task.id;
              const canOpen = expandable(task);
              const { completed, total } = assigneeProgress(task);
              const overdue = isOverdue(task, today);
              const done = isCompleted(task);
              return (
                <Fragment key={task.id}>
                <tr
                  onClick={canOpen ? () => onToggle(task.id) : undefined}
                  className={cn(
                    'border-b border-border-subtle transition-colors duration-150',
                    canOpen && 'cursor-pointer hover:bg-surface-hover',
                    open && 'bg-accent-50',
                  )}
                >
                  <td className={cn(TD, 'max-w-[22rem]')}>
                    <PressTarget
                      disabled={!canOpen}
                      aria-expanded={canOpen ? open : undefined}
                      aria-controls={canOpen && open ? `task-row-detail-${task.id}` : undefined}
                      onClick={
                        canOpen
                          ? (e: React.MouseEvent) => {
                              e.stopPropagation();
                              onToggle(task.id);
                            }
                          : undefined
                      }
                      className={cn(
                        'block w-full truncate text-left font-fw-sans text-body-sm font-medium',
                        done ? 'text-text-tertiary line-through' : 'text-text-primary',
                        canOpen && 'hover:text-accent-700',
                      )}
                    >
                      {task.title}
                    </PressTarget>
                  </td>
                  <td className={cn(TD, NUM, 'hidden md:table-cell')}>
                    {/* Never a fake 0/0: a team-wide task has no assignment
                        rows, so the cell stays empty rather than claiming one. */}
                    {total > 0 ? `${completed}/${total}` : <span className="text-text-tertiary">–</span>}
                  </td>
                  <td className={cn(TD, NUM, overdue && 'font-medium text-fw-warning-ink')}>
                    {task.due_date ? dueLabel(task.due_date, today) : <span className="text-text-tertiary">–</span>}
                  </td>
                  <td className={cn(TD, 'hidden max-w-[10rem] truncate md:table-cell')}>
                    {task.category ?? <span className="text-text-tertiary">–</span>}
                  </td>
                  <td
                    className={cn(TD, 'hidden w-px whitespace-nowrap text-right md:table-cell')}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {canManage ? (
                      <TaskManageMenu task={task} onManaged={onManaged} />
                    ) : role === 'player' && onComplete && !done ? (
                      <CompleteButton task={task} busy={completingId === task.id} onComplete={onComplete} />
                    ) : null}
                  </td>
                </tr>
                {open && canOpen ? (
                  <tr className="border-b border-border-subtle bg-accent-50">
                    <td colSpan={5} className="px-0 pb-3 pt-0" id={`task-row-detail-${task.id}`}>
                      <TaskDetail task={task} role={role} today={today} />
                    </td>
                  </tr>
                ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
