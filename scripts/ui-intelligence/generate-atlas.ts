#!/usr/bin/env tsx
/**
 * generate-atlas.ts — GolfHelm Route Atlas generator (Synthesize phase).
 *
 * Reads the VERIFIED enriched per-cluster analysis parts
 * (ui-intelligence/.atlas-parts-v2/<cluster>.json) — preferred — and falls
 * back to the FIRST-PASS parts (ui-intelligence/.atlas-parts/<cluster>.json)
 * when a v2 part is missing. Merges analysis onto every human-verified catalog
 * entry (ui-intelligence/catalog.json) by FOLDER so coverage is 100% of the
 * catalog (missing analysis -> "(analysis pending)").
 *
 * Systemic findings come from ui-intelligence/.atlas-parts-v2/_crosscut.json.
 *
 * For EACH page, beside the screenshot, we render the full core analysis
 * (purpose, features, data contract, components, connects from/to, key flows,
 * states), then Feature critique, Premium feel, Consistency & standardization,
 * a prominent "⚠ Bugs & Debt" block (only verified===true OR confidence==='high',
 * colored by severity), and Corrections. The PAGE CODE is embedded directly in
 * the card: every path in sourceFiles is read from disk and dropped into a
 * collapsible <details><pre><code> block (HTML-escaped) so the code sits
 * ALONGSIDE the screenshot.
 *
 * Emits:
 *   - ui-intelligence/ROUTE-ATLAS.md  (mirror — analysis + bugs + systemic
 *     issues + collapsible PRIMARY source file embedded per page)
 *   - ui-intelligence/atlas.html      (self-contained visual review surface
 *     with embedded code; large by design)
 *
 * No deps beyond Node builtins. dotenv is loaded best-effort if present.
 * Designed to never crash on one bad part file or missing/edge field.
 */

import { readFileSync, readdirSync, writeFileSync, existsSync, statSync } from "node:fs";
import { join, dirname, resolve, extname } from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");
const UI_DIR = join(REPO_ROOT, "ui-intelligence");
const PARTS_V2_DIR = join(UI_DIR, ".atlas-parts-v2");
const PARTS_V1_DIR = join(UI_DIR, ".atlas-parts");
const PARTS_REMEDIATION_DIR = join(UI_DIR, ".atlas-parts-remediation");
const CATALOG_PATH = join(UI_DIR, "catalog.json");
const CROSSCUT_PATH = join(PARTS_V2_DIR, "_crosscut.json");
const DESIGNSYSTEM_PATH = join(PARTS_REMEDIATION_DIR, "_designsystem.json");
const DESIGN_SYSTEM_DOC = "ui-intelligence/DESIGN-SYSTEM.md";
// Wave W1 (2026-07-09): the legacy GolfSidebar.tsx fork was deleted — Fairway
// is the only golf dashboard tree now. Wave W2 (2026-07-09) then extracted the
// 8-hub coach/player nav definitions OUT of FairwayDashboardShell.tsx into a
// dedicated registry module (src/lib/golf/nav-registry.ts —
// buildCoachRailSections()/buildPlayerRailSections()), so THAT is now the
// single source of truth this atlas parser must read.
const SIDEBAR_PATH = join(REPO_ROOT, "src", "lib", "golf", "nav-registry.ts");
const OUT_MD = join(UI_DIR, "ROUTE-ATLAS.md");
const OUT_HTML = join(UI_DIR, "atlas.html");

// ---------------------------------------------------------------------------
// Best-effort dotenv (no hard dependency)
// ---------------------------------------------------------------------------
function loadDotenvBestEffort(): void {
  for (const f of [".env.local", ".env"]) {
    const p = join(REPO_ROOT, f);
    if (!existsSync(p)) continue;
    try {
      const txt = readFileSync(p, "utf8");
      for (const raw of txt.split(/\r?\n/)) {
        const line = raw.trim();
        if (!line || line.startsWith("#")) continue;
        const eq = line.indexOf("=");
        if (eq === -1) continue;
        const key = line.slice(0, eq).trim();
        let val = line.slice(eq + 1).trim();
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.slice(1, -1);
        }
        if (key && !(key in process.env)) process.env[key] = val;
      }
    } catch {
      /* tolerate unreadable env file */
    }
  }
}
loadDotenvBestEffort();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface ConnEdge {
  route?: string;
  why?: string;
}
interface DataContract {
  reads?: string[];
  writes?: string[];
  rpcs?: string[];
  tables?: string[];
}
interface PageStates {
  empty?: string;
  loading?: string;
  error?: string;
  success?: string;
  [k: string]: string | undefined;
}
interface Bug {
  type?: string;
  severity?: string; // critical | high | medium | low
  description?: string;
  evidence?: string;
  snippet?: string;
  confidence?: string; // high | medium | low
  verified?: boolean;
}
interface Analysis {
  route?: string;
  label?: string;
  role?: string;
  category?: string;
  folder?: string;
  screenshot?: string;
  status?: string;
  primaryUser?: string;
  primaryUserNote?: string;
  purpose?: string;
  features?: unknown;
  dataSources?: unknown;
  connectsTo?: unknown;
  connectsFrom?: unknown;
  connectsFromNote?: string;
  uxNotes?: string;
  redesignOpportunities?: unknown;
  // v2 enriched fields
  accuracyChecked?: boolean;
  corrections?: unknown;
  componentsUsed?: unknown;
  dataContract?: DataContract;
  keyFlows?: unknown;
  states?: PageStates;
  sourceFiles?: unknown;
  featureCritique?: string;
  premiumFeel?: unknown;
  consistency?: unknown;
  bugs?: Bug[];
  _source?: "v2" | "v1";
}
// --- Redesign-plan (remediation) shapes -----------------------------------
interface RemediationComponent {
  name?: string;
  action?: string; // reskin-preserve-logic | delete+rebuild-presentation | reuse-shared | ...
  note?: string;
}
interface RemediationLayoutIA {
  promote?: string[];
  demote?: string[];
  merge?: string[];
  collapse?: string[];
  remove?: string[];
  [k: string]: string[] | undefined;
}
interface Remediation {
  routeType?: string;
  jobToBeDone?: string;
  flowRole?: string;
  currentProblems?: string[];
  redesignIntent?: string;
  layoutIA?: RemediationLayoutIA;
  typography?: string;
  surfaces?: string;
  currentWiring?: string;
  primitives?: string[];
  componentsToRebuild?: RemediationComponent[];
  preserveLogic?: string[];
  motion?: string;
  states?: PageStates;
  mustFix?: string[];
  accessibility?: string[];
  acceptanceCriteria?: string[];
  priority?: string; // P0 | P1 | P2
  effort?: string; // S | M | L | XL
}
/** A cross-page feature-flow assessment (_flow-<cluster>.json). */
interface FeatureFlow {
  feature?: string;
  pagesInFlow?: string[];
  coachJourney?: string;
  playerJourney?: string;
  bottlenecks?: { where?: string; problem?: string; evidence?: string }[];
  organizationOpportunities?: string[];
  optimizationOpportunities?: string[];
  _cluster?: string;
}

interface CatalogEntry {
  route?: string;
  label?: string;
  role?: string;
  auth?: boolean;
  category?: string;
  criticality?: string;
  folder?: string;
  enabled?: boolean;
  notes?: string;
  needs_confirmation?: boolean;
  dynamic?: boolean;
  param?: string | null;
  status?: string;
  url?: string;
  viewport?: string;
  screenshot?: string;
  screenshotPath?: string;
  capturedAt?: string;
  pageTitle?: string;
  finalUrl?: string;
  height?: number;
  error?: string;
}
/** A fully merged page: catalog entry + (optional) analysis. */
interface Page extends CatalogEntry {
  analysis: Analysis | null;
  hasAnalysis: boolean;
  analysisSource: "v2" | "v1" | "none";
  // resolved/derived fields
  screenshotSrc: string;
  bucket: Bucket;
  features: string[];
  dataSources: string[];
  connectsTo: ConnEdge[];
  connectsFrom: ConnEdge[];
  redesignOpportunities: string[];
  purpose: string;
  uxNotes: string;
  primaryUser: string;
  // v2
  corrections: string[];
  componentsUsed: string[];
  dataContract: DataContract;
  keyFlows: string[];
  states: PageStates;
  sourceFiles: string[];
  featureCritique: string;
  premiumFeel: string[];
  consistency: string[];
  bugs: Bug[];
  // redesign plan (remediation phase)
  remediation: Remediation | null;
  hasRemediation: boolean;
}

type Bucket = "player" | "coach" | "shared" | "public";

// ---------------------------------------------------------------------------
// Small helpers (defensive)
// ---------------------------------------------------------------------------
function safeReadJson<T>(path: string, fallback: T): T {
  try {
    if (!existsSync(path)) return fallback;
    const txt = readFileSync(path, "utf8");
    return JSON.parse(txt) as T;
  } catch (err) {
    console.warn(`[atlas] WARN: could not parse ${path}: ${(err as Error).message}`);
    return fallback;
  }
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => (typeof x === "string" ? x : x == null ? "" : String(x)))
    .map((s) => s.trim())
    .filter(Boolean);
}

function asEdgeArray(v: unknown): ConnEdge[] {
  if (!Array.isArray(v)) return [];
  const out: ConnEdge[] = [];
  for (const x of v) {
    if (x && typeof x === "object") {
      const route = typeof (x as ConnEdge).route === "string" ? (x as ConnEdge).route : undefined;
      const why = typeof (x as ConnEdge).why === "string" ? (x as ConnEdge).why : undefined;
      if (route || why) out.push({ route, why });
    } else if (typeof x === "string" && x.trim()) {
      out.push({ route: x.trim() });
    }
  }
  return out;
}

function asBugArray(v: unknown): Bug[] {
  if (!Array.isArray(v)) return [];
  const out: Bug[] = [];
  for (const x of v) {
    if (x && typeof x === "object") {
      const b = x as Bug;
      out.push({
        type: typeof b.type === "string" ? b.type : undefined,
        severity: typeof b.severity === "string" ? b.severity.toLowerCase() : undefined,
        description: typeof b.description === "string" ? b.description : undefined,
        evidence: typeof b.evidence === "string" ? b.evidence : undefined,
        snippet: typeof b.snippet === "string" ? b.snippet : undefined,
        confidence: typeof b.confidence === "string" ? b.confidence.toLowerCase() : undefined,
        verified: b.verified === true,
      });
    }
  }
  return out;
}

/** A bug is shown only if it is verified OR has high confidence. */
function bugIsShown(b: Bug): boolean {
  return b.verified === true || (b.confidence || "") === "high";
}

function asDataContract(v: unknown): DataContract {
  if (!v || typeof v !== "object") return {};
  const o = v as DataContract;
  return {
    reads: asStringArray(o.reads),
    writes: asStringArray(o.writes),
    rpcs: asStringArray(o.rpcs),
    tables: asStringArray(o.tables),
  };
}

function asStates(v: unknown): PageStates {
  if (!v || typeof v !== "object") return {};
  const o = v as Record<string, unknown>;
  const out: PageStates = {};
  for (const k of Object.keys(o)) {
    if (typeof o[k] === "string" && (o[k] as string).trim()) out[k] = o[k] as string;
  }
  return out;
}

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" && v.trim() ? v : fallback;
}

function esc(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function mdEsc(s: string): string {
  // light escaping for markdown table-ish breakers; keep readable
  return String(s).replace(/\|/g, "\\|");
}

/** Strip annotations from a sourceFiles entry to get a real on-disk path.
 * Handles: "path.ts (createGolfQualifier, ...)" and "path.tsx:123" forms.
 * MUST preserve App-Router route-group segments like "(dashboard)" / "(auth)"
 * that are part of the path — so we only strip a trailing parenthetical that
 * follows a recognized file extension, and a trailing ":line" likewise. */
function cleanSourcePath(sf: string): string {
  let s = sf.trim();
  // strip a trailing " (annotation)" that comes AFTER a file extension
  s = s.replace(/(\.(?:tsx?|jsx?|css|json|mjs|cjs))\s*\(.*$/i, "$1");
  // strip a trailing ":<line>[:col][ ...]" that comes AFTER a file extension
  s = s.replace(/(\.(?:tsx?|jsx?|css|json|mjs|cjs)):\d+.*$/i, "$1");
  return s.trim();
}

/** Map a file extension to a hljs-ish language hint (not used for highlight,
 * just a data attribute / label). */
function langFor(path: string): string {
  const e = extname(path).toLowerCase();
  if (e === ".tsx") return "tsx";
  if (e === ".ts") return "ts";
  if (e === ".jsx") return "jsx";
  if (e === ".js") return "js";
  if (e === ".css") return "css";
  if (e === ".json") return "json";
  if (e === ".md") return "md";
  return "text";
}

// ---------------------------------------------------------------------------
// Read inputs
// ---------------------------------------------------------------------------
const catalog: CatalogEntry[] = (() => {
  const raw = safeReadJson<unknown>(CATALOG_PATH, []);
  if (Array.isArray(raw)) return raw as CatalogEntry[];
  // tolerate { entries: [...] } / { routes: [...] } shapes
  if (raw && typeof raw === "object") {
    for (const k of ["entries", "routes", "pages", "catalog"]) {
      const v = (raw as Record<string, unknown>)[k];
      if (Array.isArray(v)) return v as CatalogEntry[];
    }
  }
  return [];
})();

const crosscut = safeReadJson<Record<string, unknown>>(CROSSCUT_PATH, {});

// Flatten analysis parts. PREFER v2; fall back to v1 per-cluster (by base name).
// One bad file never aborts the run.
function readPartsDir(dir: string, source: "v2" | "v1"): Map<string, Analysis[]> {
  const byBase = new Map<string, Analysis[]>();
  if (!existsSync(dir)) return byBase;
  let files: string[] = [];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".json") && !f.startsWith("_"));
  } catch (err) {
    console.warn(`[atlas] WARN: could not read parts dir ${dir}: ${(err as Error).message}`);
    return byBase;
  }
  for (const f of files.sort()) {
    const base = f.replace(/\.json$/, "");
    const full = join(dir, f);
    const raw = safeReadJson<unknown>(full, null as unknown);
    let arr: unknown[] = [];
    if (Array.isArray(raw)) arr = raw;
    else if (raw && typeof raw === "object") {
      for (const k of ["pages", "entries", "routes"]) {
        const v = (raw as Record<string, unknown>)[k];
        if (Array.isArray(v)) {
          arr = v;
          break;
        }
      }
    }
    if (!Array.isArray(arr) || arr.length === 0) {
      console.warn(`[atlas] WARN: ${source} part ${f} has no analysis array; skipped.`);
      continue;
    }
    const list: Analysis[] = [];
    for (const o of arr) {
      if (o && typeof o === "object") {
        const a = o as Analysis;
        a._source = source;
        list.push(a);
      }
    }
    byBase.set(base, list);
  }
  return byBase;
}

const v2Parts = readPartsDir(PARTS_V2_DIR, "v2");
const v1Parts = readPartsDir(PARTS_V1_DIR, "v1");

// Compose the effective analysis set: prefer v2 cluster, else v1 cluster.
let v2ClustersUsed = 0;
let v1ClustersUsed = 0;
const analyses: Analysis[] = [];
const allClusterBases = new Set<string>([...v2Parts.keys(), ...v1Parts.keys()]);
for (const base of [...allClusterBases].sort()) {
  if (v2Parts.has(base)) {
    analyses.push(...v2Parts.get(base)!);
    v2ClustersUsed++;
  } else if (v1Parts.has(base)) {
    analyses.push(...v1Parts.get(base)!);
    v1ClustersUsed++;
  }
}

// Index analysis by folder (primary) and route (fallback). Multiple analyses
// can share a route (coach + player), so route index keyed by role too.
const analysisByFolder = new Map<string, Analysis>();
const analysisByRouteRole = new Map<string, Analysis>();
const analysisByRoute = new Map<string, Analysis>();
for (const a of analyses) {
  if (a.folder && !analysisByFolder.has(a.folder)) analysisByFolder.set(a.folder, a);
  if (a.route) {
    const rr = `${a.route}::${a.role ?? ""}`;
    if (!analysisByRouteRole.has(rr)) analysisByRouteRole.set(rr, a);
    if (!analysisByRoute.has(a.route)) analysisByRoute.set(a.route, a);
  }
}

