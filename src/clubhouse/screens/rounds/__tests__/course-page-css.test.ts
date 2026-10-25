import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// P-7 4.1.6 and 4.5.6, as the 2026-10-25 changelog has them: the course page uses the phone page tokens, and no rule draws
// a left accent (a transparent spacer draws nothing, so it is allowed).
const css = readFileSync(join(process.cwd(), 'src/clubhouse/styles/rounds.css'), 'utf8');
const rule = (selector: string) => {
  const at = css.indexOf(`\n${selector} {`);
  return at < 0 ? null : css.slice(at, css.indexOf('}', at));
};

describe('course page styles', () => {
  it('pads .ch-ch with the phone page tokens, no literal side padding and no 428 px query', () => {
    const ch = rule('.ch-ch')!;
    expect(ch).toContain('padding: var(--ch-page-top-phone) var(--ch-page-x-phone) var(--ch-page-bottom-phone)');
    expect(css).not.toMatch(/@media \(min-width: 428px\)\s*{\s*\.ch-ch\s*{/);
    expect(rule('.ch-ch-sec')).toContain('margin-top: var(--ch-gap-section-phone)');
  });

  it('the course page draws no left border, and the review’s Tot column keeps its transparent spacer', () => {
    const course = css.slice(css.indexOf('\n.ch-ch {'));
    const lefts = [...course.matchAll(/border-left:\s*([^;]+);/g)].map((m) => m[1]!.trim());
    for (const v of lefts) expect(v === '0' || v === 'none' || /transparent/.test(v)).toBe(true);
    expect(css).toMatch(/\.ch-rv-nine td:last-child\s*{\s*border-left: 2px solid transparent;/);
  });
});
