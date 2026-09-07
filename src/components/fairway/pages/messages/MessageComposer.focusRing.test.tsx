// @vitest-environment jsdom
//
// G-45 / D-05 — the artboard's focus glow contradicted a documented WCAG fix.
//
// `Composer.dc.html:24`'s `.track-on` draws a two-layer soft glow built from
// `oklch(0.648 0.149 149.6)` — accent-500. `design-tokens.css:150-165` says in
// so many words why light theme must NOT use accent-500 for focus: it measures
// ~2.67:1 on the warm canvas against WCAG 2.2's 3:1 non-text minimum, the
// shared `fwFocusRing` helper had already hard-coded accent-600 for that
// reason, and 175 call sites reaching for `ring-border-focus` directly were
// "drawing a ring nobody with low vision could reliably find". The composer's
// `focus-within:border-accent-500` was one of those call sites.
//
// The owner's frozen call (audit/DECISIONS.md D-05): keep the tokens, take the
// artboard's geometry.
//
// BOTH SIDES MEASURED. The artboard's glow is parsed out of
// `Composer.dc.html` and the accent scale out of `design-tokens.css`, so the
// suite proves the CONFLICT is real — the artboard literal is accent-500 and
// the focus token is not — rather than taking the manifest's word for it. If
// either file moves, the premise under this fix is re-checked automatically.

import { createElement } from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MessageComposer } from './MessageComposer';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf-8');

const artboard = read('audit/reference/Composer.dc.html');
const tokens = read('src/styles/design-tokens.css');
const decisions = read('audit/DECISIONS.md');
const composerCode = read('src/components/fairway/pages/messages/MessageComposer.tsx')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter((line) => !line.trim().startsWith('//'))
  .join('\n');

const squash = (s: string) => s.replace(/\s+/g, ' ').trim();

/** The `.track-on` focus glow, as the artboard writes it. */
function trackOnShadow(): string {
  const value = artboard.match(/\.track-on\s*\{[^}]*box-shadow:\s*([^;]+);/)?.[1];
  expect(value, 'expected a .track-on box-shadow in Composer.dc.html').toBeDefined();
  return squash(value!);
}

/**
 * A light-theme custom property. Every name repeats in the dark block, so file
 * order matters: `first` is light, `last` is dark.
 */
function tokenValues(name: string): string[] {
  const all = [...tokens.matchAll(new RegExp(`${name}\\s*:\\s*([^;]+);`, 'g'))].map((m) =>
    squash(m[1] ?? ''),
  );
  expect(all.length, `expected ${name} in design-tokens.css`).toBeGreaterThan(0);
  return all;
}

const track = (container: HTMLElement) =>
  container.querySelector('.rounded-fw-lg.flex') as HTMLElement;

describe('G-45 — the conflict this fix resolves is real', () => {
  it('the artboard glow is built from accent-500', () => {
    // `--fw-color-accent-500: oklch(0.648 0.149 149.6)`; the artboard writes
    // the same colour with the alpha inside the parens, so compare on the
    // coordinates rather than on the whole function call.
    const accent500 = tokenValues('--fw-color-accent-500')[0]!;
    const coords = accent500.match(/oklch\(([^)/]+)\)/)?.[1]?.trim();
    expect(coords, 'expected accent-500 to be a bare oklch() colour').toBeDefined();

    // Both layers of the glow: same hue, two alphas.
    expect(trackOnShadow()).toContain(`oklch(${coords} / 0.30)`);
    expect(trackOnShadow()).toContain(`oklch(${coords} / 0.10)`);
  });

  it('but the light-theme focus token deliberately is NOT accent-500', () => {
    const [light] = tokenValues('--fw-color-border-focus');
    expect(light).toBe('var(--fw-color-accent-600)');
    expect(light).not.toBe('var(--fw-color-accent-500)');
  });

  it('and it is theme-dependent, which is why a literal cannot work', () => {
    const values = tokenValues('--fw-color-border-focus');
    expect(values.length).toBeGreaterThan(1);
    // Dark keeps accent-500 on purpose: there it is the LIGHTER green and the
    // one that earns contrast. Any single literal is wrong in one theme.
    expect(values[values.length - 1]).toBe('var(--fw-color-accent-500)');
  });

  it('rests on the decision the owner froze, not on a preference', () => {
    expect(decisions).toMatch(/D-05[\s\S]{0,200}keep the tokens, take the artboard's geometry/);
  });
});

describe('G-45 — what the composer draws', () => {
  it('no longer reaches for the accent-500 literal the token replaced', () => {
    expect(composerCode).not.toContain('focus-within:border-accent-500');
    expect(composerCode).not.toMatch(/focus-within:[a-z-]*accent-500/);
  });

  it('draws both glow layers from the focus TOKEN', () => {
    const { container } = render(
      createElement(MessageComposer, { onSend: vi.fn(async () => true) }),
    );
    const cls = track(container).className;
    expect(cls).toContain('focus-within:border-border-focus/30');
    expect(cls).toContain('var(--fw-color-border-focus)');
  });

  it('takes the artboard geometry — 1px at 30%, 4px at 10%', () => {
    const shadow = trackOnShadow();
    expect(shadow).toContain('0 0 0 1px');
    expect(shadow).toContain('0 0 0 4px');

    const { container } = render(
      createElement(MessageComposer, { onSend: vi.fn(async () => true) }),
    );
    const cls = track(container).className;
    // Inner layer at 30% is the border that already exists; outer layer at
    // 10% is the one new shadow.
    expect(cls).toContain('border-border-focus/30');
    expect(cls).toContain('0_0_0_4px');
    expect(cls).toContain('_10%,transparent');
  });

  it('reuses the alpha syntax the Tailwind bridge itself emits', () => {
    // `color-mix(in oklab, …)` — not a hand-rolled rgba or a channel triplet,
    // which against a raw var() emits no rule at all.
    expect(read('tailwind.config.ts')).toContain('color-mix(in oklab');
    expect(composerCode).toContain('color-mix(in_oklab,var(--fw-color-border-focus)');
  });

  it('drops the flat two-pixel ring it replaces', () => {
    const { container } = render(
      createElement(MessageComposer, { onSend: vi.fn(async () => true) }),
    );
    const cls = track(container).className;
    expect(cls).not.toContain('focus-within:ring-2');
  });

  it('keeps the ring off the field inside, so focus draws one shape', () => {
    // The track owns the focus treatment; the legacy Textarea's own
    // ring-offset would otherwise draw a second rounded rectangle inside it.
    expect(composerCode).toContain('focus-visible:ring-0');
    expect(composerCode).toContain('focus-visible:ring-offset-0');
  });
});
