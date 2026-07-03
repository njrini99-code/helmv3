import { describe, it, expect } from 'vitest';
import {
  gradeColor,
  gradeLabel,
  isPlus,
  GRADE_TEXT_CLASS,
  GRADE_VAR,
  type GradeBand,
} from './grades';

describe('gradeColor — 20-80 ramp banding', () => {
  it('bands the low tier (20–40 → low)', () => {
    expect(gradeColor(20)).toBe('low');
    expect(gradeColor(30)).toBe('low');
    expect(gradeColor(40)).toBe('low');
    expect(gradeColor(44)).toBe('low');
  });

  it('bands the average tier (45–55 → avg)', () => {
    expect(gradeColor(45)).toBe('avg'); // lower boundary
    expect(gradeColor(50)).toBe('avg'); // MLB average
    expect(gradeColor(55)).toBe('avg'); // upper boundary
  });

  it('bands the plus tier (60–80 → plus)', () => {
    expect(gradeColor(56)).toBe('plus');
    expect(gradeColor(60)).toBe('plus');
    expect(gradeColor(80)).toBe('plus');
  });
});

describe('gradeLabel — scouting descriptors', () => {
  it('labels the boundary cases', () => {
    expect(gradeLabel(20)).toBe('POOR');
    expect(gradeLabel(45)).toBe('FRINGE');
    expect(gradeLabel(55)).toBe('ABOVE AVG');
    expect(gradeLabel(60)).toBe('PLUS');
    expect(gradeLabel(80)).toBe('ELITE');
  });

  it('labels 50 as league average', () => {
    expect(gradeLabel(50)).toBe('AVERAGE');
  });
});

describe('isPlus — 60+ is a plus tool', () => {
  it('is false below 60', () => {
    expect(isPlus(20)).toBe(false);
    expect(isPlus(55)).toBe(false);
    expect(isPlus(59)).toBe(false);
  });

  it('is true at 60 and above', () => {
    expect(isPlus(60)).toBe(true);
    expect(isPlus(80)).toBe(true);
  });
});

describe('static class + var maps stay in sync with the bands', () => {
  it('exposes a class and a var for every band', () => {
    const bands: GradeBand[] = ['low', 'avg', 'plus'];
    for (const band of bands) {
      expect(GRADE_TEXT_CLASS[band]).toBe(`text-grade-${band}`);
      expect(GRADE_VAR[band]).toBe(`var(--grade-${band})`);
    }
  });
});
