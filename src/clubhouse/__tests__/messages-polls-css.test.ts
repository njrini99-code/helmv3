import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// P-2 (changelog 2026-10-25): the poll card's CSS pins. Dark values sit only under the app's theme attribute, the mark
// ring holds 3:1 over every fill, the bars move on the release curve and the radii come from tokens.
const css = readFileSync(join(process.cwd(), 'src/clubhouse/styles/messages.css'), 'utf8');
const poll = css.slice(css.indexOf('.ch-ms-poll {'), css.lastIndexOf('.ch-ms-poll'));

describe('the poll card styles', () => {
  it('has no prefers-color-scheme branch: dark is html[data-fw-theme=dark] only', () => {
    expect(css).not.toMatch(/prefers-color-scheme/);
    expect(css).toContain("html[data-fw-theme='dark'] [data-ui='clubhouse'] .ch-ms-poll {");
  });

  it('rings the mark in the tertiary ink, moves the fill on the smooth spring, and takes its radii from tokens (package D, messages-details.css)', () => {
    const details = readFileSync(join(process.cwd(), 'src/clubhouse/styles/messages-details.css'), 'utf8');
    const rule = (sel: string) => details.slice(details.indexOf(`${sel} {`), details.indexOf('}', details.indexOf(`${sel} {`)));
    expect(rule('[data-ch-ms-v2] .ch-msd-poll__mark')).toMatch(/inset 0 0 0 1\.5px var\(--ch-text-tertiary\)/);
    expect(rule('[data-ch-ms-v2] .ch-msd-poll__fill')).toMatch(/transform var\(--ch-dur-spring-smooth\) var\(--ch-ease-spring-smooth\)/);
    expect(rule('[data-ch-ms-v2] .ch-msd-poll__fill')).not.toMatch(/transform var\(--ch-dur-base\)/);
    expect(rule('[data-ch-ms-v2] .ch-msd-poll')).toMatch(/border-radius: var\(--ch-radius-xl\);/);
    expect(rule('[data-ch-ms-v2] .ch-msd-poll.is-mine')).toMatch(/border-bottom-right-radius: var\(--ch-radius-tail\);/);
    expect(poll).not.toMatch(/border-radius: 6px/);
  });

  it('gives the poll card a real width in the desktop thread: the column has a width, the line stretches, the stack grows', () => {
    expect(css).toMatch(/\.ch-ms-msg__col:has\(> \.ch-ms-msg__line \.ch-ms-poll\) \{\s*width: min\(460px, 78%\);/);
    expect(css).toMatch(/\.ch-ms-msg__line:has\(> \.ch-ms-msg__stack \.ch-ms-poll\) \{\s*align-self: stretch;/);
    expect(css).toMatch(/\.ch-ms-msg__stack:has\(> \.ch-ms-poll\) \{\s*flex: 1 1 0;\s*min-width: 0;/);
    expect(css).toMatch(/\.ch-msp-thread \.ch-ms-msg__col:has\(> \.ch-ms-msg__line \.ch-ms-poll\) \{\s*width: min\(100%, 360px\);/);
  });
});
