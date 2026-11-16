import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CH_BUSY, CH_DUR, CH_DUR_MS, CH_EASE_IOS, CH_EASE_OUT, CH_SHEET, CH_SPRING, CH_SWIPE, chSpring } from '../lib/motion';

/**
 * The motion vocabulary (MOTION-AND-VISUAL 3.2): six durations, two curves and two loading beats in styles/tokens.css,
 * mirrored in lib/motion.ts, and one critically damped spring. What the rest of the tree may still use outside it is
 * held by the motion gate (motion-gate.test.ts, 'retired-token').
 */
const tokens = readFileSync(join(process.cwd(), 'src/clubhouse/styles/tokens.css'), 'utf8');
const token = (name: string) => tokens.match(new RegExp(`--ch-${name}:\\s*([^;]+);`))?.[1]?.trim();

describe('the motion vocabulary (3.2)', () => {
  it('six durations, the same in CSS, in seconds and in milliseconds', () => {
    expect(Object.keys(CH_DUR_MS)).toEqual(['press', 'quick', 'base', 'release', 'marks', 'reveal']);
    expect(CH_DUR_MS).toEqual({ press: 110, quick: 180, base: 260, release: 280, marks: 360, reveal: 520 });
    for (const [name, ms] of Object.entries(CH_DUR_MS)) {
      expect(token(`dur-${name}`), name).toBe(`${ms}ms`);
      expect(Math.round(CH_DUR[name as keyof typeof CH_DUR] * 1000), name).toBe(ms);
    }
  });

  it('two curves: the iOS curve travels, ease-out presses down and leaves', () => {
    expect(token('ease-ios')).toBe(`cubic-bezier(${CH_EASE_IOS.join(', ')})`);
    expect(token('ease-out')).toBe(`cubic-bezier(${CH_EASE_OUT.join(', ')})`);
    expect(CH_EASE_IOS).toEqual([0.32, 0.72, 0, 1]);
    expect(CH_EASE_OUT).toEqual([0.22, 1, 0.36, 1]);
    // The old name is the same curve, kept while its uses fall.
    expect(token('ease')).toBe('var(--ch-ease-out)');
  });

  it('loading: nothing for 150 ms, then a skeleton held at least 300 ms', () => {
    expect(CH_BUSY).toEqual({ delay: 150, min: 300 });
    expect(token('dur-busy-delay')).toBe(`${CH_BUSY.delay}ms`);
    expect(token('dur-busy-min')).toBe(`${CH_BUSY.min}ms`);
  });

  it('one spring, critically damped: the gesture spring a released drag finishes on', () => {
    expect(CH_SPRING.damping).toBeCloseTo(2 * Math.sqrt(CH_SPRING.stiffness * CH_SPRING.mass), 1);
    expect(chSpring('gesture')).toMatchObject({ stiffness: expect.closeTo(CH_SPRING.stiffness, 1), damping: expect.closeTo(CH_SPRING.damping, 1), mass: CH_SPRING.mass });
  });

  it('the swipe and sheet thresholds', () => {
    expect(CH_SWIPE).toEqual({ edge: 20, commitProgress: 0.5, commitVelocity: 0.7 });
    expect(CH_SHEET).toEqual({ commitFraction: 0.25, commitVelocity: 0.4 });
  });
});
