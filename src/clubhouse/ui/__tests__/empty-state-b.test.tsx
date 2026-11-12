import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, render, screen } from '@testing-library/react';
import { Trophy, Users } from 'lucide-react';
import { afterEach, describe, expect, it } from 'vitest';
import { EmptyState } from '../States';

afterEach(cleanup);

const ui = readFileSync(join(process.cwd(), 'src/clubhouse/styles/ui.css'), 'utf8');
const shell = readFileSync(join(process.cwd(), 'src/clubhouse/styles/shell.css'), 'utf8');
/** The declarations of the first rule whose selector is exactly `selector`, in `css`. */
const rule = (css: string, selector: string) => {
  const at = css.indexOf(`${selector} {`);
  expect(at, selector).toBeGreaterThan(-1);
  return css.slice(at, css.indexOf('}', at));
};
const DESK = '@media (min-width: 821px) and ((min-height: 501px) or (pointer: fine)) {';
const PHONE = '@media (max-width: 820px), (max-height: 500px) and (pointer: coarse) {';
/** The rules inside the first media block that holds `marker`. */
const media = (query: string, marker: string) => {
  let at = ui.indexOf(query);
  while (at > -1 && ui.slice(at, ui.indexOf('\n}\n', at)).indexOf(marker) === -1) at = ui.indexOf(query, at + 1);
  expect(at, `${query} with ${marker}`).toBeGreaterThan(-1);
  return ui.slice(at, ui.indexOf('\n}\n', at));
};

/**
 * W19, direction B "a moment" (owner, 12 Nov 2026: "roomy card, like Tournaments"): every empty state reads as
 * Tournaments' first run did, and Tournaments' does not change. A page's is a roomy card at the page's measure that
 * holds the space its content will take: Tournaments' medallion (the dark tile on faint rings), its 28 strong title, its
 * 15 sentence, its action. One anatomy in the shared EmptyState, and one rule set for the medallion and its type
 * (shell.css), shared with the route error. A section's keeps the same order, compact, its glyph in a small tinted tile
 * (a dark 28px tile was the loudest thing in a light card). Nothing ghosted under it (owner, 4 Nov).
 */
describe('W19 B · one anatomy for a page empty', () => {
  it('a page empty without a shape is the same card a shaped one is, its glyph tile first', () => {
    const { container } = render(<EmptyState size="page" code="CH-1" icon={Trophy} title="Your season starts on the calendar" body="Add a tournament." action={<button type="button">Add a tournament</button>} />);
    const el = container.querySelector('[data-ch-code="CH-1"]')!;
    expect(el.tagName).toBe('SECTION');
    expect(el.className).toBe('ch-es ch-es--page ch-es--first-run');
    const copy = el.querySelector(':scope > .ch-es__copy')!;
    expect([...copy.children].map((c) => c.className)).toEqual(['ch-es__glyph', 'ch-es__text', 'ch-es__a']);
    // The medallion: the tile inside its ring box, the glyph at Tournaments' 26.
    expect(copy.querySelector(':scope > .ch-es__glyph > .ch-es__tile > svg')!.getAttribute('width')).toBe('26');
    expect(screen.getByRole('heading', { level: 2, name: 'Your season starts on the calendar' }).className).toBe('ch-es__title');
    expect(el.querySelector('.ch-empty-page')).toBeNull();
  });

  it('a first run keeps the glyph it is given, and a page with none takes its layout’s; a section with none has none', () => {
    const given = render(<EmptyState size="page" code="CH-2" shape="people" icon={Users} title="No players yet" />).container;
    expect(given.querySelector('.ch-es__glyph svg')!.classList.toString()).toContain('lucide-users');
    cleanup();
    const layout = render(<EmptyState size="page" code="CH-3" shape="week" title="No practice on the calendar" />).container;
    expect(layout.querySelector('.ch-es__glyph svg')!.classList.toString()).toContain('lucide-calendar-days');
    cleanup();
    const section = render(<EmptyState code="CH-4" shape="rows" title="No announcements yet" />).container;
    expect(section.querySelector('.ch-es__glyph')).toBeNull();
    cleanup();
    const sectionIcon = render(<EmptyState compact kind="first-run" code="CH-5" icon={Users} title="No rounds yet" />).container;
    expect(sectionIcon.querySelector('.ch-es--line .ch-es__glyph svg')!.getAttribute('width')).toBe('16');
  });

  it('the shape stays hidden (owner, 4 Nov): nothing ghosted under the card', () => {
    const { container } = render(<EmptyState size="page" code="CH-6" shape="rows" title="Nothing posted yet" />);
    expect(container.querySelector('.ch-es--shaped > .ch-es-shape')).not.toBeNull();
    expect(rule(ui, '.ch-root[data-ui] .ch-es--shaped > .ch-es-shape')).toContain('display: none');
  });

  it('progress on a page reads as segments and words', () => {
    const { container } = render(<EmptyState size="page" code="CH-7" title="Your first rounds" progress={{ done: 1, total: 3, label: 'rounds posted' }} />);
    expect(container.querySelectorAll('.ch-es__seg > i')).toHaveLength(3);
    expect(container.querySelectorAll('.ch-es__seg > i.is-on')).toHaveLength(1);
    expect(container.querySelector('.ch-es__prog')!.textContent).toBe('1 of 3 rounds posted');
  });

  it('a failed read and a dead end keep the route error’s medallion; neither is the empty card', () => {
    const failed = render(<EmptyState size="page" tone="danger" code="CH-8" title="Tournaments didn’t load" />).container;
    expect(failed.querySelector('[data-ch-code="CH-8"]')!.className).toBe('ch-empty-page ch-empty-page--danger');
    cleanup();
    const lost = render(<EmptyState size="canvas" code="CH-9" icon={Trophy} title="We couldn’t find that" />).container;
    const el = lost.querySelector('[data-ch-code="CH-9"]')!;
    expect(el.className).toBe('ch-empty-page');
    expect(el.querySelector('.ch-empty-page__ic svg')).not.toBeNull();
    expect(el.querySelector('.ch-es')).toBeNull();
  });
});

