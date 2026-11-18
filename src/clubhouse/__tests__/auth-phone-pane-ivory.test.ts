import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT } from './_scan';

/**
 * Sign up's question pane is the ivory paper on every size (P015 D1, "the ivory panel"). The handoff drew the phone
 * pane as near-white glass over the course; when #2180 made it opaque it kept the near-white stops, so on a phone it
 * read as white while the desktop pane was ivory (owner, 2026-11-15: "Why is mobile gradient white and not the
 * ivory"). The phone pane now paints the desktop pane's own background.
 */
const css = readFileSync(join(ROOT, 'styles', 'onboard.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const PHONE = '@media (max-width: 820px), (max-height: 500px) and (pointer: coarse) {';

/** Every phone media block's body (the query appears more than once in the file), by brace matching. */
function phoneBlocks(source: string): string[] {
  const out: string[] = [];
  for (let at = source.indexOf(PHONE); at !== -1; at = source.indexOf(PHONE, at + PHONE.length)) {
    let depth = 1;
    let i = at + PHONE.length;
    for (; i < source.length && depth > 0; i++) depth += source[i] === '{' ? 1 : source[i] === '}' ? -1 : 0;
    out.push(source.slice(at + PHONE.length, i - 1));
  }
  return out;
}

describe('sign up pane is ivory paper on the phone too', () => {
  const desktop = css.match(/^\.ch-ox-stage \{[^}]*?\bbackground: ([^;]+);/m)?.[1];
  // The light rule only: the selector opens its line (the dark theme's own phone pane, html[data-fw-theme='dark']
  // .ch-ox-stage, is dark on purpose).
  const phone = phoneBlocks(css).flatMap((b) =>
    [...b.matchAll(/(?:^|\n)[ \t]*\.ch-ox-stage \{[^}]*?\bbackground: ([^;]+);/g)].map((m) => m[1]),
  );

  it('finds the desktop rule and a phone override', () => {
    expect(desktop).toBeDefined();
    expect(phone.length).toBeGreaterThan(0);
  });

  it('paints the same background as the desktop pane', () => {
    for (const bg of phone) expect(bg).toBe(desktop);
  });

  it('never the near-white stops', () => {
    for (const bg of phone) expect(bg).not.toMatch(/252 251 247|248 246 240/);
  });
});
