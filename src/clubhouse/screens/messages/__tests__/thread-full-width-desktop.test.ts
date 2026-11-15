import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// W17 (preview walk, 11 Nov): on desktop the thread was a 760 px column in the middle of the pane, so their bubbles began
// about 270 px in. As Messages on the Mac, the thread now spans its pane on the composer's inset, the hover time sits in
// the row beside the bubble (never off the pane), and the day marker is one step larger.
const read = (f: string) => readFileSync(join(process.cwd(), 'src/clubhouse/styles', f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const DESK = '@media (min-width: 821px) and ((min-height: 501px) or (pointer: fine))';

/** The body of `sel` inside every desktop block of `css`, joined. */
function inDesktop(css: string, sel: string): string {
  let out = '';
  let at = css.indexOf(DESK);
  while (at >= 0) {
    let depth = 0;
    let i = css.indexOf('{', at);
    const start = i;
    for (; i < css.length; i++) {
      if (css[i] === '{') depth++;
      else if (css[i] === '}' && --depth === 0) break;
    }
    const block = css.slice(start + 1, i);
    for (const m of block.matchAll(/([^{}]+)\{([^{}]*)\}/g)) if (m[1]!.trim() === sel) out += m[2];
    at = css.indexOf(DESK, i);
  }
  return out;
}

describe('W17 the desktop thread spans its pane', () => {
  const css = read('messages.css');

  it('the message list has no reading-measure cap and sits on a 28 px inset', () => {
    const body = inDesktop(css, '[data-ch-ms-v2] .ch-ms-msgs');
    expect(body).toMatch(/max-width:\s*none/);
    expect(body).toMatch(/margin-inline:\s*0/);
    expect(body).not.toMatch(/measure-reading/);
  });

  it('the composer pill spans the same width', () => {
    expect(inDesktop(css, '[data-ch-ms-v2] .ch-ms-comp__field')).toMatch(/max-width:\s*none/);
  });

  it('the hover time is in the row, before your bubble and after theirs', () => {
    expect(inDesktop(css, '[data-ch-ms-v2] .ch-msv-time')).toMatch(/position:\s*static/);
    expect(inDesktop(css, '[data-ch-ms-v2] .ch-ms-msg.is-mine .ch-msv-time')).toMatch(/order:\s*-1/);
  });

  it('the day marker is 13 px, not 12', () => {
    const thread = read('messages-thread.css');
    const m = [...thread.matchAll(/([^{}]+)\{([^{}]*)\}/g)].find((r) => r[1]!.trim() === '[data-ch-ms-v2] :is(.ch-ms-thread, .ch-msp-thread) .ch-ms-day > span');
    expect(m?.[2]).toMatch(/font:\s*var\(--ch-type-13-strong\)/);
  });
});
