/**
 * Triage — collection.
 *
 * Extracted from `scripts/run-triage.ts` (the CLI is now a thin wrapper over
 * this module plus `triage-apply.ts`) so a Vercel cron
 * (`src/app/api/cron/selfheal-triage/route.ts`) can run the same collection
 * `npm run triage` does, without importing a `tsx` script into a Next.js
 * route.
 *
 * Reads the last N hours from ALL THREE sources — `admin_events`, plus the
 * correlated Sentry/Supabase/Vercel signals the reliability collector writes
 * to `background_job_logs.reliability-snapshot` — and returns candidates for
 * `buildTriagePlan` (`@/lib/admin/triage-engine`, which stays pure). This file
 * is I/O only.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';
import type { Database } from '@/lib/types/database';
import type { TriageCandidate, SourceHealth } from '@/lib/admin/triage-engine';
import type { IncidentSeverity } from '@/lib/admin/incident-grouping';

export type AdminClient = SupabaseClient<Database>;

interface AdminEventRow {
  fingerprint: string | null;
  title: string | null;
  message: string | null;
  severity: string | null;
  source: string | null;
  feature: string | null;
  url: string | null;
  metadata: unknown;
  created_at: string | null;
  id: string;
}

interface AnalysisRow {
  fingerprint: string | null;
  metadata: unknown;
  created_at: string | null;
  id: string;
}

const SEVERITIES = new Set(['critical', 'error', 'warning', 'info']);
function asSeverity(value: unknown): IncidentSeverity {
  const s = typeof value === 'string' ? value.toLowerCase() : '';
  return (SEVERITIES.has(s) ? s : 'error') as IncidentSeverity;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * Source 1 — `admin_events`. Unresolved errors in the window, one candidate
 * per fingerprint, carrying whatever analysis already exists for it.
 *
 * `event_type = 'error'` excludes `rca_analysis` rows, which are stored in
 * this same table under the fingerprint they analyse — without the filter an
 * analysis counts as an occurrence of the thing it analyses.
 */
export async function collectAdminEvents(
  admin: AdminClient,
  since: string,
): Promise<{ candidates: TriageCandidate[]; health: SourceHealth }> {
  // PAGINATED, not `.limit(2000)`.
  //
  // PostgREST truncates every response at 1000 rows (supabase/config.toml
  // `max_rows`), so a larger limit does not fail — it silently returns 1000.
  // For THIS module that is the worst possible failure: triage would read a
  // truncated window, find nothing unanalysed in it, and report a clean board.
  // A monitor reporting health from a partial read is the exact thing the
  // engine exists to prevent, and CI's row-cap check caught it here before it
  // ever ran that way.
  //
  // `.order('created_at')` alone is not a stable page key — ties would let
  // rows drift across page boundaries — so `id` breaks the tie.
  const { data, error } = await fetchAllRowsResult<AdminEventRow>((from, to) =>
    admin
      .from('admin_events')
      .select('fingerprint, title, message, severity, source, feature, url, metadata, created_at, id')
      .eq('event_type', 'error')
      .eq('resolved', false)
      .not('fingerprint', 'is', null)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .order('id', { ascending: true })
      .range(from, to),
  );

  if (error) {
    // A source that could not be READ is never reported as zero problems.
    return {
      candidates: [],
      health: { source: 'admin_events', status: 'blind', reason: error.message },
    };
  }

  const { data: analyses, error: analysesError } = await fetchAllRowsResult<AnalysisRow>(
    (from, to) =>
      admin
        .from('admin_events')
        .select('fingerprint, metadata, created_at, id')
        .eq('event_type', 'rca_analysis')
        .order('created_at', { ascending: false })
        .order('id', { ascending: true })
        .range(from, to),
  );

  if (analysesError) {
    return {
      candidates: [],
      health: { source: 'admin_events', status: 'blind', reason: analysesError.message },
    };
  }

  // Newest analysis per fingerprint wins — the query is newest-first, so the
  // first write for a key is the one to keep.
  const fixByFingerprint = new Map<string, string>();
  for (const row of analyses ?? []) {
    const fp = str(row.fingerprint);
    if (!fp || fixByFingerprint.has(fp)) continue;
    const meta = row.metadata as Record<string, unknown> | null;
    const fix = str(meta?.suggestedFix);
    if (fix) fixByFingerprint.set(fp, fix);
  }

  const byFingerprint = new Map<string, TriageCandidate>();
  for (const row of data ?? []) {
    const fp = str(row.fingerprint);
    if (!fp) continue;
    const meta = (row.metadata as Record<string, unknown> | null) ?? {};
    const createdAt = row.created_at ?? since;
    const existing = byFingerprint.get(fp);
    if (existing) {
      existing.occurrences += 1;
      if (createdAt < existing.firstSeen) existing.firstSeen = createdAt;
      if (createdAt > existing.lastSeen) existing.lastSeen = createdAt;
      continue;
    }
    byFingerprint.set(fp, {
      key: fp,
      origin: 'admin_events',
      title: str(row.title) ?? str(row.message) ?? 'Untitled',
      message: str(row.message),
      route: str(row.url) ?? str(meta.route),
      severity: asSeverity(row.severity),
      errorCode: str(meta.errorCode) ?? str(meta.code),
      feature: str(row.feature),
      action: str(meta.action),
      source: str(row.source),
      occurrences: 1,
      firstSeen: createdAt,
      lastSeen: createdAt,
      seenBy: ['admin_events'],
      evidenceUrl: null,
      existingAnalysisFix: fixByFingerprint.get(fp) ?? null,
    });
  }

  return {
    candidates: [...byFingerprint.values()],
    health: { source: 'admin_events', status: 'ok', reason: null },
  };
}