// ---------------------------------------------------------------------------
// Redesign plans (remediation phase) — load .atlas-parts-remediation/<cluster>.json
// and merge each page's `remediation` onto the matching Page (by folder, then
// route). Also load _flow-<cluster>.json (cross-page feature flows) and
// _designsystem.json (the one design system). Tolerate everything missing.
// ---------------------------------------------------------------------------
function normLayoutIA(v: unknown): RemediationLayoutIA {
  if (!v || typeof v !== "object") return {};
  const o = v as Record<string, unknown>;
  const out: RemediationLayoutIA = {};
  for (const k of Object.keys(o)) {
    const arr = asStringArray(o[k]);
    if (arr.length) out[k] = arr;
  }
  return out;
}
function normRemediationComponents(v: unknown): RemediationComponent[] {
  if (!Array.isArray(v)) return [];
  const out: RemediationComponent[] = [];
  for (const x of v) {
    if (x && typeof x === "object") {
      const c = x as RemediationComponent;
      out.push({
        name: typeof c.name === "string" ? c.name : undefined,
        action: typeof c.action === "string" ? c.action : undefined,
        note: typeof c.note === "string" ? c.note : undefined,
      });
    } else if (typeof x === "string" && x.trim()) {
      out.push({ name: x.trim() });
    }
  }
  return out;
}
function normRemediation(v: unknown): Remediation | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const r: Remediation = {
    routeType: str(o.routeType as string),
    jobToBeDone: str(o.jobToBeDone as string),
    flowRole: str(o.flowRole as string),
    currentProblems: asStringArray(o.currentProblems),
    redesignIntent: str(o.redesignIntent as string),
    layoutIA: normLayoutIA(o.layoutIA),
    typography: str(o.typography as string),
    surfaces: str(o.surfaces as string),
    currentWiring: str(o.currentWiring as string),
    primitives: asStringArray(o.primitives),
    componentsToRebuild: normRemediationComponents(o.componentsToRebuild),
    preserveLogic: asStringArray(o.preserveLogic),
    motion: str(o.motion as string),
    states: asStates(o.states),
    mustFix: asStringArray(o.mustFix),
    accessibility: asStringArray(o.accessibility),
    acceptanceCriteria: asStringArray(o.acceptanceCriteria),
    priority: (str(o.priority as string) || "").toUpperCase(),
    effort: (str(o.effort as string) || "").toUpperCase(),
  };
  return r;
}

// remediation, indexed by folder (primary) then route (fallback)
const remediationByFolder = new Map<string, Remediation>();
const remediationByRoute = new Map<string, Remediation>();
const featureFlows: FeatureFlow[] = [];
let remediationFilesLoaded = 0;
let remediationEntries = 0;
let flowFilesLoaded = 0;
(function loadRemediation(): void {
  if (!existsSync(PARTS_REMEDIATION_DIR)) return;
  let files: string[] = [];
  try {
    files = readdirSync(PARTS_REMEDIATION_DIR).filter((f) => f.endsWith(".json"));
  } catch (err) {
    console.warn(`[atlas] WARN: could not read remediation dir: ${(err as Error).message}`);
    return;
  }
  for (const f of files.sort()) {
    // _designsystem.json handled separately; _flow-*.json are feature flows; rest are page plans
    if (f === "_designsystem.json") continue;
    const full = join(PARTS_REMEDIATION_DIR, f);
    if (f.startsWith("_flow-")) {
      const cluster = f.replace(/^_flow-/, "").replace(/\.json$/, "");
      const raw = safeReadJson<unknown>(full, null as unknown);
      const arr = Array.isArray(raw) ? raw : raw && typeof raw === "object" ? [raw] : [];
      let any = false;
      for (const o of arr) {
        if (o && typeof o === "object") {
          const ff = o as FeatureFlow;
          ff._cluster = cluster;
          featureFlows.push(ff);
          any = true;
        }
      }
      if (any) flowFilesLoaded++;
      continue;
    }
    if (f.startsWith("_")) continue; // any other underscore file: skip
    const raw = safeReadJson<unknown>(full, null as unknown);
    let arr: unknown[] = [];
    if (Array.isArray(raw)) arr = raw;
    else if (raw && typeof raw === "object") {
      for (const k of ["pages", "entries", "routes"]) {
        const v = (raw as Record<string, unknown>)[k];
        if (Array.isArray(v)) {
          arr = v;
          break;
        }
      }
    }
    if (!Array.isArray(arr) || arr.length === 0) {
      console.warn(`[atlas] WARN: remediation part ${f} has no entries; skipped.`);
      continue;
    }
    remediationFilesLoaded++;
    for (const o of arr) {
      if (!o || typeof o !== "object") continue;
      const e = o as { folder?: string; route?: string; remediation?: unknown };
      const rem = normRemediation(e.remediation);
      if (!rem) continue;
      remediationEntries++;
      const folder = str(e.folder);
      const route = str(e.route);
      if (folder && !remediationByFolder.has(folder)) remediationByFolder.set(folder, rem);
      if (route && !remediationByRoute.has(route)) remediationByRoute.set(route, rem);
    }
  }
})();

// The single design system (token headlines + fonts + card direction).
const designSystem = safeReadJson<Record<string, unknown>>(DESIGNSYSTEM_PATH, {});

// ---------------------------------------------------------------------------
// Embed source code (read once, cache). Guard missing files.
// ---------------------------------------------------------------------------
interface EmbeddedFile {
  path: string; // cleaned, repo-relative
  raw: string; // the original sourceFiles entry (may carry annotation)
  lang: string;
  code: string | null; // null if missing/unreadable
  bytes: number;
}
const fileCache = new Map<string, EmbeddedFile>();
let sourceFilesEmbedded = 0;
let sourceFilesMissing = 0;
function embedFile(rawEntry: string): EmbeddedFile {
  const cleaned = cleanSourcePath(rawEntry);
  const cacheKey = cleaned;
  if (fileCache.has(cacheKey)) {
    const cached = fileCache.get(cacheKey)!;
    return { ...cached, raw: rawEntry };
  }
  const abs = resolve(REPO_ROOT, cleaned);
  let code: string | null = null;
  let bytes = 0;
  try {
    if (existsSync(abs) && statSync(abs).isFile()) {
      code = readFileSync(abs, "utf8");
      bytes = Buffer.byteLength(code, "utf8");
    }
  } catch {
    code = null;
  }
  const ef: EmbeddedFile = { path: cleaned, raw: rawEntry, lang: langFor(cleaned), code, bytes };
  fileCache.set(cacheKey, ef);
  return ef;
}

// ---------------------------------------------------------------------------
// Parse the sidebar nav (reproducible cross-page map source-of-truth)
// ---------------------------------------------------------------------------
interface NavItem {
  label: string;
  href: string;
}
/** Extract every literal `{ ... label: '...' ... href: '...' ... }` object
 *  from an arbitrary source slice (flat objects only — no nested `{}` between
 *  the label/href keys, which is exactly the GolfSubTab / NavItem-arg shape
 *  nav-registry.ts declares). */
function extractNavItemObjects(body: string): { label: string; href: string }[] {
  const items: { label: string; href: string }[] = [];
  const objRe = /\{[^{}]*href:\s*['"`]([^'"`]+)['"`][^{}]*\}/g;
  let m: RegExpExecArray | null;
  while ((m = objRe.exec(body)) !== null) {
    const block = m[0];
    const href = m[1];
    const lm = block.match(/label:\s*['"`]([^'"`]+)['"`]/);
    items.push({ label: lm ? lm[1] : href, href });
  }
  return items;
}

/** Slice a named function's body: declaration → next top-level `export function`. */
function extractFnBody(src: string, fnName: string): string {
  const fnStart = src.indexOf(`function ${fnName}`);
  if (fnStart === -1) return "";
  const nextFnStart = src.indexOf("\nexport function ", fnStart + 1);
  return nextFnStart !== -1 ? src.slice(fnStart, nextFnStart) : src.slice(fnStart);
}

/** Bracket-depth-matched slice of a top-level `const NAME: ... = [ … ];` array
 *  literal (handles the NESTED braces inside each GolfSubTab entry, unlike
 *  extractNavItemObjects's flat-object regex — this only finds the outer
 *  array's span; extractNavItemObjects then walks the flat entries inside). */
function extractConstArrayBody(src: string, constName: string): string {
  const declIdx = src.indexOf(`const ${constName}`);
  if (declIdx === -1) return "";
  const bracketStart = src.indexOf("[", declIdx);
  if (bracketStart === -1) return "";
  let depth = 0;
  for (let i = bracketStart; i < src.length; i++) {
    if (src[i] === "[") depth++;
    else if (src[i] === "]") {
      depth--;
      if (depth === 0) return src.slice(bracketStart, i + 1);
    }
  }
  return src.slice(bracketStart);
}

/**
 * WAVE W2's nav-registry.ts declares the 8-item coach/player rail in TWO
 * SEPARATE functions (buildCoachRailSections / buildPlayerRailSections) — a
 * real architectural improvement over the old single-function-with-a-role-
 * switch shape this parser used to split heuristically (second
 * "/golf/dashboard" occurrence). BUT the composite hub rail items (Team,
 * Calendar, Rounds & Stats, Messages, Operations) pass their `href` as a
 * DERIVED expression (`team.tabs[0]!.href`), not a string literal — the flat-
 * object regex can't resolve that, so those rail items are unioned in from
 * their own hub's tab-array constant instead (COACH_TEAM_TABS, etc.), which
 * always uses literal hrefs. Dedup by href keeps a hub's rail entry from
 * appearing twice when its landing tab is also its first array member.
 */
function extractRoleNav(
  src: string,
  railFnName: string,
  tabConstNames: readonly string[],
): NavItem[] {
  const seen = new Set<string>();
  const items: NavItem[] = [];
  const sources = [extractFnBody(src, railFnName), ...tabConstNames.map((n) => extractConstArrayBody(src, n))];
  for (const source of sources) {
    for (const item of extractNavItemObjects(source)) {
      if (seen.has(item.href)) continue;
      seen.add(item.href);
      items.push(item);
    }
  }
  return items;
}

const COACH_TAB_CONSTS = [
  "COACH_TEAM_TABS",
  "COACH_CALENDAR_TABS",
  "COACH_ROUNDS_STATS_TABS",
  "COACH_MESSAGES_TABS",
  "COACH_OPERATIONS_TABS",
] as const;
const PLAYER_TAB_CONSTS = ["PLAYER_TEAM_TABS"] as const;

function parseSidebarNav(): { coach: NavItem[]; player: NavItem[] } {
  const empty = { coach: [] as NavItem[], player: [] as NavItem[] };
  let src = "";
  try {
    src = readFileSync(SIDEBAR_PATH, "utf8");
  } catch {
    return empty;
  }
  const coach = extractRoleNav(src, "buildCoachRailSections", COACH_TAB_CONSTS);
  const player = extractRoleNav(src, "buildPlayerRailSections", PLAYER_TAB_CONSTS);
  if (coach.length === 0 && player.length === 0) return empty;
  return { coach, player };
}
const sidebarNav = parseSidebarNav();

// ---------------------------------------------------------------------------
// Merge catalog + analysis -> Page[]
// ---------------------------------------------------------------------------
function bucketFor(role: string | undefined, sharedRoutes: Set<string>, route: string | undefined): Bucket {
  if (role === "public") return "public";
  if (route && sharedRoutes.has(route)) return "shared";
  if (role === "player") return "player";
  if (role === "coach") return "coach";
  return "public";
}

// routes present under BOTH coach and player -> shared
const rolesByRoute = new Map<string, Set<string>>();
for (const c of catalog) {
  const r = c.route ?? "";
  if (!r) continue;
  if (!rolesByRoute.has(r)) rolesByRoute.set(r, new Set());
  rolesByRoute.get(r)!.add(c.role ?? "");
}
const sharedRoutes = new Set<string>();
for (const [r, roles] of rolesByRoute) {
  if (roles.has("coach") && roles.has("player")) sharedRoutes.add(r);
}

function mergeOne(c: CatalogEntry): Page {
  const folder = str(c.folder);
  let a: Analysis | null = null;
  if (folder && analysisByFolder.has(folder)) {
    a = analysisByFolder.get(folder)!;
  } else if (c.route) {
    a =
      analysisByRouteRole.get(`${c.route}::${c.role ?? ""}`) ??
      analysisByRoute.get(c.route) ??
      null;
  }
  const hasAnalysis = a !== null;
  const analysisSource: "v2" | "v1" | "none" = a?._source ?? "none";

  // Merge the redesign plan by folder (primary) then route (fallback). Tolerate missing.
  let rem: Remediation | null = null;
  if (folder && remediationByFolder.has(folder)) rem = remediationByFolder.get(folder)!;
  else if (c.route && remediationByRoute.has(c.route)) rem = remediationByRoute.get(c.route)!;

  // Screenshot src is ALWAYS derived from folder, per spec (relative to ui-intelligence/).
  const screenshotSrc = folder ? `screenshots/desktop/${folder}/full-page.png` : "";

  const role = str(c.role) || str(a?.role) || "public";
  const route = str(c.route) || str(a?.route);

  return {
    ...c,
    analysis: a,
    hasAnalysis,
    analysisSource,
    screenshotSrc,
    bucket: bucketFor(role, sharedRoutes, route),
    role,
    route,
    label: str(c.label) || str(a?.label) || route || folder || "(untitled)",
    category: str(c.category) || str(a?.category) || "uncategorized",
    status: str(c.status) || str(a?.status) || "unknown",
    purpose: hasAnalysis ? str(a?.purpose, "(analysis pending)") : "(analysis pending)",
    uxNotes: str(a?.uxNotes),
    primaryUser: str(a?.primaryUser) || role,
    features: asStringArray(a?.features),
    dataSources: asStringArray(a?.dataSources),
    connectsTo: asEdgeArray(a?.connectsTo),
    connectsFrom: asEdgeArray(a?.connectsFrom),
    redesignOpportunities: asStringArray(a?.redesignOpportunities),
    // v2 enriched
    corrections: asStringArray(a?.corrections),
    componentsUsed: asStringArray(a?.componentsUsed),
    dataContract: asDataContract(a?.dataContract),
    keyFlows: asStringArray(a?.keyFlows),
    states: asStates(a?.states),
    sourceFiles: asStringArray(a?.sourceFiles),
    featureCritique: str(a?.featureCritique),
    premiumFeel: asStringArray(a?.premiumFeel),
    consistency: asStringArray(a?.consistency),
    bugs: asBugArray(a?.bugs),
    remediation: rem,
    hasRemediation: rem !== null,
  };
}

const pages: Page[] = catalog.map(mergeOne);

// De-dupe shared pages: a route captured under both coach & player appears
// twice in the catalog (different folders). For the SHARED bucket we keep ONE
// canonical page per route but remember both folders/screenshots/roles.
interface SharedPage extends Page {
  folders: { role: string; folder: string; screenshotSrc: string }[];
}
function dedupeShared(all: Page[]): { player: Page[]; coach: Page[]; shared: SharedPage[]; public: Page[] } {
  const player: Page[] = [];
  const coach: Page[] = [];
  const pub: Page[] = [];
  const sharedMap = new Map<string, SharedPage>();

  for (const p of all) {
    if (p.bucket === "public") {
      pub.push(p);
    } else if (p.bucket === "player") {
      player.push(p);
    } else if (p.bucket === "coach") {
      coach.push(p);
    } else if (p.bucket === "shared") {
      const key = p.route || p.folder || p.label || "";
      if (!sharedMap.has(key)) {
        const sp: SharedPage = {
          ...p,
          // clone arrays we union below so we never mutate the source page
          bugs: [...p.bugs],
          corrections: [...p.corrections],
          premiumFeel: [...p.premiumFeel],
          consistency: [...p.consistency],
          sourceFiles: [...p.sourceFiles],
          folders: [{ role: p.role, folder: str(p.folder), screenshotSrc: p.screenshotSrc }],
        };
        sharedMap.set(key, sp);
      } else {
        const existing = sharedMap.get(key)!;
        existing.folders.push({ role: p.role, folder: str(p.folder), screenshotSrc: p.screenshotSrc });
        // Union the load-bearing findings across BOTH role copies so a
        // verified bug (or correction/critique) that only the coach OR only
        // the player copy recorded is never dropped during de-dup.
        const bugKey = (b: Bug) => `${b.type}::${b.severity}::${(b.description || "").slice(0, 80)}`;
        const seenBugs = new Set(existing.bugs.map(bugKey));
        for (const b of p.bugs) {
          if (!seenBugs.has(bugKey(b))) {
            existing.bugs.push(b);
            seenBugs.add(bugKey(b));
          }
        }
        const unionStr = (target: string[], src: string[]) => {
          const seen = new Set(target);
          for (const s of src) if (!seen.has(s)) { target.push(s); seen.add(s); }
        };
        unionStr(existing.corrections, p.corrections);
        unionStr(existing.premiumFeel, p.premiumFeel);
        unionStr(existing.consistency, p.consistency);
        unionStr(existing.sourceFiles, p.sourceFiles);
        // Keep a redesign plan if either role copy carries one (folder-keyed,
        // so both role copies usually carry the same plan anyway).
        const keptRemediation = existing.remediation ?? p.remediation;
        const keptHasRemediation = existing.hasRemediation || p.hasRemediation;
        // Pick the richer copy for the scalar/narrative fields (purpose,
        // featureCritique, features, etc.) but PRESERVE the unioned arrays.
        const richness = (x: Page) =>
          x.features.length +
          x.bugs.length +
          x.sourceFiles.length +
          x.premiumFeel.length +
          x.consistency.length +
          (x.hasAnalysis ? 1 : 0) +
          (x.analysisSource === "v2" ? 5 : 0);
        if (richness(p) > richness(existing)) {
          const { folders, bugs, corrections, premiumFeel, consistency, sourceFiles } = existing;
          Object.assign(existing, p, { folders, bugs, corrections, premiumFeel, consistency, sourceFiles });
        }
        existing.remediation = keptRemediation;
        existing.hasRemediation = keptHasRemediation;
      }
    }
  }
  // sort folder lists role-consistently (coach, player)
  const order: Record<string, number> = { coach: 0, player: 1 };
  for (const sp of sharedMap.values()) {
    sp.folders.sort((a, b) => (order[a.role] ?? 9) - (order[b.role] ?? 9));
  }
  return { player, coach, shared: [...sharedMap.values()], public: pub };
}

const grouped = dedupeShared(pages);

// Sort helpers: by category then route then label
function sortPages<T extends Page>(arr: T[]): T[] {
  return [...arr].sort(
    (a, b) =>
      (a.category || "").localeCompare(b.category || "") ||
      (a.route || "").localeCompare(b.route || "") ||
      (a.label || "").localeCompare(b.label || ""),
  );
}
function groupByCategory<T extends Page>(arr: T[]): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const p of sortPages(arr)) {
    const k = p.category || "uncategorized";
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(p);
  }
  return m;
}

