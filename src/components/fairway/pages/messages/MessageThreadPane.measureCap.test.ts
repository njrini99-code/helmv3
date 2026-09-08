/** Bubble readability is independent of the full-window thread width. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf-8');

const bubblesArtboard = read('audit/reference/Bubbles.dc.html');
const source = read('src/components/fairway/pages/messages/MessageThreadPane.tsx');

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

/** The one element the cap is written on. */
const bubbleColumn =
  code.match(/cn\('group relative flex min-w-0[^']*'/)?.[0] ?? '';

describe('G-49 — the measure cap is absolute, not a percentage of the pane', () => {
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

});
