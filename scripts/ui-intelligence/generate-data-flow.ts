/**
 * generate-data-flow.ts
 *
 * From ui-intelligence/.atlas-parts-v2/*.json (fallback .atlas-parts/) builds:
 *   A) Reverse index  table -> [{route, role, access:read|write}]
 *   B) Per-route data-flow  reads -> page -> writes (+ rpcs)
 * Outputs: data-flow.json, DATA-FLOW.md, data-flow.html.
 *
 * Run: tsx scripts/ui-intelligence/generate-data-flow.ts   (npm run ui:dataflow)
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const UI = path.join(ROOT, 'ui-intelligence');
const V2 = path.join(UI, '.atlas-parts-v2');
const V1 = path.join(UI, '.atlas-parts');

interface DC { reads?: string[]; writes?: string[]; rpcs?: string[]; tables?: string[]; }
interface Page { route: string; label: string; role: string; folder: string; dataContract?: DC; dataSources?: string[]; }

// ---- load pages (prefer v2 per cluster) -----------------------------------
function loadParts(): Page[] {
  const out: Page[] = [];
  const seen = new Set<string>();
  for (const base of [V2, V1]) {
    let files: string[] = [];
    try { files = fs.readdirSync(base); } catch { continue; }
    for (const fn of files) {
      if (!fn.endsWith('.json') || fn === '_crosscut.json') continue;
      const cluster = fn.replace(/\.json$/, '');
      if (base === V1 && seen.has(cluster)) continue; // v2 wins
      seen.add(cluster);
      try {
        const arr = JSON.parse(fs.readFileSync(path.join(base, fn), 'utf8')) as Page[];
        if (Array.isArray(arr)) out.push(...arr);
      } catch { /* skip */ }
    }
  }
  return out;
}

const TABLE_RE = /\b(?:golf|crm)_[a-z0-9_]+\b/g;
function tablesFrom(strs: string[]): string[] {
  const t = new Set<string>();
  for (const s of strs || []) {
    for (const m of s.match(TABLE_RE) || []) {
      // drop obvious file refs like golf_stats_calculator (.ts/.tsx nearby)
      if (new RegExp(m + '[-.]?(ts|tsx)\\b').test(s)) continue;
      t.add(m);
    }
  }
  return [...t];
}

// ---- build per-route flow + reverse index ----------------------------------
type Access = 'read' | 'write' | 'read/write';
interface FlowRoute { route: string; label: string; role: string; reads: string[]; writes: string[]; rpcs: string[]; }
const pages = loadParts();
const flows: FlowRoute[] = [];
const reverse: Record<string, { route: string; label: string; role: string; access: Access }[]> = {};

// de-dupe routes (shared routes appear twice — keep both roles)
const seenRoute = new Set<string>();
for (const p of pages) {
  const dc = p.dataContract || {};
  const writeText = (dc.writes || []).join('  ||  ');
  const tableSet = new Set<string>([...(dc.tables || [])]);
  tablesFrom(dc.reads || []).forEach((t) => tableSet.add(t));
  tablesFrom(dc.writes || []).forEach((t) => tableSet.add(t));
  if (tableSet.size === 0 && !(dc.rpcs || []).length) continue;

  const reads: string[] = [];
  const writes: string[] = [];
  for (const t of tableSet) {
    const isWrite = writeText.includes(t);
    const isRead = !isWrite; // a table is "read" unless it shows up in a write op
    if (isWrite) writes.push(t); else reads.push(t);
    const access: Access = isWrite ? 'write' : 'read';
    (reverse[t] = reverse[t] || []).push({ route: p.route, label: p.label, role: p.role, access });
  }
  const key = p.role + ' ' + p.route + ' ' + p.folder;
  if (seenRoute.has(key)) continue;
  seenRoute.add(key);
  flows.push({ route: p.route, label: p.label, role: p.role, reads: reads.sort(), writes: writes.sort(), rpcs: (dc.rpcs || []) });
}

// collapse reverse-index duplicates (same table+route+role+access)
for (const t of Object.keys(reverse)) {
  const m = new Map<string, { route: string; label: string; role: string; access: Access }>();
  for (const e of reverse[t]) {
    const k = e.route + '|' + e.role;
    const prev = m.get(k);
    if (prev && prev.access !== e.access) prev.access = 'read/write';
    else if (!prev) m.set(k, { ...e });
  }
  reverse[t] = [...m.values()].sort((a, b) => a.route.localeCompare(b.route));
}
const tablesSorted = Object.keys(reverse).sort((a, b) => reverse[b].length - reverse[a].length || a.localeCompare(b));

