/**
 * ============================================================================
 * MessageThreadPane — the bubble grammar, and the tokens it is drawn with
 * ----------------------------------------------------------------------------
 * Source-string matching, for the reason the sibling
 * FairwayMessages.threadWidth.test.ts gives: jsdom computes no layout and no
 * cascade, so a render test could assert that a class is on an element without
 * being able to tell whether the class means anything. What is at risk here is
 * the class NAMES.
 *
 * That risk is not hypothetical. Tailwind class names are not typechecked and
 * not linted: a `shadow-fw-card` that no config entry backs emits no rule,
 * throws no error, and ships a bubble with no shadow through a green
 * typecheck, a green lint and a green build. So the second block below checks
 * the config and the token file actually define what this component spends.
 *
 * The first block pins the grammar itself:
 *   · corner radii — the tail corner marks where an utterance ENDS, so only a
 *     LAST bubble cuts one, and the two inner corners of a middle bubble
 *     tighten so a burst of lines reads as one thing said;
 *   · depth — incoming takes the lit card recipe, own takes its accent
 *     counterpart, and NEITHER takes `shadow-flat`, which is the same shadow
 *     minus the inset specular that does all the lifting;
 *   · measure — the line has an absolute ceiling, not only a percentage.
 * ========================================================================== */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const pane = readFileSync(
  join(process.cwd(), 'src/components/fairway/pages/messages/MessageThreadPane.tsx'),
  'utf8',
);

describe('MessageThreadPane — bubble grammar', () => {
  it('cuts a tail corner only on the LAST bubble of a group, on the sender’s own side', () => {
    // single (first AND last) — a tail, and otherwise the card radius
    expect(pane).toContain(
      "isFirstInGroup && isLastInGroup && (isOwn ? 'rounded-card rounded-br-sm' : 'rounded-card rounded-bl-sm')",
    );
    // first of several — no tail yet; the utterance has not ended
    expect(pane).toContain("isFirstInGroup && !isLastInGroup && 'rounded-card'");
    // last of several — the tail, plus a tightened top-inner corner
    expect(pane).toContain(
      "!isFirstInGroup && isLastInGroup && (isOwn ? 'rounded-card rounded-tr-fw-sm rounded-br-sm' : 'rounded-card rounded-tl-fw-sm rounded-bl-sm')",
    );
    // middle — both inner corners tight, so the stack reads as one shape
    expect(pane).toContain(
      "!isFirstInGroup && !isLastInGroup && (isOwn ? 'rounded-card rounded-tr-fw-sm rounded-br-fw-sm' : 'rounded-card rounded-tl-fw-sm rounded-bl-fw-sm')",
    );
  });

  it('draws both bubbles with the LIT recipes, never the specular-less shadow-flat', () => {
    expect(pane).toContain("'bg-accent-650 text-text-on-accent shadow-fw-accent-lift'");
    expect(pane).toContain("'bg-surface text-text-primary shadow-fw-card'");
    // `shadow-flat` is the same geometry with the inset specular removed, and
    // it is exactly what both bubbles used to carry. Matched on the two class
    // strings themselves rather than on a window of the file, so the assertion
    // cannot be satisfied or broken by a comment that merely says the words.
    expect(pane).not.toContain("'bg-accent-650 text-text-on-accent shadow-flat'");
    expect(pane).not.toContain("'bg-surface text-text-primary shadow-flat'");
  });

  it('caps the measure absolutely, not only as a share of the column', () => {
    // 70% of the 720px desktop thread panel is a ~100-character line.
    expect(pane).toContain('max-w-[min(78%,288px)]');
  });

  it('puts the day label on glass and pins it, so it answers for the whole day', () => {
    expect(pane).toContain('sticky top-0 z-raised');
    expect(pane).toMatch(/fw-glass-chrome pointer-events-none rounded-full/);
  });

  it('gives the header the glass material and its two edges instead of a hairline', () => {
    expect(pane).toContain('<header className="fw-glass-chrome');
    expect(pane).toContain('inset_0_1px_0_var(--fw-glass-highlight),0_1px_0_var(--fw-glass-border-bot)');
    // Border OR shadow, never both — the rule the card recipes already follow.
    const header = pane.slice(pane.indexOf('<header className='), pane.indexOf('</header>'));
    expect(header).not.toContain('border-b border-border-subtle');
  });
});

describe('the tokens those class names spend actually exist', () => {
  const config = readFileSync(join(process.cwd(), 'tailwind.config.ts'), 'utf8');
  const tokens = readFileSync(join(process.cwd(), 'src/styles/design-tokens.css'), 'utf8');

  it('bridges --fw-shadow-card, which had no utility for the whole life of the token', () => {
    expect(config).toContain("'fw-card':       'var(--fw-shadow-card)'");
    expect(tokens).toContain('--fw-shadow-card:');
  });

  it('defines the accent counterpart in BOTH themes', () => {
    expect(config).toContain("'fw-accent-lift':'var(--fw-shadow-accent-lift)'");
    // Once under :root and once under the dark block. On a dark ground the
    // green ambient would read as a smear under a green bubble, so the dark
    // value is a different shadow, not the same one inherited.
    expect(tokens.match(/--fw-shadow-accent-lift:/g) ?? []).toHaveLength(2);
  });

  it('keeps `shadow-card` pointing at the LEGACY flat value, so nobody reaches for it by accident', () => {
    // The Fairway card shadow is `shadow-fw-card`. Plain `shadow-card` is a
    // pre-Fairway `0 1px 3px rgba(0,0,0,0.04)` with no warmth and no lit edge,
    // and it is still in use elsewhere — this asserts the two stay distinct
    // rather than one silently becoming the other.
    expect(config).toContain("'card': '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)'");
  });
});
