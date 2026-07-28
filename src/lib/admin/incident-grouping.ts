/**
 * Smart incident grouping for the admin dashboard.
 *
 * Buckets a flat list of raw error / event rows into deduped groups keyed by a
 * stable signature derived from (severity, errorCode, route, messagePrefix).
 * Used by both the tracer feed (admin-tracer-data.ts) and the System tab
 * incident feed (admin-data.ts).
 *
 * Signature derivation must be deterministic: identical inputs MUST produce
 * the same hash. We use a 32-bit FNV1a fold over a normalised key string and
 * render it as zero-padded hex. This is plenty unique for the small per-page
 * cardinality we deal with (hundreds, not millions) and avoids pulling in
 * node:crypto so the helper stays portable across runtimes.
 */

export type IncidentSeverity = 'critical' | 'error' | 'warning' | 'info';

export interface RawIncident {
  id: string;
  severity: IncidentSeverity;
  title: string;
  message: string;
  route: string | null;
  errorCode: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  resolved: boolean;
}

export interface GroupedIncident {
  signature: string;
  severity: IncidentSeverity;
  title: string;
  summary: string;
  route: string | null;
  errorCode: string | null;
  occurrences: number;
  openOccurrences: number;
  resolvedOccurrences: number;
  firstSeen: string;
  lastSeen: string;
  sampleIds: string[];
}

const SEVERITY_RANK: Record<IncidentSeverity, number> = {
  critical: 0,
  error: 1,
  warning: 2,
  info: 3,
};

const MESSAGE_PREFIX_LEN = 80;
const MAX_SAMPLE_IDS = 5;

// ---------------------------------------------------------------------------
// Normalisers — also used outside this file when callers want to build keys
// the same way the helper does. Keep them pure + side-effect free.
// ---------------------------------------------------------------------------

function normalizeIncidentMessagePrefix(message: string, length = MESSAGE_PREFIX_LEN): string {
  return message
    .trim()
    // Prefixed opaque provider ids, BEFORE the lowercase fold — these are
    // mixed-case base62, so they are neither a UUID nor long hex and used to
    // survive every rule below. That is how one broken CoachHelm conversation
    // arrived in the Bridge as four separate incidents: each retry echoed a
    // different `toolu_…` id inside "Tool result is missing for tool call …",
    // and the differing id sat inside the hashed 80-character prefix.
    //
    // Anchored on a known separator + a long alphanumeric run so it cannot eat
    // ordinary snake_case words: `engine_no_team_membership` has no run of 16+
    // alphanumerics after an underscore, and stays intact.
    .replace(/\b([a-z]{2,12}[_-])[A-Za-z0-9]{16,}\b/g, '$1:id')
    .toLowerCase()
    // Replace UUIDs / long hex / large ints so siblings of the same root cause collapse.
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, ':uuid')
    .replace(/\b[a-f0-9]{16,}\b/gi, ':id')
    .replace(/\b\d{5,}\b/g, ':id')
    .replace(/\s+/g, ' ')
    .slice(0, length);
}

export function normalizeIncidentRoute(routeOrUrl: string | null): string {
  if (!routeOrUrl) return '';
  const rawPath = (() => {
    try {
      return new URL(routeOrUrl, 'http://localhost').pathname;
    } catch {
      return routeOrUrl.split('?')[0]?.split('#')[0] ?? routeOrUrl;
    }
  })();
  const segments = rawPath
    .split('/')
    .filter(Boolean)
    .map((segment) =>
      /^[0-9]+$/.test(segment)
      || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment)
      || /^[a-f0-9]{16,}$/i.test(segment)
        ? ':id'
        : segment,
    );
  return segments.length > 0 ? `/${segments.join('/')}` : '/';
}

