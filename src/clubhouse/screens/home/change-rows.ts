import { clockLabel, longDateLabel, slotOf, snapshotOf } from '@/lib/calendar/change-mark';
import { dowOf } from '../calendar/model';
import { buildChangeMarks, type ChCalChange, type ChangeRow } from '../calendar/change-view';

/**
 * Home's "Since you last looked" rows for schedule changes (P-14): what someone else changed on an event in the last 72
 * hours, in the cardless Ledger shape the section already uses (a lead figure, a title, one meta line). Pure: the loader
 * builds them on the server from the same marks the Calendar reads, so the words match.
 */
export interface ChHomeChange {
  /** The event (the first of a series), for the link to Calendar. */
  eventId: string;
  /** The edit session, for the device's seen list and Got it. */
  changeId: string;
  /** The event's team-local date, for the link. */
  date: string;
  /** The lead figure: the new start ("4:00", with `hm` for a 24-hour clock), the new day ("Thu"), a count ("8"), or a cancelled event's old start, struck. */
  lead: { text: string; hm?: string; struck?: boolean };
  /** "Moved · Practice", "New time · Practice", "Renamed · Short game", "Cancelled · Practice", "Back on · Practice", "Changed · Practice". */
  title: string;
  /** "Was 3:00 PM · Wed 15 April · Coach Reyes". */
  meta: string;
  /** When the last edit landed. */
  at: string;
}

const hmOf = (hour: number): string => {
  const total = Math.round(hour * 60);
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};
const bare = (label: string): string => label.replace(/ [AP]M$/, '');

/**
 * The rows for the live changes someone else made, newest first, and the marks by event (for Up next and the agenda). A
 * series edited together is one row with its count. `visible` is asked of every row first (a player's read drops a meeting
 * their week does not show them).
 */
export function homeChangeRows(
  rows: ChangeRow[],
  ctx: { timeZone: string; nowMs: number; coachId: string | null; visible?: (row: ChangeRow) => boolean },
): { rows: ChHomeChange[]; byEvent: Map<string, ChCalChange> } {
  const shown = ctx.visible ? rows.filter(ctx.visible) : rows;
  const { marks } = buildChangeMarks(shown, { timeZone: ctx.timeZone, nowMs: ctx.nowMs, coachId: ctx.coachId });
  const bySession = new Map<string, ChangeRow[]>();
  for (const r of shown) {
    const m = marks.get(r.id);
    if (!m || m.byMe || m.partial) continue;
    bySession.set(m.id, [...(bySession.get(m.id) ?? []), r]);
  }
  const out: ChHomeChange[] = [];
  for (const group of bySession.values()) {
    const first = [...group].sort((a, b) => a.start_time.localeCompare(b.start_time))[0]!;
    const m = marks.get(first.id)!;
    const now = snapshotOf(first);
    const at = slotOf(now, ctx.timeZone);
    const newLabel = clockLabel(now, ctx.timeZone);
    const when = longDateLabel(at.date);
    const by = m.byLabel && m.byLabel !== 'you' ? m.byLabel : null;
    const count = group.length;

    let lead: ChHomeChange['lead'];
    if (count > 1) lead = { text: String(count) };
    else if (m.kind === 'cancel') lead = { text: m.fromSlot.label ? bare(m.fromSlot.label) : 'All day', ...(m.fromSlot.start != null ? { hm: hmOf(m.fromSlot.start) } : {}), struck: true };
    else if (m.kind === 'day') lead = { text: dowOf(at.date) };
    else lead = { text: newLabel ? bare(newLabel) : 'All day', ...(at.hour != null ? { hm: hmOf(at.hour) } : {}) };

    let text: string;
    if (count > 1) text = m.title.includes(': ') ? m.title.slice(m.title.indexOf(': ') + 2) : m.title;
    else if (m.kind === 'time') text = `Was ${m.was.time ?? ''} · ${when}`;
    else if (m.kind === 'day') text = `Was ${longDateLabel(m.fromSlot.date)}${newLabel ? ` · now ${newLabel}` : ''}`;
    else if (m.kind === 'cancel' || m.kind === 'restore') text = when;
    else if (m.kind === 'several') text = m.body;
    else text = m.panelLine1;

    out.push({
      eventId: first.id,
      changeId: m.id,
      date: at.date,
      lead,
      title: `${m.badge} · ${first.title}`,
      meta: [text, by].filter(Boolean).join(' · '),
      at: m.at,
    });
  }
  out.sort((a, b) => b.at.localeCompare(a.at));
  return { rows: out, byEvent: marks };
}
