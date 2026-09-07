/**
 * G-49 (F14) — the bubbles draw flat where the artboard lights every surface.
 *
 * "Bubbles and canvas are flat single colors with zero box-shadow. The artboard
 * gives every surface a gradient + inset highlight + drop shadow. Hues match
 * closely; the depth system is simply absent." The manifest adds that this is
 * the same gap M03A found on unread rows (G-03) — "one systemic issue across
 * two lanes, not two". G-32 closed the rail half and the page wash; this is the
 * thread half.
 *
 * MEASURED ON BOTH SIDES, and that is the whole point of this suite. The claim
 * "`.lit` is byte-identical to `--fw-shadow-card`" is not asserted from memory:
 * both declarations are parsed — one out of `audit/reference/Bubbles.dc.html`,
 * one out of `src/styles/design-tokens.css` — normalised for whitespace, and
 * compared. If either moves, the token stops being the right answer and this
 * fails rather than shipping a value that no longer matches the design.
 *
 * The same comparison is what proves the OWN bubble genuinely needs an A03
 * request: `.lit-accent` is checked against every `--fw-shadow-*` token in the
 * file and must match none of them.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf-8');

const artboard = read('audit/reference/Bubbles.dc.html');
const tokens = read('src/styles/design-tokens.css');
const tailwind = read('tailwind.config.ts');
const source = read('src/components/fairway/pages/messages/MessageThreadPane.tsx');

/** Comment-stripped, block comments removed WHOLE — see the bubbleWidth suite. */
const code = source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter((line) => !line.trim().startsWith('//'))
  .join('\n');

/** Collapse whitespace so a multi-line CSS declaration compares to a one-line one. */
const norm = (s: string) => s.replace(/\s+/g, ' ').replace(/,\s+/g, ', ').trim();

/** An artboard shadow class's declared value. */
function artboardShadow(cls: string): string {
  const line = artboard.split('\n').find((l) => l.trim().startsWith(`.${cls} {`));
  const m = (line ?? '').match(/box-shadow:\s*([^;]+);/);
  expect(m, `expected a box-shadow on .${cls}`).not.toBeNull();
  return norm(m?.[1] ?? '');
}

/**
 * The LIGHT-theme value of a `--fw-shadow-*` token. The file redefines each one
 * under the dark theme further down, so only the first declaration is read.
 */
function shadowToken(name: string): string {
  const m = tokens.match(new RegExp(`--fw-shadow-${name}:([^;]+);`));
  expect(m, `expected --fw-shadow-${name}`).not.toBeNull();
  return norm(m?.[1] ?? '');
}

/** Every light-theme shadow token, keyed by name. */
const allShadowTokens = Object.fromEntries(
  [...tokens.matchAll(/--fw-shadow-([a-z-]+):([^;]+);/g)]
    .map(([, name, value]) => [name, norm(value ?? '')] as const)
    // matchAll walks the file in order, so the light values land first and the
    // dark redefinitions below them are dropped by this de-dupe.
    .filter(([name], i, arr) => arr.findIndex(([n]) => n === name) === i),
);

describe('G-49 — the incoming bubble uses a token that already matched exactly', () => {
  it('.lit and --fw-shadow-card are the same declaration, measured', () => {
    expect(artboardShadow('lit')).toBe(shadowToken('card'));
  });

  it('the incoming branch applies that token', () => {
    expect(code).toContain('[box-shadow:var(--fw-shadow-card)]');
  });

  it('does NOT use the `shadow-card` Tailwind class, which is a different value', () => {
    // The trap the rail's G-32 comment records: `shadow-card` is a legacy entry
    // in tailwind.config.ts, not a bridge to --fw-shadow-card.
    //
    // NOT `\bshadow-card\b` — a word boundary sits before a hyphen, so that
    // pattern matches inside `--fw-shadow-card` and can never fail. The same
    // false positive the G-29a suite hit on `text-body` vs `text-body-sm`.
    expect(code).not.toMatch(/(?<![-\w])shadow-card(?![-\w])/);
  });

  it('and the trap is real — tailwind bridges soft/flat/raise/pop, not card', () => {
    // If someone ever adds the bridge, this fails and the escape above can be
    // simplified. Until then the escape is the only correct spelling.
    expect(tailwind).toContain("'soft':          'var(--fw-shadow-soft)'");
    expect(tailwind).not.toContain("var(--fw-shadow-card)");
  });
});

describe('G-49 — the own bubble needs a variant no token expresses', () => {
  it('.lit-accent matches NO existing fw shadow token', () => {
    const accent = artboardShadow('lit-accent');
    for (const [name, value] of Object.entries(allShadowTokens)) {
      expect(accent, `--fw-shadow-${name} unexpectedly matches .lit-accent`).not.toBe(value);
    }
  });

  it('because its ambient layer is HUED, which no neutral shadow can carry', () => {
    // oklch(0.488 0.124 150 / 0.22) — a green cast under a green bubble. Every
    // --fw-shadow-* token is a neutral warm grey at 0.05-0.16 alpha.
    expect(artboardShadow('lit-accent')).toMatch(/oklch\(0\.488 0\.124 150 \/ 0\.22\)/);
  });

  it('and its inset is dimmed far below the card inset, which is why the card token cannot stand in', () => {
    const litInset = Number(artboardShadow('lit').match(/inset[^,]*oklch\(1 0 0 \/ ([\d.]+)\)/)?.[1]);
    const accentInset = Number(
      artboardShadow('lit-accent').match(/inset[^,]*oklch\(1 0 0 \/ ([\d.]+)\)/)?.[1],
    );
    expect(Number.isFinite(litInset)).toBe(true);
    expect(Number.isFinite(accentInset)).toBe(true);
    // Reusing --fw-shadow-card on the green bubble would paint the bright rim
    // the artboard deliberately dims — a visible defect, not a 1px absorption.
    expect(accentInset).toBeLessThan(litInset / 2);
  });

  it('ships shadow-soft as the interim, which carries no inset at all', () => {
    expect(code).toMatch(/\bshadow-soft\b/);
    expect(shadowToken('soft')).not.toContain('inset');
  });

  it('records the gap as an A03 request rather than hardcoding it', () => {
    const a03 = read('audit/A03-VARIANT-REQUESTS.md');
    expect(a03).toContain('lit-accent');
    // The hued ambient must not appear as a literal anywhere in the component.
    expect(code).not.toContain('0.488 0.124 150');
  });
});

describe('G-49 — both bubble sides are lit, and only via tokens', () => {
  it('applies a shadow on each branch of the same conditional', () => {
    expect(code).toContain("isOwn ? 'shadow-soft' : '[box-shadow:var(--fw-shadow-card)]'");
  });

  it('writes no raw shadow literal into the thread', () => {
    // Composing tokens inside the escape is fine and the day chip does exactly
    // that (`inset_0_1px_0_var(--fw-glass-border),var(--fw-shadow-pop)`). What
    // must never appear is a hand-typed colour, which would drift silently from
    // design-tokens.css the moment the palette moves.
    expect(code).not.toMatch(/box-shadow:[^'"`]*oklch\(/);
    expect(code).not.toMatch(/box-shadow:[^'"`]*rgba?\(/);
  });
});
