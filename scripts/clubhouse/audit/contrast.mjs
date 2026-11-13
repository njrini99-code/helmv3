/* global window, document, devicePixelRatio -- the page.evaluate callbacks run inside the page */
// Painted contrast: what the eye gets, not what the stylesheet says.
// Takes two screenshots of the same frame: as painted, and with all text made transparent.
// The second gives the true background under each text run (gradients, glass, images,
// hover fills), and the text colour is blended over every background pixel with its real
// alpha and ancestor opacity. Reports WCAG 2 ratio and APCA Lc per text run.
//
// Usage (needs probe.js injected with addInitScript):
//   import { measureContrast } from './contrast.mjs';
//   const rows = await measureContrast(page, { label: 'P002-home/390/dark' });
//
// Ported from the October audit kit (~/clubhouse-audit/harness). The kit used `pngjs` and `apca-w3`; this port adds no
// package: decodePng reads Playwright's 8-bit PNG screenshots with node:zlib, and apca is APCA-W3 0.1.9 (APCA 0.0.98G-4g
// constants), checked against both packages on the same pixels. Floors are the kit's 01-RUBRIC.md CT-01 to CT-05.
//
// Floors are the rubric's CT-01 to CT-05 exactly, graded on the 5th percentile of the text's pixels (anti-aliased
// edges don't decide it; the worst pixel is kept as evidence):
//   body and UI text (CT-01)        4.5:1 and Lc 75
//   large text (CT-02)              3:1 and Lc 60   (>= 24 px, or >= 18.66 px at weight 700)
//   meta, captions, counts (CT-03)  4.5:1 and Lc 60 (<time>, <small>, <figcaption>, or under 14 px; data-ct overrides)
//   placeholders (CT-04)            Lc 45
//   non-text (CT-05)                3:1 (measureNonText, measureFocusRing); A needs 4.5:1 for tab indicator and focus ring

import { inflateSync } from 'node:zlib';

/** An 8-bit RGB or RGBA, non-interlaced PNG (what Playwright's screenshot writes) as { width, height, data: RGBA }. */
export function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let pos = 8;
  let width = 0, height = 0, depth = 0, color = 0, interlace = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const chunk = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') { width = chunk.readUInt32BE(0); height = chunk.readUInt32BE(4); depth = chunk[8]; color = chunk[9]; interlace = chunk[12]; }
    else if (type === 'IDAT') idat.push(chunk);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  if (depth !== 8 || interlace !== 0 || (color !== 2 && color !== 6)) throw new Error(`unsupported PNG: depth ${depth}, colour type ${color}, interlace ${interlace}`);
  const ch = color === 6 ? 4 : 3;
  const stride = width * ch;
  const raw = inflateSync(Buffer.concat(idat));
  const data = Buffer.alloc(width * height * 4);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const cur = Buffer.alloc(stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? cur[x - ch] : 0;
      const b = prev[x];
      const c = x >= ch ? prev[x - ch] : 0;
      let pred = 0;
      if (filter === 1) pred = a;
      else if (filter === 2) pred = b;
      else if (filter === 3) pred = (a + b) >> 1;
      else if (filter === 4) { const p = a + b - c; const pa = Math.abs(p - a); const pb = Math.abs(p - b); const pc = Math.abs(p - c); pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      else if (filter !== 0) throw new Error(`bad PNG filter ${filter}`);
      cur[x] = (line[x] + pred) & 255;
    }
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      data[o] = cur[x * ch]; data[o + 1] = cur[x * ch + 1]; data[o + 2] = cur[x * ch + 2]; data[o + 3] = ch === 4 ? cur[x * ch + 3] : 255;
    }
    prev = cur;
  }
  return { width, height, data };
}
const PNG = { sync: { read: decodePng } };

