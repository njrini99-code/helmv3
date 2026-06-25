import { describe, it, expect } from 'vitest';
import { hoverLift, tapPress, hoverScale } from '../motion';

describe('baseball motion helpers — reduced-motion gating', () => {
  describe('hoverLift', () => {
    it('returns undefined when reduced motion is on', () => {
      expect(hoverLift(true)).toBeUndefined();
    });

    it('returns a scale+y target when reduced motion is off', () => {
      const target = hoverLift(false);
      expect(target).toMatchObject({ scale: 1.03, y: -2 });
      expect(target?.transition).toBeDefined();
    });

    it('honors custom scale/y options', () => {
      expect(hoverLift(false, { scale: 1.1, y: -1 })).toMatchObject({
        scale: 1.1,
        y: -1,
      });
    });

    it('still returns undefined under reduced motion even with options', () => {
      expect(hoverLift(true, { scale: 1.2, y: -4 })).toBeUndefined();
    });

    it('treats null/undefined reduce (SSR first-render) as not-reduced', () => {
      expect(hoverLift(null)).toBeDefined();
      expect(hoverLift(undefined)).toBeDefined();
    });
  });

  describe('tapPress', () => {
    it('returns undefined when reduced motion is on', () => {
      expect(tapPress(true)).toBeUndefined();
    });

    it('returns a scale-down target when reduced motion is off', () => {
      expect(tapPress(false)).toEqual({ scale: 0.97 });
    });

    it('honors a custom scale', () => {
      expect(tapPress(false, 0.95)).toEqual({ scale: 0.95 });
    });
  });

  describe('hoverScale', () => {
    it('returns undefined when reduced motion is on', () => {
      expect(hoverScale(true)).toBeUndefined();
    });

    it('returns a scale target when reduced motion is off', () => {
      expect(hoverScale(false, 1.2)).toEqual({ scale: 1.2 });
    });
  });
});
