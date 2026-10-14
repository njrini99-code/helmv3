import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import { Plus } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';

/**
 * Fixes from the 2026-10-14 motion and accessibility audit (Playwright WebKit on the local stack); ids are the audit
 * ledger's. Each case fails on the code before its fix.
 */

vi.mock('../lib/haptics', () => ({ haptic: vi.fn() }));
const track = vi.hoisted(() => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('../lib/track', () => track);

import { Button } from '../ui/Button';
import { chLoadMotionFeatures } from '../lib/motion-features';

const css = (file: string) => readFileSync(join(__dirname, '../styles', file), 'utf8');

describe('A-10: a shortcut hint is not part of the name', () => {
  it('names the button by its words and announces the key through aria-keyshortcuts', () => {
    render(<Button variant="primary" leftIcon={Plus} kbd="N">New event</Button>);
    const button = screen.getByRole('button', { name: 'New event' });
    expect(button.getAttribute('aria-keyshortcuts')).toBe('N');
  });
  it('leaves a button without a hint alone', () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole('button', { name: 'Save' }).hasAttribute('aria-keyshortcuts')).toBe(false);
  });
});

describe('A-01: the animation features are retried, and a lasting failure shows the page', () => {
  it('a failed chunk load is retried and the features arrive', async () => {
    const features = { renderer: () => null };
    const load = vi.fn().mockRejectedValueOnce(new Error('Loading chunk features-max failed')).mockResolvedValue(features);
    await expect(chLoadMotionFeatures(load as never, [0, 1, 1])).resolves.toBe(features);
    expect(load).toHaveBeenCalledTimes(2);
    expect(track.chReport).not.toHaveBeenCalled();
  });
  it('after the last try it reports once and marks the page so nothing waits at opacity 0', async () => {
    const load = vi.fn().mockRejectedValue(new Error('Load failed'));
    const settled = vi.fn();
    void chLoadMotionFeatures(load as never, [0, 1, 1]).then(settled, settled);
    await vi.waitFor(() => expect(track.chReport).toHaveBeenCalledTimes(1));
    expect(load).toHaveBeenCalledTimes(3);
    expect(document.documentElement.hasAttribute('data-ch-motion-failed')).toBe(true);
    expect(settled).not.toHaveBeenCalled();
    expect(css('base.css')).toMatch(/html\[data-ch-motion-failed\] \.ch-root \[style\*='opacity'\] \{\s*opacity: 1 !important;/);
    delete document.documentElement.dataset.chMotionFailed;
  });
});

describe('A-11/A-12: reduced motion reaches the review scroll and dialog scrims', () => {
  it('RoundReview scrolls through chScrollIntoView, never a raw smooth scroll', () => {
    const src = readFileSync(join(__dirname, '../screens/rounds/RoundReview.tsx'), 'utf8');
    expect(src).not.toMatch(/behavior: 'smooth'/);
    expect(src.match(/chScrollIntoView\(document\.getElementById\('ch-rz-card'\), reduced\)/g)).toHaveLength(2);
  });
  it('the OS reduced-motion floor covers ::backdrop in a rule of its own', () => {
    const base = css('base.css');
    const block = base.slice(base.indexOf("@media (prefers-reduced-motion: reduce) {\n  [data-ui='clubhouse'] main[aria-busy='true']"));
    expect(block).toMatch(/\n  \.ch-root \*::backdrop \{\n    transition-duration: 1ms !important;\n    animation-duration: 1ms !important;/);
  });
});

describe('A-13: skeletons sweep on the compositor at every width', () => {
  it('no skeleton animates background-position, and the sheen slides by transform', () => {
    const shell = css('shell.css');
    expect(shell).not.toMatch(/@keyframes ch-shimmer \{/);
    expect(shell).not.toMatch(/animation: ch-shimmer var/);
    expect(shell).toMatch(/\.ch-skel::before \{[^}]*transform: translateX\(-100%\);[^}]*animation: ch-shimmer-x/);
    expect(shell).toMatch(/@keyframes ch-skel-breathe \{\s*50% \{\s*opacity: 0\.55;/);
  });
});

describe('A-31: Back returns a page to where it was left', () => {
  const src = readFileSync(join(__dirname, '../shell/RouteFrame.tsx'), 'utf8');
  it('the leaving page stops recording in the commit that swaps it out (a layout effect)', () => {
    const at = src.indexOf('const record = () => scrolled.set(scrollKey');
    const effect = src.lastIndexOf('use', at);
    expect(src.slice(effect, effect + 'useLayoutEffect'.length)).toBe('useLayoutEffect');
  });
  it('the restore holds the place while the page settles, until the person scrolls', () => {
    expect(src).toMatch(/const until = Date\.now\(\) \+ 1500;/);
    expect(src).toMatch(/\['wheel', 'touchstart', 'keydown', 'pointerdown'\]/);
    expect(src).not.toMatch(/if \(!there && Date\.now\(\) < until\) frame = requestAnimationFrame\(step\);/);
  });
});

describe('A-25: focus handed back by code does not open a hover card', () => {
  it('marks the element for that one focus, then clears the mark', async () => {
    const { chFocusQuietly } = await import('../lib/focus-quietly');
    const el = document.createElement('button');
    document.body.append(el);
    let markedDuringFocus = false;
    el.addEventListener('focus', () => (markedDuringFocus = el.hasAttribute('data-ch-peek-quiet')));
    chFocusQuietly(el);
    expect(document.activeElement).toBe(el);
    expect(markedDuringFocus).toBe(true);
    await Promise.resolve();
    expect(el.hasAttribute('data-ch-peek-quiet')).toBe(false);
    el.remove();
  });
  it('Peek skips a quiet focus; dialogs and the calendar hand focus back quietly', () => {
    const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');
    expect(read('ui/Peek.tsx')).toMatch(/if \(target\.closest\?\.\('\[data-ch-peek-quiet\]'\)\) return;/);
    expect(read('lib/dialog-lifetime.ts')).toMatch(/chFocusQuietly\(target\)/);
    expect(read('screens/calendar/Calendar.tsx')).toMatch(/chFocusQuietly\(el\)/);
  });
});
