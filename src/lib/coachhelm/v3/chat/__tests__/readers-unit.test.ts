import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { unitOf } from '../readers';

/**
 * A Stats row's unit comes from its label: "SG …" at the start, a gap anywhere, or "hole" at the end reads in strokes.
 * Each anchor holds only its own word, so a label with "SG" or "hole" somewhere else is not a strokes figure.
 */
const unit = (label: string, u = '') => unitOf({ label, unit: u } as Parameters<typeof unitOf>[0]);

describe('the unit a Stats row reads in', () => {
  it('reads strokes for a strokes-gained label, a gap and a per-hole figure', () => {
    expect(unit('SG putting')).toBe('strokes');
    expect(unit('sg approach')).toBe('strokes');
    expect(unit('Gap to team')).toBe('strokes');
    expect(unit('Strokes per hole')).toBe('strokes');
  });

  it('holds each anchor to its own end of the label', () => {
    expect(unit('XSG putting')).toBe('count');
    expect(unit('Team SG putting')).toBe('count');
    expect(unit('SGputting')).toBe('count');
    expect(unit('Per hole average')).toBe('count');
    expect(unit('Holes played')).toBe('count');
  });

  it('leaves the other units as they were', () => {
    expect(unit('Fairways hit', '%')).toBe('percent');
    expect(unit('Proximity', ' ft')).toBe('feet');
    expect(unit('Scoring avg')).toBe('score');
    expect(unit('Putts per round')).toBe('count');
  });
});
