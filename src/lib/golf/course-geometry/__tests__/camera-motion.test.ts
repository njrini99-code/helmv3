import { describe, expect, it } from 'vitest';
import { interpolateCameraMotion } from '../camera-motion';

describe('camera motion', () => {
  it('eases a selected-shot focus without overshooting its zoom or pan target', () => {
    const start = { zoom: 1, pan: { x: 0, y: 0 } };
    const target = { zoom: 1.26, pan: { x: -42, y: 18 } };

    const middle = interpolateCameraMotion(start, target, .5);
    expect(middle.zoom).toBeGreaterThan(start.zoom);
    expect(middle.zoom).toBeLessThan(target.zoom);
    expect(middle.pan.x).toBeGreaterThan(target.pan.x);
    expect(middle.pan.x).toBeLessThan(start.pan.x);
    expect(middle.pan.y).toBeGreaterThan(start.pan.y);
    expect(middle.pan.y).toBeLessThan(target.pan.y);
    expect(interpolateCameraMotion(start, target, 2)).toEqual(target);
  });
});
