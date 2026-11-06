'use client';

/**
 * A board as a picture for the composer (TASK_FIELDS 5.7). The card on screen is what's drawn, so the coach sends what
 * they saw: each box's fill, ring and corner, each line of text where it sits, and each chart's SVG with its computed
 * paint written onto it. Canvas only: an SVG holding HTML taints the canvas in WebKit, and a tainted canvas can't export.
 */

const SCALE = 2;
const SVG_PAINT = ['fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-linecap', 'stroke-opacity', 'opacity', 'font-family', 'font-size', 'font-weight', 'text-anchor', 'dominant-baseline'] as const;

const clear = (c: string) => !c || c === 'transparent' || /^rgba?\(.*[,/ ]\s*0\)$/.test(c);

function boxPath(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2));
}

/** The ring a hairline `box-shadow: 0 0 0 .5px` draws, if that's what the box has. */
export function ringOf(shadow: string): { color: string; width: number } | null {
  if (!shadow || shadow === 'none') return null;
  const m = /^(.*?\))?\s*(?:inset\s+)?0px 0px 0px ([\d.]+)px/.exec(shadow);
  if (!m?.[1]) return null;
  return { color: m[1].trim(), width: Number(m[2]) };
}

/** Words of one text node, grouped by the line the browser set them on. */
function linesOf(node: Text): Array<{ text: string; rect: DOMRect }> {
  const out: Array<{ text: string; rect: DOMRect }> = [];
  const raw = node.data;
  const range = document.createRange();
  for (const m of raw.matchAll(/\S+\s*/g)) {
    range.setStart(node, m.index);
    range.setEnd(node, m.index + m[0].trimEnd().length);
    const rect = range.getBoundingClientRect();
    if (!rect.width) continue;
    const last = out[out.length - 1];
    if (last && Math.abs(last.rect.top - rect.top) < 2) last.text += ` ${m[0].trimEnd()}`;
    else out.push({ text: m[0].trimEnd(), rect });
  }
  return out;
}

async function svgImage(svg: SVGSVGElement): Promise<HTMLImageElement> {
  const copy = svg.cloneNode(true) as SVGSVGElement;
  const from = [svg, ...svg.querySelectorAll('*')];
  const to = [copy, ...copy.querySelectorAll('*')];
  from.forEach((el, i) => {
    const cs = getComputedStyle(el);
    const paint = SVG_PAINT.map((k) => `${k}:${cs.getPropertyValue(k)}`).join(';');
    to[i]!.setAttribute('style', paint);
  });
  const box = svg.getBoundingClientRect();
  copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  copy.setAttribute('width', String(box.width));
  copy.setAttribute('height', String(box.height));
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(copy))}`;
  await img.decode();
  return img;
}

async function paint(g: CanvasRenderingContext2D, el: Element, ox: number, oy: number): Promise<void> {
  const cs = getComputedStyle(el);
  if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return;
  // Table and Expand are the coach's controls, not part of what the player is shown.
  if (el instanceof HTMLButtonElement) return;
  const box = el.getBoundingClientRect();
  const x = box.left - ox;
  const y = box.top - oy;
  if (el instanceof SVGSVGElement) {
    g.drawImage(await svgImage(el), x, y, box.width, box.height);
    return;
  }
  const r = parseFloat(cs.borderTopLeftRadius) || 0;
  if (!clear(cs.backgroundColor)) {
    boxPath(g, x, y, box.width, box.height, r);
    g.fillStyle = cs.backgroundColor;
    g.fill();
  }
  const ring = ringOf(cs.boxShadow);
  if (ring) {
    boxPath(g, x, y, box.width, box.height, r);
    g.strokeStyle = ring.color;
    g.lineWidth = ring.width;
    g.stroke();
  }
  for (const child of el.childNodes) {
    if (child instanceof Element) {
      await paint(g, child, ox, oy);
    } else if (child instanceof Text && child.data.trim()) {
      g.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      g.fillStyle = cs.color;
      g.textBaseline = 'alphabetic';
      for (const line of linesOf(child)) {
        const m = g.measureText(line.text);
        const up = m.fontBoundingBoxAscent ?? parseFloat(cs.fontSize) * 0.8;
        const down = m.fontBoundingBoxDescent ?? parseFloat(cs.fontSize) * 0.2;
        g.fillText(line.text, line.rect.left - ox, line.rect.top - oy + (line.rect.height + up - down) / 2);
      }
    }
  }
}

/** The board on screen, as a PNG file. Null when the browser can't draw it. */
export async function captureBoard(node: HTMLElement): Promise<File | null> {
  const box = node.getBoundingClientRect();
  if (!box.width || !box.height) return null;
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(box.width * SCALE);
  canvas.height = Math.ceil(box.height * SCALE);
  const g = canvas.getContext('2d');
  if (!g) return null;
  g.scale(SCALE, SCALE);
  // Its own paper behind it: a transparent PNG draws on the thread's colour, in whichever theme opens it.
  g.fillStyle = getComputedStyle(node.closest('.conf') ?? node).backgroundColor;
  g.fillRect(0, 0, box.width, box.height);
  await paint(g, node, box.left, box.top);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  return blob ? new File([blob], 'board.png', { type: 'image/png' }) : null;
}
