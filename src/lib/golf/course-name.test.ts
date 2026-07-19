import { describe, it, expect } from 'vitest';
import { cleanCourseName } from './course-name';

describe('cleanCourseName', () => {
  it('strips the leaked "(real)" QA suffix (the exact audit defect)', () => {
    expect(cleanCourseName('Poplar Grove (real)')).toBe('Poplar Grove');
  });

  it('strips other internal parentheticals, case-insensitively', () => {
    expect(cleanCourseName('Pinehurst (TEST)')).toBe('Pinehurst');
    expect(cleanCourseName('Augusta (qa)')).toBe('Augusta');
    expect(cleanCourseName('Bethpage (demo)')).toBe('Bethpage');
  });

  it('leaves a legitimate course name untouched', () => {
    expect(cleanCourseName('Golden Horseshoe Gold Course')).toBe('Golden Horseshoe Gold Course');
    expect(cleanCourseName('Poplar Grove')).toBe('Poplar Grove');
  });

  it('does not strip a non-QA trailing parenthetical', () => {
    expect(cleanCourseName('Pebble Beach (South)')).toBe('Pebble Beach (South)');
  });

  it('handles null/undefined/empty', () => {
    expect(cleanCourseName(null)).toBe('');
    expect(cleanCourseName(undefined)).toBe('');
    expect(cleanCourseName('')).toBe('');
  });
});