/** One `reliability-snapshot` row's decoded metadata — the shape
 *  `runReliabilityCollection` (`@/lib/reliability/collect.ts`) writes. */
interface ReliabilitySnapshotRow {
  metadata: unknown;
  started_at: string;
}

/**
 * Sources 2–4 — Sentry, Supabase and Vercel, via the correlated snapshots the
 * reliability collector already produces every 3 hours.
 *
 * Not re-collected here on purpose: `runReliabilityCollection` owns talking to
 * those three, and a second implementation of "what did Sentry say" would be a
 * second thing to drift from the tab an operator actually reads.
 *
 * READS EVERY SNAPSHOT ROW INSIDE THE WINDOW, not just the newest.
 *
 * The reliability collector runs every 3 hours (`WINDOW_HOURS = 4` per run,
 * `src/lib/reliability/collect.ts`) and a 72h triage window spans roughly 24
 * of those runs. Reading only the newest row (`.limit(1)`) means a signal that
 * fired at hour 3 and quieted down by hour 60 was NEVER visible to triage —
 * only whatever the collector happened to see in its last 4-hour slice. A
 * Sentry/Vercel/Supabase signal that did not recur in the most recent window
 * is not "resolved"; it is invisible, which is the exact `unknown → healthy`
 * collapse the self-heal OS contract forbids.
 *
 * Every row's signals are folded into one map keyed by the bare signature
 * (rows processed newest-first):
 *   - the first (newest) occurrence of a signature sets title/summary/route/
 *     errorCode/featureId/evidence — the freshest description wins;
 *   - every occurrence unions `sources` (dedupe) and takes count = MAX across
 *     rows, never sum — the 3h cadence over a 4h window overlaps by design,
 *     so summing would double- (or 24x-) count a signal that simply kept
 *     showing up in successive snapshots;
 *   - firstSeen = earliest across rows, lastSeen = latest across rows.
 *
 * `sourceHealth` (the three-arm status block) is read ONLY from the newest
 * row — an older row's arm health is stale by definition and must not
 * override what the most recent collection actually observed.
 */
