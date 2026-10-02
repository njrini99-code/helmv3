/**
 * The local screenshot gallery behind `clubhouse:shots -- gallery`: one HTML page per Clubhouse page,
 * `<store>/<P###-slug>/GALLERY.html`, and a top-level `<store>/GALLERY.html` that links each. Built from
 * the manifest entries (nothing is read from the images). Local only: the store is gitignored, so the
 * pages are never committed and link to the images by relative path.
 *
 * Shots are grouped by surface, then state. When a surface, role, viewport and state have both a
 * before (or, failing that, a baseline) and an after, the two sit side by side; every other shot of
 * the group follows, newest first.
 */

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const newest = (a, b) => `${b.capturedAt ?? ''}${b.date}`.localeCompare(`${a.capturedAt ?? ''}${a.date}`) || b.file.localeCompare(a.file);

/** Manifest entries (with the `date` of the directory they were found in) as shots, newest first. */
export const sortShots = (shots) => [...shots].sort(newest);

/**
 * `{ surface, states: [{ state, groups: [{ role, viewport, pair, others }] }] }[]`: surfaces and states in name
 * order, groups by role then viewport. `pair` is `{ before, after }` (the newest of each; `before` falls back to
 * the newest baseline) or null; `others` is every shot not in the pair, newest first.
 */
export function groupShots(shots) {
  const bySurface = new Map();
  for (const s of sortShots(shots)) {
    if (!bySurface.has(s.surface)) bySurface.set(s.surface, new Map());
    const states = bySurface.get(s.surface);
    if (!states.has(s.state)) states.set(s.state, new Map());
    const key = `${s.role}|${s.viewport}`;
    const groups = states.get(s.state);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(s);
  }
  const num = (v) => parseInt(v, 10) || 0;
  return [...bySurface.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([surface, states]) => ({
      surface,
      states: [...states.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([state, groups]) => ({
          state,
          groups: [...groups.values()]
            .map((list) => pairGroup(list))
            .sort((a, b) => a.role.localeCompare(b.role) || num(a.viewport) - num(b.viewport)),
        })),
    }));
}

/** The pair and the rest for the shots of one surface, state, role and viewport (already newest first). */
export function pairGroup(list) {
  const first = (phase) => list.find((s) => s.phase === phase);
  const before = first('before') ?? first('baseline');
  const after = first('after');
  const pair = before && after ? { before, after } : null;
  return { role: list[0].role, viewport: list[0].viewport, pair, others: list.filter((s) => !pair || (s !== pair.before && s !== pair.after)) };
}

const card = (s, rel) => `<figure class="shot" data-role="${esc(s.role)}" data-viewport="${esc(s.viewport)}">
  <a href="${esc(rel(s))}"><img loading="lazy" src="${esc(rel(s))}" alt="${esc(s.file)}"></a>
  <figcaption><code>${esc(s.file)}</code><span>${esc(s.role)} · ${esc(s.viewport)}px · <b class="ph ph-${esc(s.phase)}">${esc(s.phase)}</b> · ${esc(String(s.commit ?? '').slice(0, 7))} · ${esc(s.date)}</span>${s.note ? `<span class="note">${esc(s.note)}</span>` : ''}${s.route ? `<span class="note">route ${esc(s.route)}</span>` : ''}</figcaption>
</figure>`;