// ---------------------------------------------------------------------------
// Bug aggregation (only shown bugs: verified OR high-confidence)
// ---------------------------------------------------------------------------
const SEV_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
function shownBugs(p: Page): Bug[] {
  return p.bugs
    .filter(bugIsShown)
    .sort((a, b) => (SEV_ORDER[a.severity || "low"] ?? 9) - (SEV_ORDER[b.severity || "low"] ?? 9));
}
// Count over the RENDERED set (shared routes de-duped + bug-unioned) so the
// executive summary matches what the atlas actually shows — no double-counting
// of a bug that both role copies of a shared route recorded.
const renderedPages: Page[] = [
  ...grouped.player,
  ...grouped.coach,
  ...(grouped.shared as unknown as Page[]),
  ...grouped.public,
];
const allShownBugs: { page: Page; bug: Bug }[] = [];
for (const p of renderedPages) for (const b of shownBugs(p)) allShownBugs.push({ page: p, bug: b });

const bugsBySeverity: Record<string, number> = {};
const bugsByType: Record<string, number> = {};
for (const { bug } of allShownBugs) {
  bugsBySeverity[bug.severity || "?"] = (bugsBySeverity[bug.severity || "?"] ?? 0) + 1;
  bugsByType[bug.type || "?"] = (bugsByType[bug.type || "?"] ?? 0) + 1;
}

// Redesign-plan coverage over the RENDERED set (shared de-duped) + priority tally.
const pagesWithPlan = renderedPages.filter((p) => p.hasRemediation).length;
const planByPriority: Record<string, number> = {};
for (const p of renderedPages) {
  if (!p.hasRemediation) continue;
  const prio = (p.remediation?.priority || "?").toUpperCase();
  planByPriority[prio] = (planByPriority[prio] ?? 0) + 1;
}
// Over the FLAT catalog (every catalog row) — for the "X of 131" coverage report.
const catalogWithPlan = pages.filter((p) => p.hasRemediation).length;

// ---------------------------------------------------------------------------
// Cluster intros (short, by category)
// ---------------------------------------------------------------------------
const CLUSTER_INTRO: Record<string, string> = {
  public: "Marketing, landing, and unauthenticated content surfaces.",
  auth: "Login, signup, and password-recovery flows.",
  onboarding: "Role-specific first-run setup (coach 3-step, player 4-step).",
  legal: "Terms, privacy, and other legal/compliance pages.",
  join: "Team join-by-code funnel (invite -> signup -> roster).",
  core: "Primary dashboard home / hub landing surfaces.",
  "player-hub": "Player's personalized home (today, travel, tasks, events).",
  player: "Player-specific personal surfaces (game profile, standing, recruiting).",
  rounds: "Round entry, in-progress scoring, recovery, and review.",
  stats: "Stats & analytics — personal, team, and per-dimension tabs (SG, scoring, driving, approach, putting, scrambling, spray, progress).",
  qualifiers: "Qualifier index, creation, live leaderboard, and player scorecards.",
  roster: "Team roster, player profiles, and per-player detail.",
  "team-ops": "Team operations — calendar, messages, announcements, tasks, documents, travel, team info.",
  coachhelm: "CoachHelm AI layer — insights, patterns, predictions, genome, chat, development plans, qualifying workspace.",
  development: "Development plans and focus-area management.",
  recruiting: "Recruiting HQ surfaces.",
  analytics: "CoachHelm effectiveness analytics.",
  settings: "Account, notification, and coaching-intelligence settings.",
  admin: "Platform admin — dashboard and the CRM tree.",
  uncategorized: "Uncategorized surfaces.",
};
function clusterIntro(cat: string): string {
  return CLUSTER_INTRO[cat] ?? `${cat} surfaces.`;
}

// ---------------------------------------------------------------------------
// Markdown emit
// ---------------------------------------------------------------------------
function badgeWord(status: string): string {
  const s = (status || "").toLowerCase();
  if (s === "success") return "🟢 success";
  if (s === "redirected") return "🟡 redirected";
  if (s === "disabled") return "⚪ disabled";
  return `· ${status || "unknown"}`;
}

function sevEmoji(sev: string): string {
  const s = (sev || "").toLowerCase();
  if (s === "critical") return "🔴";
  if (s === "high") return "🟠";
  if (s === "medium") return "🟡";
  if (s === "low") return "⚪";
  return "·";
}

function connLines(edges: ConnEdge[]): string[] {
  if (!edges.length) return ["- _none captured_"];
  return edges.map((e) => {
    const r = e.route ? `\`${e.route}\`` : "(unspecified)";
    const why = e.why ? ` — ${mdEsc(e.why)}` : "";
    return `- ${r}${why}`;
  });
}

function bulletList(items: string[], emptyText = "_none_"): string[] {
  if (!items.length) return [`- ${emptyText}`];
  return items.map((i) => `- ${mdEsc(i)}`);
}

function dataContractLines(dc: DataContract): string[] {
  const parts: string[] = [];
  if (dc.reads && dc.reads.length) parts.push(`- **reads:** ${dc.reads.map(mdEsc).join("; ")}`);
  if (dc.writes && dc.writes.length) parts.push(`- **writes:** ${dc.writes.map(mdEsc).join("; ")}`);
  if (dc.rpcs && dc.rpcs.length) parts.push(`- **rpcs:** ${dc.rpcs.map(mdEsc).join("; ")}`);
  if (dc.tables && dc.tables.length) parts.push(`- **tables:** ${dc.tables.map((t) => `\`${t}\``).join(", ")}`);
  if (!parts.length) return ["- _none captured_"];
  return parts;
}

function statesLines(st: PageStates): string[] {
  const keys = Object.keys(st);
  if (!keys.length) return ["- _none captured_"];
  return keys.map((k) => `- **${k}:** ${mdEsc(st[k] || "")}`);
}

function bugsMd(p: Page): string[] {
  const bugs = shownBugs(p);
  if (!bugs.length) return [];
  const out: string[] = [];
  out.push("**⚠ Bugs & Debt** _(verified / high-confidence only)_");
  out.push("");
  for (const b of bugs) {
    const tag = b.type ? `\`${b.type}\`` : "";
    const sev = `${sevEmoji(b.severity || "")} **${(b.severity || "?").toUpperCase()}**`;
    out.push(`- ${sev} ${tag} — ${mdEsc(b.description || "")}`);
    if (b.evidence) out.push(`  - _evidence:_ ${mdEsc(b.evidence)}`);
    if (b.snippet) out.push(`  - _snippet:_ \`${mdEsc(b.snippet.replace(/\n/g, " ").slice(0, 240))}\``);
  }
  out.push("");
  return out;
}

// ---------------------------------------------------------------------------
// Redesign-plan (remediation) helpers — shared by MD + HTML
// ---------------------------------------------------------------------------
const PRIO_ORDER: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };
function prioEmoji(prio: string): string {
  const s = (prio || "").toUpperCase();
  if (s === "P0") return "🔴";
  if (s === "P1") return "🟠";
  if (s === "P2") return "🟡";
  return "·";
}
/** Map a componentsToRebuild action to a clear verb + class. */
function actionMeta(action: string): { label: string; cls: string } {
  const a = (action || "").toLowerCase();
  if (a.includes("delete") || a.includes("rebuild-presentation"))
    return { label: "delete + rebuild presentation", cls: "act-rebuild" };
  if (a.includes("reskin") || a.includes("preserve-logic"))
    return { label: "re-skin · preserve logic", cls: "act-reskin" };
  if (a.includes("reuse")) return { label: "reuse shared primitive", cls: "act-reuse" };
  if (a.includes("remove") || a.includes("delete-only")) return { label: "remove", cls: "act-remove" };
  if (a === "new" || a.includes("net-new") || a.startsWith("new-")) return { label: "new component", cls: "act-new" };
  return { label: action || "—", cls: "act-other" };
}
const LAYOUT_IA_ORDER = ["promote", "demote", "merge", "collapse", "remove"];
function layoutIaEntries(ia: RemediationLayoutIA | undefined): { verb: string; items: string[] }[] {
  if (!ia) return [];
  const out: { verb: string; items: string[] }[] = [];
  const keys = [...LAYOUT_IA_ORDER, ...Object.keys(ia).filter((k) => !LAYOUT_IA_ORDER.includes(k))];
  for (const k of keys) {
    const items = asStringArray(ia[k]);
    if (items.length) out.push({ verb: k, items });
  }
  return out;
}

function redesignMd(p: Page): string[] {
  const r = p.remediation;
  if (!r) return [];
  const out: string[] = [];
  const prio = r.priority || "";
  const eff = r.effort || "";
  out.push(`**🎨 Redesign plan** — ${prioEmoji(prio)} **${prio || "—"}** priority · effort **${eff || "—"}**${r.routeType ? ` · _${mdEsc(r.routeType)}_` : ""}`);
  out.push("");
  if (r.jobToBeDone) {
    out.push(`- **Job-to-be-done:** ${mdEsc(r.jobToBeDone)}`);
  }
  if (r.currentWiring) out.push(`- **Current wiring:** ${mdEsc(r.currentWiring)}`);
  if (r.flowRole) out.push(`- **Flow role:** ${mdEsc(r.flowRole)}`);
  if (r.redesignIntent) out.push(`- **Redesign intent:** ${mdEsc(r.redesignIntent)}`);
  out.push("");
  // current problems
  if (r.currentProblems && r.currentProblems.length) {
    out.push("_Current problems_");
    out.push(...bulletList(r.currentProblems));
    out.push("");
  }
  // Layout / IA
  const ia = layoutIaEntries(r.layoutIA);
  if (ia.length) {
    out.push("_Layout / IA_");
    for (const e of ia) out.push(`- **${e.verb}:** ${e.items.map(mdEsc).join("; ")}`);
    out.push("");
  }
  if (r.typography) {
    out.push(`_Typography_ — ${mdEsc(r.typography)}`);
    out.push("");
  }
  if (r.surfaces) {
    out.push(`_Surfaces_ — ${mdEsc(r.surfaces)}`);
    out.push("");
  }
  if (r.primitives && r.primitives.length) {
    out.push(`_Primitives_ — ${r.primitives.map((x) => `\`${mdEsc(x)}\``).join(" ")}`);
    out.push("");
  }
  if (r.componentsToRebuild && r.componentsToRebuild.length) {
    out.push("_Components to rebuild_");
    for (const c of r.componentsToRebuild) {
      const m = actionMeta(c.action || "");
      out.push(`- **${mdEsc(c.name || "—")}** — _${m.label}_${c.note ? `: ${mdEsc(c.note)}` : ""}`);
    }
    out.push("");
  }
  // PRESERVE (do not break)
  if (r.preserveLogic && r.preserveLogic.length) {
    out.push("_🔒 Preserve (do not break)_");
    out.push(...bulletList(r.preserveLogic));
    out.push("");
  }
  if (r.motion) {
    out.push(`_Motion_ — ${mdEsc(r.motion)}`);
    out.push("");
  }
  if (r.states && Object.keys(r.states).length) {
    out.push("_States_");
    out.push(...statesLines(r.states));
    out.push("");
  }
  if (r.mustFix && r.mustFix.length) {
    out.push("_Must-fix_");
    out.push(...bulletList(r.mustFix));
    out.push("");
  }
  if (r.accessibility && r.accessibility.length) {
    out.push("_Accessibility_");
    out.push(...bulletList(r.accessibility));
    out.push("");
  }
  if (r.acceptanceCriteria && r.acceptanceCriteria.length) {
    out.push("_Acceptance criteria_");
    out.push(...bulletList(r.acceptanceCriteria));
    out.push("");
  }
  return out;
}

function renderPageMd(p: Page, sharedFolders?: SharedPage["folders"]): string {
  const out: string[] = [];
  out.push(`### ${p.label} — \`${p.route || p.folder}\``);
  out.push("");
  // badge line
  const srcTag =
    p.analysisSource === "v2" ? "**analysis:** verified (v2)" : p.analysisSource === "v1" ? "**analysis:** first-pass (v1)" : "";
  const badgeBits = [
    `**role:** ${p.role}`,
    `**status:** ${badgeWord(p.status || "")}`,
    p.primaryUser ? `**primary user:** ${p.primaryUser}` : "",
    p.category ? `**cluster:** ${p.category}` : "",
    srcTag,
    p.hasAnalysis ? "" : "**(analysis pending)**",
  ].filter(Boolean);
  out.push(badgeBits.join("  ·  "));
  out.push("");
  // screenshot link(s)
  if (sharedFolders && sharedFolders.length > 1) {
    out.push(
      "_Shared route — both roles use this page._ Screenshots: " +
        sharedFolders.map((f) => `[${f.role}](${f.screenshotSrc})`).join(" · "),
    );
  } else {
    if (p.screenshotSrc) out.push(`Screenshot: [${p.folder}](${p.screenshotSrc})`);
  }
  out.push("");
  // purpose
  out.push(`**Purpose** — ${mdEsc(p.purpose)}`);
  out.push("");
  // features
  out.push("**Key features**");
  out.push(...bulletList(p.features, "_no features captured_"));
  out.push("");
  // data contract / sources
  out.push("**Data contract**");
  out.push(...dataContractLines(p.dataContract));
  out.push("");
  if (p.dataSources.length) {
    out.push("**Data sources**");
    out.push(...bulletList(p.dataSources, "_none captured_"));
    out.push("");
  }
  // components
  if (p.componentsUsed.length) {
    out.push("**Components used**");
    out.push(...bulletList(p.componentsUsed));
    out.push("");
  }
  // connects
  out.push("**Connects from**");
  out.push(...connLines(p.connectsFrom));
  out.push("");
  out.push("**Connects to**");
  out.push(...connLines(p.connectsTo));
  out.push("");
  // key flows
  if (p.keyFlows.length) {
    out.push("**Key flows**");
    out.push(...bulletList(p.keyFlows));
    out.push("");
  }
  // states
  if (Object.keys(p.states).length) {
    out.push("**States**");
    out.push(...statesLines(p.states));
    out.push("");
  }
  // ux notes
  if (p.uxNotes) {
    out.push(`**UX notes** — ${mdEsc(p.uxNotes)}`);
    out.push("");
  }
  // feature critique
  if (p.featureCritique) {
    out.push(`**Feature critique** — ${mdEsc(p.featureCritique)}`);
    out.push("");
  }
  // premium feel
  if (p.premiumFeel.length) {
    out.push("**Premium feel**");
    out.push(...bulletList(p.premiumFeel));
    out.push("");
  }
  // consistency & standardization
  if (p.consistency.length) {
    out.push("**Consistency & standardization**");
    out.push(...bulletList(p.consistency));
    out.push("");
  }
  // bugs (prominent)
  out.push(...bugsMd(p));
  // 🎨 redesign plan (AFTER bugs)
  out.push(...redesignMd(p));
  // corrections
  if (p.corrections.length) {
    out.push("**Corrections** _(first-pass fixes)_");
    out.push(...bulletList(p.corrections));
    out.push("");
  }
  // legacy redesign opps (v1 fallback only)
  if (p.redesignOpportunities.length) {
    out.push("**Redesign opportunities**");
    out.push(...bulletList(p.redesignOpportunities));
    out.push("");
  }
  // Embedded PRIMARY source file (+ list the rest by path).
  if (p.sourceFiles.length) {
    const primaryRaw = p.sourceFiles[0];
    const ef = embedFile(primaryRaw);
    out.push("**Source files**");
    out.push(...p.sourceFiles.map((s, i) => `- ${i === 0 ? "**(primary)** " : ""}\`${cleanSourcePath(s)}\``));
    out.push("");
    if (ef.code != null) {
      out.push(`<details><summary>📄 ${esc(ef.path)} (${(ef.bytes / 1024).toFixed(1)} KB)</summary>`);
      out.push("");
      out.push("```" + ef.lang);
      out.push(ef.code);
      out.push("```");
      out.push("");
      out.push("</details>");
      out.push("");
    } else {
      out.push(`> _primary source file not found on disk: \`${esc(ef.path)}\`_`);
      out.push("");
    }
  }
  out.push("---");
  out.push("");
  return out.join("\n");
}

