import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// MSG-402 (messages-v2 fix 2): the lift copy carries the thread's scope classes, and `.ch-ms-thread` paints the page colour.
// Nothing may paint behind the lifted row, or a lighter strip shows from the avatar to the thread's edge.
const read = (f: string) => readFileSync(join(process.cwd(), 'src/clubhouse/styles', f), 'utf8');
const rules = (css: string) => [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1]!.trim(), body: m[2]! }));

describe('the lift copy paints no background of its own', () => {
  it('the thread scope class does paint one (why the copy needs to clear it)', () => {
    expect(rules(read('messages.css')).some((r) => r.sel === '.ch-ms-thread' && /background:\s*var\(--ch-bg-page\)/.test(r.body))).toBe(true);
  });

  it('a rule out-ranks .ch-ms-thread (two classes) and clears the copy', () => {
    const rule = rules(read('messages-overlays.css')).find((r) => r.sel === '.ch-mso-lift .ch-mso-lift__copy');
    expect(rule?.body).toMatch(/background:\s*none;/);
  });

  it('nothing else in the overlay sheet gives the copy or the lifted row a fill', () => {
    const fills = rules(read('messages-overlays.css')).filter((r) => /\.ch-mso-lift__copy/.test(r.sel) && /background/.test(r.body));
    expect(fills.map((r) => r.sel)).toEqual(['.ch-mso-lift .ch-mso-lift__copy']);
  });
});
