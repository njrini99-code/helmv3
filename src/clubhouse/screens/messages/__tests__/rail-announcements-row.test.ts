import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';

const css = postcss.parse(readFileSync(join(import.meta.dirname, '../../../styles/messages-inbox.css'), 'utf8'));
const decls = (selector: string) => {
  const out: Record<string, string> = {};
  css.walkRules((r) => {
    if (r.selectors.includes(selector) && r.parent?.type === 'root') r.walkDecls((d) => void (out[d.prop] = d.value));
  });
  return out;
};
const RAIL = '[data-ch-ms-v2] .ch-inb--rail';

/**
 * On the rail the Announcements fold was the phone's card: it spanned the pane (x 240 to 560 at 1440px) with its own
 * shadow while every conversation row sits inset on the rail's grid, and it cut its preview on one line with room to
 * spare. It is a row on that grid now, and so are the announcements it opens to. The phone keeps its card (Q-37).
 */
describe('Messages rail · Announcements is a row on the rail’s grid', () => {
  it('the fold takes the conversation row’s box and drops the card', () => {
    const row = decls(`${RAIL} .ch-ms-row:not(.is-ann)`);
    const fold = decls(`${RAIL} .ch-ms-sec.is-ann .ch-ms-fold`);
    for (const prop of ['width', 'margin', 'padding', 'border-radius']) expect(fold[prop], prop).toBe(row[prop]);
    expect(fold).toMatchObject({ background: 'transparent', 'box-shadow': 'none', 'min-height': '0' });
    // The 40 face of a rail row, across both of the row's lines.
    expect(decls(`${RAIL} .ch-ms-fold .ch-ms-grp.is-ann`)).toMatchObject({ width: '40px', height: '40px', 'grid-row': '1 / span 2' });
  });

  it('the newest title runs under the count and the chevron, on two lines, as a row’s preview does', () => {
    expect(decls(`${RAIL} .ch-ms-fold__b`)).toMatchObject({ display: 'contents' });
    expect(decls(`${RAIL} .ch-ms-fold__b b`)).toMatchObject({ 'grid-column': '2', 'grid-row': '1', font: 'var(--ch-type-16-strong)' });
    expect(decls(`${RAIL} .ch-ms-fold__b > span`)).toMatchObject({ 'grid-column': '2 / -1', 'grid-row': '2', font: 'var(--ch-type-15)', 'white-space': 'normal', '-webkit-line-clamp': '2' });
    expect(decls(`${RAIL} .ch-ms-fold > .ch-ms-count`)).toMatchObject({ 'grid-column': '3', 'grid-row': '1' });
    expect(decls(`${RAIL} .ch-ms-fold > .ch-ms-fold__chev`)).toMatchObject({ 'grid-column': '4', 'grid-row': '1' });
  });

  it('an opened announcement is a row on the same grid, its count beside its two lines', () => {
    const row = decls(`${RAIL} .ch-ms-row:not(.is-ann)`);
    const ann = decls(`${RAIL} .ch-ms-row.is-ann`);
    for (const prop of ['width', 'margin', 'padding', 'border-radius']) expect(ann[prop], prop).toBe(row[prop]);
    expect(decls(`${RAIL} .ch-ms-row.is-ann .ch-ms-row__bot`)).toMatchObject({ display: 'flex', 'align-items': 'center' });
    // Selected, it keeps its amber mark and its count's pill on the pale wash.
    expect(decls(`${RAIL} .ch-ms-row.is-ann.is-sel .ch-ms-grp.is-urgent`)).toMatchObject({ background: 'var(--ch-warning-100)', color: 'var(--ch-warning-600)' });
    expect(decls(`${RAIL} .ch-ms-row.is-ann.is-sel .ch-ms-count`)).toMatchObject({ background: 'var(--ch-green-fill-600)' });
  });

  it('a hairline parts it from the conversations above, on the rows’ text edges, and only when something is above', () => {
    const after = `${RAIL} .ch-ms-sec ~ .ch-ms-sec.is-ann`;
    expect(decls(after)).toMatchObject({ position: 'relative', 'padding-top': 'var(--ch-space-2)' });
    expect(decls(`${after}::before`)).toMatchObject({
      top: '0',
      right: 'var(--ch-inb-18)',
      left: 'var(--ch-inb-18)',
      height: 'var(--ch-hairline-w)',
      background: 'var(--ch-separator)',
    });
    // The label above the rows sits on the same edge.
    expect(decls(`${RAIL} .ch-ms-sec__l`).padding).toBe('0 var(--ch-inb-18)');
    expect(decls(`${RAIL} .ch-ms-sec.is-ann::before`)).toEqual({});
  });

  it('on the phone too, an opened announcement keeps its count beside its lines, never as a bar under them', () => {
    const PHONE = '[data-ch-ms-v2] .ch-inb--phone';
    expect(decls(`${PHONE} .ch-ms-row.is-ann .ch-ms-row__bot`)).toEqual(decls(`${RAIL} .ch-ms-row.is-ann .ch-ms-row__bot`));
    expect(decls(`${PHONE} .ch-ms-row.is-ann .ch-ms-row__bot`)).toMatchObject({ display: 'flex', 'align-items': 'center' });
    expect(decls(`${PHONE} .ch-ms-row.is-ann .ch-ms-row__bot > span:first-child`)).toMatchObject({ flex: '1', 'min-width': '0' });
  });

  it('the phone’s fold is still the card at the page edge', () => {
    expect(decls('[data-ch-ms-v2] .ch-inb--phone .ch-ms-sec.is-ann')).toMatchObject({ margin: '0 var(--ch-page-x-phone) var(--ch-space-3)' });
  });

  /**
   * On the phone the opened announcements were rows on the canvas at the page gutter (a 36 face at 16, the time at 374)
   * under a card that held only its own head, beside cards whose rows sit at 32. The section is the card now, as Recent
   * is, and its rows are inside it on the card's grid.
   */
  it('on the phone the section is the card, with Recent’s face, and the fold is its head', () => {
    const PHONE = '[data-ch-ms-v2] .ch-inb--phone';
    const recent = decls(`${PHONE} .ch-msv-card`);
    const card = decls(`${PHONE} .ch-ms-sec.is-ann`);
    for (const prop of ['display', 'margin', 'overflow', 'border-radius', 'background', 'box-shadow']) expect(card[prop], prop).toBe(recent[prop]);
    expect(card).toMatchObject({ overflow: 'hidden', background: 'var(--ch-card-bg)', 'box-shadow': 'var(--ch-card-shadow)' });
    expect(decls(`${PHONE} .ch-ms-sec.is-ann .ch-ms-fold`)).toEqual({ 'grid-template-columns': '40px minmax(0, 1fr) auto auto', 'border-radius': '0', background: 'transparent', 'box-shadow': 'none' });
    // The head's face is the rows' 40, so its title and every name under it start on one edge.
    expect(decls(`${PHONE} .ch-ms-fold .ch-ms-grp.is-ann`)).toEqual({ width: '40px', height: '40px' });
    expect(decls(`${PHONE} .ch-ms-fold__body`)).toEqual({ padding: '0', 'border-top': '0' });
  });

  it('on the phone an opened announcement takes a conversation row’s box and face, and a hairline from the face’s edge', () => {
    const PHONE = '[data-ch-ms-v2] .ch-inb--phone';
    const row = decls('[data-ch-ms-v2] .ch-inb .ch-ms-row:not(.is-ann)');
    const ann = decls(`${PHONE} .ch-ms-row.is-ann`);
    for (const prop of ['grid-template-columns', 'gap', 'width', 'min-height', 'margin', 'padding', 'border-radius', 'background']) expect(ann[prop], prop).toBe(row[prop]);
    expect(ann.padding).toBe('var(--ch-inb-10) var(--ch-space-4)');
    // The same 40 face; the coin keeps the announcement's own fill (and its amber when urgent).
    const face = decls('[data-ch-ms-v2] .ch-inb .ch-ms-row:not(.is-ann) .ch-ms-grp');
    expect(decls(`${PHONE} .ch-ms-row.is-ann .ch-ms-grp`)).toEqual({ width: face.width, height: face.height });
    expect(face.width).toBe('40px');
    expect(decls(`${PHONE} .ch-ms-row.is-ann[data-ch-pressed]`)).toEqual({ background: 'var(--ch-press-wash)' });
    expect(decls(`${PHONE} .ch-ms-sec.is-ann .ch-ms-sec__card > .ch-ms-row:first-child::before`)).toMatchObject({
      left: 'var(--ch-space-4)',
      right: '0',
      height: 'var(--ch-hairline-w)',
      background: 'var(--ch-separator)',
    });
    expect(decls(`${PHONE} .ch-ms-fold__body .ch-ms-more`)).toEqual({ margin: '0 var(--ch-space-4)' });
  });
});
