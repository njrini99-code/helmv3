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
 * W19, direction B "a moment" (owner, 12 Nov 2026): every empty state reads as Tournaments' first run did. A page's is a
 * roomy card at the page's measure that holds the space its content will take: a tinted glyph tile, a 22 strong title,
 * one sentence and its action. A section's keeps the same order, compact. One anatomy, in the shared EmptyState: the
 * route error's medallion is left to failures and dead ends. Nothing ghosted under it (owner, 4 Nov).
 */
describe('W19 B · one anatomy for a page empty', () => {
  it('a page empty without a shape is the same card a shaped one is, its glyph tile first', () => {
    const { container } = render(<EmptyState size="page" code="CH-1" icon={Trophy} title="Your season starts on the calendar" body="Add a tournament." action={<button type="button">Add a tournament</button>} />);
    const el = container.querySelector('[data-ch-code="CH-1"]')!;
    expect(el.tagName).toBe('SECTION');
    expect(el.className).toBe('ch-es ch-es--page ch-es--first-run');
    const copy = el.querySelector(':scope > .ch-es__copy')!;
    expect([...copy.children].map((c) => c.className)).toEqual(['ch-es__glyph', 'ch-es__text', 'ch-es__a']);
    expect(copy.querySelector('.ch-es__glyph svg')!.getAttribute('width')).toBe('28');
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
  it('a page’s tile is 64px, tinted green-50 with a green-700 glyph; a section’s is the same tint at 28px', () => {
    const tile = rule(ui, '.ch-es__glyph');
    expect(tile).toMatch(/width: 28px;[\s\S]*height: 28px;/);
    expect(tile).toContain('background: var(--ch-green-50)');
    expect(tile).toContain('color: var(--ch-green-700)');
    expect(rule(ui, '.ch-es--page:not(.ch-es--line) .ch-es__glyph')).toMatch(/width: 64px;[\s\S]*height: 64px;[\s\S]*border-radius: var\(--ch-radius-xl\);/);
    // The section empty that takes no shape or kind draws the same tile (shell.css).
    expect(rule(shell, '.ch-empty__icon')).toMatch(/width: 28px;[\s\S]*background: var\(--ch-green-50\);[\s\S]*color: var\(--ch-green-700\);/);
  });

  it('a 22 strong title and a 16 body', () => {
    expect(rule(ui, '.ch-es--page .ch-es__title')).toContain('font: var(--ch-type-22-strong)');
    expect(rule(ui, '.ch-es--page .ch-es__body')).toContain('font: var(--ch-type-16)');
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
