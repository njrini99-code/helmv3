import { describe, it, expect } from 'vitest';
import { composeDriverPrescription } from './assemble';

describe('composeDriverPrescription', () => {
  it('joins a fact, a driver, and a specific action into one clean sentence set', () => {
    const out = composeDriverPrescription({
      fact: "You're making 48% from 10-15 ft (PGA Tour ~36%).",
      driver: 'this is a strength — your mid-range stroke is already Tour-level',
      action: 'protect it: keep your pre-putt routine consistent under tournament pace',
    });
    expect(out).toContain("You're making 48% from 10-15 ft");
    expect(out).toContain('strength');
    expect(out).toContain('protect it');
    expect(out).not.toMatch(/\s{2,}/);
    expect(out).not.toMatch(/\.\./);
  });

  it('omits a missing driver/action without leaving dangling punctuation', () => {
    const out = composeDriverPrescription({ fact: 'Sand save rate: 31%.', action: '' });
    expect(out).toBe('Sand save rate: 31%.');
  });

  it('passes the assembled prose through sanitizeProse (no authoring artifacts leak)', () => {
    const out = composeDriverPrescription({
      fact: 'Tour average is ~50% (Research doc §2).',
      action: 'practice 20 bunker shots to a tucked pin',
    });
    expect(out).not.toContain('Research doc');
    expect(out).toContain('practice 20 bunker shots');
  });

  it('always ends each provided clause with terminal punctuation', () => {
    const out = composeDriverPrescription({
      fact: 'You average a bogey on par 4s',
      driver: 'that is your single biggest scoring leak',
      action: 'tighten approach dispersion from 150-175 yds',
    });
    expect(out.endsWith('.')).toBe(true);
    expect((out.match(/\./g) ?? []).length).toBe(3);
  });
});
