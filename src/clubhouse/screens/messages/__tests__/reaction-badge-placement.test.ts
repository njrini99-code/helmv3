import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// W16 (preview walk, 11 Nov): two reaction badges sat over a message's words ("QA line A"). The badges hang above the
// bubble's top corner; at most a few pixels may overlap the bubble, inside its corner radius and padding.
const read = (f: string) => readFileSync(join(process.cwd(), 'src/clubhouse/styles', f), 'utf8');
const rules = (css: string) => [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1]!.trim(), body: m[2]! }));
const px = (body: string, prop: string) => {
  const m = body.match(new RegExp(`(?:^|;|\\s)${prop}:\\s*(-?[\\d.]+)px`));
  return m ? Number(m[1]) : NaN;
};

describe('reaction badges sit above the bubble, not on its words', () => {
  const overlays = rules(read('messages-overlays.css'));
  const box = overlays.find((r) => r.sel === '.ch-ms-reacts')!;
  const chip = overlays.find((r) => r.sel === '.ch-ms-react')!;

  it('the badge overlaps the bubble top by 6 px or less', () => {
    const top = px(box.body, 'top');
    const height = px(chip.body, 'height');
    expect(top).toBeLessThan(0);
    expect(height + top).toBeLessThanOrEqual(6);
  });

  it('the row leaves room above for the risen badges', () => {
    const row = rules(read('messages.css')).find((r) => r.sel === '.ch-ms-msg:has(.ch-ms-reacts)')!;
    expect(px(row.body, 'margin-top')).toBeGreaterThanOrEqual(-px(box.body, 'top'));
  });
});