/** FNV1a-32 → 8-char zero-padded hex. Deterministic and runtime-portable. */
function fnv1aHex(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    // 32-bit FNV prime multiply via shifts to keep us in safe-int territory
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export function buildIncidentSignature(input: {
  severity: IncidentSeverity;
  errorCode: string | null;
  route: string | null;
  message: string;
}): string {
  const prefix = normalizeIncidentMessagePrefix(input.message);
  const route = normalizeIncidentRoute(input.route);
  const key = `${input.severity}::${input.errorCode ?? ''}::${route}::${prefix}`;
  return fnv1aHex(key);
}

// ---------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------

interface GroupingBucket {
  signature: string;
  severity: IncidentSeverity;
  route: string | null;
  errorCode: string | null;
  bestTitle: string;
  bestMessage: string;
  occurrences: number;
  openOccurrences: number;
  resolvedOccurrences: number;
  firstSeen: string;
  lastSeen: string;
  sampleIds: string[];
}

function pickHumanTitle(group: GroupingBucket, incoming: RawIncident): string {
  const route = group.route;
  const code = group.errorCode;
  if (route && code) return `${route} · ${code}`;
  if (route) return route;
  if (code) return code;
  // Fall back to the most informative title we've seen — prefer the longest non-trivial one.
  const candidates = [group.bestTitle, incoming.title, incoming.message]
    .filter((s): s is string => Boolean(s) && s.trim().length > 0)
    .map((s) => s.trim());
  if (candidates.length === 0) return 'Untitled incident';
  // Use the message prefix slice (limited to 80) for stability when titles are generic.
  const fallback = candidates.sort((a, b) => b.length - a.length)[0]!;
  return fallback.length > 80 ? `${fallback.slice(0, 80).trimEnd()}…` : fallback;
}

function pickSummary(message: string): string {
  const cleaned = message.trim().replace(/\s+/g, ' ');
  if (cleaned.length <= 220) return cleaned;
  return `${cleaned.slice(0, 217).trimEnd()}…`;
}

export function groupIncidents(rows: RawIncident[]): GroupedIncident[] {
  const buckets = new Map<string, GroupingBucket>();

  for (const row of rows) {
    const route = row.route ? normalizeIncidentRoute(row.route) : null;
    const signature = buildIncidentSignature({
      severity: row.severity,
      errorCode: row.errorCode,
      route: row.route,
      message: row.message,
    });
    const existing = buckets.get(signature);
    if (!existing) {
      buckets.set(signature, {
        signature,
        severity: row.severity,
        route: route || null,
        errorCode: row.errorCode,
        bestTitle: row.title,
        bestMessage: row.message,
        occurrences: 1,
        openOccurrences: row.resolved ? 0 : 1,
        resolvedOccurrences: row.resolved ? 1 : 0,
        firstSeen: row.createdAt,
        lastSeen: row.createdAt,
        sampleIds: [row.id],
      });
      continue;
    }

    existing.occurrences += 1;
    if (row.resolved) existing.resolvedOccurrences += 1;
    else existing.openOccurrences += 1;

    if (row.createdAt < existing.firstSeen) existing.firstSeen = row.createdAt;
    if (row.createdAt >= existing.lastSeen) {
      existing.lastSeen = row.createdAt;
      // Prefer the freshest title/message — most likely to reflect the current
      // wording of the failure.
      if (row.title) existing.bestTitle = row.title;
      if (row.message) existing.bestMessage = row.message;
    }

    if (existing.sampleIds.length < MAX_SAMPLE_IDS) existing.sampleIds.push(row.id);

    // Severity "ratchet" — keep the worst severity we've seen for this signature.
    if (SEVERITY_RANK[row.severity] < SEVERITY_RANK[existing.severity]) {
      existing.severity = row.severity;
    }
  }

  return Array.from(buckets.values())
    .map((bucket): GroupedIncident => {
      const title = pickHumanTitle(bucket, {
        id: bucket.sampleIds[0] ?? '',
        severity: bucket.severity,
        title: bucket.bestTitle,
        message: bucket.bestMessage,
        route: bucket.route,
        errorCode: bucket.errorCode,
        metadata: null,
        createdAt: bucket.lastSeen,
        resolved: bucket.openOccurrences === 0,
      });
      return {
        signature: bucket.signature,
        severity: bucket.severity,
        title,
        summary: pickSummary(bucket.bestMessage || bucket.bestTitle || ''),
        route: bucket.route,
        errorCode: bucket.errorCode,
        occurrences: bucket.occurrences,
        openOccurrences: bucket.openOccurrences,
        resolvedOccurrences: bucket.resolvedOccurrences,
        firstSeen: bucket.firstSeen,
        lastSeen: bucket.lastSeen,
        sampleIds: bucket.sampleIds,
      };
    })
    .sort((a, b) => {
      const lastSeenDiff = new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime();
      if (lastSeenDiff !== 0) return lastSeenDiff;
      return b.occurrences - a.occurrences;
    });
}

// ---------------------------------------------------------------------------
// Inline determinism smoke test.
//
// Runs once per process the first time this module is imported, in dev only.
// Confirms the two contracts the rest of the codebase depends on:
//   1. Same input → same signature (deterministic)
//   2. Two semantically-equal rows with different IDs land in one group
//
// Throwing here is intentional in dev so we catch regressions immediately
// instead of silently shipping a broken signature scheme. In production we
// stay quiet — `if (process.env.NODE_ENV !== 'production')` guards the throw.
// ---------------------------------------------------------------------------

let __smokeTestRan = false;

function runIncidentGroupingSmokeTest(): void {
  if (__smokeTestRan) return;
  __smokeTestRan = true;

  // Two real-shaped round IDs (UUIDs) — the route normaliser collapses both
  // to `/api/golf/rounds/:id`, so the signatures must match.
  const sigA = buildIncidentSignature({
    severity: 'error',
    errorCode: '42P10',
    route: '/api/golf/rounds/11111111-1111-1111-1111-111111111111',
    message: 'ON CONFLICT specification did not match any constraint',
  });
  const sigB = buildIncidentSignature({
    severity: 'error',
    errorCode: '42P10',
    route: '/api/golf/rounds/22222222-2222-2222-2222-222222222222',
    message: 'ON CONFLICT specification did not match any constraint',
  });
  const sigC = buildIncidentSignature({
    severity: 'error',
    errorCode: '42P10',
    route: '/api/golf/rounds/11111111-1111-1111-1111-111111111111',
    message: 'ON CONFLICT specification did not match any constraint', // identical to A
  });

  if (sigA !== sigC) {
    if (process.env.NODE_ENV !== 'production') {
      throw new Error(`[incident-grouping] determinism failed: ${sigA} vs ${sigC}`);
    }
  }
  if (sigA !== sigB) {
    if (process.env.NODE_ENV !== 'production') {
      throw new Error(`[incident-grouping] route normalisation failed: ${sigA} vs ${sigB}`);
    }
  }

  const grouped = groupIncidents([
    { id: '1', severity: 'error', title: 't', message: 'ON CONFLICT specification did not match any constraint', route: '/api/golf/rounds/11111111-1111-1111-1111-111111111111', errorCode: '42P10', metadata: null, createdAt: '2026-04-28T10:00:00Z', resolved: false },
    { id: '2', severity: 'error', title: 't', message: 'ON CONFLICT specification did not match any constraint', route: '/api/golf/rounds/22222222-2222-2222-2222-222222222222', errorCode: '42P10', metadata: null, createdAt: '2026-04-28T10:01:00Z', resolved: false },
    { id: '3', severity: 'error', title: 't', message: 'unrelated different error', route: '/api/something-else', errorCode: null, metadata: null, createdAt: '2026-04-28T10:02:00Z', resolved: false },
  ]);
  if (grouped.length !== 2) {
    if (process.env.NODE_ENV !== 'production') {
      throw new Error(`[incident-grouping] expected 2 groups, got ${grouped.length}`);
    }
  }
}

runIncidentGroupingSmokeTest();
