import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Settings › Preferences › Animations, on this device.
const prefs = vi.hoisted(() => ({ showAnimations: true }));
vi.mock('@/hooks/golf/use-appearance-preferences', () => ({ useAppearancePreferences: () => prefs }));

const { chMotionModeNow, useChMotionMode, useChReducedMotion } = await import('../reduced-motion');
const { CH_DUR, CH_FADE_MS, chFade } = await import('../motion');

const here = dirname(fileURLToPath(import.meta.url));
const css = (name: string) => readFileSync(resolve(here, '../../styles', name), 'utf8');

let osReduce = false;
beforeEach(() => {
  osReduce = false;
  prefs.showAnimations = true;
  vi.mocked(window.matchMedia).mockImplementation(
    (query: string) =>
      ({ matches: query === '(prefers-reduced-motion: reduce)' ? osReduce : false, media: query, onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() }) as unknown as MediaQueryList,
  );
});
afterEach(() => {
  document.documentElement.removeAttribute('data-motion');
});

/** The two reads a component makes, as it renders. */
function read(): { reduced: boolean; mode: string } {
  const out = { reduced: false, mode: '' };
  function Probe() {
    out.reduced = useChReducedMotion();
    out.mode = useChMotionMode();
    return null;
  }
  render(<Probe />).unmount();
  return out;
}

describe('CH-1608 reduced motion and Animations off (owner decision 2, OQ-15)', () => {
  it('CH-1608 full motion with neither; the OS Reduce Motion fades pages and sheets; Animations off is instant, whatever the OS says', () => {
    expect(read()).toEqual({ reduced: false, mode: 'full' });
    osReduce = true;
    expect(read()).toEqual({ reduced: true, mode: 'fade' });
    prefs.showAnimations = false;
    expect(read()).toEqual({ reduced: true, mode: 'off' });
    osReduce = false;
    expect(read()).toEqual({ reduced: true, mode: 'off' });
  });

  it('CH-1608 Reduce Motion fades over the quick beat (180ms); Animations off swaps at once', () => {
    expect(chFade('fade').duration).toBe(CH_DUR.quick);
    expect(chFade('full').duration).toBe(CH_DUR.quick);
    expect(chFade('off').duration).toBe(0);
    expect(CH_FADE_MS).toBe(180);
    // The page crossfade under Reduce Motion is the same beat in CSS (--ch-dur-vt-fade), in opacity only.
    expect(css('tokens.css')).toMatch(/--ch-dur-vt-fade:\s*180ms;/);
    const shell = css('shell.css');
    const at = shell.indexOf('/* Reduce Motion (owner decision 2');
    expect(at).toBeGreaterThan(-1);
    const block = shell.slice(at, shell.indexOf('/*', at + 2));
    expect(block!).toMatch(/view-transition-old\(ch-page\)\s*\{[^}]*animation:\s*var\(--ch-dur-vt-fade\)[^}]*ch-vt-out/);
    expect(block!).toMatch(/view-transition-new\(ch-page\)\s*\{[^}]*animation:\s*var\(--ch-dur-vt-fade\)[^}]*ch-vt-in/);
  });

  it('CH-1608 outside React the mode comes from <html data-motion="off"> first, then the media query', () => {
    expect(chMotionModeNow()).toBe('full');
    osReduce = true;
    expect(chMotionModeNow()).toBe('fade');
    document.documentElement.setAttribute('data-motion', 'off');
    expect(chMotionModeNow()).toBe('off');
    osReduce = false;
    expect(chMotionModeNow()).toBe('off');
  });
});
