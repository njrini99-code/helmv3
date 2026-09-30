/**
 * The start rules live in a plain module (no 'use client') so setup screens and server code can import them without
 * the engine hook, and the engine keeps re-exporting them (ROUNDS_PLAN step 5a).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validateStartForm, validateStartHoles, type NewRoundSetup } from '@/lib/golf/round-session/start-form';

const setup = (overrides: Partial<NewRoundSetup['setup']> = {}, rest: Partial<NewRoundSetup> = {}): NewRoundSetup => ({
  setup: {
    courseName: 'Pinehurst No. 2',
    courseCity: '',
    courseState: '',
    courseRating: '',
    courseSlope: '',
    teesPlayed: 'Blue',
    roundType: 'practice',
    roundDate: '2020-01-01',
    ...overrides,
  },
  qualifierId: null,
  qualifierRoundNumber: null,
  ...rest,
});

describe('validateStartForm', () => {
  it('passes a plain practice round and names each way a form can fail', () => {
    expect(validateStartForm(setup())).toBeNull();
    expect(validateStartForm(setup({ courseName: '' }))).toBe('Please enter a course name');
    expect(validateStartForm(setup({ roundType: 'qualifier' }))).toBe('Please select a qualifier');
    expect(validateStartForm(setup({ roundType: 'qualifier' }, { qualifierId: 'q-1' }))).toBe(
      'Please select which round of the qualifier this is',
    );
    expect(validateStartForm(setup({ roundType: 'qualifier' }, { qualifierId: 'q-1', qualifierRoundNumber: 2 }))).toBeNull();
    expect(validateStartForm(setup({ courseRating: '49.9' }))).toBe('Course rating must be between 50.0 and 85.0');
    expect(validateStartForm(setup({ courseSlope: '156' }))).toBe('Course slope must be between 55 and 155');
    expect(validateStartForm(setup({ roundDate: '2999-01-01' }))).toBe('Round date cannot be in the future.');
  });
});

describe('validateStartHoles', () => {
  const card = (count: number) => Array.from({ length: count }, (_, i) => ({ holeNumber: i + 1, par: 4, yardage: 400 }));

  it('takes nine or eighteen holes with par 3 to 6 and a yardage of 1 to 999', () => {
    expect(validateStartHoles(card(9))).toBeNull();
    expect(validateStartHoles(card(18))).toBeNull();
    expect(validateStartHoles(card(12))).toBe('A round has 9 or 18 holes');
    expect(validateStartHoles([{ holeNumber: 1, par: 3, yardage: 1 }, ...card(8)])).toBeNull();
    expect(validateStartHoles([{ holeNumber: 1, par: 6, yardage: 999 }, ...card(8)])).toBeNull();
    expect(validateStartHoles([{ holeNumber: 1, par: 2, yardage: 400 }, ...card(8)])).toBe('Hole 1: par must be 3 to 6');
    expect(validateStartHoles([...card(8), { holeNumber: 9, par: 4, yardage: 0 }])).toBe('Hole 9 needs a yardage');
    expect(validateStartHoles([...card(8), { holeNumber: 9, par: 4, yardage: 1000 }])).toBe('Hole 9: 1000 yards is too long (999 at most)');
  });

  it('labels a hole by its place in the round, whatever number it carries', () => {
    const backNine = card(9).map((h) => ({ ...h, holeNumber: h.holeNumber + 9, yardage: h.holeNumber === 3 ? 0 : h.yardage }));
    expect(validateStartHoles(backNine)).toBe('Hole 3 needs a yardage');
  });
});

describe('the module boundary', () => {
  const dir = new URL('..', import.meta.url);

  it('is not a client module', () => {
    const source = readFileSync(new URL('start-form.ts', dir), 'utf8');
    expect(source).not.toMatch(/^\s*['"]use client['"]/m);
  });

  it('is re-exported by the engine', () => {
    const engine = readFileSync(new URL('use-new-round-session.ts', dir), 'utf8');
    expect(engine).toMatch(/export \{[^}]*\bvalidateStartForm\b[^}]*\bvalidateStartHoles\b[^}]*\} from '@\/lib\/golf\/round-session\/start-form'/);
    expect(engine).not.toContain('export function validateStartForm');
  });
});
