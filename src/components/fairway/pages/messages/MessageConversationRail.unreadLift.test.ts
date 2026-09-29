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
    // Block comments removed WHOLE, before the line filter. A line filter alone
    // is not enough: a JSX `{/* … *\u002f}` opens on a line that trims to `{`,
    // so neither the opener nor the prose lines under it match any prefix and
    // the entire body leaks into the searched text. That is not hypothetical —
    // it broke two negative assertions here the moment a JSX comment explained
    // which radius and shadow the card avoids, which is precisely the failure
    // mode this helper's docstring already describes.
    // `MessageThreadPane.bubbleWidth.test.ts` strips blocks this way for the
    // same reason; the two now agree.
    .replace(/\/\*[\s\S]*?\*\//g, '')
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

  /** The ConversationRow className list — the row's own styling, nothing else. */
  function rowClassList(): string {
    const start = railCode.indexOf("'group block h-auto");
    expect(start, "expected the row's class list").toBeGreaterThan(-1);
    const end = railCode.indexOf(')}', start);
    return railCode.slice(start, end);
  }

  it('the rail no longer lifts the unread row off the list', () => {
    // The reversal, pinned, and scoped to the ROW. A per-row shadow or radius
    // reintroduces the two box sizes and the 6px-vs-30px perceived cadence
    // this surface was rebuilt to remove. The LIST is allowed a shadow — that
    // is where the owner's depth request landed; see the depth test below.
    const row = rowClassList();
    expect(row).not.toContain('var(--fw-shadow-card)');
    expect(row).not.toMatch(/rounded-fw-md/);
  });

  it('expresses unread as a fill inside a divided list instead', () => {
    expect(railCode).toContain("!isSelected && hasUnread && 'bg-elevated'");
    // Deliberately NOT the leaderboard's accent tint. This row already spends
    // accent three times (unread Badge, group glyph, timestamp), and tinting
    // it accent as well made the badge and glyph disappear into their own
    // background. The structure is borrowed; the colour is not.
    expect(railCode).not.toContain("hasUnread && 'bg-accent");
    // Every conversation list on this surface is divided, not gapped: the
    // hairline is what separates rows now, and it costs no vertical space, so
    // one cadence survives regardless of which rows are unread.
    expect(railCode).not.toContain('flex flex-col gap-1.5');
    const lists = railCode.match(/divide-y divide-border-subtle/g) ?? [];
    expect(lists.length).toBe(3);
  });

  it('puts the depth on the list, never back on the row', () => {
    // The owner asked for depth after the flattening, and this is where it
    // is allowed to live. The two triage lists are raised cards; the rows
    // inside them stay identical boxes, so the cadence the flattening bought
    // survives. A shadow on the ROW is what this whole suite forbids.
    const cards = railCode.match(
      /divide-y divide-border-subtle overflow-hidden rounded-card bg-surface shadow-raise/g,
    ) ?? [];
    expect(cards.length).toBe(2);
    // RE-ANCHORED onto ONE radius token and ONE shadow token. The first
    // attempt composed `--fw-shadow-card` over `--fw-shadow-soft` on
    // `rounded-fw-lg`, and the owner rejected it as "doing too much" — so the
    // count assertion above is what still does the work here, and these two
    // pins are what keep the composite from creeping back:
    //
    //   • `rounded-fw-lg` is 28px and its token comment reserves it for
    //     "modals, sheets, hero plinths, glass bars"; `--fw-radius-card`'s
    //     says "THE card radius". A list card taking the sheet radius was a
    //     token misuse, not a taste call.
    //   • `card` and `soft` each carry a `0 1px 2px` CONTACT layer. Stacked
    //     they read ~0.11 at 2px blur — a hard dark edge at the card's foot,
    //     which is the "resting on" tell and the opposite of floating.
    //     `--fw-shadow-raise`'s own comment names the state the owner asked
    //     for: "popovers / floating glass".
    expect(railCode).not.toContain('rounded-fw-lg');
    expect(railCode).not.toContain('var(--fw-shadow-soft)');
    expect(tokens).toContain('--fw-radius-card: 1.25rem;');
    expect(tokens).toMatch(/--fw-shadow-raise:[\s\S]*?floating glass/);
    // A mapped utility, not a bracket — `shadow-raise` resolves to the fw
    // token in tailwind.config.ts. The prohibition below stands regardless:
    // no hand-typed colour may enter a box-shadow on this surface.
    expect(config).toContain("'raise':         'var(--fw-shadow-raise)'");
    expect(railCode).not.toMatch(/box-shadow:[^'"`\]]*(oklch|rgba?)\(/);
    // …and the unread row is a step ABOVE that card, not a box on the canvas.
    const rowStart = railCode.indexOf("!isSelected && hasUnread &&");
    const rowDecl = railCode.slice(rowStart, railCode.indexOf(',', rowStart));
    expect(rowDecl).not.toContain('shadow');
    expect(rowDecl).not.toContain('rounded');
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
