// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { pourOrigin } from '../useQcMotion';

/**
 * 07 M-OPEN: the panel pours from the key's centre, measured in the panel's own untransformed box "with offsetLeft /
 * offsetTop chains, never getBoundingClientRect, which includes a running scale". A retarget (M-RETARGET) measures
 * while the panel is mid-scale, so a rect read there moves the origin and the panel drifts off the key.
 */

const box = (over: Partial<Record<'offsetLeft' | 'offsetTop' | 'clientLeft' | 'clientTop', number>> & { parent?: HTMLElement | null; rect?: { left: number; top: number } }) => {
  const el = document.createElement('div');
  for (const k of ['offsetLeft', 'offsetTop', 'clientLeft', 'clientTop'] as const) Object.defineProperty(el, k, { value: over[k] ?? 0 });
  Object.defineProperty(el, 'offsetParent', { value: over.parent ?? null });
  el.getBoundingClientRect = vi.fn(() => ({ left: over.rect?.left ?? 0, top: over.rect?.top ?? 0 }) as DOMRect);
  return el;
};

afterEach(() => vi.restoreAllMocks());

describe('pourOrigin', () => {
  it('on the phone the fixed panel is measured from the viewport: 390pt gives 302px -28px', () => {
    // The panel sits 10pt in and 104 down; the key's centre is at 312, 76.
    const panel = box({ offsetLeft: 10, offsetTop: 104 });
    expect(pourOrigin(panel, { x: 312, y: 76 })).toBe('302px -28px');
  });

  it('never reads the panel’s own rect, so a running scale cannot move the origin', () => {
    const panel = box({ offsetLeft: 10, offsetTop: 104, rect: { left: 105, top: 250 } }); // mid-pour, at scale .5
    expect(pourOrigin(panel, { x: 312, y: 76 })).toBe('302px -28px');
    expect(panel.getBoundingClientRect).not.toHaveBeenCalled();
  });

  it('on the desktop the panel is measured from its offset parent, which is not moving', () => {
    // Offset parent at 0,0 with no border; the 432pt panel 14pt from the right of a 1280pt page, 62 down.
    const parent = box({ rect: { left: 0, top: 0 } });
    const panel = box({ offsetLeft: 1280 - 14 - 432, offsetTop: 62, parent });
    expect(pourOrigin(panel, { x: 834 + 323, y: 28 })).toBe('323px -34px');
  });

  it('adds the offset parent’s place and border', () => {
    const parent = box({ rect: { left: 40, top: 20 }, clientLeft: 1, clientTop: 1 });
    const panel = box({ offsetLeft: 9, offsetTop: 9, parent });
    expect(pourOrigin(panel, { x: 150, y: 10 })).toBe('100px -20px');
  });
});
