/**
 * G-50b — bubble max-width is the 288px RULE, not one of the scene specimens.
 *
 * Three numbers appear across the artboards: 288px, 296px, and 268/292px. They
 * are not three opinions. `Bubbles.dc.html:17` states 288px as a CLASS RULE, in
 * the artboard whose entire purpose is bubble grammar; the others are inline
 * styles on individual specimens inside scene compositions. DECISIONS.md takes
 * the rule.
 *
 * MEASURED ON BOTH SIDES. The 288 the component uses is compared against the
 * value parsed out of `audit/reference/Bubbles.dc.html`, and the gutter the
 * derivation rests on is compared against the artboard's own avatar width and
 * row gap — so the suite fails if either side moves.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf-8');

const bubblesArtboard = read('audit/reference/Bubbles.dc.html');
const groupArtboard = read('audit/reference/Group.dc.html');
const source = read('src/components/fairway/pages/messages/MessageThreadPane.tsx');

/**
 * Comment-stripped, so the fix's own docstring cannot satisfy an assertion.
 *
 * Block comments are removed WHOLE — a JSX `{/* … *\u002f}` spans many lines
 * whose interiors look like ordinary prose, so a line-prefix filter alone
 * leaves the body behind. This suite caught exactly that on its first run: the
 * comment explaining why 268 is not written anywhere contains "268".
 */
const code = source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter((line) => !line.trim().startsWith('//'))
  .join('\n');

/** The `.bub` class rule — the stated grammar, as opposed to a scene specimen. */
const bubRule = bubblesArtboard.split('\n').find((l) => l.trim().startsWith('.bub {'));

describe('G-50b — the rule the component implements is the artboard rule', () => {
  it('Bubbles.dc.html still states max-width as a class rule', () => {
    // If this ever becomes an inline specimen, the whole basis of the decision
    // is gone and someone must re-read DECISIONS.md before touching the number.
    expect(bubRule).toBeDefined();
    expect(bubRule).toContain('max-width:');
  });

  it('the component caps at exactly the rule width, read from the artboard', () => {
    const m = (bubRule ?? '').match(/max-width:\s*(\d+)px/);
    const ruleWidth = m?.[1];
    expect(ruleWidth, 'expected a px max-width in the .bub rule').toBeDefined();
    expect(code).toContain(`max-w-[${ruleWidth}px]`);
  });

  it('no longer caps the base width as a percentage of the pane', () => {
    // `max-w-[78%]` was a guess at the artboard, not the artboard.
    expect(code).not.toContain('max-w-[78%]');
  });

  it('writes NO specimen width anywhere — not 296, not 268, not 292', () => {
    for (const specimen of ['296px', '268px', '292px']) {
      expect(code, `${specimen} is a scene specimen, not the rule`).not.toContain(specimen);
    }
  });
});

describe('G-50b — group-incoming is derived, not numbered', () => {
  it('the avatar gutter the derivation rests on matches the artboard', () => {
    // Artboard: a 32px avatar column at an 8px row gap.
    const avatarCol = groupArtboard
      .split('\n')
      .find((l) => l.includes('width: 32px; flex-shrink: 0;'));
    expect(avatarCol, 'expected the artboard 32px avatar column').toBeDefined();
    const row = groupArtboard
      .split('\n')
      .find((l) => l.includes('align-items: flex-end; gap: 8px'));
    expect(row, 'expected the artboard 8px row gap').toBeDefined();

    // Component: `w-8` (32px) inside a `gap-2` (8px) row — the same 40px.
    expect(code).toContain('w-8 flex-shrink-0');
    expect(code).toContain("'flex items-end gap-2'");
  });

  it('keeps the gutter OUTSIDE the capped column, which is what derives it', () => {
    // The reserved avatar gutter must be a sibling of the bubble column:
    // that is the whole mechanism by which an incoming row has 40px less room
    // without anyone writing a second number.
    const gutterIdx = code.indexOf('aria-hidden="true" className="w-8 flex-shrink-0"');
    // RE-ANCHORED, not relaxed. This read `indexOf('max-w-[288px]')` and so
    // depended on the bubble column owning the file's FIRST occurrence of the
    // literal. The loading skeleton now also caps at 288 — deliberately, since
    // a placeholder that does not reserve the real slot is not shape-matched —
    // and it is declared earlier in the file, so the bare search started
    // pointing at the placeholder instead. Anchoring on the bubble column's own
    // full declaration names the element this suite is actually about, which is
    // a stricter locator than the one it replaces: a bubble column that lost its
    // `min-w-0` or its flex direction now fails here rather than silently
    // matching some other 288.
    const BUBBLE_COLUMN = 'group relative flex min-w-0 max-w-[288px] flex-col gap-1';
    const columnIdx = code.indexOf(BUBBLE_COLUMN);
    expect(gutterIdx).toBeGreaterThan(-1);
    expect(columnIdx, 'expected the bubble column declaration').toBeGreaterThan(-1);
    expect(columnIdx).toBeGreaterThan(gutterIdx);
    // Nothing closes the bubble column between them — the gutter's own <div>
    // opens and closes before the capped column opens.
    const between = code.slice(gutterIdx, columnIdx);
    expect(between).not.toContain('max-w-');
  });

  it('SUPERSEDED by G-49 — the cap now binds at every width', () => {
    // This suite originally asserted `sm:max-w-[70%]` was present: G-50b read
    // the artboards as 390px phone scenes carrying no desktop authority. G-49's
    // F13 supplied it — 288px is a "maximum text measure... constrained by
    // available row width" (audit/M03B-thread.md:94), a ceiling rather than a
    // phone-only number, and `sm:` (640px) meant the percentage was the ONLY
    // rule in effect on the 720px pane. The override is gone; the derivation
    // this suite exists to protect is unchanged, and the cap's own assertions
    // above still hold. MeasureCap.test.ts owns the width question now.
    expect(code).not.toContain('sm:max-w-[70%]');
  });
});
