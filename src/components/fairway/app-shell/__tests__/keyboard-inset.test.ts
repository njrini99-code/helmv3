/**
 * The soft keyboard on iOS. The Capacitor WebView is configured
 * `resize: 'ionic'` and there is no <ion-app>, so it never resizes for the
 * keyboard; Mobile Safari does not resize its layout viewport either. Every
 * bottom-anchored surface therefore has to lay out against the two hooks the
 * provider publishes — `--keyboard-height` and `body.keyboard-open` — or the
 * keys cover it. Shenandoah, 2026-09-01/02: "I can't see what I'm typing" in
 * the messages composer, and the same on the round-entry distance box.
 * (Fairway's messages column and composer, pinned here until Fairway retired
 * on 2026-11-14, are gone; Clubhouse's Messages owns its own composer.)
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
  it('<body> grows by the keyboard height so a focused field on ANY page can be scrolled above it', () => {
    const css = read('src/app/globals.css');
    expect(css).toMatch(/body\.keyboard-open\s*\{\s*padding-bottom:\s*var\(--keyboard-height\);/);
    // Not duplicated on the shell wrapper — two pads would stack into dead space.
    expect(read('src/components/fairway/app-shell/AppShell.tsx')).not.toContain('[.keyboard-open_&]:!pb-');
  });
});
