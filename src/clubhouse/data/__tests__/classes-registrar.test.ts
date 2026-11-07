import { describe, expect, it } from 'vitest';
import { classClashes, cleanInstructor, cleanPlace, cleanRegistrarField, parseClassName, type ChClass } from '../classes-shape';

const cls = (id: string, code: string, days: string[], start: string | null, end: string | null, semester: string | null = 'Fall 2026') =>
  ({ id, code, name: code, days, start, end, semester }) as unknown as ChClass;

describe('registrar text', () => {
  it('turns an instructor line into people, as staging’s imported rows read', () => {
    expect(cleanInstructor('Daniels, Wess (Primary); Williams, LaKeisha')).toBe('Wess Daniels and LaKeisha Williams');
    expect(cleanInstructor('Hatchett, William')).toBe('William Hatchett');
    expect(cleanInstructor('Dr. K. Osei')).toBe('Dr. K. Osei');
    expect(cleanInstructor('A, B; C, D; E, F')).toBe('B A and 2 others');
  });
  it('a department in words becomes a code, and a real code stays', () => {
    expect(parseClassName('English and Creative Writing 101 - Writing Seminar')).toEqual({ code: 'ENGL 101', name: 'Writing Seminar' });
    expect(parseClassName('Accounting 201 - Introduction to Accounting')).toEqual({ code: 'ACCO 201', name: 'Introduction to Accounting' });
    expect(parseClassName('BIOL 1010L - Biology Lab')).toEqual({ code: 'BIOL 1010L', name: 'Biology Lab' });
    expect(parseClassName('Intro to Python 2 - Part 1')).toEqual({ code: '', name: 'Intro to Python 2 - Part 1' });
  });
  it('a place reads as a building and a room', () => {
    expect(cleanPlace('Guilford Building Bauman Telecommunications Cntr Room', '203')).toEqual({ building: 'Bauman Telecommunications Center', room: '203' });
    expect(cleanPlace('Guilford Building King Hall Room', 'B26')).toEqual({ building: 'King Hall', room: 'B26' });
    expect(cleanPlace('Guilford Building Duke Memorial Room LEAK', '')).toEqual({ building: 'Duke Memorial', room: 'LEAK' });
    expect(cleanPlace('Science Hall', '214')).toEqual({ building: 'Science Hall', room: '214' });
    expect(cleanPlace('TBA', 'TBA')).toEqual({ building: '', room: '' });
  });
  it('filler is no answer', () => {
    expect(cleanInstructor('No specified Instructor')).toBe('');
    expect(cleanInstructor('Staff')).toBe('');
    expect(cleanInstructor(null)).toBe('');
    expect(cleanRegistrarField('  TBA ')).toBe('');
    expect(cleanRegistrarField('Hanes  Hall')).toBe('Hanes Hall');
  });
});

describe('class against class', () => {
  it('flags two classes that meet at once on a shared day, with the overlap', () => {
    const [x] = classClashes([cls('b', 'BIOL 1010', ['M', 'W', 'F'], '08:00', '08:50'), cls('e', 'ENGL 101', ['M', 'W', 'F'], '08:30', '09:20')]);
    expect(x).toMatchObject({ days: ['M', 'W', 'F'], start: '08:30', end: '08:50' });
    expect(x!.a.code).toBe('BIOL 1010');
  });
  it('leaves back-to-back, other days, other terms and untimed classes alone', () => {
    expect(classClashes([cls('a', 'A', ['M'], '08:00', '09:00'), cls('b', 'B', ['M'], '09:00', '10:00')])).toEqual([]);
    expect(classClashes([cls('a', 'A', ['M'], '08:00', '09:00'), cls('b', 'B', ['T'], '08:00', '09:00')])).toEqual([]);
    expect(classClashes([cls('a', 'A', ['M'], '08:00', '09:00'), cls('b', 'B', ['M'], '08:00', '09:00', 'Spring 2027')])).toEqual([]);
    expect(classClashes([cls('a', 'A', ['M'], null, null), cls('b', 'B', ['M'], '08:00', '09:00')])).toEqual([]);
  });
  it('reads a class with no term as the current one, and spellings of a term as one', () => {
    const none = cls('a', 'A', ['M'], '08:00', '09:00', null);
    const named = cls('b', 'B', ['M'], '08:30', '09:30', 'Fall 2026');
    expect(classClashes([none, named], 'Fall 2026')).toHaveLength(1);
    expect(classClashes([none, named], 'Spring 2027')).toEqual([]);
    expect(classClashes([cls('c', 'C', ['M'], '08:00', '09:00', 'fall  2026'), named], 'Fall 2026')).toHaveLength(1);
  });
});
