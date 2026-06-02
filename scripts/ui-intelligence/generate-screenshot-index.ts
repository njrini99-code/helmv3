/**
 * generate-screenshot-index.ts
 *
 * Reads routes/routes.json and every metadata.json under
 * ui-intelligence/screenshots/desktop/**, then generates:
 *   (1) ui-intelligence/catalog.json   — merged route + capture metadata
 *   (2) ui-intelligence/index.html     — self-contained gallery
 *   (3) ui-intelligence/reports/screenshot-run.md — run report
 *
 * Resilient: works whether or not routes.json exists and whether or not any
 * screenshots have been captured yet. One missing/broken file never aborts the run.
 *
 * Run with: tsx scripts/ui-intelligence/generate-screenshot-index.ts
 * (invoked by `npm run ui:index` / part of `npm run ui:screenshots`)
 */

import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.GOLFHELM_BASE_URL || 'http://localhost:3000';

// ---------------------------------------------------------------------------
// Paths (all relative to process.cwd() === repo root)
// ---------------------------------------------------------------------------
const ROOT = process.cwd();
const ROUTES_JSON = path.join(ROOT, 'routes', 'routes.json');
const SHOTS_ROOT = path.join(ROOT, 'ui-intelligence', 'screenshots', 'desktop');
const OUT_DIR = path.join(ROOT, 'ui-intelligence');
const CATALOG_JSON = path.join(OUT_DIR, 'catalog.json');
const INDEX_HTML = path.join(OUT_DIR, 'index.html');
const REPORTS_DIR = path.join(OUT_DIR, 'reports');
const RUN_REPORT_MD = path.join(REPORTS_DIR, 'screenshot-run.md');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type Role = 'public' | 'player' | 'coach' | 'unknown';
type Criticality = 'high' | 'medium' | 'low';
type CaptureStatus = 'success' | 'failed' | 'redirected';
type CatalogStatus = CaptureStatus | 'pending' | 'disabled';

interface RouteEntry {
  route: string;
  label: string;
  role: Role;
  auth: boolean;
  category: string;
  criticality: Criticality;
  folder: string;
  enabled: boolean;
  notes: string;
  needs_confirmation: boolean;
  dynamic: boolean;
  param: string | null;
}

interface Metadata {
  route?: string;
  label?: string;
  role?: string;
  category?: string;
  url?: string;
  viewport?: string;
  screenshot?: string;
  capturedAt?: string;
  status?: CaptureStatus;
  pageTitle?: string;
  finalUrl?: string;
  height?: number;
  notes?: string;
  error?: string;
}

interface CatalogItem {
  route: string;
  label: string;
  role: Role;
  auth: boolean;
  category: string;
  criticality: Criticality;
  folder: string;
  enabled: boolean;
  notes: string;
  needs_confirmation: boolean;
  dynamic: boolean;
  param: string | null;
  status: CatalogStatus;
  url: string;
  viewport: string;
  screenshot: string;
  screenshotPath: string | null; // relative to the index.html file
  capturedAt: string;
  pageTitle: string;
  finalUrl: string;
  height: number;
  error: string;
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
function safeReadJson<T>(file: string, fallback: T): T {
  try {
    if (!fs.existsSync(file)) return fallback;
    const raw = fs.readFileSync(file, 'utf8');
    if (!raw.trim()) return fallback;
    return JSON.parse(raw) as T;
  } catch (err) {
    console.warn(`[generate-index] could not parse ${path.relative(ROOT, file)}: ${(err as Error).message}`);
    return fallback;
  }
}

function asRole(v: unknown): Role {
  return v === 'public' || v === 'player' || v === 'coach' || v === 'unknown' ? v : 'unknown';
}

function asCriticality(v: unknown): Criticality {
  return v === 'high' || v === 'medium' || v === 'low' ? v : 'medium';
}

/** Recursively collect every metadata.json under SHOTS_ROOT. */
function collectMetadataFiles(dir: string): string[] {
  const out: string[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      out.push(...collectMetadataFiles(full));
    } else if (ent.isFile() && ent.name === 'metadata.json') {
      out.push(full);
    }
  }
  return out;
}

/** Derive the folder ("{role}/{tail}") from a metadata.json file path. */
function folderFromMetaPath(metaFile: string): string {
  const rel = path.relative(SHOTS_ROOT, path.dirname(metaFile));
  return rel.split(path.sep).join('/');
}

