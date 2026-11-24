/**
 * The Bridge graph (plan §3, docs/superpowers/specs/helm-bridge/2026-11-18-clubhouse-bridge-redesign.md).
 *
 * One JSON file, docs/clubhouse/generated/bridge-graph.json, written by `registry.mjs sync` from the sources the
 * registry already reads: page manifests, Bridge contracts, catalogs, the code index (§4.6), the surfaces the code
 * reports under, and the audits' findings and number checks. The Bridge screens and the signal route read it, so
 * the browser never looks anything up.
 *
 * The committed file is deterministic (no build time, no SHA), so `clubhouse:check` can hold it to its sources like
 * every other generated doc. `contentHash` names this exact contract; the release build stamps the SHA beside it.
 *
 * Controls (§4.7) are numbered in PR 2; until then `controls` is empty and says so.
 */
import { createHash } from 'node:crypto';
import { wherePaths, DOC_FILES } from './registry.mjs';

export const GRAPH_PATH = 'docs/clubhouse/generated/bridge-graph.json';
export const GRAPH_VERSION = 1;

/** Split one markdown table row into cells, keeping escaped pipes (`\|`) inside a cell. */
export function tableCells(line) {
  const cells = [];
  let cur = '';
  const body = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i];
    if (ch === '\\' && body[i + 1] === '|') {
      cur += '|';
      i += 1;
    } else if (ch === '|') {
      cells.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  cells.push(cur.trim());
  return cells;
}

const CATALOG_COLUMNS = { when: 'when', what: 'when', 'they see': 'theySee', 'they feel': 'theySee', 'they get': 'theySee', how: 'how', test: 'test' };

/** Each catalog row's cells by the table's own header (When/What, They see/feel/get, How, Test), keyed by CH code. */
export function catalogRowsByCode(catalogs) {
  const out = new Map();
  for (const md of Object.values(catalogs)) {
    let header = null;
    for (const line of md.split('\n')) {
      if (/^\|\s*#\s*\|/.test(line)) {
        header = tableCells(line).map((h) => CATALOG_COLUMNS[h.toLowerCase()] ?? null);
        continue;
      }
      const m = /^\|\s*(CH-\d{4,5})\s*\|/.exec(line);
      if (!m || !header) continue;
      const cells = tableCells(line);
      const row = {};
      header.forEach((key, i) => {
        if (key && cells[i] !== undefined && cells[i] !== '') row[key] = cells[i];
      });
      out.set(m[1], row);
    }
  }
  return out;
}

/** Findings from an audit's findings.jsonl, in the graph's shape. A withdrawn finding stays, marked withdrawn. */
export function parseFindings(jsonl, audit) {
  const out = {};
  for (const [n, line] of jsonl.split('\n').entries()) {
    if (!line.trim()) continue;
    let f;
    try {
      f = JSON.parse(line);
    } catch {
      throw new Error(`${audit} findings.jsonl line ${n + 1} is not JSON`);
    }
    out[f.id] = {
      page: f.page,
      screen: f.screen,
      severity: f.severity,
      dimension: f.dimension,
      standard: f.standard,
      title: f.title,
      repro: f.repro,
      fix: f.fix,
      files: f.files ?? [],
      tier: f.tier,
      audit,
      status: f.withdrawn || f.status === 'withdrawn' ? 'withdrawn' : f.status === 'fixed' ? 'fixed' : 'open',
    };
  }
  return out;
}

/** The "Shown | Expected | Verdict | Query" tables of an audit's numbers/P###-<slug>.md. */
export function parseNumberChecks(md, audit) {
  const rows = [];
  let inTable = false;
  for (const line of md.split('\n')) {
    if (/^\|\s*Shown\b/i.test(line)) {
      inTable = true;
      continue;
    }
    if (!inTable) continue;
    if (!line.startsWith('|')) {
      inTable = false;
      continue;
    }
    if (/^\|\s*-{3}/.test(line)) continue;
    const [shown, expected, verdict, query] = tableCells(line);
    rows.push({ shown, expected, verdict, query, audit });
  }
  return rows;
}

/**
 * Surfaces (chReport's `surface`, SectionBoundary's `surface`) by the files that name them. A surface belongs to the
 * page whose screens live in the folder that names it; a surface named only outside a page folder (a shared lib)
 * takes the page its first segment points at elsewhere.
 */
export function buildSurfaces({ surfaceIndex, manifests }) {
  const dirToPage = new Map();
  for (const m of [...manifests].sort((a, b) => a.id.localeCompare(b.id))) {
    for (const s of m.screens ?? []) {
      for (const ref of [s.coach, s.player, s.visitor]) {
        const dir = /^(src\/clubhouse\/screens\/[^/]+)\//.exec(ref ?? '')?.[1];
        if (dir && !dirToPage.has(dir)) dirToPage.set(dir, m.id);
      }
    }
  }
  // The frame's own parts (bell, More, identity) are the shell page's.
  const shell = manifests.find((m) => m.slug === 'shell');
  const pageOfFile = (file) =>
    dirToPage.get(/^(src\/clubhouse\/screens\/[^/]+)\//.exec(file)?.[1] ?? '') ?? (shell && file.startsWith('src/clubhouse/shell/') ? shell.id : null);
  const slugPage = new Map(manifests.map((m) => [m.slug, m.id]));
  const prefixVotes = new Map();
  for (const [name, files] of surfaceIndex) {
    for (const f of files) {
      const page = pageOfFile(f);
      if (!page) continue;
      const prefix = name.split('.')[0];
      const votes = prefixVotes.get(prefix) ?? new Map();
      votes.set(page, (votes.get(page) ?? 0) + 1);
      prefixVotes.set(prefix, votes);
    }
  }
  const prefixPage = (prefix) => {
    const votes = prefixVotes.get(prefix);
    if (!votes) return slugPage.get(prefix) ?? null;
    return [...votes.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
  };
  const out = {};
  for (const name of [...surfaceIndex.keys()].sort()) {
    const files = [...surfaceIndex.get(name)].sort();
    const own = files.map(pageOfFile).find(Boolean);
    out[name] = { page: own ?? prefixPage(name.split('.')[0]), files };
  }
  return out;
}

const sortedObject = (entries) => Object.fromEntries([...entries].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)));