function renderBucketMd(
  title: string,
  intro: string,
  byCat: Map<string, Page[]>,
  sharedFolderLookup?: (p: Page) => SharedPage["folders"] | undefined,
): string {
  const out: string[] = [];
  out.push(`## ${title}`);
  out.push("");
  if (intro) {
    out.push(`_${intro}_`);
    out.push("");
  }
  if (byCat.size === 0) {
    out.push("_No pages in this section._");
    out.push("");
    return out.join("\n");
  }
  for (const [cat, ps] of byCat) {
    out.push(`### Cluster: ${cat}  (${ps.length})`);
    out.push("");
    out.push(`> ${clusterIntro(cat)}`);
    out.push("");
    for (const p of ps) {
      const sf = sharedFolderLookup ? sharedFolderLookup(p) : undefined;
      out.push(renderPageMd(p, sf));
    }
  }
  return out.join("\n");
}

// --- Systemic issues (markdown) from crosscut ----------------------------
function crosscutArr(key: string): Record<string, unknown>[] {
  const v = crosscut[key];
  if (!Array.isArray(v)) return [];
  return v.filter((x) => x && typeof x === "object") as Record<string, unknown>[];
}

function systemicMd(): string {
  const out: string[] = [];
  out.push("## Systemic issues");
  out.push("");
  out.push(
    `_Cross-cutting findings from \`.atlas-parts-v2/_crosscut.json\` (${str(crosscut.method as string, "static + DB analysis")}). These are findings + evidence, not a plan._`,
  );
  out.push("");

  // Top systemic themes
  const themes = crosscutArr("topSystemicThemes");
  if (themes.length) {
    out.push("### Top systemic themes");
    out.push("");
    for (const t of themes) {
      out.push(`- ${sevEmoji(str(t.severity as string))} **${mdEsc(str(t.theme as string))}**`);
      if (t.why) out.push(`  - ${mdEsc(str(t.why as string))}`);
      const ar = asStringArray(t.affectedRoutes);
      if (ar.length) out.push(`  - _affected:_ ${ar.map((r) => `\`${r}\``).join(", ")}`);
    }
    out.push("");
  }

  // Data gaps
  const gaps = crosscutArr("dataGaps");
  out.push("### Data gaps");
  out.push("");
  if (!gaps.length) out.push("_none recorded_");
  for (const g of gaps) {
    out.push(`- ${sevEmoji(str(g.severity as string))} **${mdEsc(str(g.feature as string))}**`);
    if (g.surface) out.push(`  - _surface:_ ${mdEsc(str(g.surface as string))}`);
    if (g.evidence) out.push(`  - _evidence:_ ${mdEsc(str(g.evidence as string))}`);
  }
  out.push("");

  // Design-system drift
  const ds = crosscutArr("designSystem");
  out.push("### Design-system drift");
  out.push("");
  if (!ds.length) out.push("_none recorded_");
  for (const d of ds) {
    out.push(`- ${sevEmoji(str(d.severity as string))} **${mdEsc(str(d.issue as string))}**`);
    if (d.evidence) out.push(`  - _evidence:_ ${mdEsc(str(d.evidence as string))}`);
  }
  out.push("");

  // Consistency & competing patterns (canonical vs one-off table)
  const cons = crosscutArr("consistency");
  out.push("### Consistency & competing patterns");
  out.push("");
  if (!cons.length) {
    out.push("_none recorded_");
  } else {
    out.push("| Pattern | Canonical | Competing / one-off | Severity |");
    out.push("| --- | --- | --- | --- |");
    for (const c of cons) {
      const comp = asStringArray(c.competitors);
      const compCell =
        comp.length <= 1
          ? comp.map((x) => mdEsc(x)).join("") || "_none_"
          : `${comp.length} files — ${comp.slice(0, 3).map((x) => `\`${mdEsc(x)}\``).join(", ")}${comp.length > 3 ? ", …" : ""}`;
      out.push(
        `| ${mdEsc(str(c.pattern as string))} | \`${mdEsc(str(c.canonical as string))}\` | ${compCell} | ${sevEmoji(str(c.severity as string))} ${str(c.severity as string)} |`,
      );
    }
    out.push("");
    for (const c of cons) {
      if (c.note) out.push(`- **${mdEsc(str(c.pattern as string))}:** ${mdEsc(str(c.note as string))}`);
    }
  }
  out.push("");

  // Micro-interactions
  const micro = crosscutArr("microInteractions");
  out.push("### Micro-interactions (missing hover / focus / motion)");
  out.push("");
  if (!micro.length) out.push("_none recorded_");
  for (const m of micro) {
    out.push(`- ${sevEmoji(str(m.severity as string))} **${mdEsc(str(m.issue as string))}**`);
    if (m.evidence) out.push(`  - _evidence:_ ${mdEsc(str(m.evidence as string))}`);
  }
  out.push("");

  // IA
  const ia = crosscutArr("ia");
  out.push("### Information architecture");
  out.push("");
  if (!ia.length) out.push("_none recorded_");
  for (const i of ia) {
    out.push(`- ${sevEmoji(str(i.severity as string))} **${mdEsc(str(i.issue as string))}**`);
    if (i.evidence) out.push(`  - _evidence:_ ${mdEsc(str(i.evidence as string))}`);
  }
  out.push("");

  // Hard-rule violations
  const hard = crosscutArr("hardRuleViolations");
  out.push("### Hard-rule violations");
  out.push("");
  if (!hard.length) out.push("_none recorded_");
  for (const h of hard) {
    out.push(`- ${sevEmoji(str(h.severity as string))} **${mdEsc(str(h.rule as string))}**`);
    if (h.file) out.push(`  - _file:_ \`${mdEsc(str(h.file as string))}\``);
    if (h.evidence) out.push(`  - _evidence:_ ${mdEsc(str(h.evidence as string))}`);
  }
  out.push("");

  // Data flow
  const flow = crosscutArr("dataFlow");
  if (flow.length) {
    out.push("### Data flow status");
    out.push("");
    for (const f of flow) {
      out.push(`- **${mdEsc(str(f.flow as string))}** — _${mdEsc(str(f.status as string))}_`);
      if (f.evidence) out.push(`  - ${mdEsc(str(f.evidence as string))}`);
    }
    out.push("");
  }

  return out.join("\n");
}