// ---- write JSON ------------------------------------------------------------
fs.writeFileSync(
  path.join(UI, 'data-flow.json'),
  JSON.stringify({ generatedFrom: 'atlas-parts-v2', tables: tablesSorted.map((t) => ({ table: t, routes: reverse[t] })), routes: flows }, null, 2),
);

// ---- write Markdown --------------------------------------------------------
const esc = (s: string) => String(s).replace(/\|/g, '\\|');
let md = '# GolfHelm Data Flow\n\n';
md += `Generated from the verified atlas analysis. ${tablesSorted.length} tables across ${flows.length} routes.\n\n`;
md += '## Reverse index — table → routes (R=read, W=write)\n\n';
md += '| Table | # | Routes |\n|---|---|---|\n';
for (const t of tablesSorted) {
  const rs = reverse[t].map((e) => `${e.role === 'coach' ? '🟦' : e.role === 'player' ? '🟩' : '⬜'} \`${e.route}\` (${e.access === 'write' ? 'W' : e.access === 'read/write' ? 'RW' : 'R'})`).join('<br>');
  md += `| \`${t}\` | ${reverse[t].length} | ${rs} |\n`;
}
md += '\n## Per-route data flow (reads → page → writes)\n\n';
for (const f of flows.sort((a, b) => a.role.localeCompare(b.role) || a.route.localeCompare(b.route))) {
  md += `### ${esc(f.label)} — \`${f.route}\` _[${f.role}]_\n`;
  md += `- **reads:** ${f.reads.length ? f.reads.map((t) => '`' + t + '`').join(', ') : '—'}\n`;
  md += `- **writes:** ${f.writes.length ? f.writes.map((t) => '`' + t + '`').join(', ') : '—'}\n`;
  if (f.rpcs.length) md += `- **rpcs:** ${f.rpcs.map((t) => '`' + t + '`').join(', ')}\n`;
  md += '\n';
}
fs.writeFileSync(path.join(UI, 'DATA-FLOW.md'), md);

// ---- write HTML ------------------------------------------------------------
const h = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const chip = (t: string, kind: string) => `<span class="chip ${kind}">${h(t)}</span>`;
const roleDot = (r: string) => `<span class="dot ${r}" title="${r}"></span>`;

const flowCards = flows
  .sort((a, b) => a.role.localeCompare(b.role) || a.route.localeCompare(b.route))
  .map((f) => `
  <div class="flow" data-role="${f.role}" data-text="${h((f.label + ' ' + f.route + ' ' + f.reads.join(' ') + ' ' + f.writes.join(' ')).toLowerCase())}">
    <div class="flow-h">${roleDot(f.role)}<b>${h(f.label)}</b> <code>${h(f.route)}</code></div>
    <div class="flow-row">
      <div class="col reads"><div class="lbl">READS ↓</div>${f.reads.map((t) => chip(t, 'r')).join('') || '<span class="muted">—</span>'}</div>
      <div class="arrow">→ <span class="page">page</span> →</div>
      <div class="col writes"><div class="lbl">WRITES ↑</div>${f.writes.map((t) => chip(t, 'w')).join('') || '<span class="muted">—</span>'}</div>
    </div>
    ${f.rpcs.length ? `<div class="rpcs">rpc: ${f.rpcs.map((t) => chip(t, 'rpc')).join('')}</div>` : ''}
  </div>`)
  .join('');

const revRows = tablesSorted
  .map((t) => `
  <tr data-text="${h((t + ' ' + reverse[t].map((e) => e.route).join(' ')).toLowerCase())}">
    <td><code>${h(t)}</code></td><td class="num">${reverse[t].length}</td>
    <td>${reverse[t].map((e) => `${roleDot(e.role)}<code>${h(e.route)}</code> <span class="badge ${e.access.replace('/', '')}">${e.access === 'write' ? 'W' : e.access === 'read/write' ? 'R/W' : 'R'}</span>`).join('<br>')}</td>
  </tr>`)
  .join('');

