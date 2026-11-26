/**
 * View models for the Bridge's registry screens (plan §8: B02 Pages, B03 Controls, B04 Actions, B05 Codes,
 * B12 Readiness). Every function here reads the graph only: no database, no signals. Where a screen would show a
 * live count, it shows "No signal yet" (BR-xx93) instead, so "nothing happened" is never claimed before the pipe
 * that would see it exists.
 *
 * Pure and isomorphic (no `server-only`, no React, no fs): the server pages pass the graph in, and the tests pass the
 * fixture graph in.
 */
import type {
  BridgeGraph,
  BridgeId,
  GraphAction,
  GraphControl,
  GraphFinding,
  GraphId,
  GraphPage,
  IdStatus,
  PageId,
} from './graph';

export type SearchParams = Record<string, string | string[] | undefined>;

function first(raw: string | string[] | undefined): string | undefined {
  return Array.isArray(raw) ? raw[0] : raw;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

// ---------------------------------------------------------------------------
// Categories and the legend (plan §7.4)
// ---------------------------------------------------------------------------

/** The 25 contract categories, from config/clubhouse/category-map.json. A test holds this copy to that file. */
export const CATEGORY_NAMES: Readonly<Record<number, string>> = {
  1: 'Default / core UI',
  2: 'Initial loading / skeleton',
  3: 'Background loading / refresh',
  4: 'Empty',
  5: 'Validation',
  6: 'Server / system error',
  7: 'Network / offline',
  8: 'Permission / authorization',
  9: 'Success',
  10: 'Warning',
  11: 'Destructive',
  12: 'State preservation',
  13: 'Optimistic UI',
  14: 'Retry / recovery',
  15: 'Data freshness / sync',
  16: 'Micro animation',
  17: 'Haptic',
  18: 'Accessibility',
  19: 'Responsive layout',
  20: 'Keyboard / input',
  21: 'Performance',
  22: 'Analytics',
  23: 'Logging / observability',
  24: 'CI / automated test',
  25: 'Helm Bridge action',
};

export const CATEGORY_COUNT = 25;
export const CATEGORIES: readonly number[] = Array.from({ length: CATEGORY_COUNT }, (_, i) => i + 1);

/**
 * Plan §7.4: failure categories 06, 07, 08 and 11 use the error family, 09 Success the gain family, the rest neutrals
 * and accents. The families group the 25 so a colour means the same thing on every screen; the two-digit number on
 * each mark carries the exact category.
 */
export type CategoryFamily = 'core' | 'flow' | 'caution' | 'failure' | 'success' | 'experience' | 'record';

export const FAILURE_CATEGORIES: ReadonlySet<number> = new Set([6, 7, 8, 11]);

export function categoryFamily(category: number): CategoryFamily {
  if (FAILURE_CATEGORIES.has(category)) return 'failure';
  if (category === 9) return 'success';
  if (category === 5 || category === 10) return 'caution';
  if (category === 1 || category === 4) return 'core';
  if ([2, 3, 12, 13, 14, 15].includes(category)) return 'flow';
  if (category >= 16 && category <= 21) return 'experience';
  return 'record';
}

export function categoryCode(category: number): string {
  return pad2(category);
}

export function categoryName(category: number): string {
  return CATEGORY_NAMES[category] ?? `Category ${category}`;
}

// ---------------------------------------------------------------------------
// The scope bar (plan §7.3): page / role / viewport, carried in the URL
// ---------------------------------------------------------------------------

export const SCOPE_ROLES = ['all', 'coach', 'player', 'signed-out'] as const;
export const SCOPE_VIEWPORTS = ['all', 'desk', 'phone'] as const;
export type ScopeRole = (typeof SCOPE_ROLES)[number];
export type ScopeViewport = (typeof SCOPE_VIEWPORTS)[number];

export interface ClubhouseScope {
  page: PageId | null;
  role: ScopeRole;
  vp: ScopeViewport;
}

export const DEFAULT_SCOPE: ClubhouseScope = { page: null, role: 'all', vp: 'all' };

/** The search-param names the scope owns. Every Clubhouse screen link carries them, so the slice follows you. */
export const SCOPE_PARAMS = ['page', 'role', 'vp'] as const;

const PAGE_ID = /^P\d{3}$/;

/** An unknown value falls back to "all", never throws: a stale link opens the whole Clubhouse, not an error. */
export function parseScope(sp: SearchParams | undefined, known?: readonly string[]): ClubhouseScope {
  const rawPage = first(sp?.page)?.toUpperCase();
  const page = rawPage && PAGE_ID.test(rawPage) && (!known || known.includes(rawPage)) ? (rawPage as PageId) : null;
  const rawRole = first(sp?.role);
  const role = (SCOPE_ROLES as readonly string[]).includes(rawRole ?? '') ? (rawRole as ScopeRole) : 'all';
  const rawVp = first(sp?.vp);
  const vp = (SCOPE_VIEWPORTS as readonly string[]).includes(rawVp ?? '') ? (rawVp as ScopeViewport) : 'all';
  return { page, role, vp };
}

/** The scope's non-default params, in a fixed order: the default scope adds nothing to a URL. */
export function scopeEntries(scope: ClubhouseScope): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  if (scope.page) out.push(['page', scope.page]);
  if (scope.role !== 'all') out.push(['role', scope.role]);
  if (scope.vp !== 'all') out.push(['vp', scope.vp]);
  return out;
}