describe('W19 B · the look, in tokens', () => {
  it('a page’s glyph is Tournaments’ medallion, drawn by the same rules as the route error’s: one source', () => {
    expect(rule(shell, '.ch-empty-page,\n.ch-es--page')).toContain('--ch-medallion-bg: var(--ch-green-800)');
    expect(rule(shell, '.ch-empty-page,\n.ch-es--page')).toContain('--ch-medallion-ink: var(--ch-on-green-plate)');
    expect(rule(shell, '.ch-empty-page__art,\n.ch-es--page:not(.ch-es--line) .ch-es__glyph')).toMatch(/width: 148px;[\s\S]*height: 148px;/);
    expect(rule(shell, '.ch-empty-page__ic,\n.ch-es__tile')).toMatch(/width: 64px;[\s\S]*height: 64px;[\s\S]*background: var\(--ch-medallion-bg\);[\s\S]*color: var\(--ch-medallion-ink\);/);
    // Its ring box carries no colour of its own: the section tile's tint is cleared there.
    expect(rule(ui, '.ch-es--page:not(.ch-es--line) .ch-es__glyph')).toMatch(/border-radius: 0;[\s\S]*background: none;/);
    // Dark keeps the route error's ring tone.
    expect(shell).toMatch(/html\[data-fw-theme='dark'\] \.ch-empty-page,\nhtml\[data-fw-theme='dark'\] \.ch-es--page \{/);
  });

  it('a section’s glyph is the small tinted tile, here and in the shapeless section empty', () => {
    const tile = rule(ui, '.ch-es__glyph');
    expect(tile).toMatch(/width: 28px;[\s\S]*height: 28px;/);
    expect(tile).toContain('background: var(--ch-green-50)');
    expect(tile).toContain('color: var(--ch-green-700)');
    expect(rule(shell, '.ch-empty__icon')).toMatch(/width: 28px;[\s\S]*background: var\(--ch-green-50\);[\s\S]*color: var\(--ch-green-700\);/);
  });

  it('Tournaments’ 28 strong title and 15 sentence, 22 on a phone, in the rules the route error uses', () => {
    expect(rule(shell, '.ch-empty-page__title,\n.ch-es--page .ch-es__title')).toContain('font: var(--ch-type-28-strong)');
    expect(rule(shell, '.ch-empty-page__body,\n.ch-es--page .ch-es__body')).toContain('font: var(--ch-type-15)');
    expect(shell).toMatch(/ {2}\.ch-empty-page__title,\n {2}\.ch-es--page \.ch-es__title \{\s*font-size: calc\(22 \* var\(--ch-type-k\)\);/);
    // And no rule of ui.css sizes them otherwise.
    expect(ui).not.toContain('.ch-es--page .ch-es__title {');
    expect(ui).not.toContain('.ch-es--page .ch-es__body {');
  });

  it('Tournaments’ air: 40/24 in the card (a phone’s too), 72/88 under the Ledger’s head on a desk', () => {
    expect(rule(ui, '.ch-es--page > .ch-es__copy')).toContain('padding: 40px 24px');
    const gate = '.ch-es--page:not(.ch-surface *, .ch-sheet *, .ch-shs-card *, .ch-es--line) > .ch-es__copy';
    expect(rule(media(DESK, gate), `  [data-ui='clubhouse'] main[data-canopy] ${gate}`)).toContain('padding-block: 72px 88px');
    expect(rule(media(PHONE, gate), '  .ch-es--page:not(.ch-surface *, .ch-sheet *) > .ch-es__copy')).toContain('padding: 40px 24px');
  });

  it('the card holds 320px of the page on a desk and 240 on a phone, only where it is the card (never inside another)', () => {
    const gate = '.ch-es--page:not(.ch-surface *, .ch-sheet *, .ch-shs-card *, .ch-es--line) > .ch-es__copy';
    expect(rule(media(DESK, gate), `  ${gate}`)).toContain('min-height: 320px');
    expect(rule(media(PHONE, gate), `  ${gate}`)).toContain('min-height: 240px');
    // The card itself is drawn only outside a surface or a sheet.
    expect(rule(ui, '.ch-es--page:not(.ch-surface *, .ch-sheet *)')).toContain('background: var(--ch-card-bg)');
  });

  it('no hex, no raw radius and no !important in the new rules', () => {
    const at = ui.indexOf('W19 B, "a moment"');
    const block = ui.slice(at, ui.indexOf('.ch-es-shape {', at));
    expect(block).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(block).not.toMatch(/border-radius: \d/);
    expect(block).not.toContain('!important');
  });
});
