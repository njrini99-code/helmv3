#!/usr/bin/env node
/* Snapshot a live dev route into a single self-contained HTML file:
 *  - inlines every /_next/static/css/*.css  (the REAL compiled stylesheet)
 *  - inlines @font-face woff2 as data: URIs
 *  - drops <script> so qlmanage renders the deterministic SSR markup
 *  usage: node snap.mjs <path> <out.html> [widthPx]
 */
import path from 'node:path';

const [, , route, out, widthArg] = process.argv;
const BASE = 'http://localhost:3000';
const width = Number(widthArg || 390);

const get = async (u) => {
  const r = await fetch(u);
  if (!r.ok) throw new Error(`${r.status} ${u}`);
  return r;
};

// Turbopack dev generates a route's CSS chunk on demand: the FIRST response for
// a brand-new route can link a stylesheet that does not yet carry that route's
// own classes (measured — `.w-[390px]` present in the markup, absent from the
// served CSS). Warm the route, then read it.
await get(BASE + route).catch(() => {});
await new Promise((r) => setTimeout(r, 900));
let html = await (await get(BASE + route)).text();

// 1. collect stylesheet hrefs in document order
const hrefs = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]*>/g)]
  .map((m) => (m[0].match(/href="([^"]+)"/) || [])[1])
  .filter(Boolean);
if (!hrefs.length) console.error('WARN: no stylesheet links found');

let css = '';
for (const h of hrefs) {
  const u = h.startsWith('http') ? h : BASE + h;
  css += `\n/* ===== ${h} ===== */\n` + (await (await get(u)).text());
}

// 2. inline font files referenced by url(...) in the css
const fontUrls = [...new Set([...css.matchAll(/url\((\/_next\/static\/media\/[^)"']+\.(woff2?|ttf|otf))\)/g)].map((m) => m[1]))];
for (const f of fontUrls) {
  try {
    const buf = Buffer.from(await (await get(BASE + f)).arrayBuffer());
    const mime = f.endsWith('.woff2') ? 'font/woff2' : f.endsWith('.woff') ? 'font/woff' : 'font/ttf';
    css = css.split(`url(${f})`).join(`url(data:${mime};base64,${buf.toString('base64')})`);
  } catch (e) { console.error('font skip', f, e.message); }
}

// 2a. Collapse the stylesheet to the TARGET viewport width.
//     qlmanage renders into a square viewport of its own choosing and CSS
//     `zoom` does not change media-query evaluation, so a 390px-wide body was
//     still matching `lg:` rules and painting the two-column desktop layout.
//     Resolving width-based media queries here makes the sheet behave as the
//     phone regardless of the renderer's viewport.
function collapseMediaQueries(sheet, w) {
  let out = '';
  let i = 0;
  while (i < sheet.length) {
    const at = sheet.indexOf('@media', i);
    if (at === -1) { out += sheet.slice(i); break; }
    out += sheet.slice(i, at);
    const braceOpen = sheet.indexOf('{', at);
    if (braceOpen === -1) { out += sheet.slice(at); break; }
    const cond = sheet.slice(at + 6, braceOpen);
    // find the matching close brace
    let depth = 0, j = braceOpen;
    for (; j < sheet.length; j++) {
      if (sheet[j] === '{') depth++;
      else if (sheet[j] === '}') { depth--; if (depth === 0) break; }
    }
    const body = sheet.slice(braceOpen + 1, j);
    const px = (re) => { const m = cond.match(re); return m ? parseFloat(m[1]) * (m[0].includes('rem') ? 16 : 1) : null; };
    const min = px(/min-width:\s*([\d.]+)(?:px|rem)/);
    const max = px(/max-width:\s*([\d.]+)(?:px|rem)/);
    let keep = true;
    if (min !== null && w < min) keep = false;
    if (max !== null && w > max) keep = false;
    // width-less conditions (print, hover, prefers-*) are left as real at-rules
    if (min === null && max === null) out += sheet.slice(at, j + 1);
    else if (keep) out += body;           // inline the block, unconditionally true
    i = j + 1;
  }
  return out;
}
css = collapseMediaQueries(css, width);

// 2b. settle framer-motion's pre-mount inline state (opacity:0 / translate)
//     — we strip <script>, so nothing would ever animate it in.
html = html.replace(/style="([^"]*)"/g, (m, decls) => {
  const kept = decls
    .split(';')
    .filter((d) => {
      const t = d.trim();
      if (/^opacity:\s*0(\.0+)?$/.test(t)) return false;
      if (/^transform:\s*translate[XY]?\(/.test(t)) return false;
      if (/^animation-delay:/.test(t)) return false;
      return t.length > 0;
    })
    .join(';');
  return `style="${kept}"`;
});

// 2c. inline <img> sources (next/image serves through /_next/image, which the
//      snapshot cannot reach once it is a file:// document). The course
//      surfaces are image-forward — without this the cards render as a bare
//      scrim over cream and read as a design defect that is not there.
const imgSrcs = [...new Set([...html.matchAll(/<img[^>]+src="([^"]+)"/g)].map((m) => m[1]))];
let inlined = 0;
for (const src of imgSrcs) {
  if (src.startsWith('data:')) continue;
  try {
    const u = src.startsWith('http') ? src : BASE + src.replace(/&amp;/g, '&');
    const r = await get(u);
    const mime = r.headers.get('content-type') || 'image/png';
    const buf = Buffer.from(await r.arrayBuffer());
    // Quick Look renders a data: image fine on its own but drops every image
    // once the DOCUMENT gets large: at 2.28 MB (492 KB CSS + six ~140 KB
    // base64 photos) every <img> came back as the broken-image glyph, while
    // the very same data URI rendered in a one-image page. Downsample hard.
    let out64;
    if (/svg/.test(mime)) {
      out64 = { b: buf, m: mime };
    } else {
      const os = await import('node:os');
      const fsp = await import('node:fs/promises');
      const cp = await import('node:child_process');
      const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'snapimg-'));
      const inF = path.join(tmp, 'in'); const outF = path.join(tmp, 'out.jpg');
      await fsp.writeFile(inF, buf);
      try {
        cp.execFileSync('sips', ['-Z', '520', '-s', 'format', 'jpeg', '-s', 'formatOptions', '58', inF, '--out', outF], { stdio: 'ignore' });
        out64 = { b: await fsp.readFile(outF), m: 'image/jpeg' };
      } catch { out64 = { b: buf, m: mime }; }
      await fsp.rm(tmp, { recursive: true, force: true });
    }
    html = html.split(src).join(`data:${out64.m};base64,${out64.b.toString('base64')}`);
    inlined++;
  } catch (e) { console.error('img skip', src.slice(0, 60), e.message); }
}
// srcset entries we did not resolve would out-rank the inlined src
html = html
  // React serialises the attribute as `srcSet`, so this MUST be case-insensitive:
  // a case-sensitive strip left it in place, WebKit chose a candidate from it over
  // the inlined src, and every photo rendered as the broken-image glyph.
  .replace(/\ssrcset="[^"]*"/gi, '')
  .replace(/\ssizes="[^"]*"/gi, '')
  // a lazy image below the renderer's fold never decodes in a one-shot capture
  .replace(/\sloading="lazy"/g, '')
  .replace(/\sdecoding="async"/g, '');

// 3. strip scripts + preloads + the original stylesheet links
html = html
  .replace(/<script[\s\S]*?<\/script>/g, '')
  .replace(/<link[^>]+rel="stylesheet"[^>]*>/g, '')
  .replace(/<link[^>]+rel="preload"[^>]*>/g, '');

// 4. inject the inlined css + a viewport clamp so the mobile layout renders
const shell = `<style>${css}</style>
<style>
  html,body{margin:0;padding:0;background:var(--fw-color-canvas,#FAF6EE);
            height:auto!important;overflow:visible!important;}
  /* CSS entrance utilities never complete without a live frame loop */
  .animate-fade-in-up{animation:none!important;opacity:1!important;transform:none!important;}
  /* next/image fades in from opacity-0 on its onLoad handler; with scripts
     stripped that never fires and every photo stays invisible, which reads as
     a card with no imagery rather than a card whose photo has not painted. */
  img{opacity:1!important;}
  /* the shimmer that sits UNDER that photo would otherwise paint over it */
  img + *[class*="animate-pulse"], *[class*="animate-pulse"]:has(+ img){display:none!important;}
  body>*{max-width:${width}px;}
  body{width:${width}px;overflow-x:hidden;}
</style>`;
html = html.replace('</head>', shell + '</head>');

// Silent-zero guard: a class present in the markup but absent from the CSS
// renders as nothing at all, and looks exactly like a design decision.
const used = new Set();
for (const m of html.matchAll(/class="([^"]+)"/g)) for (const t of m[1].split(/\s+/)) if (t) used.add(t);
const esc = (c) => c.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
const missing = [...used].filter((c) => !/^(hover|focus|active|group|peer|motion|dark|sm|md|lg|xl|2xl|aria|data|disabled|\[)/.test(c))
  .filter((c) => !css.includes('.' + esc(c) + '{') && !css.includes('.' + esc(c) + ' ') && !css.includes('.' + esc(c) + ','));
if (missing.length) console.error(`WARN ${missing.length} classes with no CSS rule: ${missing.slice(0, 12).join(' ')}`);

await (await import('node:fs/promises')).writeFile(out, html);
console.log(`ok ${route} -> ${out}  css=${(css.length / 1024).toFixed(0)}KB imgs=${inlined}/${imgSrcs.length} sheets=${hrefs.length}`);