export function isScoped(scope: ClubhouseScope): boolean {
  return scopeEntries(scope).length > 0;
}

/**
 * A Clubhouse link that keeps the scope. `extra` adds screen params (a filter, a view); a null or empty value drops
 * that param.
 */
export function withScope(
  href: string,
  scope: ClubhouseScope,
  extra?: Record<string, string | number | null | undefined>,
): string {
  const [path, existing] = href.split('?');
  const params = new URLSearchParams(existing ?? '');
  for (const [key, value] of scopeEntries(scope)) params.set(key, value);
  for (const [key, value] of Object.entries(extra ?? {})) {
    if (value === null || value === undefined || value === '') params.delete(key);
    else params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `${path}?${query}` : path!;
}

const ROLE_WORDS: Record<ScopeRole, string> = {
  all: 'all roles',
  coach: 'coach',
  player: 'player',
  'signed-out': 'signed out',
};
const VP_WORDS: Record<ScopeViewport, string> = { all: 'desk and phone', desk: 'desk', phone: 'phone' };

export function describeScope(scope: ClubhouseScope, graph?: BridgeGraph | null): string {
  const page = scope.page ? `${scope.page} ${graph?.pages[scope.page]?.name ?? ''}`.trim() : 'all pages';
  return `${page} · ${ROLE_WORDS[scope.role]} · ${VP_WORDS[scope.vp]}`;
}

/** Does a page serve this role? Signed out reads the manifest's screen audiences, which is where it is recorded. */
export function pageServesRole(page: GraphPage, role: ScopeRole): boolean {
  if (role === 'all') return true;
  if (role === 'signed-out') return page.screens.some((s) => s.audience === 'signed-out');
  return page.roles.includes(role) || page.screens.some((s) => s.audience === role || s.audience === 'shared');
}

// ---------------------------------------------------------------------------
// Hrefs
// ---------------------------------------------------------------------------

export const CLUBHOUSE_BASE = '/admin/clubhouse';

export const clubhouseHref = {
  pages: () => CLUBHOUSE_BASE,
  page: (id: string) => `${CLUBHOUSE_BASE}/${encodeURIComponent(id)}`,
  controls: () => `${CLUBHOUSE_BASE}/controls`,
  control: (id: string) => `${CLUBHOUSE_BASE}/controls/${encodeURIComponent(id)}`,
  actions: () => `${CLUBHOUSE_BASE}/actions`,
  action: (id: string) => `${CLUBHOUSE_BASE}/actions/${encodeURIComponent(id)}`,
  codes: () => `${CLUBHOUSE_BASE}/codes`,
  code: (id: string | number) => `${CLUBHOUSE_BASE}/codes/${encodeURIComponent(String(id))}`,
  readiness: () => `${CLUBHOUSE_BASE}/readiness`,
  drift: () => `${CLUBHOUSE_BASE}/drift`,
  /** B13 with a pack built for `target` (P007, CTL-P007-014, ACT-P007-SEND-MESSAGE, 70603 or CH-7004). */
  duet: (target?: string) => (target ? `${CLUBHOUSE_BASE}/duet?t=${encodeURIComponent(target)}` : `${CLUBHOUSE_BASE}/duet`),
};

/** The repository the Bridge links into. Doc and code links open at the live release when it is known. */
export const REPO_BLOB_BASE = 'https://github.com/njrini99-code/helmv3/blob';

/** The commit this server was built from, else `main`. `NEXT_PUBLIC_SENTRY_RELEASE` is the release stamp deploys set. */
export function liveRef(env: Record<string, string | undefined> = process.env): string {
  const sha = env.NEXT_PUBLIC_SENTRY_RELEASE ?? env.VERCEL_GIT_COMMIT_SHA;
  return sha && /^[0-9a-f]{7,40}$/i.test(sha) ? sha : 'main';
}

/** `src/a.tsx#Symbol`, `src/a.tsx:12-30 (note)` and `src/a.tsx` all name the file `src/a.tsx`. */
export function filePart(location: string): string {
  return location.trim().split(/[#\s]/)[0]!.replace(/:\d+(-\d+)?$/, '');
}

export function githubBlobUrl(location: string, ref: string): string {
  const file = filePart(location);
  const line = location.match(/^[^#\s]+:(\d+)(?:-(\d+))?/);
  const anchor = line ? `#L${line[1]}${line[2] ? `-L${line[2]}` : ''}` : '';
  return `${REPO_BLOB_BASE}/${ref}/${file}${anchor}`;
}

/**
 * D6: "Force this state" opens the preview app only where it is served. `src/app/clubhouse-preview/[screen]` calls
 * `notFound()` when NODE_ENV is production, so in production the control is labelled "local" and is not a link.
 */
export const PREVIEW_SCREEN_BY_PAGE: Readonly<Partial<Record<PageId, string>>> = {
  P002: 'home',
  P003: 'roster',
  P004: 'stats',
  P005: 'player',
  P006: 'calendar',
  P007: 'messages',
  P008: 'settings',
  P009: 'qualifiers',
  P010: 'hub',
  P011: 'rounds',
  P012: 'classes',
  P013: 'coachhelm-brief',
  P014: 'recruiting',
  P017: 'coachhelm-practice-home',
};

export function previewPath(page: PageId): string | null {
  const screen = PREVIEW_SCREEN_BY_PAGE[page];
  return screen ? `/clubhouse-preview/${screen}` : null;
}

export function previewServed(env: Record<string, string | undefined> = process.env): boolean {
  return env.NODE_ENV !== 'production';
}

// ---------------------------------------------------------------------------
// Pages (B02) and Readiness (B12)
// ---------------------------------------------------------------------------

export const GATE_ORDER = ['design', 'implementation', 'contract', 'bridge', 'data', 'verification', 'docs'] as const;

export type GateTone = 'met' | 'partial' | 'open' | 'unknown';

const GATE_MET = new Set(['approved', 'complete', 'current', 'existing', 'done', 'wired', 'verified', 'passed', 'live']);
const GATE_PARTIAL = new Set(['in_progress', 'partial', 'review', 'reserved', 'draft', 'held']);

export function gateTone(value: string | undefined): GateTone {
  if (!value) return 'unknown';
  if (GATE_MET.has(value)) return 'met';
  if (GATE_PARTIAL.has(value)) return 'partial';
  return 'open';
}

export function gateWords(value: string | undefined): string {
  return value ? value.replace(/_/g, ' ') : 'not recorded';
}

export function sortedPageIds(graph: BridgeGraph): PageId[] {
  return (Object.keys(graph.pages) as PageId[]).sort();
}

export function idsForPage(graph: BridgeGraph, page: PageId): Array<[BridgeId, GraphId]> {
  return Object.entries(graph.ids)
    .filter(([, id]) => id.page === page)
    .map(([key, id]) => [Number(key), id] as [BridgeId, GraphId])
    .sort((a, b) => a[0] - b[0]);
}

export interface PageRow {
  id: PageId;
  name: string;
  slug: string;
  roles: string[];
  ids: Record<IdStatus, number> & { total: number };
  /** Distinct categories this page has at least one implemented ID in, of 25. */
  categoriesAnswered: number;
  /** IDs with an exact file location (`where`), the nearest the graph has to "on an element". */
  idsLocated: number;
  controls: number;
  controlsLabelled: number;
  actions: number;
  held: number;
  heldOpen: number;
  gates: Record<string, string>;
  gatesMet: number;
  findingsOpen: Record<GraphFinding['severity'], number> & { total: number };
}

export function pageRows(graph: BridgeGraph): PageRow[] {
  const rows = new Map<PageId, PageRow>();
  for (const id of sortedPageIds(graph)) {
    const page = graph.pages[id]!;
    rows.set(id, {
      id,
      name: page.name,
      slug: page.slug,
      roles: page.roles,
      ids: { implemented: 0, reserved: 0, deprecated: 0, total: 0 },
      categoriesAnswered: 0,
      idsLocated: 0,
      controls: 0,
      controlsLabelled: 0,
      actions: 0,
      held: page.held.length,
      heldOpen: page.held.filter((h) => h.status !== 'RELEASED').length,
      gates: page.gates,
      gatesMet: GATE_ORDER.filter((g) => gateTone(page.gates[g]) === 'met').length,
      findingsOpen: { S1: 0, S2: 0, S3: 0, S4: 0, total: 0 },
    });
  }
  const answered = new Map<PageId, Set<number>>();
  for (const id of Object.values(graph.ids)) {
    const row = rows.get(id.page);
    if (!row) continue;
    row.ids[id.status] += 1;
    row.ids.total += 1;
    if (id.where && id.where.length > 0) row.idsLocated += 1;
    if (id.status === 'implemented') {
      const set = answered.get(id.page) ?? new Set<number>();
      set.add(id.category);
      answered.set(id.page, set);
    }
  }
  for (const [page, set] of answered) rows.get(page)!.categoriesAnswered = set.size;
  for (const control of Object.values(graph.controls)) {
    const row = rows.get(control.page);
    if (!row) continue;
    row.controls += 1;
    if (control.label || control.labelTemplate) row.controlsLabelled += 1;
  }
  for (const action of Object.values(graph.actions)) {
    const row = rows.get(action.page);
    if (row) row.actions += 1;
  }
  for (const finding of Object.values(graph.findings)) {
    const row = rows.get(finding.page);
    if (!row || finding.status !== 'open') continue;
    row.findingsOpen[finding.severity] += 1;
    row.findingsOpen.total += 1;
  }
  return [...rows.values()];
}

export const PAGE_SORTS = ['page', 'coverage', 'gates', 'ids'] as const;
export type PageSort = (typeof PAGE_SORTS)[number];

export function parsePageSort(raw: string | string[] | undefined): PageSort {
  const value = first(raw);
  return (PAGE_SORTS as readonly string[]).includes(value ?? '') ? (value as PageSort) : 'page';
}

/** Weakest first for coverage and gates: the sort exists to find what needs work. */
export function sortPageRows(rows: readonly PageRow[], sort: PageSort): PageRow[] {
  const out = [...rows];
  switch (sort) {
    case 'coverage':
      return out.sort((a, b) => a.categoriesAnswered - b.categoriesAnswered || a.id.localeCompare(b.id));
    case 'gates':
      return out.sort((a, b) => a.gatesMet - b.gatesMet || a.id.localeCompare(b.id));
    case 'ids':
      return out.sort((a, b) => b.ids.total - a.ids.total || a.id.localeCompare(b.id));
    default:
      return out.sort((a, b) => a.id.localeCompare(b.id));
  }
}

export function filterPageRows(graph: BridgeGraph, rows: readonly PageRow[], scope: ClubhouseScope): PageRow[] {
  return rows.filter(
    (row) => (!scope.page || row.id === scope.page) && pageServesRoleById(graph, row.id, scope.role),
  );
}

// The state matrix (B02 "States" view) -------------------------------------

export const MATRIX_SHOWS = ['all', 'implemented', 'reserved', 'deprecated', 'failures'] as const;
export type MatrixShow = (typeof MATRIX_SHOWS)[number];

export function parseMatrixShow(raw: string | string[] | undefined): MatrixShow {
  const value = first(raw);
  return (MATRIX_SHOWS as readonly string[]).includes(value ?? '') ? (value as MatrixShow) : 'all';
}

export interface MatrixCell {
  id: BridgeId;
  ch?: string;
  name: string;
  meaning: string;
  theySee?: string;
  status: IdStatus;
}

export interface MatrixRow {
  category: number;
  cells: MatrixCell[];
}

export function stateMatrix(
  graph: BridgeGraph,
  page: PageId,
  options: { show?: MatrixShow; category?: number | null } = {},
): MatrixRow[] {
  const show = options.show ?? 'all';
  const byCategory = new Map<number, MatrixCell[]>();
  for (const [key, id] of idsForPage(graph, page)) {
    if (options.category && id.category !== options.category) continue;
    if (show === 'failures' && !FAILURE_CATEGORIES.has(id.category)) continue;
    if (show !== 'all' && show !== 'failures' && id.status !== show) continue;
    const cells = byCategory.get(id.category) ?? [];
    cells.push({
      id: key,
      ch: id.ch,
      name: id.name,
      meaning: id.meaning,
      theySee: id.catalogRow?.theySee,
      status: id.status,
    });
    byCategory.set(id.category, cells);
  }
  return [...byCategory.entries()].sort((a, b) => a[0] - b[0]).map(([category, cells]) => ({ category, cells }));
}

export function parseCategory(raw: string | string[] | undefined): number | null {
  const n = Number(first(raw));
  return Number.isInteger(n) && n >= 1 && n <= CATEGORY_COUNT ? n : null;
}

// ---------------------------------------------------------------------------
// Controls (B03)
// ---------------------------------------------------------------------------

export interface ControlRow extends GraphControl {
  id: string;
}

export const CONTROL_FILTERS = ['all', 'gap', 'unlabelled'] as const;
export type ControlFilter = (typeof CONTROL_FILTERS)[number];

export function parseControlFilter(raw: string | string[] | undefined): ControlFilter {
  const value = first(raw);
  return (CONTROL_FILTERS as readonly string[]).includes(value ?? '') ? (value as ControlFilter) : 'all';
}

function controlServesRole(control: GraphControl, role: ScopeRole): boolean {
  if (role === 'all' || !control.role) return true;
  // The ledger writes coach, player, both, visitor (signed out) or a mix such as player+visitor.
  const roles = control.role.split('+').flatMap((r) => (r === 'both' || r === 'shared' ? ['coach', 'player'] : r === 'visitor' ? ['signed-out'] : [r]));
  return roles.includes(role);
}

function controlServesViewport(control: GraphControl, vp: ScopeViewport): boolean {
  if (vp === 'all' || !control.viewport || control.viewport === 'both') return true;
  return control.viewport === vp;
}

export function controlRows(graph: BridgeGraph, scope: ClubhouseScope, filter: ControlFilter = 'all'): ControlRow[] {
  return Object.entries(graph.controls)
    .map(([id, control]) => ({ id, ...control }))
    .filter(
      (c) =>
        (!scope.page || c.page === scope.page) &&
        controlServesRole(c, scope.role) &&
        controlServesViewport(c, scope.vp) &&
        (filter === 'all' ||
          (filter === 'gap' && c.verdict?.toUpperCase() === 'GAP') ||
          (filter === 'unlabelled' && !c.label && !c.labelTemplate)),
    )
    .sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));
}

export function controlLabel(control: GraphControl): string {
  return control.label ?? (control.labelTemplate ? `${control.labelTemplate} (built at run time)` : '(no label)');
}

/** Controls whose press runs any of these actions: "the controls that start those actions" (B05). */
export function controlsStarting(graph: BridgeGraph, actionIds: readonly string[]): string[] {
  const wanted = new Set(actionIds);
  return Object.entries(graph.controls)
    .filter(([, c]) => c.actions.some((a) => wanted.has(a)))
    .map(([id]) => id)
    .sort();
}

// ---------------------------------------------------------------------------
// Actions (B04)
// ---------------------------------------------------------------------------

export interface ActionOutcome {
  outcome: string;
  id: BridgeId;
  ch?: string;
  meaning?: string;
  category?: number;
  status?: IdStatus;
  /** The ID is not in the contract at all (a drift row). */
  missing: boolean;
  /** The ID was retired; `replacement` names its successor when there is one. */
  tombstone?: { removedAt: string; replacement: BridgeId | null };
}

export function actionOutcomes(graph: BridgeGraph, action: GraphAction): ActionOutcome[] {
  return Object.entries(action.outcomes).map(([outcome, id]) => {
    const known = graph.ids[String(id)];
    return {
      outcome,
      id,
      ch: known?.ch,
      meaning: known?.meaning,
      category: known?.category,
      status: known?.status,
      missing: !known,
      tombstone: graph.tombstones[String(id)],
    };
  });
}

export interface ActionRow extends GraphAction {
  id: string;
  outcomeCount: number;
  /** Outcomes that point at a deprecated, retired or unknown ID: drift the dossier names. */
  driftCount: number;
}

export function actionRows(graph: BridgeGraph, scope: ClubhouseScope): ActionRow[] {
  return Object.entries(graph.actions)
    .filter(([, a]) => (!scope.page || a.page === scope.page) && pageServesRoleById(graph, a.page, scope.role))
    .map(([id, action]) => {
      const outcomes = actionOutcomes(graph, action);
      return {
        id,
        ...action,
        outcomeCount: outcomes.length,
        driftCount: outcomes.filter((o) => o.missing || o.status === 'deprecated').length,
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));
}

function pageServesRoleById(graph: BridgeGraph, page: PageId, role: ScopeRole): boolean {
  const p = graph.pages[page];
  return p ? pageServesRole(p, role) : role === 'all';
}

export const ACTION_SORTS = ['action', 'outcomes', 'drift'] as const;
export type ActionSort = (typeof ACTION_SORTS)[number];

export function parseActionSort(raw: string | string[] | undefined): ActionSort {
  const value = first(raw);
  return (ACTION_SORTS as readonly string[]).includes(value ?? '') ? (value as ActionSort) : 'action';
}

export function sortActionRows(rows: readonly ActionRow[], sort: ActionSort): ActionRow[] {
  const out = [...rows];
  if (sort === 'outcomes') return out.sort((a, b) => b.outcomeCount - a.outcomeCount || a.id.localeCompare(b.id));
  if (sort === 'drift') return out.sort((a, b) => b.driftCount - a.driftCount || a.id.localeCompare(b.id));
  return out;
}

export function actionsEndingIn(graph: BridgeGraph, id: BridgeId): string[] {
  return Object.entries(graph.actions)
    .filter(([, a]) => Object.values(a.outcomes).includes(id))
    .map(([key]) => key)
    .sort();
}

// ---------------------------------------------------------------------------
// Codes (B05)
// ---------------------------------------------------------------------------

export const CODE_PAGE_SIZE = 50;
export const ID_STATUSES: readonly IdStatus[] = ['implemented', 'reserved', 'deprecated'];

export interface CodeFilter {
  q: string;
  page: PageId | null;
  category: number | null;
  status: IdStatus | null;
  /** 1-based result page. */
  p: number;
}

export function parseCodeFilter(sp: SearchParams | undefined, scope: ClubhouseScope): CodeFilter {
  const q = (first(sp?.q) ?? '').trim().slice(0, 120);
  const rawStatus = first(sp?.status);
  const status = (ID_STATUSES as readonly string[]).includes(rawStatus ?? '') ? (rawStatus as IdStatus) : null;
  const p = Math.max(1, Math.floor(Number(first(sp?.p)) || 1));
  return { q, page: scope.page, category: parseCategory(sp?.cat), status, p };
}

export interface CodeRow extends GraphId {
  id: BridgeId;
}

/** Search covers codes, names, meanings, the exact words the coach sees, files and tests (BR-0503). */
function codeMatches(graph: BridgeGraph, key: string, id: GraphId, needle: string): boolean {
  if (key === needle || id.ch?.toLowerCase() === needle) return true;
  const hay = [
    key,
    id.ch,
    id.name,
    id.meaning,
    id.catalogRow?.theySee,
    id.catalogRow?.when,
    ...(id.where ?? []),
    ...(id.tests ?? []),
    ...(id.ch ? (graph.codeIndex[id.ch] ?? []) : []),
  ];
  return hay.some((h) => h?.toLowerCase().includes(needle));
}

export function codeRows(graph: BridgeGraph, filter: CodeFilter): { rows: CodeRow[]; total: number; pages: number; p: number } {
  const needle = filter.q.toLowerCase();
  const all = Object.entries(graph.ids)
    .filter(
      ([key, id]) =>
        (!filter.page || id.page === filter.page) &&
        (!filter.category || id.category === filter.category) &&
        (!filter.status || id.status === filter.status) &&
        (!needle || codeMatches(graph, key, id, needle)),
    )
    .map(([key, id]) => ({ ...id, id: Number(key) }))
    .sort((a, b) => a.id - b.id);
  const pages = Math.max(1, Math.ceil(all.length / CODE_PAGE_SIZE));
  const p = Math.min(filter.p, pages);
  return { rows: all.slice((p - 1) * CODE_PAGE_SIZE, p * CODE_PAGE_SIZE), total: all.length, pages, p };
}

export type CodeParam =
  | { kind: 'id'; id: BridgeId; entry: GraphId }
  | { kind: 'ch'; id: BridgeId }
  | { kind: 'tombstone'; id: BridgeId; removedAt: string; replacement: BridgeId | null }
  | { kind: 'unknown' };

/** `/codes/70603` is the dossier; `/codes/CH-7004` redirects to it through chIndex; a retired ID says so. */
export function resolveCodeParam(graph: BridgeGraph, raw: string): CodeParam {
  const value = decodeURIComponent(raw).trim();
  if (/^ch-\d+$/i.test(value)) {
    const id = graph.chIndex[value.toUpperCase()];
    return id === undefined ? { kind: 'unknown' } : { kind: 'ch', id };
  }
  if (!/^\d+$/.test(value)) return { kind: 'unknown' };
  const entry = graph.ids[value];
  if (entry) return { kind: 'id', id: Number(value), entry };
  const tomb = graph.tombstones[value];
  if (tomb) return { kind: 'tombstone', id: Number(value), ...tomb };
  return { kind: 'unknown' };
}

/** The files that write a code: its exact `where` when it has one, else the code index (plan §4.6). */
export function codeFiles(graph: BridgeGraph, id: GraphId): { exact: string[]; indexed: string[] } {
  return { exact: id.where ?? [], indexed: id.ch ? (graph.codeIndex[id.ch] ?? []) : [] };
}

// ---------------------------------------------------------------------------
// Findings and number checks (B12)
// ---------------------------------------------------------------------------

export interface FindingRow extends GraphFinding {
  id: string;
}

const SEVERITY_RANK: Record<GraphFinding['severity'], number> = { S1: 1, S2: 2, S3: 3, S4: 4 };

export function findingRows(graph: BridgeGraph, scope: ClubhouseScope): FindingRow[] {
  return Object.entries(graph.findings)
    .filter(([, f]) => !scope.page || f.page === scope.page)
    .map(([id, f]) => ({ ...f, id }))
    .sort(
      (a, b) =>
        Number(a.status !== 'open') - Number(b.status !== 'open') ||
        SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
        a.id.localeCompare(b.id),
    );
}

export function reproSteps(finding: GraphFinding): string[] {
  return Array.isArray(finding.repro) ? finding.repro : finding.repro ? [finding.repro] : [];
}

export const READINESS_VIEWS = ['grid', 'findings', 'numbers'] as const;
export type ReadinessView = (typeof READINESS_VIEWS)[number];

export const PAGE_VIEWS = ['overview', 'states', 'controls', 'actions', 'contract', 'phone', 'history'] as const;
export type PageView = (typeof PAGE_VIEWS)[number];

/** The phone-only categories (B02 "Phone"): 17 Haptic and 19 Responsive layout. */
export const PHONE_CATEGORIES: ReadonlySet<number> = new Set([17, 19]);

// ---------------------------------------------------------------------------
// Reports (Copy as Markdown, the evidence footer)
// ---------------------------------------------------------------------------

export function graphSourceLine(graph: BridgeGraph): string {
  return `docs/clubhouse/generated/bridge-graph.json (contract ${graph.contentHash})`;
}

export function markdownTable(header: readonly string[], rows: ReadonlyArray<readonly (string | number)[]>): string {
  const esc = (v: string | number) => String(v).replace(/\|/g, '\\|').replace(/\n/g, ' ');
  return [
    `| ${header.map(esc).join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
    ...rows.map((r) => `| ${r.map(esc).join(' | ')} |`),
  ].join('\n');
}
