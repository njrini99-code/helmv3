/**
 * G-32 — the artboard's values mostly already have tokens; the page just
 * wasn't using them.
 *
 * The headline one: the unread conversation row. `Main.dc.html` labels it in
 * its own markup — "unread row: cream card lifting off the champagne" — and
 * its box-shadow is byte-identical to `--fw-shadow-card`. The rail drew it
 * flat.
 *
 * Measured on both sides here rather than asserted as a literal, for the
 * reason the bubble-radius suite gives: a hardcoded shadow string would keep
 * passing if the token were retuned or a new artboard landed.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf-8');

const tokens = read('src/styles/design-tokens.css');
const artboard = read('audit/reference/Main.dc.html');
const rail = read('src/components/fairway/pages/messages/MessageConversationRail.tsx');
const config = read('tailwind.config.ts');

/**
 * Comment lines removed.
 *
 * Needed because the fixes here explain themselves by NAMING what they avoid —
 * the rail's comment says `shadow-card` is a trap and the shell's docstring
 * still describes a `bg-canvas` page. A whole-file negative search finds the
 * defect inside the very comment warning against it. (It did, on this suite's
 * first run.) Negative assertions read these.
 */
const stripComments = (src: string) =>
  src
    .split('\n')
    .filter((line) => {
      const t = line.trim();
      return !t.startsWith('*') && !t.startsWith('//') && !t.startsWith('/*');
    })
    .join('\n');

const railCode = stripComments(rail);

/** Collapse whitespace so a multi-line token declaration compares to one line. */
const flat = (s: string) => s.replace(/\s+/g, ' ').trim();

function shadowToken(name: string): string {
  const m = tokens.match(new RegExp(`--fw-shadow-${name}:([^;]+);`));
  const captured = m?.[1];
  expect(captured, `expected --fw-shadow-${name} in design-tokens.css`).toBeTypeOf('string');
  return flat(String(captured));
}

describe('G-32 — the unread row lift is an existing token, measured', () => {
  it('the artboard\'s unread-row shadow IS --fw-shadow-card', () => {
    const line = artboard
      .split('\n')
      .find((l) => l.includes('unread row'));
    expect(line, 'expected the artboard to label its unread row').toBeTruthy();

    // The labelled comment sits immediately above the row it describes.
    const idx = artboard.indexOf('unread row');
    const row = artboard.slice(idx, idx + 900);
    const shadow = row.match(/box-shadow:([^;"]+)/)?.[1];
    expect(shadow, 'expected a box-shadow on the unread row').toBeTypeOf('string');
    expect(flat(String(shadow))).toBe(shadowToken('card'));
  });

  it('the rail applies that token to the unread row', () => {
    expect(rail).toContain("!isSelected && hasUnread && 'bg-surface [box-shadow:var(--fw-shadow-card)]'");
  });

  it('does NOT use `shadow-card`, which is a different value entirely', () => {
    // The trap this guards: `shadow-card` resolves to a legacy cool-grey
    // shadow in tailwind.config.ts, and no utility bridges --fw-shadow-card at
    // all. A future "cleanup" replacing the arbitrary property with the
    // shorter-looking class would silently change the colour.
    // `--fw-shadow-card` legitimately ends in those characters, so the
    // token reference is removed before looking for the utility class.
    expect(railCode.replaceAll('--fw-shadow-card', '')).not.toMatch(/shadow-card/);
    expect(config).toContain("'card': '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)'");
    expect(config).not.toContain("'fw-card':");
  });

  it('selection still wins over the unread face', () => {
    // Both paint a background. If the unread branch were unconditional, an
    // open unread thread would render as a lifted card instead of a selected
    // row, and the two states would be indistinguishable.
    const idx = rail.indexOf('!isSelected && hasUnread');
    const after = rail.slice(idx, idx + 260);
    expect(after).toContain("isSelected\n          ? 'bg-surface-sunken/90");
  });
});

describe('G-32 — the page wash uses the token that was already wired', () => {
  it('layers the gradient OVER bg-canvas rather than replacing it', () => {
    // design-tokens.css says so explicitly: "layer it over the bg-canvas
    // color so any overscroll stays warm". The gradient's radial layer ends
    // at `transparent 78%`, so replacing the colour would leave bare ground.
    const shell = stripComments(read('src/components/fairway/pages/messages/FairwayMessages.tsx'));
    const loading = stripComments(read('src/app/golf/(dashboard)/dashboard/messages/loading.tsx'));
    const sites = (shell.match(/bg-canvas bg-canvas-gradient/g) ?? []).length
      + (loading.match(/bg-canvas bg-canvas-gradient/g) ?? []).length;
    expect(sites).toBe(4);
    expect(shell).not.toMatch(/bg-canvas(?! bg-canvas-gradient)(?![-\w])/);
    expect(loading).not.toMatch(/bg-canvas(?! bg-canvas-gradient)(?![-\w])/);
  });
});
