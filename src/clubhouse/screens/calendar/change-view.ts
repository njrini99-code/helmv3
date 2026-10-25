import {
  composeChangeCopy,
  markIsLive,
  markKind,
  parseStoredChange,
  readPartialChange,
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
  /** The sentence for what changed; the Message players draft opens with it. */
  title: string;
  body: string;
  panelLine1: string;
  panelRows: ChangePanelRow[];
  panelLine2: string;
  liveText: string;
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
  ctx: { timeZone: string; nowMs: number; /** The viewer's `golf_coaches.id`, for "By you". */ coachId: string | null },
): { marks: Map<string, ChCalChange>; unreadable: string[] } {
  const nowIso = new Date(ctx.nowMs).toISOString();
  const marks = new Map<string, ChCalChange>();
  const unreadable: string[] = [];
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
        title: own.title,
        body: own.body,
        panelLine1: own.panelLine1,
        panelRows: own.panelRows,
        panelLine2: own.panelLine2,
        liveText: own.liveText,
      });
    }
  }
  return { marks, unreadable };
}
