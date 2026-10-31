import type { ChClassDayPlayer, ChMyClassDay } from '../../data/class-day-shape';
import { classLabel, classStatusFor, classStatusText, minutesOfDay, type ChClassStatus, type ChStatusTextOptions } from '../../data/class-status';
import { clockFromMinutes } from '../../lib/clock-format';
import { weekdayShortUtc } from '../../lib/dates';
import { plural } from '../../lib/plural';

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
      const label = [weekdayShortUtc(at), min == null ? null : clockFromMinutes(min, o.clock)].filter(Boolean).join(' ');
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


/**
 * The "Pushes during class" row (P-10): whether this player's non-urgent pushes wait during class, and what is waiting now.
 * With sharing off nothing is held (the database reads a hold as off), so the row says so instead of "Not held".
 */
export type PushesRow = {
  value: 'Held' | 'Not held' | 'Off while sharing is off';
  /** "3 updates waiting", or null when nothing is held right now. */
  waiting: string | null;
};

export function pushesRow(day: ChMyClassDay): PushesRow {
  const value = !day.settings.shareStatus ? 'Off while sharing is off' : day.settings.holdPushes ? 'Held' : 'Not held';
  const n = day.held?.count ?? 0;
  return { value, waiting: n > 0 ? `${plural(n, 'update')} waiting` : null };
}

/** "3 updates held until 11:50 AM" (the Bell's row), or null when nothing is held. The time is the player's own clock in the class zone. */
export function heldLine(day: Pick<ChMyClassDay, 'held' | 'classTimeZone' | 'teamTimeZone'>, clock: ChStatusTextOptions['clock']): string | null {
  const n = day.held?.count ?? 0;
  if (n <= 0) return null;
  const what = `${plural(n, 'update')} held`;
  const at = day.held?.releaseAt ? Date.parse(day.held.releaseAt) : NaN;
  if (!Number.isFinite(at)) return what;
  const zone = day.classTimeZone || day.teamTimeZone;
  const min = minutesOfDay(at, zone);
  return min == null ? what : `${what} until ${clockFromMinutes(min, clock)}`;
}
