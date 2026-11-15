import { describe, expect, it, vi } from 'vitest';
import { CH_FADE_MS, CH_SPRINGS, chSpringCurve } from '../../../../lib/motion';
import { FADE_MS, KEYBOARD_EASE, KEYBOARD_MS, carryRunning, msAnimate, resume, sheetCloseCurve } from '../messages-motion';

const node = () => {
  const el = document.createElement('div');
  (el as unknown as { animate: unknown }).animate = vi.fn(() => ({ currentTime: 0 }));
  return el;
};

describe('messages motion module', () => {
  it('names the artifact numbers from the app tokens', () => {
    expect(CH_SPRINGS.launch).toEqual({ visualDuration: 0.5, bounce: 0.2 });
    expect(chSpringCurve('launch').ms).toBe(812);
    expect(KEYBOARD_MS).toBe(480);
    expect(KEYBOARD_EASE).toBe('cubic-bezier(0.32, 0.72, 0, 1)');
    expect(FADE_MS).toBe(CH_FADE_MS);
    expect(sheetCloseCurve.ms).toBe(280);
  });

  it('plays a spring, stacking with composite add', () => {
    const el = node();
    msAnimate(el, [{ transform: 'translateY(20px)' }, { transform: 'none' }], 'launch', { composite: 'add' });
    expect(el.animate).toHaveBeenCalledWith(expect.any(Array), expect.objectContaining({ duration: 812, composite: 'add' }));
  });

  it('under Reduce Motion crossfades an opacity motion and drops one without opacity or with rd null', () => {
    const el = node();
    msAnimate(el, [{ opacity: 0, transform: 'scale(.4)' }, { opacity: 1, transform: 'none' }], 'pop', { reduced: true });
    expect(el.animate).toHaveBeenCalledWith([{ opacity: 0 }, { opacity: 1 }], expect.objectContaining({ duration: FADE_MS, easing: 'linear' }));
    const none = node();
    expect(msAnimate(none, [{ transform: 'a' }, { transform: 'b' }], 'pop', { reduced: true })).toBeNull();
    expect(msAnimate(none, [{ opacity: 0 }, { opacity: 1 }], 'pop', { reduced: true, rd: null })).toBeNull();
    expect(none.animate).not.toHaveBeenCalled();
  });

  it('carries a running animation across a re-render by id', () => {
    const root = document.createElement('div');
    const old = document.createElement('div');
    old.id = 'm1';
    root.append(old);
    (old as unknown as { getAnimations: unknown }).getAnimations = () => [
      { playState: 'running', currentTime: 120, effect: { getKeyframes: () => [{ opacity: 0 }, { opacity: 1 }], getTiming: () => ({ duration: 300 }) } },
    ];
    const carried = carryRunning(root, '[id]');
    expect(carried).toHaveLength(1);
    const fresh = document.createElement('div');
    fresh.id = 'm1';
    (fresh as unknown as { animate: unknown }).animate = vi.fn(() => ({ currentTime: 0 }));
    const next = document.createElement('div');
    next.append(fresh);
    (globalThis as { CSS?: unknown }).CSS = { escape: (s: string) => s };
    expect(resume(next, carried)).toBe(1);
    expect(fresh.animate).toHaveBeenCalled();
  });
});