// APCA-W3 0.1.9 (APCA 0.0.98G-4g constants), as `apca-w3` exports them.
const A = { mainTRC: 2.4, sRco: 0.2126729, sGco: 0.7151522, sBco: 0.072175, normBG: 0.56, normTXT: 0.57, revTXT: 0.62, revBG: 0.65,
  blkThrs: 0.022, blkClmp: 1.414, scaleBoW: 1.14, scaleWoB: 1.14, loBoWoffset: 0.027, loWoBoffset: 0.027, deltaYmin: 0.0005, loClip: 0.1 };
export const sRGBtoY = ([r, g, b]) => A.sRco * (r / 255) ** A.mainTRC + A.sGco * (g / 255) ** A.mainTRC + A.sBco * (b / 255) ** A.mainTRC;
export function APCAcontrast(txtY, bgY) {
  if (Number.isNaN(txtY) || Number.isNaN(bgY) || Math.min(txtY, bgY) < 0 || Math.max(txtY, bgY) > 1.1) return 0;
  const t = txtY > A.blkThrs ? txtY : txtY + (A.blkThrs - txtY) ** A.blkClmp;
  const g = bgY > A.blkThrs ? bgY : bgY + (A.blkThrs - bgY) ** A.blkClmp;
  if (Math.abs(g - t) < A.deltaYmin) return 0;
  if (g > t) { const sapc = (g ** A.normBG - t ** A.normTXT) * A.scaleBoW; return (sapc < A.loClip ? 0 : sapc - A.loBoWoffset) * 100; }
  const sapc = (g ** A.revBG - t ** A.revTXT) * A.scaleWoB;
  return (sapc > -A.loClip ? 0 : sapc + A.loWoBoffset) * 100;
}

const HIDE_TEXT = `*,*::before,*::after{color:transparent!important;-webkit-text-fill-color:transparent!important;
text-shadow:none!important;caret-color:transparent!important;text-decoration-color:transparent!important}
::placeholder{color:transparent!important;-webkit-text-fill-color:transparent!important}
svg text,svg tspan{fill:transparent!important;stroke:transparent!important}`;

const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
export const wcag = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
export const apca = (text, bg) => Math.abs(APCAcontrast(sRGBtoY(text), sRGBtoY(bg)));
const blend = ([r, g, b], a, bg) => [r * a + bg[0] * (1 - a), g * a + bg[1] * (1 - a), b * a + bg[2] * (1 - a)].map(Math.round);

// Floors: 01-RUBRIC.md §4.5, CT-01 to CT-04. `kind` comes from probe.js textBoxes (body, meta, large, placeholder).
export const floors = ({ fontSize, fontWeight = 400, placeholder = false, kind = null }) => {
  const large = fontSize >= 24 || (fontSize >= 18.66 && fontWeight >= 700);
  const k = placeholder ? 'placeholder' : kind || (large ? 'large' : fontSize < 14 ? 'meta' : 'body');
  if (k === 'placeholder') return { kind: k, wcag: 0, lc: 45, aLc: 60 };
  if (k === 'large') return { kind: k, wcag: 3, lc: 60, aLc: 75 };
  if (k === 'meta') return { kind: k, wcag: 4.5, lc: 60, aLc: 75 };
  return { kind: 'body', wcag: 4.5, lc: 75, aLc: 90 };
};

