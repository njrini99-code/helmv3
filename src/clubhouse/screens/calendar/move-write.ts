/**
 * P-4: one write per held move, after its Undo window. A single event (or one occurrence, "This event") goes through
 * updateGolfEvent; "This and following" through editRecurringEvent. Every write carries the version the drag read, so a
 * move never overwrites a newer change (the server answers stale or gone). Each date gets its own UTC offset, so 4:00 PM
 * stays 4:00 PM across a clock change, and a run's end gets its own.
 *
 * Tournament rounds (P-5 6.4): when `e.round` is set the write goes to updateTournamentRound with the round's version,
 * and its refusals come back as `refused` with their numbered words (stale stays P-4's stale path).
 */
import { zonedWallTime } from '../../lib/dates';
import { editRecurringEvent } from '@/app/golf/actions/recurring-events';
import { updateGolfEvent } from '@/app/golf/actions/calendar-events';
import { updateTournamentRound } from '@/app/golf/actions/tournaments-calendar';
import { refusalNotice, type TournamentRefusal } from '../tournaments/fields/refusals';
import { roundStartAt } from '../tournaments/fields/rounds-model';
import { offsetMinutesFor } from '@/lib/golf/timezone';
import type { ChBarTarget, ChMoveTarget } from './drag-model';
import type { ChCalEvent } from './model';

export type ChMoveScope = 'single' | 'this' | 'thisAndFuture';
export type ChMoveKind = 'move' | 'resize' | 'bar';

export interface HeldMove {
  e: ChCalEvent;
  to: ChMoveTarget | ChBarTarget;
  kind: ChMoveKind;
  scope: ChMoveScope;
  expectedUpdatedAt: string | null;
}

export type WriteMoveResult =
  | { ok: true; updatedAt?: string }
  | { ok: false; code: 'stale' | 'gone' | 'forbidden' | 'failed'; message?: string; current?: { date: string; start: number | null; end: number | null; allDay: boolean; version: string | null } }
  /** P-5: a tournament round's move the RPC refused, with the words and number to show. */
  | { ok: false; code: 'refused'; notice: { code: string; text: string }; message?: string; current?: undefined };

/** A round's version travels in P-4's version slot as `round:<n>`, so a following move uses the newest one. */
const ROUND_TOKEN = 'round:';
export const roundToken = (v: number) => `${ROUND_TOKEN}${v}`;

export const toHHMM = (h: number) => {
  const mins = Math.round(h * 60);
  return `${String(Math.floor(mins / 60) % 24).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
};

const zonedAt = (iso: string, timeZone: string) => zonedWallTime(iso, timeZone);

const isBar = (to: ChMoveTarget | ChBarTarget): to is ChBarTarget => 'from' in to;

/** The update fields a held move writes: dates, times, all-day, and each end's own offset. */
export function movePayload(m: HeldMove, timeZone: string) {
  const { e, to } = m;
  if (isBar(to)) {
    if (e.allDay) return { startDate: to.from, endDate: to.to, allDay: true };
    // A timed run keeps its first day's start and last day's end.
    const startTime = toHHMM(e.span?.start ?? e.start ?? 0);
    const endHour = e.span?.end ?? e.end ?? 0;
    const endTime = toHHMM(endHour);
    // A run that ends at midnight holds 24 on its last day: that is the next day's 00:00, as a single move writes it.
    const endDate = endHour >= 24 ? addDay(to.to) : to.to;
    return {
      startDate: to.from,
      endDate,
      startTime,
      endTime,
      allDay: false,
      timezoneOffset: offsetMinutesFor(to.from, startTime, timeZone) ?? undefined,
      endTimezoneOffset: offsetMinutesFor(endDate, endTime, timeZone) ?? undefined,
    };
  }
  const startTime = toHHMM(to.start);
  // 24:00 is the next day's midnight.
  const endDate = to.end >= 24 ? addDay(to.date) : to.date;
  const endTime = toHHMM(to.end);
  return {
    startDate: to.date,
    endDate,
    startTime,
    endTime,
    allDay: false,
    timezoneOffset: offsetMinutesFor(to.date, startTime, timeZone) ?? undefined,
    endTimezoneOffset: offsetMinutesFor(endDate, endTime, timeZone) ?? undefined,
  };
}

function addDay(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

async function writeRoundMove(m: HeldMove, timeZone: string): Promise<WriteMoveResult> {
  const r = m.e.round!;
  const token = m.expectedUpdatedAt?.startsWith(ROUND_TOKEN) ? Number(m.expectedUpdatedAt.slice(ROUND_TOKEN.length)) : null;
  const version = token && Number.isFinite(token) ? token : r.version;
  const to = m.to;
  // A bar (an all-day round in the all-day lane or month) changes its day and stays all day; a timed one keeps its length.
  const patch = isBar(to)
    ? { startAt: roundStartAt({ date: to.from, tee: null }, timeZone), endAt: null, allDay: true }
    : {
        startAt: roundStartAt({ date: to.date, tee: toHHMM(to.start) }, timeZone),
        endAt: roundStartAt({ date: to.end >= 24 ? addDay(to.date) : to.date, tee: toHHMM(to.end) }, timeZone),
        allDay: false,
      };
  const res = await updateTournamentRound(m.e.id, { ...patch, ...(r.teeSheet ? { shiftTeeSheet: true } : {}) }, version);
  if (res.success) return { ok: true, updatedAt: roundToken(res.data.version) };
  if (res.code === 'stale') return { ok: false, code: 'stale', message: res.error };
  if (res.code === 'not_found') return { ok: false, code: 'gone', message: res.error };
  const n = refusalNotice((res.code ?? 'failed') as TournamentRefusal, { save: 'round', round: r.roundNo, before: r.roundNo > 1 ? r.roundNo - 1 : null, name: r.name });
  return { ok: false, code: 'refused', notice: n, message: res.error };
}

export async function writeMove(m: HeldMove, timeZone: string): Promise<WriteMoveResult> {
  if (m.e.round) return writeRoundMove(m, timeZone);
  const p = movePayload(m, timeZone);
  const expected = m.expectedUpdatedAt ?? undefined;
  if (m.scope === 'thisAndFuture') {
    const res = await editRecurringEvent({
      eventId: m.e.id,
      originalStartDate: m.e.startIso,
      scope: 'thisAndFuture',
      timezoneOffset: p.timezoneOffset,
      timeZone,
      expectedUpdatedAt: expected,
      updates: { startDate: p.startDate, startTime: p.startTime, endDate: p.endDate, endTime: p.endTime },
    });
    if (res?.success) return { ok: true };
    return { ok: false, code: res?.code === 'stale' ? 'stale' : 'failed', message: res?.error };
  }
  const res = await updateGolfEvent(m.e.id, { ...p, expectedUpdatedAt: expected });
  if (res?.success) return { ok: true, updatedAt: res.data?.updatedAt };
  const code = res?.code ?? (res?.error === 'Only coaches can update team events' ? 'forbidden' : 'failed');
  const c = res?.current;
  const current = c
    ? (() => {
        if (c.allDay) return { date: c.startTime.slice(0, 10), start: null, end: null, allDay: true, version: c.updatedAt || null };
        const a = zonedAt(c.startTime, timeZone);
        const b = c.endTime ? zonedAt(c.endTime, timeZone) : null;
        return { date: a.date, start: a.hour, end: b ? (b.date > a.date ? 24 : b.hour) : null, allDay: false, version: c.updatedAt || null };
      })()
    : undefined;
  return { ok: false, code, message: res?.error, current };
}