function htmlEscape(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ---------------------------------------------------------------------------
// 1) Load routes + metadata, build catalog
// ---------------------------------------------------------------------------
const routes = safeReadJson<RouteEntry[]>(ROUTES_JSON, []);
if (!Array.isArray(routes)) {
  console.warn('[generate-index] routes.json was not an array; treating as empty.');
}
const routeList: RouteEntry[] = Array.isArray(routes) ? routes : [];

// Map metadata by folder (folder is the join key per the contract).
const metaByFolder = new Map<string, Metadata>();
const metaFiles = collectMetadataFiles(SHOTS_ROOT);
for (const mf of metaFiles) {
  const meta = safeReadJson<Metadata | null>(mf, null);
  if (!meta || typeof meta !== 'object') continue;
  metaByFolder.set(folderFromMetaPath(mf), meta);
}

function buildCatalogItem(r: RouteEntry): CatalogItem {
  const meta = metaByFolder.get(r.folder);

  let status: CatalogStatus;
  if (r.enabled === false) {
    status = 'disabled';
  } else if (meta && (meta.status === 'success' || meta.status === 'failed' || meta.status === 'redirected')) {
    status = meta.status;
  } else {
    status = 'pending';
  }

  const screenshotName = meta?.screenshot || 'full-page.png';
  // Only point at an actual image for successful/redirected captures.
  const hasImage =
    (status === 'success' || status === 'redirected') &&
    fs.existsSync(path.join(SHOTS_ROOT, r.folder, screenshotName));

  return {
    route: r.route,
    label: r.label,
    role: asRole(r.role),
    auth: !!r.auth,
    category: r.category ?? '',
    criticality: asCriticality(r.criticality),
    folder: r.folder,
    enabled: r.enabled !== false,
    notes: r.notes ?? '',
    needs_confirmation: !!r.needs_confirmation,
    dynamic: !!r.dynamic,
    param: r.param ?? null,
    status,
    url: meta?.url || BASE + r.route,
    viewport: meta?.viewport || '1440x900',
    screenshot: screenshotName,
    screenshotPath: hasImage ? `screenshots/desktop/${r.folder}/${screenshotName}` : null,
    capturedAt: meta?.capturedAt || '',
    pageTitle: meta?.pageTitle || '',
    finalUrl: meta?.finalUrl || '',
    height: typeof meta?.height === 'number' ? meta.height : 0,
    error: meta?.error || (status === 'failed' ? meta?.notes || '' : ''),
  };
}

const catalog: CatalogItem[] = routeList.map(buildCatalogItem);

// Stable sort: by role, then criticality (high first), then label.
const roleOrder: Record<Role, number> = { public: 0, player: 1, coach: 2, unknown: 3 };
const critOrder: Record<Criticality, number> = { high: 0, medium: 1, low: 2 };
catalog.sort((a, b) => {
  if (roleOrder[a.role] !== roleOrder[b.role]) return roleOrder[a.role] - roleOrder[b.role];
  if (critOrder[a.criticality] !== critOrder[b.criticality]) return critOrder[a.criticality] - critOrder[b.criticality];
  return a.label.localeCompare(b.label);
});

// ---------------------------------------------------------------------------
// Counts / summary
// ---------------------------------------------------------------------------
const counts = {
  total: catalog.length,
  success: catalog.filter((c) => c.status === 'success').length,
  redirected: catalog.filter((c) => c.status === 'redirected').length,
  failed: catalog.filter((c) => c.status === 'failed').length,
  pending: catalog.filter((c) => c.status === 'pending').length,
  disabled: catalog.filter((c) => c.status === 'disabled').length,
  needsConfirmation: catalog.filter((c) => c.needs_confirmation).length,
  byRole: {
    public: catalog.filter((c) => c.role === 'public').length,
    player: catalog.filter((c) => c.role === 'player').length,
    coach: catalog.filter((c) => c.role === 'coach').length,
    unknown: catalog.filter((c) => c.role === 'unknown').length,
  },
};

const generatedAt = new Date().toISOString();

// ---------------------------------------------------------------------------
// Ensure output dirs
// ---------------------------------------------------------------------------
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync(REPORTS_DIR, { recursive: true });

// ---------------------------------------------------------------------------
// 2) Write catalog.json
// ---------------------------------------------------------------------------
fs.writeFileSync(CATALOG_JSON, JSON.stringify(catalog, null, 2) + '\n', 'utf8');

// ---------------------------------------------------------------------------
// 3) Write index.html
// ---------------------------------------------------------------------------
const STATUS_META: Record<CatalogStatus, { label: string; color: string; bg: string }> = {
  success: { label: 'success', color: '#166534', bg: '#dcfce7' },
  redirected: { label: 'redirected', color: '#92400e', bg: '#fef3c7' },
  failed: { label: 'failed', color: '#991b1b', bg: '#fee2e2' },
  pending: { label: 'pending', color: '#475569', bg: '#f1f5f9' },
  disabled: { label: 'disabled', color: '#475569', bg: '#e2e8f0' },
};

const ROLE_TITLES: Record<Role, string> = {
  public: 'Public',
  player: 'Player',
  coach: 'Coach',
  unknown: 'Unknown',
};

function renderCard(c: CatalogItem): string {
  const sm = STATUS_META[c.status];
  const searchKey = htmlEscape(`${c.label} ${c.route} ${c.category}`.toLowerCase());

  const media = c.screenshotPath
    ? `<a class="thumb-link" href="${htmlEscape(c.screenshotPath)}" target="_blank" rel="noopener noreferrer" title="Open full image">
         <img class="thumb" loading="lazy" src="${htmlEscape(c.screenshotPath)}" alt="${htmlEscape(c.label)} screenshot" />
       </a>`
    : `<div class="thumb thumb--placeholder placeholder--${c.status}">
         <span class="ph-status">${htmlEscape(sm.label)}</span>
         <span class="ph-note">${htmlEscape(c.error || c.notes || (c.status === 'pending' ? 'Not captured yet' : c.status === 'disabled' ? 'Capture disabled' : 'No image'))}</span>
       </div>`;

  const metaRows: string[] = [];
  if (c.pageTitle) metaRows.push(`<div class="meta-row"><span class="k">Title</span><span class="v">${htmlEscape(c.pageTitle)}</span></div>`);
  if (c.finalUrl) metaRows.push(`<div class="meta-row"><span class="k">Final URL</span><span class="v mono">${htmlEscape(c.finalUrl)}</span></div>`);
  if (c.height) metaRows.push(`<div class="meta-row"><span class="k">Height</span><span class="v">${c.height}px</span></div>`);
  if (c.capturedAt) metaRows.push(`<div class="meta-row"><span class="k">Captured</span><span class="v">${htmlEscape(c.capturedAt)}</span></div>`);
  if (c.error) metaRows.push(`<div class="meta-row meta-row--error"><span class="k">Error</span><span class="v">${htmlEscape(c.error)}</span></div>`);
  if (c.notes) metaRows.push(`<div class="meta-row"><span class="k">Notes</span><span class="v">${htmlEscape(c.notes)}</span></div>`);

  const flags: string[] = [];
  if (c.needs_confirmation) flags.push(`<span class="flag flag--confirm">needs confirmation</span>`);
  if (c.dynamic) flags.push(`<span class="flag flag--dynamic">dynamic${c.param ? ` (${htmlEscape(c.param)})` : ''}</span>`);
  if (c.auth) flags.push(`<span class="flag flag--auth">auth</span>`);

  return `
  <article class="card" data-role="${c.role}" data-status="${c.status}" data-confirm="${c.needs_confirmation}" data-search="${searchKey}">
    <div class="card__media">${media}</div>
    <div class="card__body">
      <div class="card__head">
        <h3 class="card__label">${htmlEscape(c.label)}</h3>
        <span class="badge" style="color:${sm.color};background:${sm.bg}">${htmlEscape(sm.label)}</span>
      </div>
      <div class="card__route mono">${htmlEscape(c.route)}</div>
      <div class="chips">
        ${c.category ? `<span class="chip chip--cat">${htmlEscape(c.category)}</span>` : ''}
        <span class="chip chip--crit chip--crit-${c.criticality}">${htmlEscape(c.criticality)}</span>
        ${flags.join('')}
      </div>
      ${metaRows.length ? `<div class="meta">${metaRows.join('')}</div>` : ''}
    </div>
  </article>`;
}

function renderRoleSection(role: Role): string {
  const items = catalog.filter((c) => c.role === role);
  if (items.length === 0) return '';
  return `
  <section class="role-section" data-role-section="${role}">
    <h2 class="role-title">${htmlEscape(ROLE_TITLES[role])} <span class="role-count">${items.length}</span></h2>
    <div class="grid">
      ${items.map(renderCard).join('')}
    </div>
  </section>`;
}

const sections = (['public', 'player', 'coach', 'unknown'] as Role[]).map(renderRoleSection).join('');

const summaryChips = `
  <span class="sum"><b>${counts.total}</b> total</span>
  <span class="sum sum--success"><b>${counts.success}</b> success</span>
  <span class="sum sum--redirected"><b>${counts.redirected}</b> redirected</span>
  <span class="sum sum--failed"><b>${counts.failed}</b> failed</span>
  <span class="sum sum--pending"><b>${counts.pending}</b> pending</span>
  ${counts.disabled ? `<span class="sum sum--disabled"><b>${counts.disabled}</b> disabled</span>` : ''}
  <span class="sum-sep"></span>
  <span class="sum">public <b>${counts.byRole.public}</b></span>
  <span class="sum">player <b>${counts.byRole.player}</b></span>
  <span class="sum">coach <b>${counts.byRole.coach}</b></span>
  <span class="sum">unknown <b>${counts.byRole.unknown}</b></span>`;

const emptyState =
  counts.total === 0
    ? `<div class="empty">No routes found. Generate <code>routes/routes.json</code> first, then run the capture step.</div>`
    : '';

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>GolfHelm Desktop Screenshot Inventory</title>
<style>
  :root {
    --bg: #f8fafc;
    --panel: #ffffff;
    --ink: #0f172a;
    --muted: #64748b;
    --line: #e2e8f0;
    --accent: #16a34a;
    --amber: #d97706;
    --red: #dc2626;
    --radius: 14px;
    --shadow: 0 1px 2px rgba(15,23,42,.06), 0 8px 24px rgba(15,23,42,.06);
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    background: var(--bg);
    color: var(--ink);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    line-height: 1.45;
    -webkit-font-smoothing: antialiased;
  }
  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace; }
  a { color: inherit; }

  header.top {
    position: sticky; top: 0; z-index: 20;
    background: rgba(255,255,255,.92);
    backdrop-filter: saturate(180%) blur(8px);
    border-bottom: 1px solid var(--line);
    padding: 18px 28px 14px;
  }
  .title-row { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
  h1 { font-size: 20px; margin: 0; letter-spacing: -0.01em; }
  .accent-dot { width: 10px; height: 10px; border-radius: 50%; background: var(--accent); display: inline-block; }
  .gen { color: var(--muted); font-size: 12.5px; }
  .summary { margin-top: 10px; display: flex; flex-wrap: wrap; gap: 8px 14px; font-size: 13px; color: var(--muted); align-items: center; }
  .summary .sum b { color: var(--ink); }
  .sum--success b { color: var(--accent); }
  .sum--redirected b { color: var(--amber); }
  .sum--failed b { color: var(--red); }
  .sum-sep { width: 1px; height: 16px; background: var(--line); }

  .controls { margin-top: 14px; display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
  .filters { display: flex; flex-wrap: wrap; gap: 6px; }
  .fbtn {
    border: 1px solid var(--line); background: var(--panel); color: var(--ink);
    padding: 6px 12px; border-radius: 999px; font-size: 13px; cursor: pointer; transition: all .12s ease;
  }
  .fbtn:hover { border-color: #cbd5e1; }
  .fbtn.active { background: var(--ink); color: #fff; border-color: var(--ink); }
  .search {
    margin-left: auto; border: 1px solid var(--line); background: var(--panel);
    border-radius: 10px; padding: 7px 12px; font-size: 13px; min-width: 240px; color: var(--ink);
  }
  .search:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px rgba(22,163,74,.12); }

  main { padding: 24px 28px 64px; max-width: 1680px; margin: 0 auto; }
  .empty { background: var(--panel); border: 1px dashed var(--line); border-radius: var(--radius); padding: 36px; text-align: center; color: var(--muted); }
  .empty code { background: #f1f5f9; padding: 2px 6px; border-radius: 6px; }

  .role-section { margin-bottom: 40px; }
  .role-section.hidden { display: none; }
  .role-title { font-size: 15px; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); margin: 0 0 14px; display: flex; align-items: center; gap: 8px; }
  .role-count { background: #eef2f7; color: var(--ink); border-radius: 999px; font-size: 12px; padding: 2px 9px; letter-spacing: 0; }

  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(330px, 1fr)); gap: 18px; }

  .card {
    background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius);
    box-shadow: var(--shadow); overflow: hidden; display: flex; flex-direction: column; transition: box-shadow .15s ease, transform .15s ease;
  }
  .card:hover { box-shadow: 0 2px 4px rgba(15,23,42,.08), 0 14px 36px rgba(15,23,42,.10); transform: translateY(-1px); }
  .card.hidden { display: none; }

  .card__media { background: #f1f5f9; border-bottom: 1px solid var(--line); }
  .thumb-link { display: block; }
  .thumb { display: block; width: 100%; height: 200px; object-fit: cover; object-position: top center; background: #fff; }
  .thumb--placeholder { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; height: 200px; text-align: center; padding: 16px; }
  .placeholder--pending, .placeholder--disabled { background: repeating-linear-gradient(45deg,#f8fafc,#f8fafc 12px,#f1f5f9 12px,#f1f5f9 24px); }
  .placeholder--failed { background: #fff1f1; }
  .ph-status { font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); }
  .placeholder--failed .ph-status { color: var(--red); }
  .ph-note { font-size: 12px; color: var(--muted); max-width: 90%; }

  .card__body { padding: 14px 16px 16px; display: flex; flex-direction: column; gap: 10px; }
  .card__head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
  .card__label { font-size: 15px; margin: 0; letter-spacing: -0.01em; }
  .badge { font-size: 11px; font-weight: 600; padding: 3px 9px; border-radius: 999px; text-transform: uppercase; letter-spacing: .04em; white-space: nowrap; }
  .card__route { font-size: 12.5px; color: var(--muted); word-break: break-all; }

  .chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .chip { font-size: 11px; padding: 2px 8px; border-radius: 6px; border: 1px solid var(--line); color: var(--muted); background: #fff; }
  .chip--cat { background: #eef2ff; color: #3730a3; border-color: #e0e7ff; }
  .chip--crit-high { background: #fee2e2; color: #991b1b; border-color: #fecaca; }
  .chip--crit-medium { background: #fef3c7; color: #92400e; border-color: #fde68a; }
  .chip--crit-low { background: #ecfccb; color: #3f6212; border-color: #d9f99d; }
  .flag { font-size: 11px; padding: 2px 8px; border-radius: 6px; }
  .flag--confirm { background: #fef3c7; color: #92400e; }
  .flag--dynamic { background: #f3e8ff; color: #6b21a8; }
  .flag--auth { background: #f1f5f9; color: #475569; }

  .meta { border-top: 1px solid var(--line); padding-top: 10px; display: flex; flex-direction: column; gap: 4px; }
  .meta-row { display: grid; grid-template-columns: 78px 1fr; gap: 8px; font-size: 12px; }
  .meta-row .k { color: var(--muted); }
  .meta-row .v { color: var(--ink); word-break: break-word; }
  .meta-row--error .v { color: var(--red); }

  footer { color: var(--muted); font-size: 12px; text-align: center; padding: 24px; }
</style>
</head>
<body>
<header class="top">
  <div class="title-row">
    <span class="accent-dot"></span>
    <h1>GolfHelm Desktop Screenshot Inventory</h1>
    <span class="gen">generated ${htmlEscape(generatedAt)} &middot; ${htmlEscape(BASE)} &middot; 1440&times;900</span>
  </div>
  <div class="summary">${summaryChips}</div>
  <div class="controls">
    <div class="filters" id="filters">
      <button class="fbtn active" data-filter="all">All</button>
      <button class="fbtn" data-filter="public">Public</button>
      <button class="fbtn" data-filter="player">Player</button>
      <button class="fbtn" data-filter="coach">Coach</button>
      <button class="fbtn" data-filter="unknown">Unknown</button>
      <button class="fbtn" data-filter="failed">Failed</button>
      <button class="fbtn" data-filter="needs-confirmation">Needs-confirmation</button>
    </div>
    <input class="search" id="search" type="search" placeholder="Search label or route&hellip;" autocomplete="off" />
  </div>
</header>

<main>
  ${emptyState}
  ${sections}
</main>

<footer>GolfHelm UI Intelligence &middot; desktop layer &middot; ${counts.total} routes catalogued</footer>

<script>
(function () {
  var cards = Array.prototype.slice.call(document.querySelectorAll('.card'));
  var sections = Array.prototype.slice.call(document.querySelectorAll('.role-section'));
  var fbtns = Array.prototype.slice.call(document.querySelectorAll('.fbtn'));
  var search = document.getElementById('search');
  var currentFilter = 'all';

  function matchesFilter(card) {
    if (currentFilter === 'all') return true;
    if (currentFilter === 'failed') return card.getAttribute('data-status') === 'failed';
    if (currentFilter === 'needs-confirmation') return card.getAttribute('data-confirm') === 'true';
    return card.getAttribute('data-role') === currentFilter;
  }

  function matchesSearch(card, q) {
    if (!q) return true;
    return (card.getAttribute('data-search') || '').indexOf(q) !== -1;
  }

  function apply() {
    var q = (search.value || '').trim().toLowerCase();
    cards.forEach(function (card) {
      var show = matchesFilter(card) && matchesSearch(card, q);
      card.classList.toggle('hidden', !show);
    });
    sections.forEach(function (sec) {
      var any = Array.prototype.some.call(sec.querySelectorAll('.card'), function (c) {
        return !c.classList.contains('hidden');
      });
      sec.classList.toggle('hidden', !any);
    });
  }

  fbtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      fbtns.forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      currentFilter = btn.getAttribute('data-filter');
      apply();
    });
  });
  search.addEventListener('input', apply);
  apply();
})();
</script>
</body>
</html>
`;

fs.writeFileSync(INDEX_HTML, html, 'utf8');

// ---------------------------------------------------------------------------
// 4) Write reports/screenshot-run.md
// ---------------------------------------------------------------------------
const needsConfirmList = catalog.filter((c) => c.needs_confirmation);
const dynamicList = catalog.filter((c) => c.dynamic);

const md = `# GolfHelm Screenshot Run Report

_Generated: ${generatedAt}_

Command: \`npm run ui:screenshots\`

Output folder: \`${path.relative(ROOT, SHOTS_ROOT)}\`
Gallery: \`${path.relative(ROOT, INDEX_HTML)}\`
Catalog: \`${path.relative(ROOT, CATALOG_JSON)}\`

## Totals

| Metric | Count |
| --- | --- |
| Total routes | ${counts.total} |
| Successful | ${counts.success} |
| Redirected | ${counts.redirected} |
| Failed | ${counts.failed} |
| Pending | ${counts.pending} |
| Disabled | ${counts.disabled} |

## By role

| Role | Count |
| --- | --- |
| Public | ${counts.byRole.public} |
| Player | ${counts.byRole.player} |
| Coach | ${counts.byRole.coach} |
| Unknown | ${counts.byRole.unknown} |

## Routes needing confirmation (${needsConfirmList.length})

${
  needsConfirmList.length === 0
    ? '_None._'
    : needsConfirmList
        .map((c) => `- \`${c.route}\` — ${c.label} (${c.role}${c.notes ? `; ${c.notes}` : ''})`)
        .join('\n')
}

## Dynamic routes (need IDs to enable) (${dynamicList.length})

${
  dynamicList.length === 0
    ? '_None._'
    : dynamicList
        .map((c) => `- \`${c.route}\` — ${c.label} (param: ${c.param ?? 'n/a'})`)
        .join('\n')
}

## Next steps

1. Review \`ui-intelligence/reports/failed-routes.md\` for capture failures and re-run those routes.
2. Supply real IDs for the ${dynamicList.length} dynamic-param route(s) above so they can be enabled and captured.
3. Confirm the ${needsConfirmList.length} \`needs_confirmation\` route(s) (destructive / sensitive actions) before automated capture.
4. Check \`ui-intelligence/reports/auth-errors.md\` if player/coach routes redirected to login.
5. Later layers: mobile viewport capture, visual-regression baselines/diffing, and an AI taste/quality pass over the gallery.
`;

fs.writeFileSync(RUN_REPORT_MD, md, 'utf8');

// ---------------------------------------------------------------------------
// Console summary
// ---------------------------------------------------------------------------
console.log(
  `[generate-index] ${counts.total} routes -> ` +
    `success ${counts.success}, redirected ${counts.redirected}, failed ${counts.failed}, ` +
    `pending ${counts.pending}, disabled ${counts.disabled}`,
);
console.log(`[generate-index] wrote ${path.relative(ROOT, CATALOG_JSON)}`);
console.log(`[generate-index] wrote ${path.relative(ROOT, INDEX_HTML)}`);
console.log(`[generate-index] wrote ${path.relative(ROOT, RUN_REPORT_MD)}`);
