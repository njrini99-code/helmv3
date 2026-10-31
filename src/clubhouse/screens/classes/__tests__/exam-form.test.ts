import { describe, expect, it } from 'vitest';
import { defaultExamLabel, EXAM_ERROR_CODES, examComplete, examsOfClass, validateExam } from '../exam-form';

const TERM = { label: 'Fall 2026', classesStart: '2026-08-24', examsEnd: '2026-12-18' };
const ok = { on: '2026-12-14', start: '09:00', end: '11:00', label: 'STAT 201 exam' };

describe('exam form (P-10)', () => {
  it('accepts an exam in the term, up to four hours', () => {
    expect(validateExam(ok, TERM)).toBeNull();
    expect(validateExam({ ...ok, end: '13:00' }, TERM)).toBeNull();
    expect(validateExam({ ...ok, on: '2026-12-18' }, TERM)).toBeNull();
  });
  it('says what is wrong', () => {
    expect(validateExam({ ...ok, end: '08:00' }, TERM)).toMatchObject({ code: EXAM_ERROR_CODES.order, message: 'The exam must end after it starts.' });
    expect(validateExam({ ...ok, end: '09:00' }, TERM)).toMatchObject({ code: EXAM_ERROR_CODES.order });
    expect(validateExam({ ...ok, end: '13:15' }, TERM)).toMatchObject({ code: EXAM_ERROR_CODES.long, message: 'Exams can be up to 4 hours.' });
    expect(validateExam({ ...ok, on: '2027-01-05' }, TERM)).toMatchObject({ code: EXAM_ERROR_CODES.term, message: 'Pick a date in Fall 2026.' });
    expect(validateExam({ ...ok, on: '2026-08-01' }, TERM)).toMatchObject({ code: EXAM_ERROR_CODES.term });
  });
  it('an unfinished form is not an error yet', () => {
    expect(validateExam({ ...ok, end: '' }, TERM)).toBeNull();
    expect(validateExam({ ...ok, on: '' }, TERM)).toBeNull();
    expect(examComplete({ ...ok, end: '' })).toBe(false);
    expect(examComplete({ ...ok, label: ' ' })).toBe(false);
    expect(examComplete(ok)).toBe(true);
  });
  it('without a confirmed term only the times are checked (the sheet is not offered then)', () => {
    expect(validateExam({ ...ok, on: '2020-01-01' }, null)).toBeNull();
  });
  it('labels an exam with the class code, and finds a class’s exams by that label', () => {
    expect(defaultExamLabel({ code: 'STAT 201', name: 'Probability' })).toBe('STAT 201 exam');
    expect(defaultExamLabel({ code: '', name: 'Writing seminar' })).toBe('Writing seminar exam');
    const exams = [
      { id: '1', on: '2026-12-14', start: '09:00', end: '11:00', label: 'STAT 201 exam' },
      { id: '2', on: '2026-12-15', start: '09:00', end: '11:00', label: 'stat 201 midterm' },
      { id: '3', on: '2026-12-16', start: '09:00', end: '11:00', label: 'ECON 310 exam' },
    ];
    expect(examsOfClass(exams, { code: 'STAT 201', name: 'Probability' }).map((e) => e.id)).toEqual(['1', '2']);
    expect(examsOfClass(exams, { code: '', name: '' })).toEqual([]);
  });
});
