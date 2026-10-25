import { TERM_WINDOWS } from '@/lib/golf/semester';
import { shortDate } from '../home/home-line';

/**
 * P-10 class awareness: the Term sheet's pure parts. The label prefill and the suggested dates (TERM_WINDOWS, the same
 * windows the class import uses), the validation sentences, and the overlap check against the team's other terms. The
 * server action and the database check the same limits (golf_team_terms_span / _exams / the overlap guard): these only
 * say it in a sentence before anything is sent.
 *
 * Saving is the confirmation: a suggestion is never stored on its own.
 */

export type TermValues = { label: string; classesStart: string; classesEnd: string; examsEnd: string; timeZone: string };
export type TermError = { field: 'label' | 'classesStart' | 'classesEnd' | 'examsEnd'; code: string; message: string };

export const TERM_ERROR_CODES = {
  label: 'CH-2175',
  order: 'CH-2170',
  span: 'CH-2171',
  exams: 'CH-2172',
  examsOrder: 'CH-2173',
  overlap: 'CH-2174',
} as const;

const DAY_MS = 86_400_000;
const dayNumber = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / DAY_MS);
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
const validDay = (iso: string) => /^\d{4}-\d{2}-\d{2}$/.test(iso) && Number.isFinite(Date.parse(`${iso}T00:00:00Z`));

/** "Fall 2026" to its usual window, or null when the label names no season and year. */
export function suggestedDates(label: string): Pick<TermValues, 'classesStart' | 'classesEnd' | 'examsEnd'> | null {
  const m = /\b(spring|summer|fall|autumn|winter)\s+(\d{4})\b/i.exec(label);
  if (!m) return null;
  const season = (m[1]!.toLowerCase() === 'autumn' ? 'fall' : m[1]!.toLowerCase()) as keyof typeof TERM_WINDOWS;
  const year = Number(m[2]);
  const start = TERM_WINDOWS[season].start(year);
  const end = TERM_WINDOWS[season].end(year);
  const classesEnd = dayNumber(end) - 7 >= dayNumber(start) + 27 ? addDays(end, -7) : end;
  return { classesStart: start, classesEnd, examsEnd: end };
}

/** Shown as the sheet opens: the term's own dates when one is being edited, else the label's usual window, else empty. */
export function termDefaults(o: { editing: (TermValues & { id: string }) | null; label: string | null; timeZone: string }): { values: TermValues; suggested: boolean } {
  if (o.editing) return { values: { label: o.editing.label, classesStart: o.editing.classesStart, classesEnd: o.editing.classesEnd, examsEnd: o.editing.examsEnd, timeZone: o.editing.timeZone }, suggested: false };
  const label = (o.label ?? '').trim().slice(0, 40);
  const dates = suggestedDates(label);
  return { values: { label, classesStart: dates?.classesStart ?? '', classesEnd: dates?.classesEnd ?? '', examsEnd: dates?.examsEnd ?? '', timeZone: o.timeZone }, suggested: !!dates };
}

export type OtherTerm = { id: string; label: string; classesStart: string; examsEnd: string };

const err = (field: TermError['field'], code: string, message: string): TermError => ({ field, code, message });

/** The first thing wrong, in the order a coach fixes it, or null. `others` excludes the term being edited. */
export function validateTerm(v: TermValues, others: readonly OtherTerm[]): TermError | null {
  if (!v.label.trim()) return err('label', TERM_ERROR_CODES.label, 'Name the term.');
  if (![v.classesStart, v.classesEnd, v.examsEnd].every(validDay)) return null; // incomplete: Save stays unavailable, no sentence yet
  const lead = dayNumber(v.classesEnd) - dayNumber(v.classesStart);
  if (lead <= 0) return err('classesEnd', TERM_ERROR_CODES.order, 'Last day of classes must be after classes start.');
  if (lead < 27 || lead > 200) return err('classesEnd', TERM_ERROR_CODES.span, 'A term is 4 weeks to about 6 months.');
  const exams = dayNumber(v.examsEnd) - dayNumber(v.classesEnd);
  if (exams < 0) return err('examsEnd', TERM_ERROR_CODES.examsOrder, 'Exams end on or after the last day of classes.');
  if (exams > 21) return err('examsEnd', TERM_ERROR_CODES.exams, 'Exams end within 3 weeks of the last class.');
  const clash = others.find((o) => dayNumber(o.classesStart) <= dayNumber(v.examsEnd) && dayNumber(v.classesStart) <= dayNumber(o.examsEnd));
  if (clash) {
    const short = (iso: string) => shortDate(iso).replace(/^\w+, /, '');
    return err('classesStart', TERM_ERROR_CODES.overlap, `This overlaps ${clash.label} (${short(clash.classesStart)} to ${short(clash.examsEnd)}).`);
  }
  return null;
}

export const termComplete = (v: TermValues) => !!v.label.trim() && [v.classesStart, v.classesEnd, v.examsEnd].every(validDay) && !!v.timeZone;

export const BREAK_ERROR_CODES = { order: 'CH-2176', long: 'CH-2177' } as const;
export type BreakError = { code: string; message: string };

/** A team break: the last day on or after the first, at most 21 days. */
export function validateBreak(startsOn: string, endsOn: string): BreakError | null {
  if (!validDay(startsOn) || !validDay(endsOn)) return null;
  const span = dayNumber(endsOn) - dayNumber(startsOn);
  if (span < 0) return { code: BREAK_ERROR_CODES.order, message: 'The last day must be on or after the first.' };
  if (span > 20) return { code: BREAK_ERROR_CODES.long, message: 'A break is at most 21 days.' };
  return null;
}

/** "Fall break · Oct 12 to 13" / "Oct 12" / "Oct 30 to Nov 2": how a break reads in the sheet's list. */
export function breakLine(b: { startsOn: string; endsOn: string; label: string | null }): string {
  const parts = (iso: string) => {
    const [, m, d] = iso.split('-').map(Number);
    return { m: m!, d: d!, text: shortDate(iso).replace(/^\w+, /, '') };
  };
  const a = parts(b.startsOn);
  const z = parts(b.endsOn);
  const range = b.startsOn === b.endsOn ? a.text : a.m === z.m ? `${a.text} to ${z.d}` : `${a.text} to ${z.text}`;
  return [b.label, range].filter(Boolean).join(' · ');
}
