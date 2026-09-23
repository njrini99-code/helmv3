/**
 * G-50a — the day separator is a glass chip, sitting INLINE in the thread.
 *
 * The chip's MATERIAL is still `Thread.dc.html:53`'s glass, and the first
 * describe below still measures it against the tokens byte for byte. Its
 * PLACEMENT is not. G-50a read `Thread.dc.html:51`'s authored comment — "the
 * day chip FLOATS over the thread on glass, not inline in it" — as a rule about
 * every day boundary. It is not: Thread positions that chip against the SCROLL
 * CONTAINER (`position: absolute; top: 12px`), one chip pinned at the head of
 * the pane, which is a current-day indicator. Ported onto each boundary it
 * became an absolute element over a zero-height row and landed on top of the
 * sender name of the group beneath it — visible in the owner's screenshot of a
 * group thread, "TODAY" overlapping "Alexis Bennett".
 *
 * `Group.dc.html:44` is the artboard that matches a group thread, and it draws
 * the same boundary chip inline: `display: flex; justify-content: center;
 * padding: 0 0 16px 0`. Inline is what these assertions pin, because inline is
 * what structurally cannot collide. The two `h-px flex-1` hairlines the
 * original shipped code used stay gone — neither artboard draws them.
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
const groupArtboard = read('audit/reference/Group.dc.html');
const tokens = read('src/styles/design-tokens.css');
const source = read('src/components/fairway/pages/messages/MessageThreadPane.tsx');

/** Comment-stripped, so the fix's own docstring cannot satisfy an assertion.
 *  Block comments are removed WHOLE first: a JSX comment opens `{/*`, which
 *  trims to start with `{`, so the line filter alone lets its body through. */
const code = source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter((line) => {
    const t = line.trim();
    return !t.startsWith('*') && !t.startsWith('//') && !t.startsWith('/*');
  })
  .join('\n');

const CHIP_ROW = 'pointer-events-none flex justify-center pb-4';
const chipSurfaceStart = code.indexOf(`<div className="${CHIP_ROW}"`);
const chipSurfaceEnd = code.indexOf('<m.div', chipSurfaceStart);
const chipSurfaceCode = code.slice(chipSurfaceStart, chipSurfaceEnd);

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

describe('G-50a — the component inlines the chip instead of floating it', () => {
  it('no longer draws the two hairlines that bound the label into the list', () => {
    expect(chipSurfaceCode).not.toContain('<span className="h-px flex-1 bg-border-subtle" />');
  });

  it('sits IN FLOW and centred — it cannot overlap the group below it', () => {
    // `Group.dc.html:44` — `display: flex; justify-content: center; padding: 0
    // 0 16px 0`. Assert the artboard still says so, then that the row does.
    const groupChipRow = groupArtboard
      .split('\n')
      .find((l) => l.includes('justify-content: center') && l.includes('padding: 0 0 16px 0'));
    expect(groupChipRow, 'Group.dc.html no longer draws an inline centred chip row').toBeDefined();
    expect(chipSurfaceStart).toBeGreaterThanOrEqual(0);
    expect(chipSurfaceEnd).toBeGreaterThan(chipSurfaceStart);
    expect(chipSurfaceCode).toContain(CHIP_ROW);
    // The regression this replaces: an absolute chip over a zero-height row
    // painted on top of the next group's sender name.
    expect(chipSurfaceCode).not.toContain('absolute -top-3 left-0 right-0');
    expect(chipSurfaceCode).not.toContain('relative z-raised h-0');
  });

  it('keeps role="separator" — the a11y semantics a visual change quietly loses', () => {
    expect(chipSurfaceCode).toContain('role="separator"');
  });

  it('references the glass TOKENS, never the banned legacy glass-* utilities', () => {
    expect(chipSurfaceCode).toContain('[background:var(--fw-glass-bg)]');
    expect(chipSurfaceCode).toContain('blur(var(--fw-blur-glass))_saturate(var(--fw-glass-saturate))');
    expect(chipSurfaceCode).toContain('var(--fw-shadow-pop)');
    // `.claude/rules/design-system.md` bans `glass-*`; those are the legacy
    // cream-100 utilities, unrelated to the --fw-glass-* tokens above.
    expect(chipSurfaceCode).not.toMatch(/\bbg-glass\b|\bglass-standard\b|\bbackdrop-blur-glass\b/);
  });

  it("carries the artboard's padding, radius and tracking", () => {
    // 6px 14px → py-1.5 px-3.5; 9999px → rounded-full; 0.06em tracking.
    // Material stays Thread's glass chip; only the placement took Group's.
    expect((chipLine ?? '')).toContain('padding: 6px 14px');
    expect(chipSurfaceCode).toContain('rounded-full px-3.5 py-1.5');
    expect((chipLine ?? '')).toContain('letter-spacing: 0.06em');
    expect(chipSurfaceCode).toContain('tracking-[0.06em]');
  });

  it('keeps both glass filter declarations on the date chip surface', () => {
    // The action popup is independently licensed glass. Count only the date
    // chip's standard and WebKit declarations so adding that popup cannot
    // invalidate this chip contract.
    const sites = chipSurfaceCode.match(/backdrop-filter:/g) ?? [];
    expect(sites.length).toBe(2); // the standard property and its -webkit- pair
  });
});
