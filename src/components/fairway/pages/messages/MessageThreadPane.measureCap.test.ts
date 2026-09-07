/**
 * G-49 (F13) — the 288px cap is a MAXIMUM MEASURE, so it binds at every width.
 *
 * G-50b applied `max-w-[288px]` but kept a `sm:max-w-[70%]` override, on the
 * stated reasoning that every artboard is a 390px phone scene and supplies no
 * desktop authority. F13 is that authority: "The repo constrains bubble width
 * by percentage only, with no absolute cap... On the desktop 720px-capped panel
 * a bubble can reach ~475px — well past the readable measure §8.3 is
 * protecting." `audit/M03B-thread.md:94` quotes the plan directly: "D08
 * annotates a 288px maximum text measure... constrained by available row
 * width." A MAXIMUM narrowed by row width is a ceiling — a percentage that
 * rises above it on a wider pane inverts the rule it was meant to implement.
 *
 * Tailwind's `sm:` is min-width 640px and the pane is `max-w-[720px]`, so the
 * override was not dormant on desktop: it was the only thing in effect there.
 *
 * MEASURED ON BOTH SIDES. The cap is parsed out of the artboard, the pane width
 * out of `FairwayMessages.tsx`, and the arithmetic that makes the override a
 * defect is computed from the two — so the suite fails if either side moves.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf-8');

const bubblesArtboard = read('audit/reference/Bubbles.dc.html');
const source = read('src/components/fairway/pages/messages/MessageThreadPane.tsx');
const paneSource = read('src/components/fairway/pages/messages/FairwayMessages.tsx');

/** Comment-stripped, block comments removed WHOLE — see the bubbleWidth suite. */
const code = source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter((line) => !line.trim().startsWith('//'))
  .join('\n');

/** The artboard's stated cap, read rather than repeated. */
const ruleWidth = Number(
  (bubblesArtboard.split('\n').find((l) => l.trim().startsWith('.bub {')) ?? '').match(
    /max-width:\s*(\d+)px/,
  )?.[1],
);

/** The desktop pane the bubble column lives inside. */
const paneWidth = Number(paneSource.match(/max-w-\[(\d+)px\]/)?.[1]);

/** The one element the cap is written on. */
const bubbleColumn =
  code.match(/cn\('group relative flex min-w-0[^']*'/)?.[0] ?? '';

describe('G-49 — the measure cap is absolute, not a percentage of the pane', () => {
  it('reads a cap out of the artboard and a pane width out of the page', () => {
    expect(Number.isFinite(ruleWidth), 'expected .bub max-width in px').toBe(true);
    expect(Number.isFinite(paneWidth), 'expected the pane max-w-[Npx]').toBe(true);
  });

  it('the bubble column exists and carries the artboard cap', () => {
    expect(bubbleColumn, 'expected to locate the capped bubble column').not.toBe('');
    expect(bubbleColumn).toContain(`max-w-[${ruleWidth}px]`);
  });

  it('carries NO responsive width override on that column', () => {
    // `sm:max-w-[70%]` was the whole defect: above 640px it replaced the cap.
    expect(bubbleColumn).not.toMatch(/\bsm:max-w-/);
    expect(bubbleColumn).not.toMatch(/\bmd:max-w-|\blg:max-w-|\bxl:max-w-/);
  });

  it('caps by no percentage anywhere in the thread', () => {
    // A percentage cap cannot express a maximum measure: it is a function of
    // the container, which is exactly the variable the rule is protecting from.
    expect(code).not.toMatch(/max-w-\[\d+(\.\d+)?%\]/);
  });

  it('the override it removed did exceed the artboard maximum — computed, not asserted', () => {
    // 70% of the pane, against the cap the artboard states. This is the
    // arithmetic F13 reports as "~475px"; both operands are read from files.
    const overrideWidth = paneWidth * 0.7;
    expect(overrideWidth).toBeGreaterThan(ruleWidth);
  });

  it('and the excess was large enough to be a defect, not a rounding delta', () => {
    // Absorbing 1px of render noise is this audit's standing practice. This is
    // not that: it is more than half the cap again.
    expect(paneWidth * 0.7 - ruleWidth).toBeGreaterThan(ruleWidth * 0.5);
  });
});
