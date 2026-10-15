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

describe('A-29: the Ask sheet is ready before it is asked for', () => {
  const src = readFileSync(join(__dirname, '../shell/AskSheet.tsx'), 'utf8');
  it('loads its chunk when the page is idle and mounts closed when the key is approached', () => {
    expect(src).toMatch(/requestIdleCallback\(\(\) => void loadAskSheetBody\(\)/);
    expect(src).toMatch(/onPointerEnter=\{warm\}\s+onFocus=\{warm\}\s+onPointerDown=\{warm\}/);
  });
});

describe('review 2026-10-15: a section change fades through, and a faded bar hides its buttons', () => {
  it('the new page waits for the whole fade out, so the two snapshots never overlap', () => {
    const tokens = css('tokens.css');
    expect(tokens).toContain('--ch-dur-vt-gap: var(--ch-dur-vt-out);');
    expect(css('shell.css')).toMatch(/::view-transition-new\(ch-page\) \{\s*animation: var\(--ch-dur-vt-in\) var\(--ch-ease-vt-in\) var\(--ch-dur-vt-gap\) both ch-vt-in;/);
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
