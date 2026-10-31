import {
  byLabel,
  clockLabel,
  composeChangeCopy,
  markIsLive,
  markKind,
  movedAwayAria,
  movedToPhrase,
  parseStoredChange,
  readPartialChange,
  slotOf,
  snapshotOf,
  whenPhrase,
  withinRowHorizon,
  type ChangeCopy,
  type ChangePanelRow,
  type MarkBadgeWord,
  type MarkKind,
  type StoredChange,
} from '@/lib/calendar/change-mark';

/**
 * A change mark as the Calendar draws it (P-14): the stored mark (`golf_events.metadata.change`, written by the database
 * trigger) read against the event as it is now, with every string already written by `composeChangeCopy`, so the rows, the
 * panel, the live region and the Message players draft all say the same words. Pure: the loader builds it on the server,
 * the preview builds it from fixtures.
 */
export interface ChCalChange {
  /** The edit session's id: the cookie and the live region key on it. */
  id: string;
  kind: MarkKind;
  badge: MarkBadgeWord;
  /** When the last edit landed. */
  at: string;
  /** The reader made the change. */
  byMe: boolean;
  /** The mark is there but not a shape this version reads: a bare badge, "Changed", no struck values. */
  partial: boolean;
  /** The old values, for the struck chunks. */
  was: ChangeCopy['was'];
  /** Rows carry the mark only for events that start within the next 14 days; further out only the detail says what changed. */
  rowMark: boolean;
  /** How many occurrences of a series were edited together (1 for a single event). */
  count: number;
  /** The cancellation's reason, when one was given. */
  reason: string | null;
  /** Where the event started before the change, for the old-slot line on the week grid; null when it started all day. */
  fromSlot: { date: string; start: number | null; label: string | null };
  /** "Coach Reyes", "you", or null: who made it, for the peek. */
  byLabel: string | null;
  /** The sentence for what changed; the Message players draft opens with it. */
  title: string;
  body: string;
  panelLine1: string;
  panelRows: ChangePanelRow[];
  panelLine2: string;
  liveText: string;
}

/** A row on the day an event left: "~~3:00~~ Practice · Moved to Thu at 4:00 PM", linking to the event on its new day. */
export interface ChMovedAway {
  id: string;
  title: string;
  type: string;
  changeId: string;
  fromDate: string;
  fromStart: number | null;
  /** The old start as the time column writes it ("3:00 PM"), null for an all-day event. */
  fromLabel: string | null;
  toDate: string;
  sub: string;
  aria: string;
}

/** The columns of an event row the marks are read from. */
export interface ChangeRow {
  id: string;
  start_time: string;
  end_time: string | null;
  all_day: boolean | null;
  location: string | null;
  title: string;
  event_type: string;
  status: string | null;
  cancellation_reason?: string | null;
  /** `metadata->change`, unparsed. */
  change: unknown;
}

const hasContent = (raw: unknown): boolean => raw !== null && raw !== undefined && !(typeof raw === 'object' && !Array.isArray(raw) && Object.keys(raw as object).length === 0);

/**
 * The live marks among a window's event rows, by event id, and the ids of rows whose mark could not be read (reported
 * once by the caller). Class rows never carry a mark. Rows that share a session id (a series edited together) share their
 * copy: "Practice: 8 dates moved to 4:00 PM (was 3:00 PM)".
 */
