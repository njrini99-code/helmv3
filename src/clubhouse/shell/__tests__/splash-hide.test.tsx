import { afterEach, describe, expect, it, vi } from 'vitest';
import { SPLASH_HIDE_SCRIPT } from '../SplashHide';

/** A15: the inline splash hide reaches the native SplashScreen plugin two frames after it runs, and does nothing in a browser. */

const run = () => new Function(SPLASH_HIDE_SCRIPT)();
afterEach(() => {
  delete (window as { Capacitor?: unknown }).Capacitor;
  vi.useRealTimers();
});

describe('Shell · splash hide on first paint (A15)', () => {
  it('in the app: hides the splash on the second frame, with the fade CapacitorProvider uses', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame'] });
    const nativePromise = vi.fn(() => Promise.resolve());
    (window as { Capacitor?: unknown }).Capacitor = { isNativePlatform: () => true, nativePromise };
    run();
    vi.advanceTimersToNextFrame();
    expect(nativePromise).not.toHaveBeenCalled();
    vi.advanceTimersToNextFrame();
    expect(nativePromise).toHaveBeenCalledWith('SplashScreen', 'hide', { fadeOutDuration: 250 });
  });

  it('in a browser, or a bridge without the call: nothing, and nothing thrown', () => {
    expect(run).not.toThrow();
    const nativePromise = vi.fn();
    (window as { Capacitor?: unknown }).Capacitor = { isNativePlatform: () => false, nativePromise };
    expect(run).not.toThrow();
    (window as { Capacitor?: unknown }).Capacitor = { isNativePlatform: () => true };
    expect(run).not.toThrow();
    expect(nativePromise).not.toHaveBeenCalled();
  });
});