// --- Design-system callout (markdown) -------------------------------------
function dsGet(path: string[]): unknown {
  let cur: unknown = designSystem;
  for (const k of path) {
    if (cur && typeof cur === "object") cur = (cur as Record<string, unknown>)[k];
    else return undefined;
  }
  return cur;
}
function dsStr(path: string[], fallback = ""): string {
  const v = dsGet(path);
  return typeof v === "string" && v.trim() ? v : fallback;
}
function designSystemMd(): string {
  if (!Object.keys(designSystem).length) return "";
  const out: string[] = [];
  const name = dsStr(["name"], "Design System");
  const version = dsStr(["version"]);
  const status = dsStr(["status"]);
  out.push("## 🎨 Design System");
  out.push("");
  out.push(`> **${mdEsc(name)}**${version ? ` · v${mdEsc(version)}` : ""}${status ? ` · _${mdEsc(status)}_` : ""} — the ONE unified style for the entire app. Full spec: [\`${DESIGN_SYSTEM_DOC}\`](DESIGN-SYSTEM.md).`);
  out.push("");
  const ns = dsStr(["northStar", "statement"]);
  if (ns) out.push(`_${mdEsc(ns)}_`);
  out.push("");
  // Fonts
  const dispFont = dsStr(["typography", "roles", "display", "font"]);
  const bodyFont = dsStr(["typography", "roles", "body", "font"]);
  const numFont = dsStr(["typography", "roles", "numeric", "font"]);
  out.push("**Typography (replaces DM Sans)**");
  if (dispFont) out.push(`- **Display:** ${mdEsc(dispFont)} — ${mdEsc(dsStr(["typography", "roles", "display", "why"]))}`);
  if (bodyFont) out.push(`- **Body:** ${mdEsc(bodyFont)} — ${mdEsc(dsStr(["typography", "roles", "body", "why"]))}`);
  if (numFont) out.push(`- **Numeric:** ${mdEsc(numFont)}`);
  out.push("");
  // Card direction
  out.push("**Surfaces / card direction (replaces glass cards)**");
  out.push(`- ${mdEsc(dsStr(["surfaces", "model"]))}`);
  const cardSpec = dsGet(["surfaces", "cardSpec"]);
  if (cardSpec && typeof cardSpec === "object") {
    const cs = cardSpec as Record<string, string>;
    if (cs.radius) out.push(`- radius ${mdEsc(cs.radius)} · resting ${mdEsc(cs.resting || "")}`);
    if (cs.anatomy) out.push(`- anatomy: ${mdEsc(cs.anatomy)}`);
  }
  const retire = dsStr(["surfaces", "retire"]);
  if (retire) out.push(`- retire: ${mdEsc(retire)}`);
  out.push("");
  // Palette headline
  out.push("**Palette (kept: black sidebar · green · cream)**");
  out.push(`- accent ${mdEsc(dsStr(["palette", "anchors", "accent", "hex"]))} (${mdEsc(dsStr(["palette", "anchors", "accent", "role"]))})`);
  out.push(`- canvas ${mdEsc(dsStr(["palette", "anchors", "canvas", "hex"]))} · sidebar ${mdEsc(dsStr(["palette", "anchors", "sidebarBlack", "hex"]))}`);
  out.push("");
  // Token headlines
  const radii = dsGet(["tokens", "radius"]);
  if (radii && typeof radii === "object") {
    out.push(`**Token headlines** — radius: ${Object.entries(radii as Record<string, string>).map(([k, v]) => `\`${k}\` ${mdEsc(String(v).split(" —")[0])}`).join(" · ")}`);
    out.push("");
  }
  return out.join("\n");
}

// --- Feature flows & bottlenecks (markdown) -------------------------------
function featureFlowsMd(): string {
  if (!featureFlows.length) return "";
  const out: string[] = [];
  out.push("## Feature flows & bottlenecks");
  out.push("");
  out.push(`_Cross-page feature-flow assessments from \`.atlas-parts-remediation/_flow-*.json\` (${featureFlows.length} features across ${flowFilesLoaded} clusters). Each feature is judged as a system spanning multiple routes — the coach AND player journeys, the pages it touches, and the bottlenecks a user observes moving between them._`);
  out.push("");
  // group by cluster
  const byCluster = new Map<string, FeatureFlow[]>();
  for (const ff of featureFlows) {
    const k = ff._cluster || "other";
    if (!byCluster.has(k)) byCluster.set(k, []);
    byCluster.get(k)!.push(ff);
  }
  for (const [cluster, flows] of [...byCluster.entries()].sort()) {
    out.push(`### Cluster: ${cluster}`);
    out.push("");
    for (const ff of flows) {
      out.push(`#### ${mdEsc(ff.feature || "(feature)")}`);
      out.push("");
      const pif = asStringArray(ff.pagesInFlow);
      if (pif.length) {
        out.push(`**Pages in flow:** ${pif.map((r) => `\`${mdEsc(r)}\``).join(" → ")}`);
        out.push("");
      }
      if (ff.coachJourney) {
        out.push(`**Coach journey** — ${mdEsc(ff.coachJourney)}`);
        out.push("");
      }
      if (ff.playerJourney) {
        out.push(`**Player journey** — ${mdEsc(ff.playerJourney)}`);
        out.push("");
      }
      if (Array.isArray(ff.bottlenecks) && ff.bottlenecks.length) {
        out.push("**Bottlenecks**");
        for (const b of ff.bottlenecks) {
          out.push(`- **${mdEsc(str(b.where as string) || "—")}:** ${mdEsc(str(b.problem as string))}`);
          if (b.evidence) out.push(`  - _evidence:_ ${mdEsc(str(b.evidence as string))}`);
        }
        out.push("");
      }
      const org = asStringArray(ff.organizationOpportunities);
      if (org.length) {
        out.push("**Organization opportunities**");
        out.push(...bulletList(org));
        out.push("");
      }
      const opt = asStringArray(ff.optimizationOpportunities);
      if (opt.length) {
        out.push("**Optimization opportunities**");
        out.push(...bulletList(opt));
        out.push("");
      }
    }
  }
  return out.join("\n");
}

function buildMarkdown(): string {
  const total = pages.length;
  const byRole: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  for (const p of pages) {
    byRole[p.role] = (byRole[p.role] ?? 0) + 1;
    byStatus[p.status || "unknown"] = (byStatus[p.status || "unknown"] ?? 0) + 1;
  }
  const fullAnalysis = pages.filter((p) => p.hasAnalysis).length;
  const pending = total - fullAnalysis;
  const v2Count = pages.filter((p) => p.analysisSource === "v2").length;
  const v1Count = pages.filter((p) => p.analysisSource === "v1").length;

  const out: string[] = [];
  out.push("# GolfHelm Route Atlas");
  out.push("");
  out.push(
    `> Master review surface. Auto-generated by \`scripts/ui-intelligence/generate-atlas.ts\` on ${new Date().toISOString()}.`,
  );
  out.push("> Merges the human-verified route catalog with VERIFIED per-cluster analysis (.atlas-parts-v2), code embedded per page. Do not hand-edit.");
  out.push("");

  // Executive summary
  out.push("## Executive summary");
  out.push("");
  out.push(`- **Total pages in atlas:** ${total} (100% of catalog)`);
  out.push(
    `- **By role:** ${Object.entries(byRole)
      .sort()
      .map(([r, n]) => `${r} ${n}`)
      .join(" · ")}`,
  );
  out.push(
    `- **By status:** ${Object.entries(byStatus)
      .sort()
      .map(([s, n]) => `${badgeWord(s)} ${n}`)
      .join(" · ")}`,
  );
  out.push(
    `- **Sections:** Player ${grouped.player.length} · Coach ${grouped.coach.length} · Shared–Team ${grouped.shared.length} (de-duped from both roles) · Public & Auth ${grouped.public.length}`,
  );
  out.push(`- **Analysis coverage:** ${fullAnalysis} full (${v2Count} verified v2 · ${v1Count} first-pass v1) / ${pending} pending`);
  out.push(
    `- **Verified bugs & debt:** ${allShownBugs.length} (by severity: ${Object.entries(bugsBySeverity)
      .sort((a, b) => (SEV_ORDER[a[0]] ?? 9) - (SEV_ORDER[b[0]] ?? 9))
      .map(([s, n]) => `${sevEmoji(s)} ${s} ${n}`)
      .join(" · ")})`,
  );
  out.push(
    `- **🎨 Redesign plans:** ${catalogWithPlan} / ${total} catalog pages (${pagesWithPlan} of ${renderedPages.length} rendered cards, shared de-duped) — by priority: ${Object.entries(planByPriority)
      .sort((a, b) => (PRIO_ORDER[a[0]] ?? 9) - (PRIO_ORDER[b[0]] ?? 9))
      .map(([s, n]) => `${prioEmoji(s)} ${s} ${n}`)
      .join(" · ")}`,
  );
  out.push("");

  // Design system (the ONE unified style) — top-of-page callout.
  out.push(designSystemMd());
  out.push("");

  // Feature flows & bottlenecks (cross-page system view).
  out.push(featureFlowsMd());
  out.push("");

  // Systemic issues (NOT a plan — findings + evidence)
  out.push(systemicMd());
  out.push("");

  // Sections
  out.push(renderBucketMd("PLAYER EXPERIENCE", "Surfaces a player primarily uses.", groupByCategory(grouped.player)));
  out.push("");
  out.push(renderBucketMd("COACH EXPERIENCE", "Surfaces a coach primarily uses.", groupByCategory(grouped.coach)));
  out.push("");
  out.push(
    renderBucketMd(
      "SHARED — TEAM",
      "Routes captured under BOTH coach and player. Listed once here; both roles render the same page (coach + player screenshots noted per page).",
      groupByCategory(grouped.shared as unknown as Page[]),
      (p) => (p as SharedPage).folders,
    ),
  );
  out.push("");
  out.push(renderBucketMd("PUBLIC & AUTH", "Unauthenticated marketing, auth, onboarding, legal, and join surfaces.", groupByCategory(grouped.public)));
  out.push("");

  // Cross-page navigation map
  out.push("## Cross-page navigation map");
  out.push("");
  out.push("Primary navigation comes from `src/lib/golf/nav-registry.ts`. Two role-scoped nav groups:");
  out.push("");
  out.push("**Coach sidebar**");
  if (sidebarNav.coach.length) {
    for (const n of sidebarNav.coach) out.push(`- ${n.label} → \`${n.href}\``);
  } else {
    out.push("- _(sidebar not parsed)_");
  }
  out.push("");
  out.push("**Player sidebar**");
  if (sidebarNav.player.length) {
    for (const n of sidebarNav.player) out.push(`- ${n.label} → \`${n.href}\``);
  } else {
    out.push("- _(sidebar not parsed)_");
  }
  out.push("");
  // Deep links from connectsTo (beyond the sidebar) — aggregate the most common targets
  const linkCount = new Map<string, number>();
  for (const p of pages) {
    for (const e of p.connectsTo) {
      if (e.route) linkCount.set(e.route, (linkCount.get(e.route) ?? 0) + 1);
    }
  }
  const topTargets = [...linkCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
  if (topTargets.length) {
    out.push("**Most-linked-to destinations (from page `connectsTo`)** — the app's gravity wells:");
    out.push("");
    for (const [route, n] of topTargets) out.push(`- \`${route}\` ← ${n} inbound link${n === 1 ? "" : "s"}`);
    out.push("");
  }

  return out.join("\n");
}

// ---------------------------------------------------------------------------
// HTML emit (self-contained — inline CSS + vanilla JS, no CDNs)
// ---------------------------------------------------------------------------
function statusClass(status: string): string {
  const s = (status || "").toLowerCase();
  if (s === "success") return "ok";
  if (s === "redirected") return "warn";
  if (s === "disabled") return "off";
  return "unk";
}

function sevClass(sev: string): string {
  const s = (sev || "").toLowerCase();
  if (s === "critical") return "crit";
  if (s === "high") return "high";
  if (s === "medium") return "med";
  return "low";
}

function connHtml(edges: ConnEdge[]): string {
  if (!edges.length) return `<li class="muted">none captured</li>`;
  return edges
    .map((e) => {
      const r = e.route ? `<code>${esc(e.route)}</code>` : `<span class="muted">unspecified</span>`;
      const why = e.why ? ` <span class="why">— ${esc(e.why)}</span>` : "";
      return `<li>${r}${why}</li>`;
    })
    .join("");
}

function listHtml(items: string[], empty = "none captured"): string {
  if (!items.length) return `<li class="muted">${esc(empty)}</li>`;
  return items.map((i) => `<li>${esc(i)}</li>`).join("");
}

function dataContractHtml(dc: DataContract): string {
  const rows: string[] = [];
  if (dc.reads && dc.reads.length) rows.push(`<li><b>reads</b> ${dc.reads.map((x) => esc(x)).join("; ")}</li>`);
  if (dc.writes && dc.writes.length) rows.push(`<li><b>writes</b> ${dc.writes.map((x) => esc(x)).join("; ")}</li>`);
  if (dc.rpcs && dc.rpcs.length) rows.push(`<li><b>rpcs</b> ${dc.rpcs.map((x) => esc(x)).join("; ")}</li>`);
  if (dc.tables && dc.tables.length)
    rows.push(`<li><b>tables</b> ${dc.tables.map((t) => `<code>${esc(t)}</code>`).join(" ")}</li>`);
  if (!rows.length) return `<li class="muted">none captured</li>`;
  return rows.join("");
}

function statesHtml(st: PageStates): string {
  const keys = Object.keys(st);
  if (!keys.length) return `<li class="muted">none captured</li>`;
  return keys.map((k) => `<li><b>${esc(k)}</b> ${esc(st[k] || "")}</li>`).join("");
}

// Visual reads -> page -> writes flow, derived from the page's dataContract.
const FLOW_TABLE_RE = /\b(?:golf|crm)_[a-z0-9_]+\b/g;
function flowTablesFrom(strs: string[]): string[] {
  const t = new Set<string>();
  for (const s of strs || []) {
    for (const m of s.match(FLOW_TABLE_RE) || []) {
      if (new RegExp(m + "[-.]?(ts|tsx)\\b").test(s)) continue; // skip file refs
      t.add(m);
    }
  }
  return [...t];
}
function dataFlowHtml(p: Page): string {
  const dc = p.dataContract || ({} as DataContract);
  const writeText = (dc.writes || []).join("  ||  ");
  const set = new Set<string>([...(dc.tables || [])]);
  flowTablesFrom(dc.reads || []).forEach((t) => set.add(t));
  flowTablesFrom(dc.writes || []).forEach((t) => set.add(t));
  const rpcs = dc.rpcs || [];
  if (!set.size && !rpcs.length) return "";
  const reads: string[] = [];
  const writes: string[] = [];
  for (const t of set) (writeText.includes(t) ? writes : reads).push(t);
  reads.sort();
  writes.sort();
  const chips = (arr: string[], k: string) =>
    arr.length ? arr.map((t) => `<span class="fchip ${k}">${esc(t)}</span>`).join("") : `<span class="muted">—</span>`;
  const rpcRow = rpcs.length
    ? `<div class="flow-rpc">rpc ${rpcs.map((t) => `<span class="fchip rpc">${esc(t)}</span>`).join("")}</div>`
    : "";
  return `
    <div class="block dataflow">
      <h4>Data flow</h4>
      <div class="flow-row">
        <div class="flow-col"><div class="flow-lbl">reads ↓</div>${chips(reads, "r")}</div>
        <div class="flow-arrow">→ <span class="flow-page">page</span> →</div>
        <div class="flow-col"><div class="flow-lbl">writes ↑</div>${chips(writes, "w")}</div>
      </div>
      ${rpcRow}
    </div>`;
}

function bugsHtml(p: Page): string {
  const bugs = shownBugs(p);
  if (!bugs.length) return "";
  const items = bugs
    .map((b) => {
      const cls = sevClass(b.severity || "");
      const ev = b.evidence ? `<div class="bug-ev"><span class="lbl">evidence</span> <code>${esc(b.evidence)}</code></div>` : "";
      const snip = b.snippet
        ? `<pre class="bug-snip"><code>${esc(b.snippet)}</code></pre>`
        : "";
      return `
        <li class="bug ${cls}">
          <div class="bug-head">
            <span class="sev ${cls}">${esc((b.severity || "?").toUpperCase())}</span>
            ${b.type ? `<span class="bug-type">${esc(b.type)}</span>` : ""}
          </div>
          <p class="bug-desc">${esc(b.description || "")}</p>
          ${ev}
          ${snip}
        </li>`;
    })
    .join("");
  return `
    <div class="block bugs">
      <h4>⚠ Bugs &amp; Debt <span class="bugcount">${bugs.length}</span></h4>
      <ul class="buglist">${items}</ul>
    </div>`;
}

// --- 🎨 Redesign plan panel (HTML) — green-accented, after the bugs block ---
function prioClass(prio: string): string {
  const s = (prio || "").toUpperCase();
  if (s === "P0") return "p0";
  if (s === "P1") return "p1";
  if (s === "P2") return "p2";
  return "px";
}
function redesignHtml(p: Page): string {
  const r = p.remediation;
  if (!r) return "";
  const blocks: string[] = [];
  const sub = (title: string, body: string) =>
    body ? `<div class="rd-sub"><span class="rd-lbl">${esc(title)}</span> ${body}</div>` : "";
  const subList = (title: string, items: string[]) =>
    items.length ? `<div class="rd-sub"><span class="rd-lbl">${esc(title)}</span><ul class="rd-ul">${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul></div>` : "";

  // JTBD / wiring / flow / intent
  blocks.push(sub("Job-to-be-done", r.jobToBeDone ? esc(r.jobToBeDone) : ""));
  blocks.push(sub("Current wiring", r.currentWiring ? esc(r.currentWiring) : ""));
  blocks.push(sub("Flow role", r.flowRole ? esc(r.flowRole) : ""));
  blocks.push(sub("Redesign intent", r.redesignIntent ? `<span class="rd-intent">${esc(r.redesignIntent)}</span>` : ""));
  blocks.push(subList("Current problems", r.currentProblems || []));

  // Layout / IA verbs
  const ia = layoutIaEntries(r.layoutIA);
  if (ia.length) {
    const rows = ia
      .map(
        (e) =>
          `<div class="rd-ia-row"><span class="rd-verb v-${esc(e.verb)}">${esc(e.verb)}</span><ul class="rd-ul">${e.items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul></div>`,
      )
      .join("");
    blocks.push(`<div class="rd-sub"><span class="rd-lbl">Layout / IA</span><div class="rd-ia">${rows}</div></div>`);
  }

  blocks.push(sub("Typography", r.typography ? esc(r.typography) : ""));
  blocks.push(sub("Surfaces", r.surfaces ? esc(r.surfaces) : ""));

  // primitives as chips
  if (r.primitives && r.primitives.length) {
    blocks.push(
      `<div class="rd-sub"><span class="rd-lbl">Primitives</span> ${r.primitives.map((x) => `<span class="rd-chip">${esc(x)}</span>`).join("")}</div>`,
    );
  }

  // components to rebuild — each with action verb
  if (r.componentsToRebuild && r.componentsToRebuild.length) {
    const rows = r.componentsToRebuild
      .map((c) => {
        const m = actionMeta(c.action || "");
        return `<li class="rd-comp"><span class="rd-comp-name">${esc(c.name || "—")}</span> <span class="rd-act ${m.cls}">${esc(m.label)}</span>${c.note ? `<div class="rd-comp-note">${esc(c.note)}</div>` : ""}</li>`;
      })
      .join("");
    blocks.push(`<div class="rd-sub"><span class="rd-lbl">Components to rebuild</span><ul class="rd-complist">${rows}</ul></div>`);
  }

  // 🔒 Preserve — flagged distinctly
  if (r.preserveLogic && r.preserveLogic.length) {
    blocks.push(
      `<div class="rd-preserve"><span class="rd-lbl">🔒 Preserve (do not break)</span><ul class="rd-ul">${r.preserveLogic.map((i) => `<li>${esc(i)}</li>`).join("")}</ul></div>`,
    );
  }

  blocks.push(sub("Motion", r.motion ? esc(r.motion) : ""));

  // states
  if (r.states && Object.keys(r.states).length) {
    const rows = Object.keys(r.states)
      .map((k) => `<li><b>${esc(k)}</b> ${esc(r.states![k] || "")}</li>`)
      .join("");
    blocks.push(`<div class="rd-sub"><span class="rd-lbl">States</span><ul class="rd-ul">${rows}</ul></div>`);
  }

  blocks.push(subList("Must-fix", r.mustFix || []));
  blocks.push(subList("Accessibility", r.accessibility || []));
  if (r.acceptanceCriteria && r.acceptanceCriteria.length) {
    blocks.push(
      `<div class="rd-sub rd-accept"><span class="rd-lbl">Acceptance criteria</span><ul class="rd-ul">${r.acceptanceCriteria.map((i) => `<li>${esc(i)}</li>`).join("")}</ul></div>`,
    );
  }

  const prio = (r.priority || "").toUpperCase();
  const eff = (r.effort || "").toUpperCase();
  return `
    <div class="block redesign">
      <div class="rd-head">
        <h4>🎨 Redesign plan</h4>
        <div class="rd-badges">
          ${prio ? `<span class="rd-prio ${prioClass(prio)}">${esc(prio)}</span>` : ""}
          ${eff ? `<span class="rd-eff">effort ${esc(eff)}</span>` : ""}
          ${r.routeType ? `<span class="rd-rtype">${esc(r.routeType)}</span>` : ""}
        </div>
      </div>
      <div class="rd-body">${blocks.filter(Boolean).join("")}</div>
    </div>`;
}

function codeHtml(p: Page): string {
  if (!p.sourceFiles.length) return "";
  const blocks = p.sourceFiles
    .map((raw) => {
      const ef = embedFile(raw);
      if (ef.code == null) {
        return `<div class="codefile missing"><span class="muted">⚠ not found on disk:</span> <code>${esc(ef.path)}</code></div>`;
      }
      sourceFilesEmbedded++;
      return `
        <details class="codefile">
          <summary><span class="filepath">${esc(ef.path)}</span> <span class="filemeta">${ef.lang} · ${(ef.bytes / 1024).toFixed(1)} KB</span></summary>
          <pre class="code"><code>${esc(ef.code)}</code></pre>
        </details>`;
    })
    .join("");
  return `
    <div class="block code-block" data-code-block>
      <div class="code-head">
        <h4>📄 Page code <span class="muted">(${p.sourceFiles.length} file${p.sourceFiles.length === 1 ? "" : "s"})</span></h4>
        <button type="button" class="code-toggle" data-code-toggle>Show code</button>
      </div>
      <div class="code-files" hidden>${blocks}</div>
    </div>`;
}

function cardHtml(p: Page, sharedFolders?: SharedPage["folders"]): string {
  const sc = statusClass(p.status || "");
  const hasBugs = shownBugs(p).length > 0;
  const maxSev = shownBugs(p)[0]?.severity || "";
  const planPrio = (p.remediation?.priority || "").toUpperCase();
  const dataAttrs = [
    `data-bucket="${esc(p.bucket)}"`,
    `data-category="${esc(p.category || "")}"`,
    `data-hasbugs="${hasBugs ? "1" : "0"}"`,
    `data-maxsev="${esc(maxSev)}"`,
    `data-hasplan="${p.hasRemediation ? "1" : "0"}"`,
    `data-priority="${esc(planPrio)}"`,
    `data-search="${esc((p.label + " " + (p.route || "") + " " + p.purpose + " " + p.sourceFiles.join(" ")).toLowerCase())}"`,
  ].join(" ");

  // thumbnail(s)
  let thumb = "";
  if (sharedFolders && sharedFolders.length > 1) {
    thumb = sharedFolders
      .map(
        (f) => `
        <figure class="thumb">
          <a href="${esc(f.screenshotSrc)}" target="_blank" rel="noopener">
            <img loading="lazy" src="${esc(f.screenshotSrc)}" alt="${esc(p.label)} (${esc(f.role)})" />
          </a>
          <figcaption>${esc(f.role)}</figcaption>
        </figure>`,
      )
      .join("");
  } else {
    thumb = `
      <figure class="thumb">
        <a href="${esc(p.screenshotSrc)}" target="_blank" rel="noopener">
          <img loading="lazy" src="${esc(p.screenshotSrc)}" alt="${esc(p.label)}" />
        </a>
      </figure>`;
  }

  const pendingBadge = p.hasAnalysis ? "" : `<span class="badge pending">analysis pending</span>`;
  const srcBadge =
    p.analysisSource === "v2"
      ? `<span class="badge v2">verified</span>`
      : p.analysisSource === "v1"
        ? `<span class="badge v1">first-pass</span>`
        : "";
  const sharedNote =
    sharedFolders && sharedFolders.length > 1
      ? `<p class="sharednote">Shared route — both roles render this page.</p>`
      : "";

  const dcBlock = `<div class="block"><h4>Data contract</h4><ul>${dataContractHtml(p.dataContract)}</ul></div>`;
  const dsBlock = p.dataSources.length
    ? `<div class="block"><h4>Data sources</h4><ul>${listHtml(p.dataSources)}</ul></div>`
    : "";
  const compBlock = p.componentsUsed.length
    ? `<div class="block"><h4>Components used</h4><ul>${listHtml(p.componentsUsed)}</ul></div>`
    : "";
  const flowsBlock = p.keyFlows.length
    ? `<div class="block"><h4>Key flows</h4><ul>${listHtml(p.keyFlows)}</ul></div>`
    : "";
  const statesBlock = Object.keys(p.states).length
    ? `<div class="block"><h4>States</h4><ul>${statesHtml(p.states)}</ul></div>`
    : "";
  const uxBlock = p.uxNotes ? `<div class="block"><h4>UX notes</h4><p>${esc(p.uxNotes)}</p></div>` : "";
  const critiqueBlock = p.featureCritique
    ? `<div class="block critique"><h4>Feature critique</h4><p>${esc(p.featureCritique)}</p></div>`
    : "";
  const premiumBlock = p.premiumFeel.length
    ? `<div class="block premium"><h4>Premium feel</h4><ul>${listHtml(p.premiumFeel)}</ul></div>`
    : "";
  const consistencyBlock = p.consistency.length
    ? `<div class="block consistency"><h4>Consistency &amp; standardization</h4><ul>${listHtml(p.consistency)}</ul></div>`
    : "";
  const correctionsBlock = p.corrections.length
    ? `<div class="block corrections"><h4>Corrections <span class="muted">(first-pass fixes)</span></h4><ul>${listHtml(p.corrections)}</ul></div>`
    : "";
  const redesignBlock = p.redesignOpportunities.length
    ? `<div class="block"><h4>Redesign opportunities</h4><ul>${listHtml(p.redesignOpportunities)}</ul></div>`
    : "";

  return `
  <article class="card${hasBugs ? " has-bugs" : ""}" ${dataAttrs}>
    <div class="card-media">${thumb}</div>
    <div class="card-body">
      <header>
        <div class="titleline">
          <h3>${esc(p.label)}</h3>
          <span class="badge ${sc}">${esc(p.status || "unknown")}</span>
          <span class="badge role">${esc(p.role)}</span>
          ${srcBadge}
          ${pendingBadge}
          ${planPrio ? `<span class="badge plan-prio ${prioClass(planPrio)}">🎨 ${esc(planPrio)}</span>` : ""}
        </div>
        <code class="route">${esc(p.route || p.folder || "")}</code>
        ${sharedNote}
      </header>
      <div class="block"><h4>Purpose</h4><p>${esc(p.purpose)}</p></div>
      <div class="block"><h4>Key features</h4><ul>${listHtml(p.features, "no features captured")}</ul></div>
      <div class="grid2">
        ${dcBlock}
        ${dsBlock}
      </div>
      ${dataFlowHtml(p)}
      ${compBlock}
      <div class="grid2">
        <div class="block"><h4>Connects from</h4><ul class="conns">${connHtml(p.connectsFrom)}</ul></div>
        <div class="block"><h4>Connects to</h4><ul class="conns">${connHtml(p.connectsTo)}</ul></div>
      </div>
      ${flowsBlock}
      ${statesBlock}
      ${uxBlock}
      ${critiqueBlock}
      ${premiumBlock}
      ${consistencyBlock}
      ${bugsHtml(p)}
      ${redesignHtml(p)}
      ${correctionsBlock}
      ${redesignBlock}
      ${codeHtml(p)}
    </div>
  </article>`;
}

function sectionHtml(
  id: string,
  label: string,
  intro: string,
  ps: Page[],
  sharedLookup?: (p: Page) => SharedPage["folders"] | undefined,
): string {
  const cards = sortPages(ps)
    .map((p) => cardHtml(p, sharedLookup ? sharedLookup(p) : undefined))
    .join("\n");
  return `
  <section class="bucket" id="bucket-${esc(id)}" data-bucket-section="${esc(id)}">
    <div class="bucket-head">
      <h2>${esc(label)}</h2>
      <p class="bucket-intro">${esc(intro)} <span class="count">${ps.length} page${ps.length === 1 ? "" : "s"}</span></p>
    </div>
    <div class="cards">${cards}</div>
  </section>`;
}

// --- 🎨 Design-system callout (HTML) — top-of-page summary ----------------
function designSystemHtml(): string {
  if (!Object.keys(designSystem).length) return "";
  const name = dsStr(["name"], "Design System");
  const version = dsStr(["version"]);
  const status = dsStr(["status"]);
  const ns = dsStr(["northStar", "statement"]);
  const feel = dsStr(["northStar", "feel"]);

  const dispFont = dsStr(["typography", "roles", "display", "font"]);
  const dispWhy = dsStr(["typography", "roles", "display", "why"]);
  const bodyFont = dsStr(["typography", "roles", "body", "font"]);
  const bodyWhy = dsStr(["typography", "roles", "body", "why"]);
  const numFont = dsStr(["typography", "roles", "numeric", "font"]);

  const surfaceModel = dsStr(["surfaces", "model"]);
  const cardSpec = (dsGet(["surfaces", "cardSpec"]) as Record<string, string>) || {};
  const retire = dsStr(["surfaces", "retire"]);

  const accentHex = dsStr(["palette", "anchors", "accent", "hex"]);
  const canvasHex = dsStr(["palette", "anchors", "canvas", "hex"]);
  const sidebarHex = dsStr(["palette", "anchors", "sidebarBlack", "hex"]);

  const radii = (dsGet(["tokens", "radius"]) as Record<string, string>) || {};
  // primitives entries can be strings or {name,...} objects
  const prims = Array.isArray(dsGet(["primitives"]))
    ? (dsGet(["primitives"]) as unknown[]).map((p) => (typeof p === "string" ? p : ((p as Record<string, string>).name || ""))).filter(Boolean)
    : [];

  const radiusChips = Object.entries(radii)
    .map(([k, v]) => `<span class="ds-chip"><b>${esc(k)}</b> ${esc(String(v).split(" —")[0].trim())}</span>`)
    .join("");

  return `
  <section class="bucket ds-callout" id="bucket-designsystem" data-bucket-section="designsystem">
    <div class="bucket-head">
      <h2>🎨 Design System <span class="ds-name">${esc(name)}${version ? ` · v${esc(version)}` : ""}${status ? ` · ${esc(status)}` : ""}</span></h2>
      <p class="bucket-intro">The ONE unified style for the entire app — every page plan references it. Full spec: <a href="DESIGN-SYSTEM.md"><code>${esc(DESIGN_SYSTEM_DOC)}</code></a>.</p>
    </div>
    ${ns ? `<p class="ds-northstar">${esc(ns)}</p>` : ""}
    ${feel ? `<p class="ds-feel">“${esc(feel)}”</p>` : ""}
    <div class="ds-grid">
      <div class="ds-card">
        <h3>Typography <span class="ds-replace">replaces DM Sans</span></h3>
        <ul class="ds-list">
          ${dispFont ? `<li><span class="ds-role">Display</span> <b>${esc(dispFont)}</b><div class="ds-why">${esc(dispWhy)}</div></li>` : ""}
          ${bodyFont ? `<li><span class="ds-role">Body</span> <b>${esc(bodyFont)}</b><div class="ds-why">${esc(bodyWhy)}</div></li>` : ""}
          ${numFont ? `<li><span class="ds-role">Numeric</span> <b>${esc(numFont)}</b></li>` : ""}
        </ul>
      </div>
      <div class="ds-card">
        <h3>Surfaces / Cards <span class="ds-replace">replaces glass cards</span></h3>
        <p class="ds-model">${esc(surfaceModel)}</p>
        <ul class="ds-list">
          ${cardSpec.radius ? `<li><span class="ds-role">Radius</span> ${esc(cardSpec.radius)}</li>` : ""}
          ${cardSpec.resting ? `<li><span class="ds-role">Resting</span> ${esc(cardSpec.resting)}</li>` : ""}
          ${cardSpec.anatomy ? `<li><span class="ds-role">Anatomy</span> ${esc(cardSpec.anatomy)}</li>` : ""}
        </ul>
        ${retire ? `<p class="ds-retire">Retire: ${esc(retire)}</p>` : ""}
      </div>
      <div class="ds-card">
        <h3>Palette <span class="ds-replace">kept: black · green · cream</span></h3>
        <div class="ds-swatches">
          ${accentHex ? `<span class="ds-sw"><span class="sw" style="background:${esc(accentHex)}"></span> accent ${esc(accentHex)}</span>` : ""}
          ${canvasHex ? `<span class="ds-sw"><span class="sw" style="background:${esc(canvasHex)};border:1px solid #e7e3da"></span> canvas ${esc(canvasHex)}</span>` : ""}
          ${sidebarHex ? `<span class="ds-sw"><span class="sw" style="background:${esc(sidebarHex)}"></span> sidebar ${esc(sidebarHex)}</span>` : ""}
        </div>
        ${radiusChips ? `<div class="ds-tokens"><span class="ds-tok-lbl">radius scale</span>${radiusChips}</div>` : ""}
      </div>
      ${prims.length ? `<div class="ds-card ds-prims"><h3>Shared primitives <span class="muted">(${prims.length})</span></h3><div class="ds-chips">${prims.map((x) => `<span class="rd-chip">${esc(x)}</span>`).join("")}</div></div>` : ""}
    </div>
  </section>`;
}

// --- Feature flows & bottlenecks (HTML) -----------------------------------
function featureFlowsHtml(): string {
  if (!featureFlows.length) return "";
  const byCluster = new Map<string, FeatureFlow[]>();
  for (const ff of featureFlows) {
    const k = ff._cluster || "other";
    if (!byCluster.has(k)) byCluster.set(k, []);
    byCluster.get(k)!.push(ff);
  }
  const clusters = [...byCluster.entries()]
    .sort()
    .map(([cluster, flows]) => {
      const feats = flows
        .map((ff) => {
          const pif = asStringArray(ff.pagesInFlow);
          const pagesRow = pif.length
            ? `<div class="ff-pages"><span class="ff-lbl">Pages in flow</span> ${pif.map((r) => `<code>${esc(r)}</code>`).join('<span class="ff-arrow">→</span>')}</div>`
            : "";
          const journeys = `
            ${ff.coachJourney ? `<div class="ff-journey ff-coach"><span class="ff-lbl">Coach journey</span><p>${esc(ff.coachJourney)}</p></div>` : ""}
            ${ff.playerJourney ? `<div class="ff-journey ff-player"><span class="ff-lbl">Player journey</span><p>${esc(ff.playerJourney)}</p></div>` : ""}`;
          const bottlenecks = Array.isArray(ff.bottlenecks) && ff.bottlenecks.length
            ? `<div class="ff-bottlenecks"><span class="ff-lbl">Bottlenecks</span><ul class="ff-bl">${ff.bottlenecks
                .map(
                  (b) =>
                    `<li><b>${esc(str(b.where as string) || "—")}</b> — ${esc(str(b.problem as string))}${b.evidence ? `<div class="ff-ev"><span class="lbl">evidence</span> <code>${esc(str(b.evidence as string))}</code></div>` : ""}</li>`,
                )
                .join("")}</ul></div>`
            : "";
          const org = asStringArray(ff.organizationOpportunities);
          const opt = asStringArray(ff.optimizationOpportunities);
          const opps = `
            ${org.length ? `<div class="ff-opp ff-org"><span class="ff-lbl">Organization opportunities</span><ul>${org.map((i) => `<li>${esc(i)}</li>`).join("")}</ul></div>` : ""}
            ${opt.length ? `<div class="ff-opp ff-opt"><span class="ff-lbl">Optimization opportunities</span><ul>${opt.map((i) => `<li>${esc(i)}</li>`).join("")}</ul></div>` : ""}`;
          return `
            <div class="ff-feature">
              <h4 class="ff-title">${esc(ff.feature || "(feature)")}</h4>
              ${pagesRow}
              ${journeys}
              ${bottlenecks}
              ${opps}
            </div>`;
        })
        .join("");
      return `<div class="ff-cluster"><h3 class="ff-cluster-h">${esc(cluster)}</h3>${feats}</div>`;
    })
    .join("");

  return `
  <section class="bucket featureflows" id="bucket-featureflows" data-bucket-section="featureflows">
    <div class="bucket-head">
      <h2>Feature flows &amp; bottlenecks</h2>
      <p class="bucket-intro">Cross-page feature systems — coach + player journeys, the pages each spans, and the friction users observe moving between them. <span class="count">${featureFlows.length} features · ${flowFilesLoaded} clusters</span></p>
    </div>
    <div class="ff-wrap">${clusters}</div>
  </section>`;
}

// --- Systemic issues panel (HTML) -----------------------------------------
function systemicHtml(): string {
  const sectionOf = (
    title: string,
    items: Record<string, unknown>[],
    render: (x: Record<string, unknown>) => string,
  ) =>
    `<div class="sys-section"><h3>${esc(title)}</h3>${items.length ? `<ul class="sys-list">${items.map(render).join("")}</ul>` : `<p class="muted">none recorded</p>`}</div>`;

  const themeHtml = sectionOf("Top systemic themes", crosscutArr("topSystemicThemes"), (t) => {
    const ar = asStringArray(t.affectedRoutes);
    return `<li class="sys sev-${sevClass(str(t.severity as string))}"><span class="sev ${sevClass(str(t.severity as string))}">${esc(str(t.severity as string, "?").toUpperCase())}</span> <b>${esc(str(t.theme as string))}</b><p>${esc(str(t.why as string))}</p>${ar.length ? `<p class="muted">affected: ${ar.map((r) => `<code>${esc(r)}</code>`).join(" ")}</p>` : ""}</li>`;
  });

  const gapsHtml = sectionOf("Data gaps", crosscutArr("dataGaps"), (g) => {
    return `<li class="sys sev-${sevClass(str(g.severity as string))}"><span class="sev ${sevClass(str(g.severity as string))}">${esc(str(g.severity as string, "?").toUpperCase())}</span> <b>${esc(str(g.feature as string))}</b>${g.surface ? `<p class="muted">${esc(str(g.surface as string))}</p>` : ""}<p>${esc(str(g.evidence as string))}</p></li>`;
  });

  const dsHtml = sectionOf("Design-system drift", crosscutArr("designSystem"), (d) => {
    return `<li class="sys sev-${sevClass(str(d.severity as string))}"><span class="sev ${sevClass(str(d.severity as string))}">${esc(str(d.severity as string, "?").toUpperCase())}</span> <b>${esc(str(d.issue as string))}</b><p>${esc(str(d.evidence as string))}</p></li>`;
  });

  // Consistency table
  const cons = crosscutArr("consistency");
  const consRows = cons
    .map((c) => {
      const comp = asStringArray(c.competitors);
      const compCell =
        comp.length <= 1
          ? esc(comp[0] || "—")
          : `${comp.length} files <details class="comp-d"><summary>list</summary><ul>${comp.map((x) => `<li><code>${esc(x)}</code></li>`).join("")}</ul></details>`;
      return `<tr class="sev-${sevClass(str(c.severity as string))}"><td>${esc(str(c.pattern as string))}</td><td><code>${esc(str(c.canonical as string))}</code></td><td>${compCell}</td><td><span class="sev ${sevClass(str(c.severity as string))}">${esc(str(c.severity as string, "?").toUpperCase())}</span></td></tr>${c.note ? `<tr class="note-row"><td colspan="4" class="muted">${esc(str(c.note as string))}</td></tr>` : ""}`;
    })
    .join("");
  const consHtml = `<div class="sys-section"><h3>Consistency &amp; competing patterns</h3>${
    cons.length
      ? `<table class="sys-table"><thead><tr><th>Pattern</th><th>Canonical</th><th>Competing / one-off</th><th>Sev</th></tr></thead><tbody>${consRows}</tbody></table>`
      : `<p class="muted">none recorded</p>`
  }</div>`;

  const microHtml = sectionOf("Micro-interactions (hover / focus / motion)", crosscutArr("microInteractions"), (m) => {
    return `<li class="sys sev-${sevClass(str(m.severity as string))}"><span class="sev ${sevClass(str(m.severity as string))}">${esc(str(m.severity as string, "?").toUpperCase())}</span> <b>${esc(str(m.issue as string))}</b><p>${esc(str(m.evidence as string))}</p></li>`;
  });

  const iaHtml = sectionOf("Information architecture", crosscutArr("ia"), (i) => {
    return `<li class="sys sev-${sevClass(str(i.severity as string))}"><span class="sev ${sevClass(str(i.severity as string))}">${esc(str(i.severity as string, "?").toUpperCase())}</span> <b>${esc(str(i.issue as string))}</b><p>${esc(str(i.evidence as string))}</p></li>`;
  });

  const hardHtml = sectionOf("Hard-rule violations", crosscutArr("hardRuleViolations"), (h) => {
    return `<li class="sys sev-${sevClass(str(h.severity as string))}"><span class="sev ${sevClass(str(h.severity as string))}">${esc(str(h.severity as string, "?").toUpperCase())}</span> <b>${esc(str(h.rule as string))}</b>${h.file ? `<p class="muted"><code>${esc(str(h.file as string))}</code></p>` : ""}<p>${esc(str(h.evidence as string))}</p></li>`;
  });

  const flow = crosscutArr("dataFlow");
  const flowHtml = flow.length
    ? `<div class="sys-section"><h3>Data flow status</h3><ul class="sys-list">${flow
        .map(
          (f) =>
            `<li class="sys"><b>${esc(str(f.flow as string))}</b> <span class="flowstatus">${esc(str(f.status as string))}</span><p>${esc(str(f.evidence as string))}</p></li>`,
        )
        .join("")}</ul></div>`
    : "";

  return `
  <section class="bucket systemic" id="bucket-systemic" data-bucket-section="systemic">
    <div class="bucket-head">
      <h2>Systemic issues</h2>
      <p class="bucket-intro">Cross-cutting findings + evidence from <code>_crosscut.json</code> (not a plan).</p>
    </div>
    <div class="sys-wrap">
      ${themeHtml}
      ${gapsHtml}
      ${dsHtml}
      ${consHtml}
      ${microHtml}
      ${iaHtml}
      ${hardHtml}
      ${flowHtml}
    </div>
  </section>`;
}

function buildHtml(): string {
  const total = pages.length;
  const byRole: Record<string, number> = {};
  for (const p of pages) byRole[p.role] = (byRole[p.role] ?? 0) + 1;
  const fullAnalysis = pages.filter((p) => p.hasAnalysis).length;
  const v2Count = pages.filter((p) => p.analysisSource === "v2").length;

  // categories present (for filter dropdown)
  const cats = [...new Set(pages.map((p) => p.category || "uncategorized"))].sort();

  const designSystemSection = designSystemHtml();
  const featureFlowsSection = featureFlowsHtml();
  const systemicSection = systemicHtml();
  const playerSection = sectionHtml("player", "Player", "Surfaces a player primarily uses.", grouped.player);
  const coachSection = sectionHtml("coach", "Coach", "Surfaces a coach primarily uses.", grouped.coach);
  const sharedSection = sectionHtml(
    "shared",
    "Shared — Team",
    "Routes both roles render (listed once).",
    grouped.shared as unknown as Page[],
    (p) => (p as SharedPage).folders,
  );
  const publicSection = sectionHtml("public", "Public & Auth", "Marketing, auth, onboarding, legal, join.", grouped.public);

  const css = `
:root{
  --cream:#FFFEFA; --paper:#fbfaf6; --ink:#1c1917; --muted:#78716c; --line:#e7e3da;
  --green:#16A34A; --green-d:#15803d; --amber:#F59E0B; --gray:#9ca3af; --red:#DC2626;
  --crit:#DC2626; --high:#EA580C; --med:#D97706; --low:#9ca3af;
  --shadow:0 1px 2px rgba(28,25,23,.04),0 8px 24px rgba(28,25,23,.06);
  --radius:18px;
}
*{box-sizing:border-box}
html,body{margin:0}
body{
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Helvetica,Arial,sans-serif;
  background:var(--cream); color:var(--ink); line-height:1.5; -webkit-font-smoothing:antialiased;
}
a{color:var(--green-d);text-decoration:none}
a:hover{text-decoration:underline}
code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.82em;background:#f2efe8;padding:.08em .4em;border-radius:6px}
.topbar{
  position:sticky;top:0;z-index:50;background:rgba(255,254,250,.9);backdrop-filter:blur(14px);
  border-bottom:1px solid var(--line);padding:18px 28px 14px;
}
.topbar h1{margin:0 0 2px;font-size:22px;letter-spacing:-.02em}
.topbar .sub{color:var(--muted);font-size:13px;margin:0 0 12px}
.stats{display:flex;gap:18px;flex-wrap:wrap;font-size:12.5px;color:var(--muted);margin-bottom:14px}
.stats b{color:var(--ink)}
.controls{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.tabs{display:flex;gap:6px;background:#f2efe8;padding:4px;border-radius:12px}
.tab{border:0;background:transparent;padding:7px 14px;border-radius:9px;font-size:13px;font-weight:600;color:var(--muted);cursor:pointer}
.tab.active{background:#fff;color:var(--ink);box-shadow:var(--shadow)}
select,input[type=search]{
  font:inherit;font-size:13px;padding:8px 12px;border:1px solid var(--line);border-radius:10px;background:#fff;color:var(--ink);
}
input[type=search]{min-width:240px}
.chk{display:flex;align-items:center;gap:6px;font-size:12.5px;color:var(--muted);cursor:pointer;user-select:none}
.wrap{max-width:1320px;margin:0 auto;padding:26px 28px 80px}
.bucket{margin-bottom:46px}
.bucket-head{margin:0 0 16px}
.bucket-head h2{margin:0;font-size:18px;letter-spacing:-.01em}
.bucket-intro{margin:2px 0 0;color:var(--muted);font-size:13px}
.count{display:inline-block;margin-left:8px;background:#f2efe8;border-radius:20px;padding:1px 9px;font-size:11.5px;color:var(--muted)}
.cards{display:grid;grid-template-columns:1fr;gap:18px}
.card{
  background:#fff;border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow);
  display:grid;grid-template-columns:320px 1fr;overflow:hidden;
}
.card.has-bugs{border-color:#f3cfae}
.card-media{background:var(--paper);border-right:1px solid var(--line);padding:14px;display:flex;flex-direction:column;gap:10px;align-items:center;justify-content:flex-start;position:sticky;top:120px;align-self:start;max-height:calc(100vh - 140px);overflow:auto}
.thumb{margin:0;width:100%}
.thumb img{width:100%;height:auto;max-height:520px;object-fit:cover;object-position:top;border-radius:10px;border:1px solid var(--line);background:#fff;display:block}
.thumb img:hover{box-shadow:var(--shadow)}
.thumb figcaption{font-size:11px;color:var(--muted);text-align:center;margin-top:4px;text-transform:capitalize}
.card-body{padding:18px 20px;min-width:0}
.titleline{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.titleline h3{margin:0;font-size:16px;letter-spacing:-.01em}
.route{display:inline-block;margin-top:6px;font-size:12px}
.sharednote{margin:6px 0 0;font-size:12px;color:var(--green-d);font-weight:600}
.badge{font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.03em;padding:2px 8px;border-radius:20px;color:#fff}
.badge.ok{background:var(--green)}
.badge.warn{background:var(--amber)}
.badge.off{background:var(--gray)}
.badge.unk{background:#cbd5e1;color:#334155}
.badge.role{background:#eceae3;color:var(--muted)}
.badge.pending{background:#fef3c7;color:#92400e}
.badge.v2{background:#dcfce7;color:#166534}
.badge.v1{background:#e0e7ff;color:#3730a3}
.block{margin-top:14px}
.block h4{margin:0 0 6px;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted)}
.block p{margin:0;font-size:13.5px}
.block ul{margin:0;padding-left:18px;font-size:13px}
.block ul li{margin:2px 0}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:18px}
.dataflow .flow-row{display:grid;grid-template-columns:1fr auto 1fr;gap:12px;align-items:start;margin-top:2px}
.flow-col .flow-lbl{font-size:10px;letter-spacing:.06em;color:#78716c;margin-bottom:5px;text-transform:uppercase}
.flow-arrow{align-self:center;color:#a8a29e;white-space:nowrap;font-size:12px}
.flow-page{display:inline-block;padding:2px 9px;border:1px dashed #cbd5d1;border-radius:8px;font-size:11px;color:#44403c;background:#fafaf9}
.fchip{display:inline-block;font:11px/1.4 ui-monospace,Menlo,monospace;padding:2px 7px;border-radius:6px;margin:2px 3px 2px 0}
.fchip.r{background:#eff6ff;color:#1e40af;border:1px solid #dbeafe}
.fchip.w{background:#ecfdf5;color:#065f46;border:1px solid #d1fae5}
.fchip.rpc{background:#fef3c7;color:#92400e;border:1px solid #fde68a}
.flow-rpc{margin-top:8px;font-size:11px;color:#78716c}
.conns code{font-size:11.5px}
.conns .why{color:var(--muted);font-size:12px}
.muted{color:var(--muted)}
.why{color:var(--muted)}
.critique p{background:#fffaf2;border-left:3px solid var(--amber);padding:8px 12px;border-radius:0 8px 8px 0;font-size:13px}
.premium ul li,.consistency ul li{font-size:12.5px;color:#44403c}
.corrections ul li{font-size:12.5px;color:#3730a3}
/* bugs */
.bugs h4{color:var(--ink);font-size:12px}
.bugcount{display:inline-block;margin-left:6px;background:#fee2e2;color:#991b1b;border-radius:20px;padding:0 8px;font-size:11px}
.buglist{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
.bug{border:1px solid var(--line);border-radius:10px;padding:10px 12px;background:#fffdfb}
.bug.crit{border-left:4px solid var(--crit);background:#fef2f2}
.bug.high{border-left:4px solid var(--high);background:#fff7ed}
.bug.med{border-left:4px solid var(--med);background:#fffbeb}
.bug.low{border-left:4px solid var(--low);background:#fafaf9}
.bug-head{display:flex;align-items:center;gap:8px;margin-bottom:4px}
.sev{font-size:10px;font-weight:800;letter-spacing:.04em;padding:1px 7px;border-radius:6px;color:#fff}
.sev.crit{background:var(--crit)}.sev.high{background:var(--high)}.sev.med{background:var(--med)}.sev.low{background:var(--low)}
.bug-type{font-size:11px;font-weight:700;color:var(--muted);background:#f2efe8;border-radius:6px;padding:1px 7px;font-family:ui-monospace,Menlo,monospace}
.bug-desc{margin:0 0 4px;font-size:13px}
.bug-ev{font-size:11.5px;color:var(--muted);margin-top:3px}
.bug-ev .lbl{font-weight:700;text-transform:uppercase;font-size:9.5px;letter-spacing:.04em;margin-right:4px}
.bug-ev code{font-size:11px;background:#f4f1ea;word-break:break-word}
.bug-snip{margin:6px 0 0;background:#1c1917;color:#e7e5e4;border-radius:8px;padding:8px 10px;overflow:auto}
.bug-snip code{background:transparent;color:inherit;font-size:11px;white-space:pre-wrap}
/* code embed */
.code-block{border-top:1px dashed var(--line);padding-top:12px}
.code-head{display:flex;align-items:center;justify-content:space-between;gap:10px}
.code-toggle{font:inherit;font-size:12px;font-weight:600;border:1px solid var(--line);background:#fff;color:var(--green-d);border-radius:9px;padding:5px 12px;cursor:pointer}
.code-toggle:hover{background:#f0fdf4;border-color:var(--green)}
.code-files{margin-top:10px;display:flex;flex-direction:column;gap:8px}
.codefile{border:1px solid var(--line);border-radius:10px;background:#fbfaf6;overflow:hidden}
.codefile summary{cursor:pointer;padding:8px 12px;font-size:12px;display:flex;justify-content:space-between;gap:10px;align-items:center;list-style:none}
.codefile summary::-webkit-details-marker{display:none}
.codefile summary:hover{background:#f2efe8}
.codefile .filepath{font-family:ui-monospace,Menlo,monospace;color:var(--ink);word-break:break-all}
.codefile .filemeta{color:var(--muted);font-size:11px;white-space:nowrap}
.codefile.missing{padding:8px 12px;font-size:12px}
pre.code{margin:0;background:#1c1917;color:#e7e5e4;padding:14px 16px;overflow:auto;max-height:560px;font-size:11.5px;line-height:1.55}
pre.code code{background:transparent;color:inherit;font-size:inherit;white-space:pre}
/* systemic */
.systemic .sys-wrap{display:grid;grid-template-columns:1fr;gap:18px}
.sys-section{background:#fff;border:1px solid var(--line);border-radius:14px;box-shadow:var(--shadow);padding:16px 18px}
.sys-section h3{margin:0 0 10px;font-size:14px}
.sys-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px}
.sys{border:1px solid var(--line);border-radius:10px;padding:10px 12px;background:#fcfbf8}
.sys.sev-crit{border-left:4px solid var(--crit)}.sys.sev-high{border-left:4px solid var(--high)}.sys.sev-med{border-left:4px solid var(--med)}.sys.sev-low{border-left:4px solid var(--low)}
.sys b{font-size:13px}
.sys p{margin:4px 0 0;font-size:12.5px;color:#44403c}
.flowstatus{font-size:11px;font-weight:700;color:var(--green-d);background:#f0fdf4;border-radius:6px;padding:1px 7px;margin-left:6px}
.sys-table{width:100%;border-collapse:collapse;font-size:12px}
.sys-table th{text-align:left;color:var(--muted);font-size:10.5px;text-transform:uppercase;letter-spacing:.04em;border-bottom:1px solid var(--line);padding:6px 8px}
.sys-table td{padding:7px 8px;border-bottom:1px solid #f0ece3;vertical-align:top}
.sys-table tr.note-row td{color:var(--muted);font-size:11.5px;padding-top:0}
.comp-d summary{cursor:pointer;color:var(--green-d);font-size:11px}
.comp-d ul{margin:6px 0 0;padding-left:16px}
@media (min-width:1024px){ .systemic .sys-wrap{grid-template-columns:1fr 1fr} .systemic .sys-section.wide{grid-column:1/-1} }
/* plan-priority badge in titleline */
.badge.plan-prio{color:#fff}
.badge.plan-prio.p0{background:var(--crit)}
.badge.plan-prio.p1{background:var(--high)}
.badge.plan-prio.p2{background:var(--med)}
.badge.plan-prio.px{background:#9ca3af}
/* 🎨 redesign plan panel — green-accented, distinct from the atlas chrome */
.block.redesign{margin-top:16px;border:1px solid #bbf7d0;border-left:4px solid var(--green);border-radius:14px;background:linear-gradient(180deg,#f3fdf6,#fbfffc);padding:14px 16px 4px;box-shadow:0 1px 2px rgba(22,163,74,.05)}
.rd-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:8px}
.rd-head h4{margin:0;font-size:13px;color:var(--green-d);text-transform:none;letter-spacing:0;font-weight:800}
.rd-badges{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.rd-prio{font-size:11px;font-weight:800;color:#fff;border-radius:7px;padding:2px 9px;letter-spacing:.02em}
.rd-prio.p0{background:var(--crit)}.rd-prio.p1{background:var(--high)}.rd-prio.p2{background:var(--med)}.rd-prio.px{background:#9ca3af}
.rd-eff{font-size:10.5px;font-weight:700;color:var(--green-d);background:#dcfce7;border-radius:7px;padding:2px 8px;text-transform:uppercase;letter-spacing:.03em}
.rd-rtype{font-size:10.5px;font-weight:600;color:#3f6212;background:#ecfccb;border-radius:7px;padding:2px 8px}
.rd-body{display:flex;flex-direction:column;gap:10px}
.rd-sub,.rd-preserve{font-size:13px;color:#27331f;line-height:1.5}
.rd-lbl{display:block;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--green-d);margin-bottom:3px}
.rd-intent{display:block;background:#ecfdf3;border-radius:8px;padding:8px 11px;border:1px solid #d1fadf}
.rd-ul{margin:2px 0 0;padding-left:18px}
.rd-ul li{margin:2px 0;font-size:12.5px}
/* layout/IA verbs */
.rd-ia{display:flex;flex-direction:column;gap:6px;margin-top:2px}
.rd-ia-row{display:grid;grid-template-columns:84px 1fr;gap:8px;align-items:start}
.rd-verb{display:inline-block;font-size:9.5px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;border-radius:6px;padding:2px 7px;color:#fff;text-align:center;align-self:start}
.rd-verb.v-promote{background:var(--green)}.rd-verb.v-demote{background:#a16207}.rd-verb.v-merge{background:#2563eb}.rd-verb.v-collapse{background:#7c3aed}.rd-verb.v-remove{background:var(--red)}
.rd-ia-row .rd-ul{margin:0;padding-left:16px}
/* primitives + chips */
.rd-chip{display:inline-block;font:11.5px/1.4 ui-monospace,Menlo,monospace;background:#fff;border:1px solid #bbf7d0;color:#166534;border-radius:7px;padding:2px 8px;margin:2px 4px 2px 0}
/* components to rebuild */
.rd-complist{list-style:none;margin:4px 0 0;padding:0;display:flex;flex-direction:column;gap:7px}
.rd-comp{border:1px solid #e3eee5;border-radius:9px;background:#fff;padding:7px 10px}
.rd-comp-name{font-weight:700;font-size:12.5px;margin-right:6px}
.rd-act{display:inline-block;font-size:9.5px;font-weight:800;text-transform:uppercase;letter-spacing:.03em;border-radius:6px;padding:1px 7px;vertical-align:middle}
.rd-act.act-rebuild{background:#fee2e2;color:#991b1b}
.rd-act.act-reskin{background:#dbeafe;color:#1e40af}
.rd-act.act-reuse{background:#dcfce7;color:#166534}
.rd-act.act-new{background:#ede9fe;color:#5b21b6}
.rd-act.act-remove{background:#f3f4f6;color:#374151}
.rd-act.act-other{background:#f3f4f6;color:#374151}
.rd-comp-note{font-size:12px;color:#52635a;margin-top:3px}
/* preserve — locked, distinct amber-on-green */
.rd-preserve{border:1px dashed #f0b46b;border-radius:10px;background:#fffaf0;padding:9px 12px}
.rd-preserve .rd-lbl{color:#b45309}
.rd-preserve .rd-ul li{color:#7c4a03}
.rd-accept .rd-ul li{font-weight:500}
/* design-system callout */
.ds-callout{background:linear-gradient(180deg,#f6fdf8,#fffefa);border:1px solid #cdeed7;border-radius:18px;padding:22px 24px;box-shadow:var(--shadow)}
.ds-callout .bucket-head{margin-bottom:8px}
.ds-name{font-size:13px;font-weight:600;color:var(--green-d);margin-left:6px}
.ds-northstar{margin:4px 0 2px;font-size:14px;color:#1f2a1b;max-width:80ch}
.ds-feel{margin:0 0 14px;font-size:13px;color:var(--green-d);font-style:italic}
.ds-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
.ds-card{background:#fff;border:1px solid var(--line);border-radius:14px;padding:14px 16px}
.ds-card.ds-prims{grid-column:1/-1}
.ds-card h3{margin:0 0 8px;font-size:13px;color:var(--ink);display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.ds-replace{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#92400e;background:#fef3c7;border-radius:6px;padding:1px 7px}
.ds-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:7px}
.ds-list li{font-size:13px}
.ds-role{display:inline-block;font-size:9.5px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:var(--green-d);background:#dcfce7;border-radius:6px;padding:1px 7px;margin-right:6px}
.ds-why{font-size:12px;color:var(--muted);margin-top:2px}
.ds-model{margin:0 0 8px;font-size:12.5px;color:#27331f}
.ds-retire{margin:8px 0 0;font-size:11.5px;color:#92400e}
.ds-swatches{display:flex;flex-direction:column;gap:6px}
.ds-sw{display:flex;align-items:center;gap:7px;font-size:12px;color:#27331f}
.ds-sw .sw{width:16px;height:16px;border-radius:5px;display:inline-block}
.ds-tokens{margin-top:10px;display:flex;flex-wrap:wrap;gap:5px;align-items:center}
.ds-tok-lbl{font-size:9.5px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);margin-right:4px;width:100%}
.ds-chip{display:inline-block;font-size:11px;background:#f2efe8;border-radius:6px;padding:2px 7px;color:#44403c}
.ds-chip b{color:var(--ink)}
.ds-chips{display:flex;flex-wrap:wrap;gap:5px}
/* feature flows */
.featureflows .ff-wrap{display:flex;flex-direction:column;gap:18px}
.ff-cluster{background:#fff;border:1px solid var(--line);border-radius:14px;box-shadow:var(--shadow);padding:16px 18px}
.ff-cluster-h{margin:0 0 10px;font-size:13px;text-transform:uppercase;letter-spacing:.05em;color:var(--green-d)}
.ff-feature{border-top:1px dashed var(--line);padding-top:12px;margin-top:12px}
.ff-feature:first-of-type{border-top:0;padding-top:0;margin-top:0}
.ff-title{margin:0 0 8px;font-size:15px;letter-spacing:-.01em;color:var(--ink)}
.ff-lbl{display:block;font-size:9.5px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);margin-bottom:3px}
.ff-pages{margin-bottom:10px;font-size:12px}
.ff-pages code{font-size:11px}
.ff-arrow{color:#a8a29e;margin:0 5px}
.ff-journey{margin-bottom:9px;border-radius:10px;padding:9px 12px}
.ff-journey p{margin:0;font-size:13px;color:#33302c}
.ff-coach{background:#f0f6ff;border:1px solid #dbe8fb}
.ff-coach .ff-lbl{color:#1e40af}
.ff-player{background:#f0fdf4;border:1px solid #d4f3dd}
.ff-player .ff-lbl{color:var(--green-d)}
.ff-bottlenecks{margin:10px 0;background:#fffaf2;border:1px solid #f3e3c8;border-radius:10px;padding:9px 12px}
.ff-bottlenecks .ff-lbl{color:#b45309}
.ff-bl{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:7px}
.ff-bl li{font-size:12.5px;color:#33302c}
.ff-bl li b{color:var(--ink)}
.ff-ev{font-size:11px;color:var(--muted);margin-top:2px}
.ff-ev .lbl{font-weight:700;text-transform:uppercase;font-size:9px;letter-spacing:.04em;margin-right:4px}
.ff-ev code{font-size:10.5px;background:#f4f1ea;word-break:break-word}
.ff-opp{margin-top:9px}
.ff-opp ul{margin:2px 0 0;padding-left:18px;font-size:12.5px}
.ff-opp ul li{margin:2px 0}
.ff-org .ff-lbl{color:#2563eb}
.ff-opt .ff-lbl{color:var(--green-d)}
@media (max-width:1024px){ .ds-grid{grid-template-columns:1fr} }
@media (max-width:860px){
  .card{grid-template-columns:1fr}
  .card-media{border-right:0;border-bottom:1px solid var(--line);flex-direction:row;flex-wrap:wrap;position:static;max-height:none}
  .thumb{width:auto;flex:1;min-width:160px}
  .grid2{grid-template-columns:1fr}
  .systemic .sys-wrap{grid-template-columns:1fr}
  .rd-ia-row{grid-template-columns:1fr}
}
`;

  const js = `
(function(){
  var state={bucket:"all",category:"all",q:"",hasbugs:false,hasplan:false,sev:"all",prio:"all"};
  var tabs=document.querySelectorAll(".tab");
  var catSel=document.getElementById("catFilter");
  var sevSel=document.getElementById("sevFilter");
  var prioSel=document.getElementById("prioFilter");
  var bugChk=document.getElementById("bugChk");
  var planChk=document.getElementById("planChk");
  var search=document.getElementById("searchBox");
  var SEV=["critical","high","medium","low"];
  // Panels that are not card grids (shown only on All or their own tab; ignored by card-only filters)
  var PANELS={designsystem:1,featureflows:1,systemic:1};
  function sevAtLeast(cardSev, want){
    if(want==="all") return true;
    var ci=SEV.indexOf(cardSev); var wi=SEV.indexOf(want);
    if(ci<0) return false;
    return ci<=wi; // critical(0) passes any threshold
  }
  function cardFiltersActive(){
    return state.category!=="all"||state.q||state.hasbugs||state.hasplan||state.sev!=="all"||state.prio!=="all";
  }
  function apply(){
    var sections=document.querySelectorAll("[data-bucket-section]");
    sections.forEach(function(sec){
      var bid=sec.getAttribute("data-bucket-section");
      if(PANELS[bid]){
        // non-card panel: show on All (when no card-only filters active) or its own tab
        var show=(state.bucket===bid)||(state.bucket==="all"&&!cardFiltersActive());
        sec.style.display=show?"":"none";
        return;
      }
      var sectionVisible=(state.bucket==="all"||state.bucket===bid);
      var anyCard=false;
      sec.querySelectorAll(".card").forEach(function(card){
        var okCat=(state.category==="all"||card.getAttribute("data-category")===state.category);
        var okQ=(!state.q||card.getAttribute("data-search").indexOf(state.q)>-1);
        var okBug=(!state.hasbugs||card.getAttribute("data-hasbugs")==="1");
        var okPlan=(!state.hasplan||card.getAttribute("data-hasplan")==="1");
        var okPrio=(state.prio==="all"||card.getAttribute("data-priority")===state.prio);
        var okSev=(state.sev==="all"||(card.getAttribute("data-hasbugs")==="1"&&sevAtLeast(card.getAttribute("data-maxsev"),state.sev)));
        var show=sectionVisible&&okCat&&okQ&&okBug&&okPlan&&okPrio&&okSev;
        card.style.display=show?"":"none";
        if(show)anyCard=true;
      });
      sec.style.display=(sectionVisible&&anyCard)?"":"none";
    });
  }
  tabs.forEach(function(t){t.addEventListener("click",function(){
    tabs.forEach(function(x){x.classList.remove("active")});
    t.classList.add("active");
    state.bucket=t.getAttribute("data-tab");
    apply();
  });});
  catSel.addEventListener("change",function(){state.category=catSel.value;apply();});
  sevSel.addEventListener("change",function(){state.sev=sevSel.value;apply();});
  prioSel.addEventListener("change",function(){state.prio=prioSel.value;apply();});
  bugChk.addEventListener("change",function(){state.hasbugs=bugChk.checked;apply();});
  planChk.addEventListener("change",function(){state.hasplan=planChk.checked;apply();});
  search.addEventListener("input",function(){state.q=search.value.trim().toLowerCase();apply();});
  // per-card code toggles
  document.querySelectorAll("[data-code-toggle]").forEach(function(btn){
    btn.addEventListener("click",function(){
      var files=btn.closest("[data-code-block]").querySelector(".code-files");
      var hidden=files.hasAttribute("hidden");
      if(hidden){files.removeAttribute("hidden");btn.textContent="Hide code";}
      else{files.setAttribute("hidden","");btn.textContent="Show code";}
    });
  });
  apply();
})();
`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>GolfHelm Route Atlas</title>
<style>${css}</style>
</head>
<body>
  <div class="topbar">
    <h1>GolfHelm Route Atlas</h1>
    <p class="sub">Redesign review surface — screenshot + analysis + verified bugs + 🎨 redesign plan + embedded code for every captured route.</p>
    <div class="stats">
      <span><b>${total}</b> pages</span>
      <span><b>${byRole.player ?? 0}</b> player · <b>${byRole.coach ?? 0}</b> coach · <b>${byRole.public ?? 0}</b> public</span>
      <span><b>${grouped.shared.length}</b> shared (de-duped)</span>
      <span><b>${fullAnalysis}</b> analyzed · <b>${v2Count}</b> verified (v2)</span>
      <span><b>${allShownBugs.length}</b> verified bugs (${Object.entries(bugsBySeverity)
        .sort((a, b) => (SEV_ORDER[a[0]] ?? 9) - (SEV_ORDER[b[0]] ?? 9))
        .map(([s, n]) => `${n} ${s}`)
        .join(" · ")})</span>
      <span>🎨 <b>${catalogWithPlan}</b> redesign plans (${Object.entries(planByPriority)
        .sort((a, b) => (PRIO_ORDER[a[0]] ?? 9) - (PRIO_ORDER[b[0]] ?? 9))
        .map(([s, n]) => `${n} ${s}`)
        .join(" · ")})</span>
    </div>
    <div class="controls">
      <div class="tabs">
        <button class="tab active" data-tab="all">All</button>
        <button class="tab" data-tab="designsystem">🎨 Design system</button>
        <button class="tab" data-tab="featureflows">Feature flows</button>
        <button class="tab" data-tab="player">Player</button>
        <button class="tab" data-tab="coach">Coach</button>
        <button class="tab" data-tab="shared">Shared</button>
        <button class="tab" data-tab="public">Public</button>
        <button class="tab" data-tab="systemic">Systemic</button>
      </div>
      <select id="catFilter" aria-label="Filter by cluster">
        <option value="all">All clusters</option>
        ${cats.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join("")}
      </select>
      <select id="prioFilter" aria-label="Filter by redesign priority">
        <option value="all">Any priority</option>
        <option value="P0">🔴 P0 only</option>
        <option value="P1">🟠 P1 only</option>
        <option value="P2">🟡 P2 only</option>
      </select>
      <select id="sevFilter" aria-label="Filter by bug severity">
        <option value="all">Any severity</option>
        <option value="critical">Critical+</option>
        <option value="high">High+</option>
        <option value="medium">Medium+</option>
        <option value="low">Low+</option>
      </select>
      <label class="chk"><input type="checkbox" id="bugChk" /> Has bugs only</label>
      <label class="chk"><input type="checkbox" id="planChk" /> Has plan only</label>
      <input id="searchBox" type="search" placeholder="Search label / route / purpose / file…" aria-label="Search" />
    </div>
  </div>
  <main class="wrap">
    ${designSystemSection}
    ${featureFlowsSection}
    ${systemicSection}
    ${playerSection}
    ${coachSection}
    ${sharedSection}
    ${publicSection}
  </main>
  <script>${js}</script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Write outputs + summary
// ---------------------------------------------------------------------------
const md = buildMarkdown();
const html = buildHtml();
writeFileSync(OUT_MD, md, "utf8");
writeFileSync(OUT_HTML, html, "utf8");

const byRoleSummary: Record<string, number> = {};
for (const p of pages) byRoleSummary[p.role] = (byRoleSummary[p.role] ?? 0) + 1;
const full = pages.filter((p) => p.hasAnalysis).length;
const v2Final = pages.filter((p) => p.analysisSource === "v2").length;
const v1Final = pages.filter((p) => p.analysisSource === "v1").length;

// count unique embedded files actually read OK
let uniqueEmbedded = 0;
for (const ef of fileCache.values()) if (ef.code != null) uniqueEmbedded++;
for (const ef of fileCache.values()) if (ef.code == null) sourceFilesMissing++;

function kb(path: string): string {
  try {
    return (statSync(path).size / 1024).toFixed(1) + " KB";
  } catch {
    return "?";
  }
}

console.log("─".repeat(64));
console.log("GolfHelm Route Atlas — generated");
console.log("─".repeat(64));
console.log(`ROUTE-ATLAS.md : ${OUT_MD}  (${kb(OUT_MD)})`);
console.log(`atlas.html     : ${OUT_HTML}  (${kb(OUT_HTML)})`);
console.log(`Total pages    : ${pages.length}`);
console.log(`By role        : ${Object.entries(byRoleSummary).sort().map(([r, n]) => `${r}=${n}`).join(", ")}`);
console.log(
  `By bucket      : player=${grouped.player.length}, coach=${grouped.coach.length}, shared=${grouped.shared.length} (de-duped), public=${grouped.public.length}`,
);
console.log(`Analysis       : ${full} full (${v2Final} v2 / ${v1Final} v1) / ${pages.length - full} pending`);
console.log(`Clusters used  : v2=${v2ClustersUsed}, v1-fallback=${v1ClustersUsed}`);
console.log(`Verified bugs  : ${allShownBugs.length} by severity ${JSON.stringify(bugsBySeverity)}`);
console.log(`               : by type ${JSON.stringify(bugsByType)}`);
console.log(`Code embedded  : ${sourceFilesEmbedded} sourceFile blocks (HTML) · ${uniqueEmbedded} unique files read · ${sourceFilesMissing} missing/skipped`);
console.log("─".repeat(64));
console.log(`Redesign plans : ${catalogWithPlan}/${pages.length} catalog pages have a plan (${pages.length - catalogWithPlan} without)`);
console.log(`  by priority  : ${Object.entries(planByPriority).sort((a, b) => (PRIO_ORDER[a[0]] ?? 9) - (PRIO_ORDER[b[0]] ?? 9)).map(([s, n]) => `${s}=${n}`).join(", ") || "none"}`);
console.log(`  rem. files   : ${remediationFilesLoaded} page-plan files · ${remediationEntries} plan entries · folder-index=${remediationByFolder.size}`);
console.log(`Feature flows  : ${featureFlows.length} features across ${flowFilesLoaded} _flow files`);
console.log(`Design system  : ${Object.keys(designSystem).length ? `loaded "${dsStr(["name"], "?")}" v${dsStr(["version"], "?")}` : "MISSING"}`);
const pagesMissingPlan = pages.filter((p) => !p.hasRemediation);
if (pagesMissingPlan.length) {
  console.log(`Pages w/o plan : ${pagesMissingPlan.length} —`);
  const byCat: Record<string, number> = {};
  for (const p of pagesMissingPlan) byCat[p.category || "?"] = (byCat[p.category || "?"] ?? 0) + 1;
  console.log(`               : by cluster ${Object.entries(byCat).sort().map(([c, n]) => `${c}=${n}`).join(", ")}`);
  for (const p of pagesMissingPlan) console.log(`               · ${p.role} ${p.route || p.folder}`);
}