export async function measureContrast(page, { label = '', inset = 1, sampleStep = 2 } = {}) {
  const dpr = await page.evaluate(() => devicePixelRatio);
  const boxes = await page.evaluate(() => window.__chAudit.textBoxes());
  const painted = PNG.sync.read(await page.screenshot({ animations: 'disabled' }));
  const style = await page.addStyleTag({ content: HIDE_TEXT });
  const bare = PNG.sync.read(await page.screenshot({ animations: 'disabled' }));
  await style.evaluate((el) => el.remove());

  const rows = [];
  for (const b of boxes) {
    const [r, g, bl, a] = b.rgba;
    const alpha = a * b.opacity;
    const x0 = Math.max(0, Math.floor((b.x + inset) * dpr)); const y0 = Math.max(0, Math.floor((b.y + inset) * dpr));
    const x1 = Math.min(bare.width, Math.ceil((b.x + b.w - inset) * dpr)); const y1 = Math.min(bare.height, Math.ceil((b.y + b.h - inset) * dpr));
    const ratios = []; const lcs = [];
    for (let y = y0; y < y1; y += sampleStep) {
      for (let x = x0; x < x1; x += sampleStep) {
        const i = (y * bare.width + x) * 4;
        const bg = [bare.data[i], bare.data[i + 1], bare.data[i + 2]];
        const fg = blend([r, g, bl], alpha, bg);
        ratios.push(wcag(fg, bg)); lcs.push(apca(fg, bg));
      }
    }
    if (!ratios.length) continue;
    ratios.sort((m, n) => m - n); lcs.sort((m, n) => m - n);
    const p5 = (arr) => arr[Math.floor((arr.length - 1) * 0.05)];
    const floor = floors(b);
    const row = {
      label, el: b.el, text: b.text, fontSize: b.fontSize, fontWeight: b.fontWeight, placeholder: b.placeholder,
      wcagWorst: +ratios[0].toFixed(2), wcagP5: +p5(ratios).toFixed(2),
      lcWorst: +lcs[0].toFixed(1), lcP5: +p5(lcs).toFixed(1),
      kind: floor.kind, floorWcag: floor.wcag, floorLc: floor.lc, aLc: floor.aLc,
    };
    // Grade on the 5th percentile so anti-aliased edges don't decide it; the worst pixel is kept as evidence.
    row.failWcag = row.wcagP5 < floor.wcag;
    row.failApca = row.lcP5 < floor.lc;
    if (!covered(b)) row.notPainted = true;
    row.belowA = row.lcP5 < floor.aLc;
    rows.push(row);
  }
  return rows;

  // Painted pixels prove the text actually rendered (catches text hidden by a later layer).
  function covered(b) {
    const cx = Math.floor((b.x + b.w / 2) * dpr); const cy = Math.floor((b.y + b.h / 2) * dpr);
    if (cx >= painted.width || cy >= painted.height) return true;
    let diff = 0;
    for (let y = Math.max(0, cy - 3); y < Math.min(painted.height, cy + 3); y++) {
      for (let x = Math.max(0, cx - 12); x < Math.min(painted.width, cx + 12); x++) {
        const i = (y * painted.width + x) * 4;
        diff += Math.abs(painted.data[i] - bare.data[i]) + Math.abs(painted.data[i + 1] - bare.data[i + 1]);
      }
    }
    return diff > 0;
  }
}

// ---- Non-text contrast (CT-05, WCAG 1.4.11): 3:1 against what is next to the part. Icons are read against the
// background painted under them (icons hidden); borders, toggles and tab indicators against a ring just outside
// them. An input passes if either its border or its fill stands out from the surface around it.
const HIDE_ICONS = `${HIDE_TEXT} svg{visibility:hidden!important}`;
const ringPixels = (png, dpr, b, out = 2, band = 2) => {
  const px = [];
  const x0 = Math.floor((b.x - out - band) * dpr); const x1 = Math.ceil((b.x + b.w + out + band) * dpr);
  const y0 = Math.floor((b.y - out - band) * dpr); const y1 = Math.ceil((b.y + b.h + out + band) * dpr);
  const ix0 = Math.floor((b.x - out) * dpr); const ix1 = Math.ceil((b.x + b.w + out) * dpr);
  const iy0 = Math.floor((b.y - out) * dpr); const iy1 = Math.ceil((b.y + b.h + out) * dpr);
  for (let y = Math.max(0, y0); y < Math.min(png.height, y1); y += 1) {
    for (let x = Math.max(0, x0); x < Math.min(png.width, x1); x += 1) {
      if (x >= ix0 && x < ix1 && y >= iy0 && y < iy1) continue;
      const i = (y * png.width + x) * 4; px.push([png.data[i], png.data[i + 1], png.data[i + 2]]);
    }
  }
  return px;
};
const insidePixels = (png, dpr, b) => {
  const px = [];
  for (let y = Math.max(0, Math.floor(b.y * dpr)); y < Math.min(png.height, Math.ceil((b.y + b.h) * dpr)); y += 1) {
    for (let x = Math.max(0, Math.floor(b.x * dpr)); x < Math.min(png.width, Math.ceil((b.x + b.w) * dpr)); x += 1) {
      const i = (y * png.width + x) * 4; px.push([png.data[i], png.data[i + 1], png.data[i + 2]]);
    }
  }
  return px;
};
const p5ratio = (fg, alpha, pixels) => {
  const r = pixels.map((bg) => wcag(blend(fg, alpha, bg), bg)).sort((m, n) => m - n);
  return r.length ? r[Math.floor((r.length - 1) * 0.05)] : null;
};

