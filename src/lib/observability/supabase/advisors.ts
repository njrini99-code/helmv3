import 'server-only';

/**
 * Supabase Security/Performance Advisors — brief §30.
 *
 * Read-only Management API path, Bearer `SUPABASE_ACCESS_TOKEN`:
 *   GET /v1/projects/{ref}/advisors/security
 *   GET /v1/projects/{ref}/advisors/performance
 * confirmed via `https://supabase.com/docs/reference/api/v1-get-security-advisors`
 * (fetched 2026-09-03) — a documented endpoint exists, so this does NOT fall
 * back to the splinter-SQL path the task brief allowed for if none did. Both
 * endpoints share the `{ lints: [...] }` response shape; each lint carries
 * `name`, `title`, `level`, `categories`, `description`, `metadata` (schema/
 * name/entity/type — object identifiers, never row data). That page marks
 * the endpoint "deprecated and experimental, subject to future changes" —
 * recorded here, not smoothed over: this integration degrades to
 * `sourceStatus: 'unreachable'` on any non-2xx response rather than
 * assuming a particular error shape survives a future API change.
 *
 * NO PERSISTENCE IN THIS PHASE. This module and its reader
 * (`src/lib/admin/database/advisors.ts`) re-fetch and re-normalize on every
 * call (behind a 10-minute in-memory cache); there is no
 * `helm_debug.db_advisor_findings` table. A later phase can add one — this
 * phase only needed live, on-demand normalization, and the brief's own
 * phase list (§78) does not name advisor persistence as part of this
 * program's Phase 2.
 *
 * `featureMapping` IS ALWAYS NULL IN THIS PHASE. The one existing
 * "knowledge registry glob" (`memory/registry.yml`'s `code.db` field) holds
 * MIGRATION FILE globs (`supabase/migrations/*golf_round*.sql`), not table
 * names — matching an advisor's flagged object against those would need
 * fuzzy substring matching against glob fragments, which is a real feature
 * this phase chose not to build. More concretely: the `yaml` package that
 * would parse the registry is a devDependency only (`package.json`), not a
 * production dependency — importing it from a server module that runs in
 * the Bridge would risk a production runtime failure the first time this
 * path is hit. Neither obstacle is unsolvable, but "cheaply available" from
 * the task brief is explicitly the bar, and this clears neither cheaply nor
 * safely today.
 */

export type AdvisorType = 'security' | 'performance';
export type AdvisorSourceStatus = 'ok' | 'unconfigured' | 'unreachable';

export interface AdvisorFinding {
  advisorType: AdvisorType;
  name: string;
  level: string;
  /** `schema.name`, or a bare `entity`, when the API supplies either — never
   *  row data, only an object identifier. */
  object: string | null;
  /** Always `null` in this phase — see module header. */
  featureMapping: string | null;
  /** This run's timestamp, not the advisor's own detection time (the API
   *  does not expose one) — brief's literal spec: "firstSeen (this run)". */
  firstSeen: string;
  status: 'open';
}

export interface RawAdvisorLint {
  name?: string;
  title?: string;
  level?: string;
  metadata?: {
    schema?: string;
    name?: string;
    entity?: string;
    type?: string;
  };
}

function deriveAdvisorObject(metadata: RawAdvisorLint['metadata']): string | null {
  if (!metadata) return null;
  if (metadata.schema && metadata.name) return `${metadata.schema}.${metadata.name}`;
  if (metadata.entity) return metadata.entity;
  if (metadata.name) return metadata.name;
  return null;
}

function advisorDedupeKey(f: Pick<AdvisorFinding, 'advisorType' | 'name' | 'object'>): string {
  return `${f.advisorType}|${f.name}|${f.object ?? ''}`;
}

/** Pure: raw lints -> normalized findings, no network. Exported for tests. */
export function normalizeAdvisorLints(advisorType: AdvisorType, lints: readonly RawAdvisorLint[], firstSeenIso: string): AdvisorFinding[] {
  return lints.map((lint) => ({
    advisorType,
    name: lint.name ?? lint.title ?? 'unknown',
    level: lint.level ?? 'UNKNOWN',
    object: deriveAdvisorObject(lint.metadata),
    featureMapping: null,
    firstSeen: firstSeenIso,
    status: 'open' as const,
  }));
}

/** Pure: dedupe by (advisorType, name, object) — first occurrence wins,
 *  matching the brief's "no duplicate incidents per run". Exported for
 *  tests. */
export function dedupeAdvisorFindings(findings: readonly AdvisorFinding[]): AdvisorFinding[] {
  const seen = new Set<string>();
  const out: AdvisorFinding[] = [];
  for (const finding of findings) {
    const key = advisorDedupeKey(finding);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(finding);
  }
  return out;
}

function resolveProjectRef(): string | null {
  if (process.env.SUPABASE_PROJECT_REF) return process.env.SUPABASE_PROJECT_REF;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return null;
  try {
    return new URL(url).hostname.split('.')[0] || null;
  } catch {
    return null;
  }
}

async function fetchAdvisorType(token: string, projectRef: string, advisorType: AdvisorType): Promise<RawAdvisorLint[]> {
  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/advisors/${advisorType}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`advisors/${advisorType} HTTP ${res.status}`);
  const body = (await res.json()) as { lints?: unknown };
  return Array.isArray(body?.lints) ? (body.lints as RawAdvisorLint[]) : [];
}

export interface AdvisorFetchOutcome {
  findings: AdvisorFinding[];
  sourceStatus: AdvisorSourceStatus;
}

const CACHE_TTL_MS = 10 * 60_000;
let cached: AdvisorFetchOutcome | null = null;
let cachedAtMs = 0;

export function __resetSupabaseAdvisorsCacheForTests(): void {
  cached = null;
  cachedAtMs = 0;
}

export async function fetchSupabaseAdvisors(nowMs: number = Date.now()): Promise<AdvisorFetchOutcome> {
  if (cached && nowMs - cachedAtMs < CACHE_TTL_MS) {
    return cached;
  }

  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const projectRef = resolveProjectRef();

  if (!token || !projectRef) {
    const result: AdvisorFetchOutcome = { findings: [], sourceStatus: 'unconfigured' };
    cached = result;
    cachedAtMs = nowMs;
    return result;
  }

  try {
    const [security, performance] = await Promise.all([
      fetchAdvisorType(token, projectRef, 'security'),
      fetchAdvisorType(token, projectRef, 'performance'),
    ]);
    const nowIso = new Date(nowMs).toISOString();
    const findings = dedupeAdvisorFindings([
      ...normalizeAdvisorLints('security', security, nowIso),
      ...normalizeAdvisorLints('performance', performance, nowIso),
    ]);
    const result: AdvisorFetchOutcome = { findings, sourceStatus: 'ok' };
    cached = result;
    cachedAtMs = nowMs;
    return result;
  } catch {
    const result: AdvisorFetchOutcome = { findings: [], sourceStatus: 'unreachable' };
    cached = result;
    cachedAtMs = nowMs;
    return result;
  }
}