const html = `<!doctype html><html><head><meta charset="utf-8"><title>GolfHelm Data Flow</title>
<style>
:root{--green:#16A34A;--cream:#FFFEFA;--ink:#1c1917;--mut:#78716c;}
*{box-sizing:border-box}body{margin:0;font:14px/1.5 -apple-system,BlinkMacSystemFont,"SF Pro Display",system-ui,sans-serif;background:var(--cream);color:var(--ink)}
header{padding:20px 28px;border-bottom:1px solid #e7e5e4;position:sticky;top:0;background:rgba(255,254,250,.9);backdrop-filter:blur(8px);z-index:5}
h1{margin:0 0 4px;font-size:22px}.sub{color:var(--mut);font-size:13px}
.tabs{display:flex;gap:8px;margin-top:12px}.tab{padding:6px 14px;border:1px solid #d6d3d1;border-radius:999px;background:#fff;cursor:pointer;font-weight:600;font-size:13px}
.tab.active{background:var(--green);color:#fff;border-color:var(--green)}
input{margin-top:12px;width:340px;max-width:60vw;padding:8px 12px;border:1px solid #d6d3d1;border-radius:10px;font-size:13px}
main{padding:20px 28px}
.view{display:none}.view.active{display:block}
.flow{background:#fff;border:1px solid #ececec;border-radius:14px;padding:14px 16px;margin-bottom:10px;box-shadow:0 1px 2px rgba(0,0,0,.03)}
.flow-h{margin-bottom:8px}.flow-h code{color:var(--mut);font-size:12px;margin-left:6px}
.flow-row{display:grid;grid-template-columns:1fr auto 1fr;gap:14px;align-items:start}
.col .lbl{font-size:10px;letter-spacing:.08em;color:var(--mut);margin-bottom:6px}
.arrow{align-self:center;color:var(--mut);white-space:nowrap}.page{display:inline-block;padding:3px 10px;border:1px dashed #cbd5d1;border-radius:8px;font-size:12px;color:#44403c;background:#fafaf9}
.chip{display:inline-block;font:11px/1.4 ui-monospace,Menlo,monospace;padding:2px 7px;border-radius:6px;margin:2px 3px 2px 0}
.chip.r{background:#eff6ff;color:#1e40af;border:1px solid #dbeafe}
.chip.w{background:#ecfdf5;color:#065f46;border:1px solid #d1fae5}
.chip.rpc{background:#fef3c7;color:#92400e;border:1px solid #fde68a}
.rpcs{margin-top:8px;font-size:11px;color:var(--mut)}
.muted{color:#a8a29e}
.dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;vertical-align:middle}
.dot.coach{background:#2563eb}.dot.player{background:var(--green)}.dot.public{background:#a8a29e}.dot.shared{background:#7c3aed}
table{border-collapse:collapse;width:100%;background:#fff;border:1px solid #ececec;border-radius:12px;overflow:hidden}
th,td{text-align:left;padding:9px 12px;border-bottom:1px solid #f1f1ef;vertical-align:top;font-size:13px}
th{background:#fafaf9;position:sticky;top:148px}.num{text-align:center;font-weight:700;color:var(--green)}
td code{font-size:12px}
.badge{font-size:10px;font-weight:700;padding:1px 5px;border-radius:5px;margin-left:4px}
.badge.read{background:#eff6ff;color:#1e40af}.badge.write{background:#ecfdf5;color:#065f46}.badge.readwrite{background:#fef3c7;color:#92400e}
.filters{margin-top:10px;font-size:12px;color:var(--mut)}.filters b{color:var(--ink)}
</style></head><body>
<header>
  <h1>GolfHelm Data Flow</h1>
  <div class="sub">${tablesSorted.length} Supabase tables · ${flows.length} routes · 🟩 player 🟦 coach ⬜ public — derived from the verified atlas analysis</div>
  <div class="tabs"><div class="tab active" data-v="routes">Per-route flow</div><div class="tab" data-v="rev">Reverse index (table → routes)</div></div>
  <input id="q" placeholder="filter by table or route…">
</header>
<main>
  <div class="view active" id="routes">${flowCards}</div>
  <div class="view" id="rev"><table><thead><tr><th>Table</th><th class="num">#</th><th>Routes (R/W)</th></tr></thead><tbody>${revRows}</tbody></table></div>
</main>
<script>
const tabs=[...document.querySelectorAll('.tab')],views={routes:document.getElementById('routes'),rev:document.getElementById('rev')};
tabs.forEach(t=>t.onclick=()=>{tabs.forEach(x=>x.classList.remove('active'));t.classList.add('active');Object.values(views).forEach(v=>v.classList.remove('active'));views[t.dataset.v].classList.add('active');filt();});
const q=document.getElementById('q');
function filt(){const s=q.value.toLowerCase();
  document.querySelectorAll('#routes .flow').forEach(e=>e.style.display=e.dataset.text.includes(s)?'':'none');
  document.querySelectorAll('#rev tbody tr').forEach(e=>e.style.display=e.dataset.text.includes(s)?'':'none');}
q.oninput=filt;
</script></body></html>`;
fs.writeFileSync(path.join(UI, 'data-flow.html'), html);

console.log(`[data-flow] ${tablesSorted.length} tables, ${flows.length} routes`);
console.log('[data-flow] wrote data-flow.json, DATA-FLOW.md, data-flow.html');
console.log('top tables: ' + tablesSorted.slice(0, 8).map((t) => t + '(' + reverse[t].length + ')').join(', '));
