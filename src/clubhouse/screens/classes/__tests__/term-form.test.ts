import { describe, expect, it } from 'vitest';
import { BREAK_ERROR_CODES, breakLine, suggestedDates, TERM_ERROR_CODES, termComplete, termDefaults, validateBreak, validateTerm, type TermValues } from '../term-form';

const FALL: TermValues = { label: 'Fall 2026', classesStart: '2026-08-24', classesEnd: '2026-12-11', examsEnd: '2026-12-18', timeZone: 'America/New_York' };

describe('term form (P-10)', () => {
  it('suggests the label’s usual window, with exams a week after the last class', () => {
    expect(suggestedDates('Fall 2026')).toEqual({ classesStart: '2026-08-20', classesEnd: '2026-12-08', examsEnd: '2026-12-15' });
    expect(suggestedDates('Spring 2027')).toMatchObject({ classesStart: '2027-01-15', examsEnd: '2027-05-15' });
    expect(suggestedDates('Autumn 2026')).toMatchObject({ classesStart: '2026-08-20' });
    expect(suggestedDates('Semester one')).toBeNull();
  });

  it('every suggested window passes its own validation (the database spans)', () => {
    for (const label of ['Spring 2026', 'Summer 2026', 'Fall 2026', 'Winter 2026']) {
      const d = suggestedDates(label)!;
      expect(validateTerm({ label, timeZone: 'America/New_York', ...d }, [])).toBeNull();
    }
  });

  it('prefills from the term being edited, else the label’s window, flagged as a suggestion', () => {
    const edit = termDefaults({ editing: { id: 't', ...FALL }, label: 'Spring 2027', timeZone: 'America/Chicago' });
    expect(edit).toEqual({ values: FALL, suggested: false });
    const fresh = termDefaults({ editing: null, label: 'Fall 2026', timeZone: 'America/Chicago' });
    expect(fresh.suggested).toBe(true);
    expect(fresh.values).toMatchObject({ label: 'Fall 2026', classesStart: '2026-08-20', timeZone: 'America/Chicago' });
    expect(termDefaults({ editing: null, label: null, timeZone: 'America/Chicago' })).toEqual({
      values: { label: '', classesStart: '', classesEnd: '', examsEnd: '', timeZone: 'America/Chicago' },
      suggested: false,
    });
  });

  it('says what is wrong, in the order it is fixed', () => {
    expect(validateTerm(FALL, [])).toBeNull();
    expect(validateTerm({ ...FALL, label: ' ' }, [])).toMatchObject({ code: TERM_ERROR_CODES.label, message: 'Name the term.' });
    expect(validateTerm({ ...FALL, classesEnd: '2026-08-24' }, [])).toMatchObject({ code: TERM_ERROR_CODES.order, message: 'Last day of classes must be after classes start.' });
    expect(validateTerm({ ...FALL, classesEnd: '2026-09-10' }, [])).toMatchObject({ code: TERM_ERROR_CODES.span, message: 'A term is 4 weeks to about 6 months.' });
    expect(validateTerm({ ...FALL, classesEnd: '2027-04-01' }, [])).toMatchObject({ code: TERM_ERROR_CODES.span });
    expect(validateTerm({ ...FALL, examsEnd: '2026-12-10' }, [])).toMatchObject({ code: TERM_ERROR_CODES.examsOrder, message: 'Exams end on or after the last day of classes.' });
    expect(validateTerm({ ...FALL, examsEnd: '2027-01-15' }, [])).toMatchObject({ code: TERM_ERROR_CODES.exams, message: 'Exams end within 3 weeks of the last class.' });
  });

  it('names the term a new one overlaps, exams period included', () => {
    const spring = { id: 's', label: 'Spring 2027', classesStart: '2027-01-12', examsEnd: '2027-05-01' };
    expect(validateTerm({ ...FALL, classesStart: '2026-12-20', classesEnd: '2027-02-01', examsEnd: '2027-02-10' }, [spring])).toMatchObject({
      code: TERM_ERROR_CODES.overlap,
      message: 'This overlaps Spring 2027 (Jan 12 to May 1).',
    });
    expect(validateTerm(FALL, [spring])).toBeNull();
  });

  it('an incomplete form is not complete and not an error yet', () => {
    const blank = { ...FALL, classesEnd: '' };
    expect(termComplete(blank)).toBe(false);
    expect(validateTerm(blank, [])).toBeNull();
    expect(termComplete(FALL)).toBe(true);
  });

  it('a break runs on or after its first day for at most 21 days', () => {
    expect(validateBreak('2026-10-12', '2026-10-13')).toBeNull();
    expect(validateBreak('2026-10-12', '2026-11-01')).toBeNull();
    expect(validateBreak('2026-10-13', '2026-10-12')).toMatchObject({ code: BREAK_ERROR_CODES.order, message: 'The last day must be on or after the first.' });
    expect(validateBreak('2026-10-12', '2026-11-02')).toMatchObject({ code: BREAK_ERROR_CODES.long, message: 'A break is at most 21 days.' });
    expect(validateBreak('', '')).toBeNull();
  });

  it('writes a break as the list shows it', () => {
    expect(breakLine({ startsOn: '2026-10-12', endsOn: '2026-10-13', label: 'Fall break' })).toBe('Fall break · Oct 12 to 13');
    expect(breakLine({ startsOn: '2026-11-26', endsOn: '2026-11-26', label: null })).toBe('Nov 26');
    expect(breakLine({ startsOn: '2026-10-30', endsOn: '2026-11-02', label: 'Long weekend' })).toBe('Long weekend · Oct 30 to Nov 2');
  });
});
