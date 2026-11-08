/**
 * The presentation gate's page scan (design-refresh/redesign-ui-sweep-2026-11-06, PR 1).
 *
 * Runs inside the page and returns what a person would call broken on real-shaped values: boxes leaving their card, clipped
 * text, cards inside cards, phone type under 12px, tap targets under 44, rows on a card's edge, a page edge that isn't the token.
 *
 * "Card" is read from computed style, not from a class. The lanes built their cards from CSS ported out of the design pages
 * (SYS-1), so a check that only knew ui/Surface would pass every page that needs it most.
 */
export type GateCheck = 'card-escape' | 'text-clip' | 'cramped-text' | 'nested-surface' | 'phone-text' | 'tap-target' | 'row-inset' | 'page-edge';
export type GateFinding = { check: GateCheck; at: string; detail: string };

export function scanPage(args: { phone: boolean }): GateFinding[] {
  const out: GateFinding[] = [];
  const seen = new Set<string>();
  const px = (s: string) => parseFloat(s) || 0;
  const name = (el: Element) => {
    const c = typeof el.className === 'string' ? el.className : (el.getAttribute('class') ?? '');
    const first = c.trim().split(/\s+/).filter(Boolean).slice(0, 2).join('.');
    return el.tagName.toLowerCase() + (first ? `.${first}` : '');
  };
  const path = (el: Element) => {
    const parts: string[] = [];
    for (let n: Element | null = el, i = 0; n && i < 3; n = n.parentElement, i++) parts.unshift(name(n));
    return parts.join(' > ');
  };
  const add = (check: GateCheck, el: Element, detail: string) => {
    // One finding per check and shape: a list of forty identical rows is one bug, not forty.
    const key = `${check}|${path(el)}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ check, at: path(el), detail });
  };
  const painted = (c: string) => !!c && c !== 'transparent' && !/^rgba?\(.*,\s*0\)$/.test(c) && !/\/\s*0\)$/.test(c);
  const visible = (el: Element) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    const s = getComputedStyle(el);
    if (s.visibility === 'hidden' || s.display === 'none' || px(s.opacity) === 0 && s.opacity !== '') return false;
    if (s.clip === 'rect(0px, 0px, 0px, 0px)' || s.clipPath === 'inset(50%)') return false;
    return true;
  };
  const skip = (el: Element) => !!el.closest('nextjs-portal, script, style, template, [data-ch-gate-skip], .ch-sr-only:not(:focus)');
  const isCard = (el: Element) => {
    if (el instanceof SVGElement || /^(BUTTON|A|INPUT|SELECT|TEXTAREA|LABEL|IMG|SPAN|LI|TR|TD|TH|DIALOG|MAIN|BODY|HTML)$/.test(el.tagName)) return false;
    if (el.getAttribute('role') === 'button' || el.getAttribute('role') === 'dialog') return false;
    const r = el.getBoundingClientRect();
    if (r.width < 120 || r.height < 56) return false;
    if (r.width >= innerWidth - 1) return false;
    // The app's own frame is rounded on a desk; it holds pages, it isn't a card on one.
    if (el.querySelector('main')) return false;
    const s = getComputedStyle(el);
    if (/(auto|scroll)/.test(s.overflowY)) return false;
    if (px(s.borderTopLeftRadius) < 10 || px(s.borderBottomRightRadius) < 10) return false;
    // A band of chips is a row, not a card: what holds a row of buttons and nothing else has no edge of its own to keep.
    if (el.children.length > 1 && Array.from(el.children).every((c) => c.matches('button, a, [role="button"], [role="tab"]'))) return false;
    const edge = (s.boxShadow && s.boxShadow !== 'none') || (px(s.borderTopWidth) > 0 && painted(s.borderTopColor));
    return !!edge || painted(s.backgroundColor) || s.backgroundImage !== 'none';
  };
  const cardOf = (el: Element) => {
    for (let n = el.parentElement; n; n = n.parentElement) if (isCard(n)) return n;
    return null;
  };
  // Between an element and its card, a scroller or a fixed layer means the box may legitimately pass the card's edge.
  const freed = (el: Element, stop: Element) => {
    for (let n: Element | null = el; n && n !== stop; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (s.position === 'fixed') return true;
      if (/(auto|scroll)/.test(s.overflowX)) return true;
    }
    return false;
  };
  const ownText = (el: Element) => Array.from(el.childNodes).some((n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim().length > 0);

  const root = document.querySelector('main') ?? document.body;
  const scope = [...Array.from(root.querySelectorAll('*')), ...Array.from(document.querySelectorAll('dialog[open] *'))].filter((el) => !skip(el) && visible(el));

  for (const el of scope) {
    const r = el.getBoundingClientRect();
    const card = cardOf(el);

    // A drawing's marks stay in the drawing, whatever the figure: a halo past its SVG lands on the caption or the chips while still inside the card (TEAM-1).
    if (el instanceof SVGElement && el.tagName !== 'svg' && el.tagName !== 'g' && el.ownerSVGElement && !el.closest('defs, clipPath, mask, symbol')) {
      const o = el.ownerSVGElement.getBoundingClientRect();
      const over = Math.max(o.left - r.left, r.right - o.right, o.top - r.top, r.bottom - o.bottom);
      if (over > 0.5) add('card-escape', el, `${over.toFixed(1)}px past its drawing`);
    }

    if (card && !freed(el, card)) {
      const c = card.getBoundingClientRect();
      const over = Math.max(c.left - r.left, r.right - c.right, c.top - r.top, r.bottom - c.bottom);
      // Drawing marks count: a halo cut off by the card's overflow is still drawn past it (TEAM-1). Absolute hit areas are pseudo-elements, so they never reach here.
      if (over > 0.5) add('card-escape', el, `${over.toFixed(1)}px past ${name(card)}`);
    }

    if (ownText(el) && !(el instanceof SVGElement)) {
      const s = getComputedStyle(el);
      const clipsX = s.overflowX !== 'visible' && el.scrollWidth > el.clientWidth + 1;
      if (clipsX && s.textOverflow !== 'ellipsis' && !/(auto|scroll)/.test(s.overflowX)) add('text-clip', el, `${el.scrollWidth} in ${el.clientWidth}`);
    }

    // Words stacked two at a time: a column too narrow for what it holds (CRH-3). Lines are read off the text itself, so a tall button or an avatar with one word is not a stack.
    if (args.phone && !(el instanceof SVGElement) && getComputedStyle(el).display !== 'inline' && (el.textContent ?? '').trim()) {
      const blockChild = Array.from(el.children).some((c) => getComputedStyle(c).display !== 'inline');
      if (!blockChild) {
        const range = document.createRange();
        range.selectNodeContents(el);
        const lines = new Set(Array.from(range.getClientRects()).filter((b) => b.width > 0 && b.height > 0).map((b) => Math.round(b.bottom / 4))).size;
        const words = (el.textContent ?? '').trim().split(/\s+/).length;
        if (lines >= 3 && words >= lines && words / lines < 3) add('cramped-text', el, `${words} words on ${lines} lines, ${r.width.toFixed(0)} wide`);
      }
    }

    // A desk's grid kept on a phone: side-by-side cells too narrow for the sentences in them (SYS-4, CRH-3's 147px columns).
    if (args.phone && !(el instanceof SVGElement) && getComputedStyle(el).display.endsWith('grid')) {
      const cols = getComputedStyle(el).gridTemplateColumns.split(' ').filter((t) => /px$/.test(t)).length;
      const kids = Array.from(el.children).filter((c) => visible(c));
      const wordy = kids.find((c) => (c.textContent ?? '').trim().split(/\s+/).length >= 8 && c.getBoundingClientRect().width < 180);
      if (cols >= 2 && wordy) add('cramped-text', el, `${cols} columns, ${wordy.getBoundingClientRect().width.toFixed(0)} wide, holding sentences`);
    }

    if (isCard(el)) {
      const outer = cardOf(el);
      if (outer && !freed(el, outer)) {
        const o = outer.getBoundingClientRect();
        const s = getComputedStyle(el);
        const lifted = (s.boxShadow && s.boxShadow !== 'none') || (px(s.borderTopWidth) > 0 && painted(s.borderTopColor));
        if (lifted && r.width >= o.width * 0.5) add('nested-surface', el, `inside ${name(outer)}`);
      }
    }

    if (args.phone && (ownText(el) || el.tagName === 'text' || el.tagName === 'tspan')) {
      const size = px(getComputedStyle(el).fontSize);
      // A drawing's text renders at its own scale, so measure what reaches the screen.
      const svg = (el as SVGElement).ownerSVGElement;
      const vb = svg?.viewBox?.baseVal;
      const scale = svg && vb && vb.width ? svg.getBoundingClientRect().width / vb.width : 1;
      if (size * scale < 11.75) add('phone-text', el, `${(size * scale).toFixed(1)}px`);
    }

    if (args.phone && el.matches('a[href], button, [role="button"], [role="tab"], [role="link"], [role="menuitem"], summary, select, input:not([type="hidden"]), textarea')) {
      if (el.closest('p, [data-ch-prose]') || (el as HTMLButtonElement).disabled) continue;
      // A hit area drawn on a pseudo-element counts, as it does for a finger.
      let w = r.width, h = r.height;
      for (const pseudo of ['::before', '::after']) {
        const p = getComputedStyle(el, pseudo);
        if (p.content === 'none' || p.position !== 'absolute') continue;
        w = Math.max(w, r.width - px(p.left) - px(p.right), px(p.width));
        h = Math.max(h, r.height - px(p.top) - px(p.bottom), px(p.height));
      }
      if (w < 43.5 || h < 43.5) add('tap-target', el, `${w.toFixed(0)}x${h.toFixed(0)}`);
    }

    if (card && !freed(el, card) && !(el instanceof SVGElement) && (ownText(el) || el.matches('img, .ch-avatar, [class*="avatar"]'))) {
      const c = card.getBoundingClientRect();
      const left = r.left - c.left, right = c.right - r.right;
      const near = Math.min(left, right);
      // A full-width drawing or a divider is meant to touch; a row's name, avatar or score is not.
      if (near >= -0.5 && near < 11.5 && r.width < c.width - 2) add('row-inset', el, `${near.toFixed(1)}px from ${name(card)}`);
    }
  }

  if (args.phone) {
    const probe = document.createElement('div');
    probe.style.cssText = 'position:absolute;visibility:hidden;width:var(--ch-page-x-phone)';
    root.appendChild(probe);
    const edge = probe.getBoundingClientRect().width;
    probe.remove();
    // The page edge is where the page's own blocks start: direct content, not full-bleed bands, bars, or anything in a sideways scroller.
    let min = Infinity, at: Element | null = null;
    for (const el of scope) {
      const r = el.getBoundingClientRect();
      if (r.width >= innerWidth - 1 || r.left < -0.5 || el instanceof SVGElement) continue;
      if (!(ownText(el) || isCard(el))) continue;
      if (el.closest('dialog, [role="dialog"], header, nav, .ch-phonebar, .ch-pbar, [data-ch-full-bleed]')) continue;
      let bleed = false;
      for (let n: Element | null = el; n && n !== root; n = n.parentElement) {
        const s = getComputedStyle(n);
        if (s.position === 'fixed' || s.position === 'sticky' || /(auto|scroll)/.test(s.overflowX)) { bleed = true; break; }
      }
      if (bleed) continue;
      if (r.left < min) { min = r.left; at = el; }
    }
    if (at && Math.abs(min - edge) > 0.5) add('page-edge', at, `starts at ${min.toFixed(1)}, token ${edge}`);
  }
  return out;
}
