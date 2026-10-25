import type { ChClassDayPlayer, ChMyClassDay } from '../../data/class-day-shape';
import { classLabel, classStatusFor, classStatusText, minutesOfDay, type ChClassStatus, type ChStatusTextOptions } from '../../data/class-status';
import { clockFromMinutes } from '../../lib/clock-format';

/**
 * P-10 class awareness: what the player's Class status panel says, as pure functions of the player's own payload and
 * the instant. The top line is the player's own state (second person where it reads better); "Coaches see" is the exact
 * object a coach's payload holds for this player, drawn with the same text function, so the preview cannot drift from
 * the coach view.
 */

export type PanelTop = {
  kind: ChClassStatus['kind'] | 'no_term' | 'exams';
  /** "In class until 11:50 AM". */
  text: string;
  /** The own class in full ("STAT 201 - Probability") for the status that has one; the player's own data. */
  detail: string | null;
};

const WEEKDAY = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short' });

/** The player's own state, from their own blocks whatever the sharing switch says (the switch only decides what coaches see). */
export function panelTop(day: ChMyClassDay, now: number, o: ChStatusTextOptions): PanelTop {
  if (!day.term) return { kind: 'no_term', text: 'Class status starts when your coach sets this term’s dates', detail: null };
  const own: ChClassDayPlayer = {
    playerId: day.player?.playerId ?? 'me',
    firstName: day.player?.firstName ?? null,
    lastName: day.player?.lastName ?? null,
    avatarUrl: null,
    tracked: true,
    holds: day.settings.holdPushes,
    onCourse: day.player?.onCourse ?? false,
    offToday: day.player?.offToday ?? false,
    away: day.player?.away ?? null,
    blocks: day.blocks,
  };
  const status = classStatusFor(own, now);
  if ((status.kind === 'in_class' || status.kind === 'exam' || status.kind === 'soon') && classStatusText(status, o)) {
    const block = [...status.island.blocks].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))[0];
    return { kind: status.kind, text: classStatusText(status, o)!, detail: block?.label || null };
  }
  if (status.kind === 'travelling') return { kind: 'travelling', text: classStatusText(status, o) ?? 'Travelling', detail: null };
  if (day.term.phase === 'exams') {
    const next = day.blocks.filter((b) => b.kind === 'exam' && Date.parse(b.startsAt) > now).sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))[0];
    const zone = o.classTz ?? o.teamTz;
    if (next) {
      const at = Date.parse(next.startsAt);
      const min = minutesOfDay(at, zone);
      const label = [WEEKDAY.format(new Date(at)), min == null ? null : clockFromMinutes(min, o.clock)].filter(Boolean).join(' ');
      return { kind: 'exams', text: `Exams · next exam ${label}`, detail: next.label || null };
    }
    return { kind: 'exams', text: 'Exams', detail: null };
  }
  return { kind: 'none', text: 'No class right now', detail: null };
}

/** The "Coaches see" row: the same text a coach reads, or null for "No class status". */
export function coachesSee(day: ChMyClassDay, now: number, o: ChStatusTextOptions): { name: string; status: ChClassStatus | null; text: string | null } {
  const p = day.player;
  const name = [p?.firstName, p?.lastName].filter(Boolean).join(' ') || 'You';
  if (!p || !day.settings.shareStatus || !p.tracked) return { name, status: null, text: null };
  const status = classStatusFor(p, now);
  const text = status.kind === 'none' ? null : classStatusText(status, o);
  return { name, status: text ? status : null, text };
}

export type PanelNotice =
  | { kind: 'untagged'; count: number; text: string; action: string }
  | { kind: 'times' | 'days'; classId: string; text: string; action: string }
  | { kind: 'calendar_mismatch'; classId: string; text: string; action: string };

/** The panel's quiet notices: classes ignored until tagged, classes that cannot be used, calendar times that disagree. */
export function panelNotices(day: ChMyClassDay, classes: ReadonlyArray<{ id: string; code: string; name: string }>): PanelNotice[] {
  const out: PanelNotice[] = [];
  const nameOf = (id: string) => {
    const c = classes.find((x) => x.id === id);
    return c ? classLabel(c.code ? `${c.code} - ${c.name}` : c.name) : 'A class';
  };
  if (day.untaggedClasses > 0 && day.term) {
    const n = day.untaggedClasses;
    out.push({ kind: 'untagged', count: n, text: `${n} ${n === 1 ? 'class isn’t' : 'classes aren’t'} tagged with a term`, action: `Tag as ${day.term.label}` });
  }
  for (const u of day.unusableClasses) {
    if (u.reason === 'calendar_mismatch') out.push({ kind: 'calendar_mismatch', classId: u.classId, text: `${nameOf(u.classId)}’s calendar times don’t match`, action: 'Re-sync' });
    else out.push({ kind: u.reason, classId: u.classId, text: `${nameOf(u.classId)} isn’t used for class status`, action: u.reason === 'days' ? 'Fix days' : 'Fix times' });
  }
  return out;
}

