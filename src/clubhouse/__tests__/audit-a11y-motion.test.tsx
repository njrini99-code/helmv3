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
    expect(block).toMatch(/\n {2}\.ch-root \*::backdrop \{\n {4}transition-duration: 1ms !important;\n {4}animation-duration: 1ms !important;/);
  });
});

// A-13 moved the sheen onto the compositor; MOTION-AND-VISUAL 3.9 and 3.12 then retired the sheen and the pulse: a
// skeleton is static, and its one animation is the busy wait (no frames run, it only keeps the block hidden for 150 ms).
describe('A-13, 3.9: skeletons are static at every width', () => {
  it('no skeleton sweeps, breathes or animates background-position', () => {
    const shell = css('shell.css');
    expect(shell).not.toMatch(/@keyframes ch-shimmer/);
    expect(shell).not.toMatch(/@keyframes ch-skel-breathe/);
    expect(shell).not.toMatch(/\.ch-skel::before \{/);
    expect(shell).not.toMatch(/200vw 100% fixed/);
    expect(shell).toMatch(/@keyframes ch-busy-wait \{\s*from \{\s*visibility: hidden;\s*\}\s*\}/);
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

describe('A-18: three sheets leave on their exit instead of unmounting', () => {
  const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');
  it('Edit shot, the phone Evidence sheet and the submit overlay stay mounted and close through open', () => {
    expect(read('screens/rounds/track/RoundTracking.tsx')).toMatch(/<EditShotSheet\s+open=\{editOpen\}/);
    expect(read('screens/rounds/track/RoundTracking.tsx')).not.toMatch(/t\.showEditModal && t\.editingShot && t\.editFormData && \(/);
    expect(read('screens/coachhelm/chat/Ask.tsx')).toMatch(/<AskEvidencePanel open=\{evidenceOpen\}[^>]*phone /);
    expect(read('screens/coachhelm/chat/EvidencePanel.tsx')).toMatch(/<Modal open=\{open\}/);
    expect(read('screens/rounds/entry/RoundRuntime.tsx')).toMatch(/<SubmitOverlay\s+open=\{overlayOpen\}/);
    expect(read('screens/rounds/track/round-sheets.tsx')).toMatch(/useDialogLifetime\(open, \{ direction: 'center', surfaceSelector: '\.ch-rt-subm' \}\)/);
  });
});

describe('review 2026-10-15: a page change never shows two pages, and a faded bar hides its buttons', () => {
  it('only the desktop crossfades, old and new together; the phone fade-through is gone (S4.4, S4.8)', () => {
    const tokens = css('tokens.css');
    expect(tokens).not.toContain('--ch-dur-vt-gap');
    expect(css('shell.css')).toMatch(/::view-transition-new\(ch-page\) \{\s*animation: var\(--ch-dur-vt-in\) var\(--ch-ease-vt-in\) both ch-vt-in;/);
  });
  it('switching or a route skeleton takes the old bar buttons out of Tab and VoiceOver, after their fade', () => {
    const shell = css('shell.css');
    const at = shell.indexOf(".ch-topbar[data-switching] :is(.ch-topbar__actions, .ch-topbar__team, .ch-pbar__right),");
    const rule = shell.slice(at, shell.indexOf('}', at));
    expect(rule).toMatch(/main\[aria-busy='true'\]\[aria-label\^='Loading'\]/);
    expect(rule).toMatch(/opacity: 0;\s*visibility: hidden;/);
    expect(rule).toMatch(/visibility 0s linear var\(--ch-dur-press\);/);
    expect(shell).toMatch(/\.ch-topbar \.ch-pbar__right \{\s*transition:\s*opacity var\(--ch-dur-quick\) var\(--ch-ease\),\s*visibility 0s;/);
  });
});

describe('overnight polish 2026-10-15: ink on the green stages', () => {
  it('the Home form card label outranks the Ledger h2 ink (forest on forest was 1.2:1 in light)', () => {
    // main[data-canopy] h2 is (0,2,2); the card's own label must be more specific.
    expect(css('home.css')).toMatch(/\[data-ui='clubhouse'\] \.ch-h-form \.ch-h-form__lead h2 \{[^}]*color: var\(--ch-stage-ink-soft\);/);
  });
  it('the calendar plates are green in both themes, so their ink never follows --ch-ivory-50 (dark in dark mode)', () => {
    const cal = css('calendar.css');
    for (const sel of ['.ch-in__today {', "main[data-canopy] .ch-in__today h2.ch-in__title {", '.ch-in__plate {', "main[data-canopy] .ch-in__plate h2.ch-in__title {", '.ch-in__chip {']) {
      const at = cal.indexOf(sel);
      expect(at, sel).toBeGreaterThan(-1);
      expect(cal.slice(at, cal.indexOf('}', at)), sel).not.toMatch(/color: var\(--ch-ivory-50\)/);
    }
  });
});

describe('overnight polish 2026-10-15: dark mode keeps day-only surfaces whole', () => {
  it('the Stats stage keeps the day palette at night (it turned mint under dark ink)', () => {
    const stats = css('stats.css');
    const at = stats.indexOf("html[data-fw-theme='dark'] .ch-st .ch-sgt {");
    expect(at).toBeGreaterThan(-1);
    const rule = stats.slice(at, stats.indexOf('}', at));
    for (const t of ['--ch-green-700: #0f4a2f;', '--ch-green-900: #082b1c;', '--ch-ivory-100: #f4f2ea;', '--ch-ivory-400: #c9c2b1;', '--ch-control-bg:', '--ch-well-bg:']) expect(rule).toContain(t);
  });
  it('the sidebar plate has its own night material and ink, not a half-flipped day gradient', () => {
    const tokens = css('tokens.css');
    const dark = tokens.slice(tokens.indexOf("html[data-fw-theme='dark'] [data-ui='clubhouse'] {"));
    expect(dark.slice(0, dark.indexOf('\n}'))).toMatch(/--ch-nav-well-bg: linear-gradient\(180deg, #24432f, #1a3524\);[\s\S]*--ch-nav-well-ink: #f3efe6;/);
    expect(css('shell.css')).toMatch(/color: var\(--ch-nav-well-ink, var\(--ch-green-800\)\);/);
  });
});

describe('MOTION-AND-VISUAL 3.12 (owner, 15 Nov 2026): the now line is still', () => {
  it('its dot and the phone pill no longer breathe: the only loop is the working indicator', () => {
    const cal = css('calendar.css');
    expect(cal).not.toMatch(/ch-now-breathe|ch-now-pill|--ch-dur-live|\binfinite\b/);
    expect(cal).not.toMatch(/\.ch-wk__now::after|\.ch-calm-now span::before/);
  });
});

describe('owner 2026-10-15: a sheet rises from the bottom, never part way', () => {
  it('holds the rise and the scrim at their first frame until two frames have painted', async () => {
    const { renderHook } = await import('@testing-library/react');
    const { useDialogLifetime } = await import('../lib/dialog-lifetime');
    const dialog = document.createElement('dialog');
    const panel = document.createElement('div');
    panel.className = 'ch-modal__panel';
    dialog.append(panel);
    document.body.append(dialog);
    dialog.showModal ??= function (this: HTMLDialogElement) { this.setAttribute('open', ''); };
    dialog.close ??= function (this: HTMLDialogElement) { this.removeAttribute('open'); };
    const frames: FrameRequestCallback[] = [];
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => (frames.push(cb), frames.length));
    renderHook(() => {
      const life = useDialogLifetime(true, { surfaceSelector: '.ch-modal__panel' });
      (life.ref as { current: HTMLDialogElement | null }).current = dialog;
      return life;
    });
    // The ref is attached after the first render here, so open it the way Modal's commit does.
    const { rerender } = renderHook(({ o }) => {
      const life = useDialogLifetime(o, { surfaceSelector: '.ch-modal__panel' });
      (life.ref as { current: HTMLDialogElement | null }).current = dialog;
      return life;
    }, { initialProps: { o: false } });
    dialog.removeAttribute('open');
    rerender({ o: true });
    expect(panel.hasAttribute('data-ch-hold')).toBe(true);
    expect(dialog.hasAttribute('data-ch-hold')).toBe(true);
    // The scrim is held clear by its opacity (A9), not a paused keyframe.
    expect(dialog.style.getPropertyValue('--ch-scrim-a')).toBe('0');
    frames.shift()?.(0);
    expect(panel.hasAttribute('data-ch-hold')).toBe(true);
    while (frames.length) frames.shift()?.(16);
    expect(panel.hasAttribute('data-ch-hold')).toBe(false);
    expect(dialog.hasAttribute('data-ch-hold')).toBe(false);
    expect(dialog.style.getPropertyValue('--ch-scrim-a')).toBe('1');
    expect(css('controls.css')).toMatch(/\.ch-root \[data-ch-hold\] \{\s*animation-play-state: paused;/);
    raf.mockRestore();
    dialog.remove();
  });
});
