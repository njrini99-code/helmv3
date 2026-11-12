import {
  AlarmClock,
  BellRing,
  CalendarClock,
  CalendarOff,
  CalendarPlus,
  CalendarRange,
  CalendarX,
  CheckCheck,
  ClipboardCheck,
  ClipboardList,
  Dumbbell,
  EyeOff,
  FileText,
  Flag,
  GraduationCap,
  ListChecks,
  Lock,
  Megaphone,
  MessageCircle,
  NotebookPen,
  Repeat,
  Route,
  StickyNote,
  Target,
  Trophy,
  UserCheck,
  UserPlus,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { ActionProposal } from '@/lib/coachhelm/v3/chat/action-types';
import { countedFact, namesIn, plural, tellsSomebody, valueOf } from './facts';
import { reachOf } from './truth';
import type { Reach } from './types';

/**
 * Each capability's words, as data (CAPABILITIES.md, section A). The shell's head, button, badge and lines and the body's
 * reach come from this one table, so they cannot drift apart.
 */
export interface CardCopy {
  /** The head: what this will become. */
  head: string;
  icon: LucideIcon;
  /** The named primary, its word while the request is out, and the badge once it is in. */
  primary: string;
  busy: string;
  badge: string;
  /** How far it travels, and the mark's own word for it. */
  reach: Reach;
  mark: string;
  /** How many people hear about it; 0 when nobody is told. */
  told: number;
  /** The sentence beside the ring. */
  hold: (seconds: number) => string;
  /** After Undo. */
  undone: string;
  /** What a failure leaves behind, when the receipt does not say. */
  untouched: string;
  /** Where Open goes, in the app's words. Null: the receipt has no link yet (CAPABILITIES E-12). */
  home: string | null;
  /** Writes on the press: no hold, no Undo. */
  immediate: boolean;
  /** The quiet key beside the primary: "Not now", or the task's own word where setting it aside needs saying ("Keep the event"). */
  dismiss: string;
}

interface Row {
  head: string;
  icon: LucideIcon;
  primary: string | ((p: ActionProposal, told: number) => string);
  busy: string;
  badge: string;
  reach: Reach | ((p: ActionProposal) => Reach);
  mark?: string;
  /** How many people are told, from the plan. */
  told?: (p: ActionProposal) => number;
  /** The noun in the hold line: "saved" or "sent". */
  verb?: 'saved' | 'sent' | 'posted' | 'published';
  undone?: string;
  home: string | null;
  immediate?: boolean;
  dismiss?: string;
}

const players = (p: ActionProposal): number => p.affects.filter((a) => a.kind === 'player').length;
const firstNumber = (s: string | undefined): number => Number(s?.match(/\d+/)?.[0] ?? 0);
/** The number of people a plan's own notification line names: "6 players get…", "…to 6 players". */
const toldInLine = (p: ActionProposal): number => (tellsSomebody(p) ? firstNumber(p.notifications.find((n) => /\d/.test(n))) : 0);
const sendsWhenTold = (p: ActionProposal): Reach => (tellsSomebody(p) ? 'sends' : 'visible');

const ROWS: Record<string, Row> = {
  create_event: { head: 'New event', icon: CalendarPlus, primary: 'Add to calendar', busy: 'Adding…', badge: 'Added', reach: sendsWhenTold, told: toldInLine, undone: 'Undone. The event was not added, and nobody was told.', home: 'Calendar' },
  create_recurring_practice: { head: 'New practices', icon: Repeat, primary: (p) => `Add ${plural(firstNumber(valueOf(p, 'Occurrences') ?? '') || 1, 'practice')}`, busy: 'Adding…', badge: 'Added', reach: sendsWhenTold, told: (p) => (tellsSomebody(p) ? players(p) || firstNumber(valueOf(p, 'Invites') ?? '') : 0), undone: 'Undone. No practices were added, and nobody was told.', home: 'Calendar' },
  add_blocked_time: { head: 'Block your time', icon: CalendarOff, primary: 'Block time', busy: 'Blocking…', badge: 'Blocked', reach: 'private', mark: 'Only you', home: 'Calendar' },
  add_team_break: { head: 'New break', icon: CalendarRange, primary: 'Add break', busy: 'Adding…', badge: 'Added', reach: 'private', mark: 'Nobody is told', home: null },
  save_team_term: { head: 'School term', icon: GraduationCap, primary: 'Save term', busy: 'Saving…', badge: 'Saved', reach: 'private', mark: 'Nobody is told', home: null },
  create_trip: { head: 'New trip', icon: Route, primary: 'Add the trip', busy: 'Adding…', badge: 'Added', reach: 'visible', undone: 'Undone. The trip was not added.', home: 'Travel' },
  create_qualifier: { head: 'New qualifier', icon: Trophy, primary: 'Set qualifier', busy: 'Setting…', badge: 'Set', reach: 'sends', told: (p) => toldInLine(p) || namesIn(valueOf(p, 'Players')).length, undone: 'Undone. The qualifier was not set, and nobody was told.', home: 'Qualifiers' },
  create_goal: { head: 'New goal', icon: Target, primary: 'Set goal', busy: 'Setting…', badge: 'Set', reach: 'sends', told: () => 1, undone: 'Undone. The goal was not set, and nobody was told.', home: null },
  create_focus_area: { head: 'New focus', icon: Flag, primary: 'Assign focus', busy: 'Assigning…', badge: 'Proposed', reach: 'sends', told: () => 1, undone: 'Undone. The focus area was not created, and nobody was told.', home: 'Focus areas' },
  create_task: { head: 'New task', icon: ClipboardCheck, primary: 'Assign task', busy: 'Assigning…', badge: 'Assigned', reach: 'sends', told: players, undone: 'Undone. The task was not created, and nobody was told.', home: 'Tasks' },
  create_team_announcement: { head: 'Team announcement', icon: Megaphone, primary: (_p, told) => (told ? `Post to ${plural(told, 'player')}` : 'Post'), busy: 'Posting…', badge: 'Posted', reach: 'sends', told: players, verb: 'posted', undone: 'Undone. Nothing was posted.', home: 'Announcements' },
  add_round_note: { head: 'Note on a round', icon: StickyNote, primary: 'Add note', busy: 'Adding…', badge: 'Added', reach: 'visible', undone: 'Undone. The round’s notes are as they were.', home: null },
  set_availability_note: { head: 'Availability note', icon: NotebookPen, primary: 'Save note', busy: 'Saving…', badge: 'Saved', reach: 'private', mark: 'Coaches only', home: null },
  create_recruit: { head: 'New recruit', icon: UserPlus, primary: 'Add recruit', busy: 'Adding…', badge: 'Added', reach: 'private', mark: 'Coaches only', home: 'Recruiting' },
  create_drill: { head: 'New drill', icon: Dumbbell, primary: 'Add to drill bank', busy: 'Adding…', badge: 'Added', reach: 'private', mark: 'Nobody is told', home: null },
  publish_practice_plan: { head: 'Publish the plan', icon: ClipboardList, primary: (p) => p.action || 'Publish', busy: 'Publishing…', badge: 'Published', reach: 'sends', told: (p) => firstNumber(p.action) || toldInLine(p), verb: 'published', undone: 'Undone. The plan is not published, and nobody was told.', home: 'the plan' },
  publish_artifact: { head: 'Publish to Documents', icon: FileText, primary: (p) => p.action || 'Publish', busy: 'Publishing…', badge: 'Published', reach: 'visible', verb: 'published', undone: 'Undone. Nothing was published.', home: null },
  send_message: { head: 'Message', icon: MessageCircle, primary: 'Send', busy: 'Sending…', badge: 'Sent', reach: 'sends', told: (p) => (p.visual?.kind === 'msg' ? p.visual.count : firstNumber(p.action)), verb: 'sent', undone: 'Undone. Nothing was sent.', home: 'the thread' },
  set_lineup: { head: 'Tournament lineup', icon: Users, primary: 'Set lineup', busy: 'Setting…', badge: 'Set', reach: 'private', mark: 'Nobody is told', undone: 'Undone. The earlier lineup is as it was.', home: 'the tournament' },
  lock_lineup: { head: 'Lock the lineup', icon: Lock, primary: 'Lock the lineup', busy: 'Locking…', badge: 'Locked', reach: 'private', mark: 'Nobody is told', home: null, immediate: true },
  send_event_reminder: { head: 'Event reminder', icon: BellRing, primary: 'Send reminder', busy: 'Sending…', badge: 'Sent', reach: 'sends', told: (p) => countedFact(p, 'To')?.count ?? players(p), verb: 'sent', undone: 'Undone. Nothing was sent.', home: 'the event' },
  // CONTEXT's tasks on things that already exist (tasks/*.ts). Each card carries its own reach, words and way back.
  update_event: { head: 'Change an event', icon: CalendarClock, primary: 'Change the event', busy: 'Changing…', badge: 'Changed', reach: sendsWhenTold, told: toldInLine, undone: 'Undone. The event is as it was, and nobody was told.', home: 'Calendar' },
  cancel_event: { head: 'Cancel an event', icon: CalendarX, primary: 'Cancel the event', busy: 'Cancelling…', badge: 'Cancelled', reach: sendsWhenTold, told: toldInLine, undone: 'Undone. The event is still on, and nobody was told.', home: 'Calendar', dismiss: 'Keep the event' },
  set_focus_area_status: { head: 'Focus area', icon: Flag, primary: (p) => (/completed/i.test(valueOf(p, 'After') ?? '') ? 'Mark completed' : 'Reopen'), busy: 'Saving…', badge: 'Saved', reach: 'visible', undone: 'Undone. The focus area is as it was.', home: null },
  set_goal_state: { head: 'Goal', icon: Target, primary: (p) => `${p.summary.split(' ')[0] ?? 'Update'} the goal`, busy: 'Saving…', badge: 'Saved', reach: 'visible', undone: 'Undone. The goal is as it was.', home: null },
  mark_signal_handled: { head: 'Signal', icon: CheckCheck, primary: 'Mark handled', busy: 'Saving…', badge: 'Handled', reach: 'visible', undone: 'Undone. The signal is still open.', home: 'CoachHelm' },
  dismiss_signal: { head: 'Signal', icon: EyeOff, primary: 'Dismiss the signal', busy: 'Dismissing…', badge: 'Dismissed', reach: 'visible', undone: 'Undone. The signal is still on your board.', home: null, dismiss: 'Keep it' },
  set_qualifier_coach_pick: { head: 'Coach’s pick', icon: UserCheck, primary: 'Make the pick', busy: 'Saving…', badge: 'Picked', reach: 'private', mark: 'Coaches only', undone: 'Undone. No pick was made.', home: 'the selection' },
  set_task_reminder: { head: 'Task reminder', icon: AlarmClock, primary: 'Set the reminder', busy: 'Setting…', badge: 'Set', reach: 'sends', told: (p) => countedFact(p, 'To')?.count ?? players(p), undone: 'Undone. No reminder was set.', home: 'the task' },
  log_focus_progress: { head: 'Focus area progress', icon: Flag, primary: 'Log progress', busy: 'Saving…', badge: 'Logged', reach: 'visible', undone: 'Undone. The focus area is as it was.', home: null },
  record_focus_outcome: { head: 'Focus area outcome', icon: Flag, primary: 'Record the outcome', busy: 'Saving…', badge: 'Recorded', reach: 'visible', undone: 'Undone. No outcome was recorded.', home: null },
  record_attendance: { head: 'Attendance', icon: ListChecks, primary: 'Save attendance', busy: 'Saving…', badge: 'Saved', reach: 'private', mark: 'Nothing is sent', undone: 'Undone. No marks were saved.', home: 'the event' },
};

const MARK: Record<Reach, string> = { sends: 'Sends', visible: 'Players can see it', private: 'Only you' };
const PAST: Record<NonNullable<Row['verb']>, { not: string; soon: string }> = {
  saved: { not: 'Not saved yet', soon: 'Saves' },
  sent: { not: 'Not sent yet', soon: 'Sends' },
  posted: { not: 'Not posted yet', soon: 'Posts' },
  published: { not: 'Not published yet', soon: 'Publishes' },
};

/** The tools this table knows: every `kind: 'task'` tool in the registry (a test holds the two lists together). */
export const CARD_TOOLS: readonly string[] = Object.keys(ROWS);

export function cardCopy(tool: string, proposal: ActionProposal): CardCopy {
  const row = ROWS[tool];
  if (!row) {
    // A task this table has not met: the plan's own words, and the cautious reading of its reach.
    const truth = reachOf(proposal, tellsSomebody(proposal) ? 'sends' : 'private');
    const told = truth.reach === 'sends' ? (proposal.recipients?.length ?? toldInLine(proposal)) : 0;
    return { head: proposal.action, icon: ClipboardCheck, primary: 'Confirm', busy: 'Working…', badge: 'Done', reach: truth.reach, mark: truth.mark ?? (truth.reach === 'sends' ? 'Sends' : truth.reach === 'visible' ? MARK.visible : 'Nobody is told'), told, hold: holdLine('saved', told), undone: 'Undone. Nothing was saved, and nobody was told.', untouched: 'Nothing was saved.', home: null, immediate: proposal.undo?.window === false, dismiss: 'Not now' };
  }
  // The plan's own word on who is sent something and who can see it outranks the catalogue's reading of an older card.
  const read = typeof row.reach === 'function' ? row.reach(proposal) : row.reach;
  const truth = reachOf(proposal, read);
  const reach = truth.reach;
  const told = reach === 'sends' ? (proposal.recipients?.length ?? row.told?.(proposal) ?? 0) : 0;
  const verb = row.verb ?? 'saved';
  return {
    head: row.head,
    icon: row.icon,
    primary: typeof row.primary === 'function' ? row.primary(proposal, told) : row.primary,
    busy: row.busy,
    badge: row.badge,
    reach,
    mark: truth.mark ?? (reach === 'private' ? (row.mark ?? MARK.private) : MARK[reach]),
    told,
    hold: holdLine(verb, told),
    undone: row.undone ?? 'Undone. Nothing was saved, and nobody was told.',
    untouched: verb === 'saved' ? 'Nothing was saved.' : `Nothing was ${verb}.`,
    home: row.home,
    immediate: proposal.undo ? !proposal.undo.window : !!row.immediate,
    dismiss: row.dismiss ?? 'Not now',
  };
}

/** "Not saved yet. Saves in 8 seconds, then 6 players are told." The seconds are the server's time left. */
function holdLine(verb: NonNullable<Row['verb']>, told: number): (seconds: number) => string {
  const words = PAST[verb];
  return (seconds) => {
    const when = `${words.soon} in ${plural(Math.max(0, Math.ceil(seconds)), 'second')}`;
    if (verb !== 'saved') return `${words.not}. ${when}${told ? ` to ${plural(told, 'person', 'people')}` : ''}.`;
    return `${words.not}. ${when}${told ? `, then ${plural(told, 'person is', 'people are')} told` : ''}.`;
  };
}
