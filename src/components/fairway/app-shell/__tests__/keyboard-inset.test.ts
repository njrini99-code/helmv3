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
  it('immersive mobile conversations hide every shell chrome layer', () => {
    const css = read('src/app/globals.css');

    expect(css).toMatch(/body\[data-fw-immersive\] \[data-slot='fw-topbar'\][\s\S]*?display:\s*none/);
    expect(css).toMatch(/body\[data-fw-immersive\] \[data-slot='fairway-hub-subnav'\][\s\S]*?display:\s*none/);
    expect(css).toMatch(/body\[data-fw-immersive\] \[data-slot='fw-bottom-nav'\][\s\S]*?display:\s*none/);
  });

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
    // Assert the GUARANTEE (both mobile budgets yield to the keyboard), not one
    // literal arithmetic shape. This counted occurrences of
    // `max(0px,calc(var(--keyboard-height,0px)` and expected exactly 2, so it
    // failed on 2026-09-04 when the thread branch's term became the SIMPLER
    // `max(0px,var(--keyboard-height,0px))` — correct, because that surface no
    // longer subtracts the bottom inset and therefore has nothing to net
    // against. The two budgets are allowed to differ; what is not allowed is
    // either one ignoring the keyboard.
    // Scope to the `mobileShowChat` ternary — the two CONVERSATION budgets.
    // Everything else in this file with a 100dvh height is either a `md:`
    // desktop pane or the no-team EmptyState, which centres its content and
    // has neither a composer nor a keyboard to yield to.
    //
    // Identified by what FOLLOWS the height: a conversation budget is the
    // scrolling column and is immediately `flex-col overflow-hidden`. The
    // EmptyState is `items-center justify-center`.
    //
    // Not by matching quoted strings — this source is full of prose apostrophes
    // in comments, so a naive /'[^']*'/ mis-pairs quotes and matches NOTHING,
    // which is a gate that passes by being empty.
    const mobileHeights = [...src.matchAll(/(?<!md:)h-\[calc\(100dvh(?:(?!\]).)*\](.{0,30})/g)]
      .filter((m) => m[1]?.includes('flex-col'))
      .map((m) => m[0]);
    expect(mobileHeights, 'expected a thread budget and a list budget').toHaveLength(2);
    for (const h of mobileHeights) {
      expect(h, `mobile conversation surface must yield to the keyboard: ${h}`).toContain('--keyboard-height');
    }

    // The guarantee this test exists for: a column that keeps its full height
    // while the keyboard covers the composer is the bug.
    expect(src).not.toContain('100dvh-4rem-56px-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px)');
    expect(src).not.toMatch(/h-\[calc\(100dvh-4rem-env\(safe-area-inset-top,0px\)\)\]/);
  });

  it('the composer drops its home-indicator pad while the keyboard covers the home indicator', () => {
    const src = read('src/components/fairway/pages/messages/MessageComposer.tsx');

    // Assert the INVARIANT, not a spacing value. This used to pin the literal
    // string `[.keyboard-open_&]:pb-4`, which made it fail on 2026-09-04 for a
    // composer that still had exactly the behaviour the test is named after —
    // only the number had changed. A gate that fires on a padding tweak and is
    // silent on the actual regression is measuring the wrong thing.
    //
    // What must hold: the resting pad reserves the home indicator, and the
    // keyboard-open override does NOT — because when the keyboard is up it is
    // covering the home indicator, and reserving space for both stacks a dead
    // band above the keyboard.
    // `[\s'"\`]` not `\s`: the composer's className moved into a cn() call on
    // 2026-09-04, so the utility is now preceded by a quote rather than a
    // space. The class was unchanged; only what sits to its left moved.
    const resting = src.match(/[\s'"`]pb-\[calc\([^\]]*env\(safe-area-inset-bottom\)[^\]]*\)\]/);
    expect(resting, 'composer must reserve the home indicator at rest').not.toBeNull();

    // ...and it must be the ONLY thing that does. The open-thread surface in
    // FairwayMessages used to subtract the same inset from its height while
    // the composer padded by it, reserving the home indicator twice — which
    // is the blank band under the composer (spec §7). Reserve it in one place.
    const shell = read('src/components/fairway/pages/messages/FairwayMessages.tsx');
    const threadHeight = shell.match(/\? 'flex h-\[calc\(100dvh[^\]]*\]/);
    expect(threadHeight, 'open-thread surface must set its own height').not.toBeNull();
    expect(
      threadHeight?.[0],
      'the open-thread surface must NOT also subtract the bottom inset — the composer owns it',
    ).not.toContain('safe-area-inset-bottom');

    const keyboardOpen = src.match(/\[\.keyboard-open_&\]:pb-[\w.[\]-]+/);
    expect(keyboardOpen, 'composer must override its bottom pad when the keyboard is open').not.toBeNull();
    expect(
      keyboardOpen?.[0],
      'the keyboard-open pad must NOT re-add the safe-area inset',
    ).not.toContain('safe-area-inset-bottom');
  });

  it('<body> grows by the keyboard height so a focused field on ANY page can be scrolled above it', () => {
    const css = read('src/app/globals.css');
    expect(css).toMatch(/body\.keyboard-open\s*\{\s*padding-bottom:\s*var\(--keyboard-height\);/);
    // Not duplicated on the shell wrapper — two pads would stack into dead space.
    expect(read('src/components/fairway/app-shell/AppShell.tsx')).not.toContain('[.keyboard-open_&]:!pb-');
  });
});
