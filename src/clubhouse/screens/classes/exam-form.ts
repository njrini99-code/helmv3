import type { ChExam } from './class-status-writes';

/**
 * P-10 class awareness: the Add an exam sheet's pure parts. An exam is a one-off block the player adds for a class
 * (`golf_class_exceptions`, kind `extra`): a date inside the confirmed term (classes start to exams end), a start and an
 * end, at most 4 hours (the database check says the same), and a label that begins with the class's code so the class's
 * detail can list it.
 */
export type ExamValues = { on: string; start: string; end: string; label: string };
export type ExamError = { field: 'on' | 'end'; code: string; message: string };

export const EXAM_ERROR_CODES = { order: 'CH-12170', long: 'CH-12171', term: 'CH-12172' } as const;

const minutes = (hhmm: string): number | null => {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm);
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  return h < 24 && mm < 60 ? h * 60 + mm : null;
};

/** The first thing wrong, or null (an incomplete form is not an error yet: Save stays unavailable). */
export function validateExam(v: ExamValues, term: { label: string; classesStart: string; examsEnd: string } | null): ExamError | null {
  const a = minutes(v.start);
  const b = minutes(v.end);
  if (v.on && term && (v.on < term.classesStart || v.on > term.examsEnd)) return { field: 'on', code: EXAM_ERROR_CODES.term, message: `Pick a date in ${term.label}.` };
  if (a == null || b == null) return null;
  if (b <= a) return { field: 'end', code: EXAM_ERROR_CODES.order, message: 'The exam must end after it starts.' };
  if (b - a > 240) return { field: 'end', code: EXAM_ERROR_CODES.long, message: 'Exams can be up to 4 hours.' };
  return null;
}

export const examComplete = (v: ExamValues) => !!v.on && minutes(v.start) != null && minutes(v.end) != null && !!v.label.trim();

/** "STAT 201 exam": the label the sheet starts with. */
export const defaultExamLabel = (c: { code: string; name: string }) => `${c.code || c.name} exam`.slice(0, 60);

/** The exams that belong to a class: their label begins with its code (or its name when it has none). */
export function examsOfClass(exams: readonly ChExam[], c: { code: string; name: string }): ChExam[] {
  const key = (c.code || c.name).trim().toLowerCase();
  return key ? exams.filter((e) => e.label.trim().toLowerCase().startsWith(key)) : [];
}
