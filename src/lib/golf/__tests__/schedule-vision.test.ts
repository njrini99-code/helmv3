import { describe, it, expect } from 'vitest';
import {
  normalizeTime24,
  splitLocation,
  mapExtractionToParsedClasses,
  type ScheduleExtraction,
} from '@/lib/golf/schedule-vision';

describe('normalizeTime24', () => {
  it('pads and passes well-formed times', () => {
    expect(normalizeTime24('9:05')).toBe('09:05');
    expect(normalizeTime24('14:30')).toBe('14:30');
    expect(normalizeTime24('00:00')).toBe('00:00');
    expect(normalizeTime24(' 23:59 ')).toBe('23:59');
  });

  it('rejects out-of-range and non-time strings', () => {
    expect(normalizeTime24('25:00')).toBe('');
    expect(normalizeTime24('9:65')).toBe('');
    expect(normalizeTime24('905A')).toBe('');
    expect(normalizeTime24('TBA')).toBe('');
    expect(normalizeTime24('')).toBe('');
    expect(normalizeTime24('9:05 AM')).toBe('');
  });
});

describe('splitLocation', () => {
  it('splits Banner-style building-then-room', () => {
    expect(splitLocation('Sci Hall 214')).toEqual({ building: 'Sci Hall', room: '214' });
    expect(splitLocation('Bryan Hall 213B')).toEqual({ building: 'Bryan Hall', room: '213B' });
  });

  it('splits PeopleSoft-style room-then-building', () => {
    expect(splitLocation('627 Thackeray Hall')).toEqual({
      building: 'Thackeray Hall',
      room: '627',
    });
    expect(splitLocation('L9 Clapp Hall')).toEqual({ building: 'Clapp Hall', room: 'L9' });
  });

  it('leaves no-room locations intact', () => {
    expect(splitLocation('WEB')).toEqual({ building: 'WEB', room: '' });
    expect(splitLocation('Online')).toEqual({ building: 'Online', room: '' });
    expect(splitLocation('')).toEqual({ building: '', room: '' });
    expect(splitLocation('  ')).toEqual({ building: '', room: '' });
  });
});

function extraction(overrides: Partial<ScheduleExtraction> = {}): ScheduleExtraction {
  return {
    is_class_schedule: true,
    document_kind: 'Banner list view',
    term: 'Fall 2026',
    classes: [],
    warnings: [],
    image_quality: 'good',
    ...overrides,
  };
}

const baseClass = {
  course_code: 'BIOL 1010',
  course_name: 'Introduction to Biology',
  section_kind: 'lecture' as const,
  days: ['MON', 'WED', 'FRI'] as Array<
    'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN'
  >,
  start_time: '9:05',
  end_time: '9:55',
  location: 'Sci Hall 214',
  instructor: 'Dr. A. Ramirez',
  confidence: 0.95,
  note: '',
};

describe('mapExtractionToParsedClasses', () => {
  it('maps a clean class into the ParsedClass shape', () => {
    const result = mapExtractionToParsedClasses(extraction({ classes: [baseClass] }));

    expect(result.classes).toHaveLength(1);
    const cls = result.classes[0]!;
    expect(cls.course_code).toBe('BIOL 1010');
    expect(cls.days).toEqual(['M', 'W', 'F']);
    expect(cls.start_time).toBe('09:05');
    expect(cls.end_time).toBe('09:55');
    expect(cls.building).toBe('Sci Hall');
    expect(cls.room).toBe('214');
    expect(cls.semester).toBe('Fall 2026');
    expect(cls.id).toBeTruthy();
    expect(result.warnings).toEqual([]);
  });

  it('maps Tuesday/Thursday to the short tokens the pipeline expects', () => {
    const result = mapExtractionToParsedClasses(
      extraction({
        classes: [{ ...baseClass, days: ['TUE', 'THU'], start_time: '11:00', end_time: '12:15' }],
      }),
    );
    expect(result.classes[0]!.days).toEqual(['T', 'Th']);
  });

  it('degrades a malformed time to empty and warns instead of dropping the class', () => {
    const result = mapExtractionToParsedClasses(
      extraction({ classes: [{ ...baseClass, end_time: '9:99' }] }),
    );
    expect(result.classes).toHaveLength(1);
    expect(result.classes[0]!.end_time).toBe('');
    expect(result.warnings.some((w) => w.includes('BIOL 1010'))).toBe(true);
  });

  it('keeps online classes with no days or times', () => {
    const result = mapExtractionToParsedClasses(
      extraction({
        classes: [
          {
            ...baseClass,
            course_code: 'PHYS 2010',
            days: [],
            start_time: '',
            end_time: '',
            location: '',
          },
        ],
      }),
    );
    expect(result.classes).toHaveLength(1);
    expect(result.classes[0]!.days).toEqual([]);
    expect(result.classes[0]!.start_time).toBe('');
    expect(result.warnings).toEqual([]);
  });

  it('surfaces low-confidence rows and per-class notes as warnings', () => {
    const result = mapExtractionToParsedClasses(
      extraction({
        classes: [
          { ...baseClass, confidence: 0.4, note: 'time cropped in screenshot' },
          { ...baseClass, course_code: 'HIST 1301', note: 'second half of semester only' },
        ],
        warnings: ['bottom row cut off'],
      }),
    );
    expect(result.warnings).toContain('bottom row cut off');
    expect(result.warnings.some((w) => w.includes('double-check'))).toBe(true);
    expect(result.warnings.some((w) => w.includes('HIST 1301: second half'))).toBe(true);
  });

  it('falls back to the course code when the title is missing', () => {
    const result = mapExtractionToParsedClasses(
      extraction({ classes: [{ ...baseClass, course_name: '' }] }),
    );
    expect(result.classes[0]!.course_name).toBe('BIOL 1010');
  });
});
