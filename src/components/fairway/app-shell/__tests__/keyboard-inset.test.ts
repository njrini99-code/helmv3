/**
 * The soft keyboard on iOS. The Capacitor WebView is configured
 * `resize: 'ionic'` and there is no <ion-app>, so it never resizes for the
 * keyboard; Mobile Safari does not resize its layout viewport either. Every
 * bottom-anchored surface therefore has to lay out against the two hooks the
 * provider publishes — `--keyboard-height` and `body.keyboard-open` — or the
 * keys cover it. Shenandoah, 2026-09-01/02: "I can't see what I'm typing" in
 * the messages composer, and the same on the round-entry distance box.
 *
 * These are contract tests over the source: each surface that must consume
 * the hooks, does.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');

describe('keyboard inset — who publishes it', () => {
  const provider = read('src/components/providers/CapacitorProvider.tsx');

  it('native: keyboardWillShow sets the height and the body flag; keyboardWillHide clears both', () => {
    expect(provider).toMatch(/keyboardWillShow[\s\S]*?classList\.add\('keyboard-open'\)[\s\S]*?--keyboard-height/);
    expect(provider).toMatch(/keyboardWillHide[\s\S]*?classList\.remove\('keyboard-open'\)[\s\S]*?--keyboard-height',\s*'0px'/);
  });

  it('web: visualViewport publishes the same two hooks, gated on a coarse pointer and not fooled by pinch-zoom', () => {
    expect(provider).toContain('window.visualViewport');
    expect(provider).toContain("matchMedia('(pointer: coarse)')");
    expect(provider).toMatch(/viewport\.scale > 1\.01 \? 0 :/);
    expect(provider).toMatch(/setProperty\('--keyboard-height'/);
    expect(provider).toMatch(/classList\.toggle\('keyboard-open'/);
  });
});

describe('keyboard inset — who consumes it', () => {
  it('the messages column always gives up room for the keyboard, in both mobile modes', () => {
    const src = read('src/components/fairway/pages/messages/FairwayMessages.tsx');

    // The shape changed from `max(bottom chrome, keyboard)` to
    // `chrome + max(0, keyboard - chrome)`. Same guarantee, different arithmetic:
    // the old form assumed the column owed the FULL bottom chrome, but AppShell
    // already reserves the tab bar's height in its own padding, so subtracting
    // it again cost ~200px of dead space. The keyboard now takes only what that
    // reservation has not already covered.
    //
    // There are two mobile budgets because the chrome differs: with a thread
    // open the tab bar is hidden and its padding collapsed (immersive), so only
    // the home indicator is owed; on the list the bar is up.
    const keyboardTerms = src.split('max(0px,calc(var(--keyboard-height,0px)').length - 1;
    expect(keyboardTerms).toBe(2);

    // The guarantee this test exists for: a column that keeps its full height
    // while the keyboard covers the composer is the bug.
    expect(src).not.toContain('100dvh-4rem-56px-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px)');
    expect(src).not.toMatch(/h-\[calc\(100dvh-4rem-env\(safe-area-inset-top,0px\)\)\]/);
  });

  it('the composer drops its home-indicator pad while the keyboard covers the home indicator', () => {
    const src = read('src/components/fairway/pages/messages/MessageComposer.tsx');
    expect(src).toContain('[.keyboard-open_&]:pb-4');
  });

  it('<body> grows by the keyboard height so a focused field on ANY page can be scrolled above it', () => {
    const css = read('src/app/globals.css');
    expect(css).toMatch(/body\.keyboard-open\s*\{\s*padding-bottom:\s*var\(--keyboard-height\);/);
    // Not duplicated on the shell wrapper — two pads would stack into dead space.
    expect(read('src/components/fairway/app-shell/AppShell.tsx')).not.toContain('[.keyboard-open_&]:!pb-');
  });
});
