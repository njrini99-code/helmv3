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

  it('rings the mark in ink-500, moves the fill on --ch-dur-release, and takes its radii from tokens', () => {
    expect(poll).toMatch(/--ch-poll-mark-ring: var\(--ch-ink-500\);/);
    expect(poll).toMatch(/transform var\(--ch-dur-release\) var\(--ch-ease\)/);
    expect(poll).not.toMatch(/transform var\(--ch-dur-base\)/);
    expect(poll).toMatch(/border-radius: var\(--ch-radius-card\);/);
    expect(poll).toMatch(/border-bottom-right-radius: var\(--ch-radius-tail\);/);
    expect(poll).not.toMatch(/border-radius: 6px/);
  });

  it('gives the poll card a real width in the desktop thread: the column has a width, the line stretches, the stack grows', () => {
    expect(css).toMatch(/\.ch-ms-msg__col:has\(> \.ch-ms-msg__line \.ch-ms-poll\) \{\s*width: min\(460px, 78%\);/);
    expect(css).toMatch(/\.ch-ms-msg__line:has\(> \.ch-ms-msg__stack \.ch-ms-poll\) \{\s*align-self: stretch;/);
    expect(css).toMatch(/\.ch-ms-msg__stack:has\(> \.ch-ms-poll\) \{\s*flex: 1 1 0;\s*min-width: 0;/);
    expect(css).toMatch(/\.ch-msp-thread \.ch-ms-msg__col:has\(> \.ch-ms-msg__line \.ch-ms-poll\) \{\s*width: min\(100%, 360px\);/);
  });
});
