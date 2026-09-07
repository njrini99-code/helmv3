/**
 * G-50a — the day separator is a floating glass chip, not an inline hairline row.
 *
 * `Thread.dc.html:51` carries an authored comment — "the day chip FLOATS over
 * the thread on glass, not inline in it" — and `DECISIONS.md` takes that over
 * `Group.dc.html`'s unannotated inline bordered pill, on the rule that a stated
 * intent beats a variant that does not say why it looks that way. The shipped
 * code was neither: a flex row with two `h-px flex-1` hairlines binding the
 * label into the list.
 *
 * MEASURED ON BOTH SIDES. Every assertion reads the artboard's literal value out
 * of `audit/reference/Thread.dc.html` AND the token's value out of
 * `src/styles/design-tokens.css`, then compares them — so the suite fails if
 * either side moves. A hardcoded expected string would only pin the component.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf-8');

const artboard = read('audit/reference/Thread.dc.html');
const tokens = read('src/styles/design-tokens.css');
const source = read('src/components/fairway/pages/messages/MessageThreadPane.tsx');

/** Comment-stripped, so the fix's own docstring cannot satisfy an assertion. */
const code = source
  .split('\n')
  .filter((line) => {
    const t = line.trim();
    return !t.startsWith('*') && !t.startsWith('//') && !t.startsWith('/*');
  })
  .join('\n');

/** The chip's own markup — the `<span class="glass" …>TODAY</span>` line. */
const chipLine = artboard.split('\n').find((l) => l.includes('>TODAY<'));

/** The `.glass` rule the chip's class resolves to. */
const glassRule = artboard.split('\n').find((l) => l.trim().startsWith('.glass {'));

/** Read a `--fw-*` declaration's value out of the LIGHT block (first match). */
function token(name: string): string {
  const m = tokens.match(new RegExp(`^\\s*${name}:\\s*([^;]+);`, 'm'));
  expect(m, `expected ${name} in design-tokens.css`).not.toBeNull();
  return (m?.[1] ?? '').replace(/\s+/g, ' ').trim();
}

describe('G-50a — the artboard chip and the tokens agree', () => {
  it('has an artboard chip and a .glass rule to measure', () => {
    expect(chipLine).toBeDefined();
    expect(glassRule).toBeDefined();
  });

  it('--fw-glass-bg resolves to the artboard glass background, byte for byte', () => {
    // The token is written through --fw-glass-tint, so resolve one level.
    const tint = token('--fw-glass-tint');
    const resolved = token('--fw-glass-bg').replace('var(--fw-glass-tint)', tint);
    expect(glassRule).toContain(`background: ${resolved}`);
  });

  it('--fw-blur-glass and --fw-glass-saturate match the artboard filter', () => {
    const blur = token('--fw-blur-glass').replace(/\s*\/\*.*$/, '').trim();
    const sat = token('--fw-glass-saturate').replace(/\s*\/\*.*$/, '').trim();
    expect(glassRule).toContain(`backdrop-filter: blur(${blur}) saturate(${sat})`);
  });

  it('--fw-shadow-pop matches the chip shadow below its inset specular', () => {
    const pop = token('--fw-shadow-pop').replace(/\s+/g, ' ');
    // The chip's own shadow is `inset …, <pop>`. Normalise whitespace so the
    // token file's column alignment does not decide the comparison.
    const chipShadow = (chipLine ?? '').replace(/\s+/g, ' ');
    expect(chipShadow).toContain(pop);
  });

  it("the chip's ink is the token the component uses, not a literal", () => {
    // The artboard writes oklch(0.444 0.014 65); text-text-secondary maps to it.
    const secondary = token('--fw-color-text-secondary');
    const warmRef = secondary.startsWith('var(')
      ? token(`--${secondary.slice(6, -1)}`)
      : secondary;
    expect((chipLine ?? '').replace(/\s+/g, ' ')).toContain(`color: ${warmRef}`);
  });
});

describe('G-50a — the component floats the chip instead of inlining it', () => {
  it('no longer draws the two hairlines that bound the label into the list', () => {
    expect(code).not.toContain('<span className="h-px flex-1 bg-border-subtle" />');
  });

  it('contributes no layout height — it floats OVER the thread', () => {
    // `h-0` plus an absolutely-positioned chip. If someone reinstates an
    // in-flow row, the chip is inline again and G-50a silently reverts.
    expect(code).toContain('pointer-events-none relative z-raised h-0');
    expect(code).toContain('absolute -top-3 left-0 right-0');
  });

  it('keeps role="separator" — the a11y semantics a visual change quietly loses', () => {
    const idx = code.indexOf('pointer-events-none relative z-raised h-0');
    expect(idx).toBeGreaterThan(-1);
    expect(code.slice(idx, idx + 200)).toContain('role="separator"');
  });

  it('references the glass TOKENS, never the banned legacy glass-* utilities', () => {
    const idx = code.indexOf('pointer-events-none relative z-raised h-0');
    const block = code.slice(idx, idx + 1200);
    expect(block).toContain('[background:var(--fw-glass-bg)]');
    expect(block).toContain('blur(var(--fw-blur-glass))_saturate(var(--fw-glass-saturate))');
    expect(block).toContain('var(--fw-shadow-pop)');
    // `.claude/rules/design-system.md` bans `glass-*`; those are the legacy
    // cream-100 utilities, unrelated to the --fw-glass-* tokens above.
    expect(block).not.toMatch(/\bbg-glass\b|\bglass-standard\b|\bbackdrop-blur-glass\b/);
  });

  it("carries the artboard's padding, radius and tracking", () => {
    const idx = code.indexOf('pointer-events-none relative z-raised h-0');
    const block = code.slice(idx, idx + 1200);
    // 6px 14px → py-1.5 px-3.5; 9999px → rounded-full; 0.06em tracking.
    expect((chipLine ?? '')).toContain('padding: 6px 14px');
    expect(block).toContain('rounded-full px-3.5 py-1.5');
    expect((chipLine ?? '')).toContain('letter-spacing: 0.06em');
    expect(block).toContain('tracking-[0.06em]');
  });

  it('does not license glass anywhere else in the file', () => {
    // DECISIONS.md bounds the licence to this chip: "does not license glass on
    // any larger surface". One backdrop-filter site, and it is the chip's.
    const sites = code.match(/backdrop-filter:/g) ?? [];
    expect(sites.length).toBe(2); // the standard property and its -webkit- pair
  });
});