export async function measureNonText(page, { label = '' } = {}) {
  const dpr = await page.evaluate(() => devicePixelRatio);
  const parts = await page.evaluate(() => window.__chAudit.nonTextBoxes());
  const painted = PNG.sync.read(await page.screenshot({ animations: 'disabled' }));
  const style = await page.addStyleTag({ content: HIDE_ICONS });
  const bare = PNG.sync.read(await page.screenshot({ animations: 'disabled' }));
  await style.evaluate((el) => el.remove());
  const rows = [];
  for (const p of parts) {
    const [r, g, b, a] = p.rgba;
    const alpha = a * p.opacity;
    let ratio;
    if (p.kind === 'icon') ratio = p5ratio([r, g, b], alpha, insidePixels(bare, dpr, p));
    else {
      const ring = ringPixels(painted, dpr, p);
      ratio = p5ratio([r, g, b], alpha, ring);
      if (p.kind === 'input-border' && p.fillRgba && p.fillRgba[3] > 0.05) {
        const fill = p5ratio(p.fillRgba.slice(0, 3), p.fillRgba[3] * p.opacity, ring);
        ratio = Math.max(ratio ?? 0, fill ?? 0);
      }
    }
    if (ratio == null) continue;
    const needA = p.aaNeeds || 3;
    rows.push({ label, el: p.el, kind: p.kind, color: p.color, ratio: +ratio.toFixed(2), floor: 3, fail: ratio < 3, belowA: ratio < needA });
  }
  return rows;
}

/** The focus ring of one control, focused as a keyboard would: ring colour against the surface it is drawn on. */
export async function measureFocusRing(page, selector, { label = '' } = {}) {
  const dpr = await page.evaluate(() => devicePixelRatio);
  const before = PNG.sync.read(await page.screenshot({ animations: 'disabled' }));
  await page.focus(selector);
  // Make it keyboard focus (:focus-visible): step off and back with the keyboard if a script focus didn't count.
  if (!(await page.evaluate((s) => document.querySelector(s).matches(':focus-visible'), selector))) { await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Tab'); }
  const ring = await page.evaluate((s) => window.__chAudit.focusRing(s), selector);
  if (!ring || !ring.rgba || !ring.width) return { label, selector, ring, ratio: null, fail: true, reason: 'no visible focus ring' };
  const out = Math.max(0, ring.offset);
  const ratio = p5ratio(ring.rgba.slice(0, 3), ring.rgba[3], ringPixels(before, dpr, ring, out, Math.max(1, ring.width)));
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  return { label, selector, color: ring.color, width: ring.width, focusVisible: ring.focusVisible, ratio: ratio == null ? null : +ratio.toFixed(2), floor: 3, fail: ratio == null || ratio < 3, belowA: ratio == null || ratio < 4.5 };
}
