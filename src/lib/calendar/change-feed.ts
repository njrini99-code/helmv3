import { composeChangeCopy, markIsLive, parseStoredChange, snapshotOf } from './change-mark';

/**
 * The line a subscribed calendar (the P-3 iCal feed) shows above an event's description while its change mark is live
 * (P-14): "Moved from 3:00 PM by Coach Reyes on Tue 14 April." A mark this version cannot read, one past its lifetime and
 * one on an event that has ended add nothing, so the feed is exactly what it was. Pure: the route reads the rows.
 */
export interface FeedChangeRow {
  id: string;
  start_time: string;
  end_time: string | null;
  all_day: boolean | null;
  location: string | null;
  title: string;
  event_type: string | null;
  status: string | null;
  /** `golf_events.metadata->change`. */
  change?: unknown;
}

export function feedChangeLines(rows: FeedChangeRow[], ctx: { timeZone: string; nowMs: number }): Map<string, string> {
  const out = new Map<string, string>();
  const nowIso = new Date(ctx.nowMs).toISOString();
  for (const row of rows) {
    if (!row.change || row.event_type === 'class') continue;
    const change = parseStoredChange(row.change);
    if (!change) continue;
    if (!markIsLive(change, { startIso: row.start_time, endIso: row.end_time, allDay: row.all_day === true }, ctx.timeZone, ctx.nowMs)) continue;
    // Each occurrence of a series says its own change: a subscriber sees one event at a time.
    const copy = composeChangeCopy({
      items: [{ before: change.from, after: snapshotOf({ ...row, event_type: row.event_type ?? 'other' }) }],
      timeZone: ctx.timeZone,
      nowIso,
      byNames: change.by_names,
      at: change.at,
    });
    out.set(row.id, copy.feedLine);
  }
  return out;
}