export function buildChangeMarks(
  rows: ChangeRow[],
  ctx: {
    timeZone: string;
    nowMs: number;
    /** The viewer's `golf_coaches.id`, for "By you". */
    coachId: string | null;
    /** The dates the page has loaded: a moved-away row is made only for an old day inside it. */
    range?: { from: string; to: string };
  },
): { marks: Map<string, ChCalChange>; unreadable: string[]; movedAway: ChMovedAway[] } {
  const nowIso = new Date(ctx.nowMs).toISOString();
  const marks = new Map<string, ChCalChange>();
  const unreadable: string[] = [];
  const movedAway: ChMovedAway[] = [];
  const parsed: Array<{ row: ChangeRow; change: StoredChange }> = [];

  for (const row of rows) {
    if (row.event_type === 'class' || !hasContent(row.change)) continue;
    const ev = { startIso: row.start_time, endIso: row.end_time, allDay: row.all_day === true };
    const change = parseStoredChange(row.change);
    if (!change) {
      unreadable.push(row.id);
      const partial = readPartialChange(row.change);
      if (!partial || !markIsLive(partial, ev, ctx.timeZone, ctx.nowMs)) continue;
      marks.set(row.id, {
        id: partial.id,
        kind: 'several',
        badge: 'Changed',
        at: partial.at,
        byMe: false,
        partial: true,
        was: {},
        rowMark: withinRowHorizon(row.start_time, ctx.nowMs),
        count: 1,
        reason: null,
        fromSlot: { date: '', start: null, label: null },
        byLabel: null,
        title: 'Changed',
        body: '',
        panelLine1: 'Changed',
        panelRows: [],
        panelLine2: `Changed ${whenPhrase(partial.at, nowIso, ctx.timeZone)}`,
        liveText: '',
      });
      continue;
    }
    if (!markIsLive(change, ev, ctx.timeZone, ctx.nowMs)) continue;
    parsed.push({ row, change });
  }

  // A series edited together shares one session id: its occurrences are told as one change.
  const bySession = new Map<string, Array<{ row: ChangeRow; change: StoredChange }>>();
  for (const p of parsed) bySession.set(p.change.id, [...(bySession.get(p.change.id) ?? []), p]);

  for (const group of bySession.values()) {
    const first = group[0]!;
    const copy = composeChangeCopy({
      items: group.map(({ row, change }) => ({ before: change.from, after: snapshotOf(row) })),
      timeZone: ctx.timeZone,
      nowIso,
      byNames: first.change.by_names,
      byMe: !!ctx.coachId && first.change.by === ctx.coachId,
      reason: first.row.cancellation_reason ?? null,
      at: first.change.at,
    });
    for (const { row, change } of group) {
      const fromSlot = slotOf(change.from, ctx.timeZone);
      const own = group.length > 1 ? copy : composeChangeCopy({ items: [{ before: change.from, after: snapshotOf(row) }], timeZone: ctx.timeZone, nowIso, byNames: change.by_names, byMe: !!ctx.coachId && change.by === ctx.coachId, reason: row.cancellation_reason ?? null, at: change.at });
      marks.set(row.id, {
        id: change.id,
        kind: group.length > 1 ? copy.kind : markKind(change, snapshotOf(row), ctx.timeZone),
        badge: own.badge,
        at: change.at,
        byMe: !!ctx.coachId && change.by === ctx.coachId,
        partial: false,
        was: group.length > 1 ? {} : own.was,
        rowMark: withinRowHorizon(row.start_time, ctx.nowMs),
        count: group.length,
        reason: row.cancellation_reason?.trim() || null,
        fromSlot: { date: fromSlot.date, start: fromSlot.hour, label: clockLabel(change.from, ctx.timeZone) },
        byLabel: byLabel(change.by_names, !!ctx.coachId && change.by === ctx.coachId),
        title: own.title,
        body: own.body,
        panelLine1: own.panelLine1,
        panelRows: own.panelRows,
        panelLine2: own.panelLine2,
        liveText: own.liveText,
      });
      // The day the event left shows a quiet row, so nobody hunts for it (a cancellation stays on its day, struck).
      const after = snapshotOf(row);
      const from = fromSlot;
      const to = slotOf(after, ctx.timeZone);
      if (!after.cancelled && from.date !== to.date && (!ctx.range || (from.date >= ctx.range.from && from.date <= ctx.range.to))) {
        movedAway.push({
          id: row.id,
          title: row.title,
          type: row.event_type,
          changeId: change.id,
          fromDate: from.date,
          fromStart: from.hour,
          fromLabel: clockLabel(change.from, ctx.timeZone),
          toDate: to.date,
          sub: movedToPhrase(after, ctx.timeZone, nowIso),
          aria: movedAwayAria(change.from, after, ctx.timeZone, nowIso),
        });
      }
    }
  }
  return { marks, unreadable, movedAway };
}
