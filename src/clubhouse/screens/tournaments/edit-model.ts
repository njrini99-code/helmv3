/**
 * The edit-event form's pure half: a saved event's draft (`ChTourEventDraft`, read by the loader) becomes the form's
 * state (`ChTourState`, the same one the new-event form and the calendar editor hold), and the state becomes the
 * `updateTournament` input. No React, no clock. The rounds are kept exactly as saved (custom mode), so opening an event
 * and saving it unchanged sends the same days, courses and tee times.
 */
import type { TourEventInput } from '@/app/golf/actions/tournaments';
import { zoneWallParts } from '../../lib/dates';
import {
  formatToColumns,
  nextRoundId,
  sortRounds,
  zonedIso,
  type ChRoundDraft,
  type ChTourCounting,
  type ChTourEventKind as FormEventKind,
  type ChTourPlay,
  type ChTourState,
} from './fields/rounds-model';
import type { ChTourEventDraft, ChTourEventKind } from './types';

const KIND_TO_FORM: Record<ChTourEventKind, FormEventKind> = {
  regular: 'regular',
  conference: 'conference',
  regional: 'ncaa_regional',
  national: 'ncaa_championship',
  exhibition: 'exhibition',
};

/** The wall clock of an instant in a zone, "08:42"; null for no instant or an unreadable one. */
export function wallTime(instant: string | null, timeZone: string): string | null {
  if (!instant) return null;
  const ms = Date.parse(instant);
  if (Number.isNaN(ms)) return null;
  const wall = zoneWallParts(ms, timeZone);
  return wall ? `${String(wall.hour).padStart(2, '0')}:${String(wall.minute).padStart(2, '0')}` : null;
}

/**
 * A round saved as all-day sits at midnight UTC of its day: it has no tee time, whatever zone the team is in. Only a
 * round whose instant is not that convention reads as timed.
 */
function teeOf(instant: string | null, timeZone: string): string | null {
  if (!instant || /T00:00:00(\.000)?(\+00:00|Z)$/.test(instant)) return null;
  return wallTime(instant, timeZone);
}

export function stateFromDraft(draft: ChTourEventDraft, courses: ReadonlyArray<{ id: string; name: string; tees: string[] }>, timeZone: string): ChTourState {
  const rounds = draft.rounds.reduce<ChRoundDraft[]>((list, r) => [...list, { id: nextRoundId(list), date: r.date, tee: teeOf(r.firstTee, timeZone), startType: r.startType, courseId: r.courseId }], []);
  const first = rounds[0]?.courseId ?? null;
  const sameCourse = rounds.every((r) => (r.courseId ?? null) === first);
  const named = (id: string | null) => {
    const c = courses.find((x) => x.id === id);
    return c ? { id: c.id, label: c.name, teeId: null, teeLine: c.tees[0] ?? null } : null;
  };
  const f = draft.format;
  const play: ChTourPlay = f.kind === 'individual' ? 'individual' : f.kind === 'match' ? 'match' : f.kind === 'medal_match' ? 'medal_match' : 'stroke';
  const counting: ChTourCounting = f.kind === '5c4' || f.kind === '6c5' || f.kind === '6c4' ? f.kind : f.kind === 'custom' ? 'custom' : '5c4';
  const sorted = sortRounds(rounds);
  return {
    name: draft.name,
    firstDay: sorted[0]?.date ?? draft.startDate,
    lastDay: sorted[sorted.length - 1]?.date ?? draft.endDate,
    mode: 'custom',
    rounds: sorted,
    course: named(first),
    sameCourse,
    counting,
    play: f.players,
    count: f.counting,
    format: play,
    holes: f.holes,
    eventKind: KIND_TO_FORM[draft.kind],
    fieldSize: draft.fieldSize,
    host: draft.host,
    resultsUrl: draft.resultsUrl,
    lockMinutes: 10,
  };
}

/** The `updateTournament` input for the form's state. Fields the form does not edit (the lock minutes) are left out, so they stay as saved. */
export function toUpdateInput(s: ChTourState, timeZone: string): Partial<TourEventInput> {
  const rounds = sortRounds(s.rounds);
  const cols = formatToColumns(s.format, s.counting, s.play, s.count);
  const course = s.course?.id ?? null;
  return {
    name: s.name.trim(),
    startDate: rounds[0]?.date ?? s.firstDay,
    endDate: rounds[rounds.length - 1]?.date ?? s.lastDay,
    courseId: course,
    format: cols.format,
    ...(cols.playersPerTeam != null ? { playersPerTeam: cols.playersPerTeam } : {}),
    ...(cols.counting != null ? { counting: cols.counting } : {}),
    holesPerRound: s.holes,
    kind: s.eventKind,
    fieldSize: s.fieldSize,
    host: s.host.trim() || null,
    resultsUrl: s.resultsUrl.trim() || null,
    rounds: rounds.map((r) => ({
      date: r.date,
      courseId: s.sameCourse ? course : (r.courseId ?? course),
      startType: r.startType,
      firstTeeAt: r.tee ? zonedIso(r.date, r.tee, timeZone) : null,
    })),
  };
}