export async function collectReliabilitySignals(
  admin: AdminClient,
  since: string,
  fixByKey: ReadonlyMap<string, string>,
): Promise<{ candidates: TriageCandidate[]; health: SourceHealth[] }> {
  // Bounded by construction, not paginated: a 72h triage window at a 3h
  // collector cadence holds on the order of tens of rows — nowhere near
  // PostgREST's 1000-row page cap — so a single `.gte(...).order(...)` read
  // is sufficient. (`admin_events` above needs `fetchAllRowsResult` because
  // its row volume in the same window is unbounded; this table's is not.)
  const { data, error } = await admin
    .from('background_job_logs')
    .select('metadata, started_at')
    .eq('job_type', 'reliability-snapshot')
    .gte('started_at', since)
    .order('started_at', { ascending: false });

  if (error) {
    return {
      candidates: [],
      health: [
        { source: 'sentry', status: 'blind', reason: error.message },
        { source: 'supabase', status: 'blind', reason: error.message },
        { source: 'vercel', status: 'blind', reason: error.message },
      ],
    };
  }

  const rows = (data ?? []) as ReliabilitySnapshotRow[];
  if (rows.length === 0) {
    // No snapshot at all is not "three healthy sources found nothing" — it is
    // three sources nobody has looked at.
    return {
      candidates: [],
      health: [
        { source: 'sentry', status: 'blind', reason: 'no reliability-snapshot row on record' },
        { source: 'supabase', status: 'blind', reason: 'no reliability-snapshot row on record' },
        { source: 'vercel', status: 'blind', reason: 'no reliability-snapshot row on record' },
      ],
    };
  }

  // Newest row (rows are ordered started_at desc) supplies the arm-health
  // block — an older row's health is stale the moment a newer one exists.
  const newestSnapshot = rows[0]!.metadata as Record<string, unknown>;
  const health: SourceHealth[] = (
    Array.isArray(newestSnapshot.sources) ? newestSnapshot.sources : []
  ).map((raw) => {
    const s = (raw ?? {}) as Record<string, unknown>;
    const status = str(s.status);
    return {
      source: str(s.source) ?? 'unknown',
      status: status === 'ok' || status === 'degraded' ? status : 'blind',
      reason: str(s.reason),
    };
  });

  interface Merged {
    candidate: TriageCandidate;
    sourcesSeen: Set<string>;
  }
  const merged = new Map<string, Merged>();

  for (const row of rows) {
    const snapshot = row.metadata as Record<string, unknown> | null;
    const signals = Array.isArray(snapshot?.signals) ? snapshot!.signals : [];
    for (const raw of signals) {
      const s = (raw ?? {}) as Record<string, unknown>;
      const signature = str(s.signature);
      if (!signature) continue;
      const lastSeen = str(s.lastSeen);
      // Same window as `admin_events`, applied here rather than at the
      // source: a snapshot is a rolling correlation and can carry signals
      // older than the triage window even though the snapshot ROW itself is
      // inside it.
      if (lastSeen && lastSeen < since) continue;

      const sourcesRaw = Array.isArray(s.sources) ? s.sources.map(String) : [];
      const evidence = Array.isArray(s.evidence) ? s.evidence : [];
      const firstEvidence = (evidence[0] ?? {}) as Record<string, unknown>;
      const key = `rel:${signature}`;
      const count = Number(s.count) || 1;
      const firstSeen = str(s.firstSeen) ?? lastSeen ?? since;
      const resolvedLastSeen = lastSeen ?? since;

      const existing = merged.get(key);
      if (!existing) {
        merged.set(key, {
          candidate: {
            key,
            origin: sourcesRaw[0] === 'supabase' || sourcesRaw[0] === 'vercel' ? sourcesRaw[0] : 'sentry',
            title: str(s.title) ?? str(s.summary) ?? 'Untitled signal',
            message: str(s.summary) ?? str(s.title),
            route: str(s.route),
            severity: asSeverity(s.severity),
            errorCode: str(s.errorCode),
            feature: str(s.featureId),
            action: null,
            source: null,
            occurrences: count,
            firstSeen,
            lastSeen: resolvedLastSeen,
            seenBy: [...sourcesRaw],
            evidenceUrl: str(firstEvidence.ref),
            existingAnalysisFix: fixByKey.get(key) ?? null,
          },
          sourcesSeen: new Set(sourcesRaw),
        });
        continue;
      }

      // Union sources, max count (never sum — overlapping windows), and
      // widen the first/last-seen span across every row that saw this
      // signature.
      for (const src of sourcesRaw) existing.sourcesSeen.add(src);
      existing.candidate.seenBy = [...existing.sourcesSeen];
      existing.candidate.occurrences = Math.max(existing.candidate.occurrences, count);
      if (firstSeen < existing.candidate.firstSeen) existing.candidate.firstSeen = firstSeen;
      if (resolvedLastSeen > existing.candidate.lastSeen) existing.candidate.lastSeen = resolvedLastSeen;
    }
  }

  return { candidates: [...merged.values()].map((m) => m.candidate), health };
}

/** Analyses stored for reliability signals, keyed `rel:<signature>`. */
export async function collectRelAnalyses(admin: AdminClient): Promise<Map<string, string>> {
  // This is a best-effort "did we already analyse this" annotation, not a
  // source of truth for existence. A failed read here degrades to "no
  // existing fix shown" for the affected candidates (they still surface via
  // collectReliabilitySignals with existingAnalysisFix=null) rather than
  // masquerading as a health verdict; the health-critical reads this feeds
  // (admin_events, reliability snapshot) each bind and report their own error.
  const { data, error } = await fetchAllRowsResult<{ fingerprint: string | null; metadata: unknown }>(
    (from, to) =>
      admin
        .from('admin_events')
        .select('fingerprint, metadata, created_at, id')
        .eq('event_type', 'rca_analysis')
        .like('fingerprint', 'rel:%')
        .order('created_at', { ascending: false })
        .order('id', { ascending: true })
        .range(from, to),
  );
  if (error) {
    console.error('collectRelAnalyses: read failed, continuing without existing-fix annotations', error.message);
  }
  const out = new Map<string, string>();
  for (const row of data ?? []) {
    const fp = str(row.fingerprint);
    if (!fp || out.has(fp)) continue;
    const fix = str((row.metadata as Record<string, unknown> | null)?.suggestedFix);
    if (fix) out.set(fp, fix);
  }
  return out;
}