/** Build the graph. Pure: everything it needs is passed in. */
export function buildBridgeGraph({ manifests, bridge, tombstones = [], catalogs, codeIndex, surfaceIndex = new Map(), auditFiles = {}, read, exists }) {
  const pages = [...manifests].sort((a, b) => a.id.localeCompare(b.id));
  const rowCells = catalogRowsByCode(catalogs);

  // A page's CONTRACT.md names the other pages' IDs it shows (the shell's offline line, Practice's rows kept under
  // CoachHelm). The signal route reads these as "may fire here", so only a code no contract names is a wrong page.
  const idPage = new Map(bridge.map((r) => [r.id, r.page]));
  const borrowsOf = (m, contractPath) => {
    if (!exists(contractPath)) return [];
    const named = new Set();
    for (const hit of read(contractPath).matchAll(/(?<![\w-])(\d{5,6})(?![\w-])/g)) {
      const id = Number(hit[1]);
      if (idPage.has(id) && idPage.get(id) !== m.id) named.add(id);
    }
    return [...named].sort((a, b) => a - b);
  };

  const graphPages = {};
  for (const m of pages) {
    const base = `docs/clubhouse/pages/${m.id}-${m.slug}`;
    graphPages[m.id] = {
      name: m.name,
      slug: m.slug,
      namespace: m.bridgeNamespace,
      routes: m.routes ?? [],
      plannedRoutes: m.plannedRoutes ?? [],
      roles: m.roles ?? [],
      gates: m.status,
      catalog: m.catalog ?? null,
      docs: Object.fromEntries(DOC_FILES.map((d) => [d, exists(`${base}/${d}.md`) ? `${base}/${d}.md` : null])),
      held: (m.held ?? []).map((plan) => {
        const md = exists(plan) ? read(plan) : '';
        return { plan, status: /^Status:\s*(\S+)/m.exec(md)?.[1] ?? null, migration: /^Migration:\s*(.+)$/m.exec(md)?.[1]?.trim() ?? null };
      }),
      screens: m.screens ?? [],
      borrows: borrowsOf(m, `${base}/CONTRACT.md`),
    };
  }

  const actions = {};
  for (const m of pages) {
    for (const a of m.actions ?? []) {
      actions[a.id] = {
        page: m.id,
        label: a.label,
        component: a.component ?? null,
        handler: a.handler ?? null,
        service: a.service ?? null,
        tables: a.data ?? [],
        outcomes: Object.fromEntries(Object.entries(a.bridge ?? {}).filter(([, id]) => id != null)),
        tests: a.tests ?? [],
      };
    }
  }

  const ids = {};
  const chIndex = {};
  for (const r of [...bridge].sort((a, b) => a.id - b.id)) {
    const rec = { page: r.page, category: r.category, name: r.name, meaning: r.meaning, status: r.status };
    if (r.chCode) {
      rec.ch = r.chCode;
      chIndex[r.chCode] = r.id;
      const row = rowCells.get(r.chCode);
      // The row's When is the ID's meaning already; the rest of the row is kept as written.
      if (row) {
        const { when, ...rest } = row;
        rec.catalogRow = when === r.meaning ? rest : row;
      }
    }
    const where = wherePaths(r.where);
    if (where.length) rec.where = where;
    if (r.tests?.length) rec.tests = r.tests;
    ids[r.id] = rec;
  }

  const findings = {};
  const numberChecks = {};
  for (const path of Object.keys(auditFiles).sort()) {
    const audit = /^docs\/clubhouse\/audit\/([^/]+)\//.exec(path)?.[1];
    if (!audit) continue;
    if (path.endsWith('/findings.jsonl')) Object.assign(findings, parseFindings(auditFiles[path], audit));
    const page = /\/numbers\/(P\d{3})-[^/]+\.md$/.exec(path)?.[1];
    if (page) (numberChecks[page] ??= []).push(...parseNumberChecks(auditFiles[path], audit));
  }

  const graph = {
    $comment: 'Generated by node scripts/clubhouse/registry.mjs sync (plan §3). Never hand-edit.',
    version: GRAPH_VERSION,
    contentHash: '',
    pages: graphPages,
    surfaces: buildSurfaces({ surfaceIndex, manifests: pages }),
    controls: {},
    controlsNote: 'Controls are numbered in PR 2 (plan §4.7, CTL-P###-NNN with data-ctl); until then none are registered.',
    actions: sortedObject(Object.entries(actions)),
    ids,
    tombstones: Object.fromEntries([...tombstones].sort((a, b) => a.id - b.id).map((t) => [t.id, { removedAt: t.removedAt, replacement: t.replacement ?? null }])),
    chIndex: sortedObject(Object.entries(chIndex)),
    codeIndex: sortedObject([...(codeIndex ?? new Map())].map(([code, files]) => [code, [...files].sort()])),
    findings: sortedObject(Object.entries(findings)),
    numberChecks: sortedObject(Object.entries(numberChecks)),
  };
  graph.contentHash = createHash('sha256').update(JSON.stringify({ ...graph, contentHash: '' })).digest('hex').slice(0, 16);
  return graph;
}

export const renderGraph = (graph) => JSON.stringify(graph, null, 1) + '\n';
