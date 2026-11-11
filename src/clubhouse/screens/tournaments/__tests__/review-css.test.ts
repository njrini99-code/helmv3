import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const css = readFileSync(join(process.cwd(), 'src/clubhouse/styles/tournaments-review.css'), 'utf8');
const rule = (selector: string) => {
  const at = css.indexOf(`${selector} {`);
  return at < 0 ? '' : css.slice(at, css.indexOf('}', at));
};

describe('the review’s notes on a phone', () => {
  it('sit flush in the section’s card: no card, corners or inset of their own inside it', () => {
    // On a phone the section is the card (ui.css). A second card inside it put the rows 32 in against the heading's 16
    // and left the line about missing reflections under the inner card's foot.
    const list = rule('.ch-tour-rev.is-phone .ch-tour-rev-notes');
    expect(list).toMatch(/box-shadow:\s*none/);
    expect(list).toMatch(/border-radius:\s*0/);
    expect(rule('.ch-tour-rev.is-phone .ch-tour-rev-note')).toMatch(/padding-inline:\s*0/);
  });

  it('end the card 16 under the last line, with or without the line about missing reflections', () => {
    expect(rule('.ch-tour-rev.is-phone .ch-sec__head ~ .ch-tour-rev-notes:last-child')).toMatch(/padding-bottom:\s*0/);
    // The line is the card's last row: the rows' rule over it, drawn inside its own inset.
    const over = rule('.ch-tour-rev.is-phone .ch-tour-rev-missing::before');
    expect(over).toMatch(/height:\s*var\(--ch-hairline-w\)/);
    expect(over).toMatch(/background:\s*var\(--ch-border-hairline\)/);
  });

  it('a desk keeps the notes as their own card', () => {
    const desk = rule('.ch-tour-rev-notes');
    expect(desk).toMatch(/box-shadow:\s*var\(--ch-elevation-reading\)/);
    expect(desk).toMatch(/border-radius:\s*var\(--ch-radius-card\)/);
  });
});

describe('Link rounds on a phone', () => {
  it('its two lists sit flush in their section’s card: no card, corners or inset of their own inside it', () => {
    const lists = rule('.ch-tour-links.is-phone .ch-tour-links-list,\n.ch-tour-links.is-phone .ch-tour-links-miss');
    expect(lists).toMatch(/box-shadow:\s*none/);
    expect(lists).toMatch(/border-radius:\s*0/);
    expect(rule('.ch-tour-links.is-phone .ch-tour-links-row,\n.ch-tour-links.is-phone .ch-tour-links-miss__row')).toMatch(/padding-inline:\s*0/);
  });

  it('a list that ends the card leaves 16 under its last row: 4 here and the row’s own 12', () => {
    expect(rule('.ch-tour-links.is-phone .ch-sec__head ~ .ch-tour-links-list:last-child,\n.ch-tour-links.is-phone .ch-sec__head ~ .ch-tour-links-miss:last-child')).toMatch(/padding-bottom:\s*4px/);
    expect(rule('.ch-tour-links-row')).toMatch(/padding:\s*12px 16px/);
  });
});