const STYLE = `:root{color-scheme:light dark;--bg:#f4f2ea;--panel:#fcfbf7;--ink:#1c1b18;--sub:#55524b;--line:#d9d4c6;--accent:#0f4a2f}
@media (prefers-color-scheme:dark){:root{--bg:#161a17;--panel:#1e2420;--ink:#ece8dc;--sub:#a9a699;--line:#34402f;--accent:#7fd1a0}}
*{box-sizing:border-box}body{margin:0;padding:24px 20px 64px;background:var(--bg);color:var(--ink);font:14px/1.45 system-ui,sans-serif}
h1{margin:0 0 4px;font-size:22px}h2{margin:32px 0 4px;font-size:17px}h3{margin:18px 0 8px;font-size:14px;color:var(--sub);font-weight:600}
.lede{margin:0 0 16px;color:var(--sub)}.bar{display:flex;gap:12px;flex-wrap:wrap;align-items:center;margin:12px 0 4px}
select{padding:6px 8px;border:1px solid var(--line);border-radius:8px;background:var(--panel);color:var(--ink);font:inherit}
.row{display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start;margin-bottom:12px}
.pair{display:flex;gap:12px;flex-wrap:wrap;padding:10px;border:1px solid var(--line);border-radius:12px;background:var(--panel)}
.shot{margin:0;max-width:340px}.shot img{display:block;max-width:100%;height:auto;border:1px solid var(--line);border-radius:8px;background:#fff}
.shot[data-viewport="1440"]{max-width:560px}.shot[data-viewport="1440"] img{width:100%}
figcaption{display:flex;flex-direction:column;gap:2px;margin-top:6px;font-size:12px;color:var(--sub);word-break:break-all}
figcaption code{color:var(--ink);font-size:11px}.note{font-style:italic}
.ph{padding:0 5px;border-radius:5px;border:1px solid var(--line)}.ph-after{color:var(--accent);border-color:var(--accent)}
.hidden{display:none!important}a{color:var(--accent)}ul{padding-left:18px}`;

const SCRIPT = `const sel=(id)=>document.getElementById(id);
function apply(){const r=sel('role').value,v=sel('viewport').value;
for(const f of document.querySelectorAll('.shot'))f.classList.toggle('hidden',(r&&f.dataset.role!==r)||(v&&f.dataset.viewport!==v));
for(const g of document.querySelectorAll('.pair,.row'))g.classList.toggle('hidden',!g.querySelector('.shot:not(.hidden)'));
for(const s of document.querySelectorAll('section.state'))s.classList.toggle('hidden',!s.querySelector('.shot:not(.hidden)'));}
sel('role').onchange=apply;sel('viewport').onchange=apply;`;

/** One page's gallery as an HTML string. `shots` carry `date` and the manifest fields; image paths are `<date>/<file>`. */
export function renderGallery({ page, slug, shots }) {
  const rel = (s) => `${s.date}/${s.file}`;
  const roles = [...new Set(shots.map((s) => s.role))].sort();
  const viewports = [...new Set(shots.map((s) => s.viewport))].sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
  let body = '';
  for (const { surface, states } of groupShots(shots)) {
    body += `<h2>${esc(surface)}</h2>\n`;
    for (const { state, groups } of states) {
      body += `<section class="state"><h3>${esc(state)}</h3>\n`;
      for (const g of groups) {
        if (g.pair) body += `<div class="pair">${card(g.pair.before, rel)}${card(g.pair.after, rel)}</div>\n`;
        if (g.others.length) body += `<div class="row">${g.others.map((s) => card(s, rel)).join('')}</div>\n`;
      }
      body += '</section>\n';
    }
  }
  const opts = (list) => list.map((x) => `<option value="${esc(x)}">${esc(x)}</option>`).join('');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(page)} ${esc(slug)} screenshots</title><style>${STYLE}</style></head>
<body>
<p><a href="../GALLERY.html">All pages</a></p>
<h1>${esc(page)} ${esc(slug)}: screenshots</h1>
<p class="lede">${shots.length} shot(s), local and never committed. A before (or baseline) and an after of the same surface, role, viewport and state sit side by side; newest first. Naming: <code>P###__surface__role__viewport__state__phase__sha7.png</code>.</p>
<div class="bar"><label>Role <select id="role"><option value="">all</option>${opts(roles)}</select></label><label>Viewport <select id="viewport"><option value="">all</option>${opts(viewports)}</select></label></div>
${body}<script>${SCRIPT}</script>
</body></html>
`;
}

/** The top-level page: one link per Clubhouse page that has screenshots. */
export function renderIndex(pages) {
  const items = pages.map((p) => `<li><a href="${esc(`${p.page}-${p.slug}/GALLERY.html`)}">${esc(p.page)} ${esc(p.slug)}</a> (${p.count} shot(s), latest ${esc(p.latest ?? 'none')})</li>`).join('\n');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Clubhouse screenshots</title><style>${STYLE}</style></head>
<body>
<h1>Clubhouse screenshots</h1>
<p class="lede">Local and gitignored. Regenerate with <code>npm run clubhouse:shots -- gallery</code>.</p>
<ul>
${items || '<li>No screenshots yet.</li>'}
</ul>
</body></html>
`;
}
