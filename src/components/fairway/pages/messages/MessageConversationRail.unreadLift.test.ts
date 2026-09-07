/**
 * G-32 — the artboard's values mostly already have tokens; the page just
 * wasn't using them.
 *
 * The headline one WAS the unread conversation row. `Main.dc.html` labels it
 * in its own markup — "unread row: cream card lifting off the champagne" —
 * and its box-shadow is byte-identical to `--fw-shadow-card`. The rail drew
 * it flat, and G-32 gave it the card.
 *
 * THAT PART IS NOW REVERSED, and this suite is re-anchored rather than
 * deleted (the G-49a precedent: assert the absence and cite why).
 *
 * G-32's diagnosis was right — read and unread were indistinguishable — and
 * the shadow was a free exact-token match. What the artboard could not show
 * is what the treatment does to a real inbox: it is a specimen, and it never
 * stacks two flat rows consecutively. Measured at 390x844 with six
 * conversations, box gaps were a uniform 6px but PERCEIVED gaps were not.
 * Card-to-card the eye lands on the card edges and reads 6px. Flat-to-flat
 * there is no edge, so it reads text-to-text: 12px padding + 6px gap + 12px
 * padding = 30px, five times larger. Rows measured 80px carded against 72px
 * flat on top of that. Five competing cadences in one list.
 *
 * DECISIONS.md G-50b governs: take the rule, not the specimens. The rule is
 * "unread reads stronger than read", and the repo already ships that rule in
 * a dense list without touching the box — `FairwayQualifierLeaderboard.tsx`
 * tints its leader row `bg-accent-50/60` inside a `divide-y` list. So unread
 * is now a fill; the geometry is uniform; a hairline carries the separation.
 *
 * The artboard measurement below is KEPT, because the fact it records is
 * still true and still the reason `shadow-card` must never be substituted for
 * the token anywhere on this surface.
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

  it('the rail no longer lifts the unread row off the list', () => {
    // The reversal, pinned. A per-row shadow or radius reintroduces the two
    // box sizes and the 6px-vs-30px perceived cadence this surface was
    // rebuilt to remove.
    expect(railCode).not.toContain('var(--fw-shadow-card)');
    expect(railCode).not.toMatch(/rounded-fw-md border-0 p-3/);
  });

  it('expresses unread as a fill inside a divided list instead', () => {
    expect(railCode).toContain("!isSelected && hasUnread && 'bg-surface'");
    // Deliberately NOT the leaderboard's accent tint. This row already spends
    // accent three times (unread Badge, group glyph, timestamp), and tinting
    // it accent as well made the badge and glyph disappear into their own
    // background. The structure is borrowed; the colour is not.
    expect(railCode).not.toContain("hasUnread && 'bg-accent");
    // Every conversation list on this surface is divided, not gapped: the
    // hairline is what separates rows now, and it costs no vertical space, so
    // one cadence survives regardless of which rows are unread.
    expect(railCode).not.toContain('flex flex-col gap-1.5');
    const lists = railCode.match(/<ul className="divide-y divide-border-subtle">/g) ?? [];
    expect(lists.length).toBe(3);
  });

  it('gives every row the same box, whatever its state', () => {
    // The three things that made rows differ, each pinned with its measured
    // reason. Any one of them coming back reintroduces two row heights or two
    // perceived cadences.
    //
    // 1. Radius. Button's base is `rounded-full`; without an explicit
    //    override the unread tint paints as a pill and the divider run gets
    //    rounded ends.
    expect(railCode).toContain('rounded-none border-0 p-3');
    // 2. Row height. The avatar is 48px and the row is pinned to it, so the
    //    text block can never decide the height.
    expect(railCode).toContain('<div className="flex h-12 items-center gap-3">');
    // 3. The badge's line box. `text-[11px]` sets only a font-size, so the
    //    badge inherited the row's 24px line-height and rendered 28px against
    //    its own 20px `min-h-5` — 8px straight into the row height, which is
    //    exactly the 80-vs-72 that was measured.
    expect(railCode).toContain("className=\"flex-shrink-0 leading-none\"");
  });

  it('is the same treatment the repo already ships for a marked row', () => {
    // Not invented here. If the leaderboard's idiom changes, this surface's
    // justification changes with it and someone should look at both.
    const leaderboard = read(
      'src/components/fairway/pages/qualifiers/FairwayQualifierLeaderboard.tsx',
    );
    expect(leaderboard).toContain('divide-y divide-border-subtle');
    expect(leaderboard).toContain("'bg-accent-50/60'");
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
    // open unread thread would render tinted instead of selected and the two
    // states would be indistinguishable.
    const idx = railCode.indexOf('!isSelected && hasUnread');
    expect(idx).toBeGreaterThan(-1);
    const after = railCode.slice(idx, idx + 320);
    expect(after).toContain('isSelected');
    expect(after).toContain('bg-surface-sunken');
    // The selected marker is a leading accent rule painted as an inset
    // shadow, so it adds no width and shifts no text in a flush list.
    expect(after).toContain('inset_3px_0_0_0_var(--fw-color-accent-500)');
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
