/**
 * Overlays and the soft keyboard. The Capacitor WebView is configured
 * `resize: 'ionic'` with no <ion-app>, so it never resizes for the keyboard;
 * Mobile Safari never resizes its layout viewport either. An overlay pinned to
 * the bottom of the screen therefore sits under the keys the moment a field
 * inside it is tapped. Audit 2026-09-02: 27 sheets/modals carry text inputs.
 *
 * Contract: every overlay edge that touches the bottom of the screen lifts by
 * the `--keyboard-height` CapacitorProvider publishes, and marks itself
 * `data-fw-keyboard-aware` so the provider's global scroll-into-view leaves
 * the page behind it alone.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');

describe('Sheet', () => {
  const src = read('src/components/fairway/overlays/Sheet.tsx');

  it('lifts every bottom-touching edge by the keyboard height', () => {
    expect(src).toContain("'bottom-[var(--keyboard-height,0px)]");
    // bottom, left and right sheets share the lift; a top sheet does not touch the keyboard.
    expect(src.split('KEYBOARD_LIFT +').length - 1).toBe(3);
    expect(src).not.toMatch(/'inset-y-0 (left|right)-0/);
    expect(src).not.toMatch(/'inset-x-0 bottom-0 /);
  });

  it('shrinks the bottom sheet cap by the same amount so it still clears the status bar', () => {
    expect(src).toContain('max-h-[calc(88dvh-var(--keyboard-height,0px))]');
  });

  it('tells the provider it handles its own keyboard clearance', () => {
    expect(src).toMatch(/<Drawer\.Content[\s\S]*?data-fw-keyboard-aware/);
  });
});

describe('ModalShell', () => {
  const src = read('src/components/fairway/overlays/ModalShell.tsx');

  it('uses the keyboard as its bottom inset when the keyboard is taller than the safe area', () => {
    expect(src).toContain(
      "'max(1rem, env(safe-area-inset-bottom), calc(var(--keyboard-height, 0px) + 1rem))'",
    );
    expect(src).toMatch(/bottom: MODAL_BOTTOM_INSET/);
    expect(src).toMatch(/maxHeight: `calc\(100dvh - max\(1rem, env\(safe-area-inset-top\)\) - \$\{MODAL_BOTTOM_INSET\}\)`/);
  });

  it('tells the provider it handles its own keyboard clearance', () => {
    expect(src).toContain('data-fw-keyboard-aware');
  });
});

describe('CoachHelm phone drawer', () => {
  it('lifts by the keyboard height and drops the home-indicator pad while the keyboard is up', () => {
    const drawer = read('src/components/golf/coachhelm/chat/CoachHelmDrawer.tsx');
    expect(drawer).toContain('bottom-[var(--keyboard-height,0px)]');
    expect(drawer).toContain('data-fw-keyboard-aware');
    const composer = read('src/components/golf/coachhelm/chat/PromptComposer.tsx');
    expect(composer).toContain('[.keyboard-open_&]:pb-0');
  });

  it('re-pins the transcript to the newest answer when its box shrinks', () => {
    const chat = read('src/components/golf/coachhelm/chat/CoachHelmChat.tsx');
    expect(chat).toMatch(/new ResizeObserver\([\s\S]*?el\.scrollTop = el\.scrollHeight/);
  });
});
