import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';

const css = postcss.parse(readFileSync(join(import.meta.dirname, '../../../styles/messages-inbox.css'), 'utf8'));
const decls = (selector: string) => {
  const out: Record<string, string> = {};
  css.walkRules((r) => {
    if (r.selector === selector && r.parent?.type === 'root') r.walkDecls((d) => void (out[d.prop] = d.value));
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

  it('the phone’s fold is still the card at the page edge', () => {
    expect(decls('[data-ch-ms-v2] .ch-inb--phone .ch-ms-sec.is-ann')).toMatchObject({ margin: '0 var(--ch-page-x-phone) var(--ch-space-3)' });
  });
});
