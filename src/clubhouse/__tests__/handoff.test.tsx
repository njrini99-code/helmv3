import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dropHandoffCurtain, liftHandoffCurtain } from '../lib/handoff';

/** The hand-off curtain: the fold's last frame, held over the route change until the dashboard's frame mounts. */

const media = (phone: boolean, reduced: boolean) =>
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce') ? reduced : q.includes('max-width') ? phone : false, media: q, addEventListener() {}, removeEventListener() {} }));

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb(0), 0));
  document.body.innerHTML = '';
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const curtain = () => document.getElementById('ch-handoff-curtain');

describe('the hand-off curtain', () => {
  it('draws the dashboard’s frame: the sidebar’s green and an ivory canvas at the sidebar’s edge', () => {
    media(false, false);
    dropHandoffCurtain();
    const c = curtain()!;
    expect(c.getAttribute('aria-hidden')).toBe('true');
    expect(c.style.pointerEvents).toBe('none');
    const canvas = c.firstElementChild as HTMLElement;
    expect(canvas.style.left).toBe('240px');
    expect(canvas.style.top).toBe('8px');
    expect(canvas.style.borderRadius).toBe('14px');
  });

  it('is one curtain, however often it is dropped', () => {
    media(false, false);
    dropHandoffCurtain();
    dropHandoffCurtain();
    expect(document.querySelectorAll('#ch-handoff-curtain')).toHaveLength(1);
  });

  it('on the phone it is the canvas alone, full bleed', () => {
    media(true, false);
    dropHandoffCurtain();
    expect(curtain()!.children).toHaveLength(0);
  });

  it('lifts when the dashboard says it is there (reduced motion: at once)', async () => {
    media(false, true);
    dropHandoffCurtain();
    liftHandoffCurtain();
    await vi.advanceTimersByTimeAsync(700);
    expect(curtain()).toBeNull();
  });

  it('lifts on its own if the dashboard never mounts, so a wrong destination is never covered', async () => {
    media(false, true);
    dropHandoffCurtain();
    await vi.advanceTimersByTimeAsync(4800);
    expect(curtain()).toBeNull();
  });

  it('does nothing on an ordinary page load, with no curtain', () => {
    media(false, false);
    expect(() => liftHandoffCurtain()).not.toThrow();
    expect(curtain()).toBeNull();
  });
});
