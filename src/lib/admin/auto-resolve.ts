/**
 * Release-aware auto-resolution — once a fix ships (a production deploy
 * goes READY and stays quiet for a day) or an incident simply stops firing
 * for two weeks, its `admin_events` rows flip `resolved = true` and drop out
 * of the Bridge errors view (fetchIncidentFeed/queryAppErrorEvents both
 * filter `.eq('resolved', false)`). Regression semantics need no extra code
 * here: every native insert path (src/lib/server-error-logger.ts's
 * writeAdminTables and src/app/api/log-error/route.ts) always inserts
 * without setting `resolved` — the column's own `DEFAULT false`
 * (prod_public_baseline.sql) applies, so a fingerprint that fires again
 * after being auto-resolved reappears on its own via a fresh row. Verified
 * by reading both insert paths; neither sets `resolved` explicitly.
 *
 * Two independent rules, both scored off the SAME "how stale is this
 * fingerprint" snapshot (one paginated read of currently-unresolved error
 * rows), so a fingerprint is never resolved twice / double-counted across
 * rules. The bulk UPDATE that flips each rule's candidates is additionally
 * bounded by `created_at < cutoff` (the same cutoff the rule used to decide
 * staleness) so a fresh row inserted for one of those fingerprints between
 * the snapshot read and the UPDATE — a live regression or the fingerprint
 * firing again mid-run — can never be caught up in the same UPDATE and
 * silently marked resolved; see resolveFingerprints()'s doc comment.
 *
 *   Rule A (release): the newest READY production deploy is >= 24h old, and
 *   the fingerprint produced nothing since that deploy went live — assume
 *   the deploy fixed it.
 *
 *   Rule B (quiet fallback): the fingerprint produced nothing in 14 days,
 *   regardless of deploy data. Runs even when Vercel is unconfigured/erroring
 *   (Rule A fails soft and is simply skipped in that case).
 *
 * Metadata tagging ({ autoResolved: { at, rule, deploySha? } }) is NOT
 * applied: each candidate row carries its own pre-existing metadata JSON, so
 * tagging it would require either an N-row loop of individual UPDATEs (the
 * pattern incident-resolver.ts uses, but there for a small allowlisted set —
 * here the candidate set can span thousands of rows across many
 * fingerprints) or a jsonb-merge RPC, which this task explicitly may not
 * add (NO database migrations). A single bulk `UPDATE ... WHERE fingerprint
 * IN (...)` cannot carry a different per-row metadata literal, so the tag is
 * skipped per the task's own "if not cheap, skip it" allowance. `resolved`
 * + `resolved_at` are still the source of truth for what got auto-resolved;
 * `resolved_by` is deliberately left null — same reasoning as
 * incident-resolver.ts: no invoking admin user to attribute it to.
 */
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchAllRows } from '@/lib/supabase/fetch-all-rows';
import { fetchVercelDeployments, type VercelDeployment } from '@/lib/admin/vercel-api';

/** Exported so incident-feed.ts's read-time Sentry filter (the "mirror of
 *  Rule A" described in its own doc comment) can never drift from the
 *  actual grace period used here to resolve rows. */
export const RELEASE_GRACE_MS = 24 * 3600_000;
const QUIET_MS = 14 * 86400_000;
const FINGERPRINT_CHUNK_SIZE = 200;
/** Short cache — mirrors vercel-api.ts's own REVALIDATE_SECONDS. Both the
 *  cron (one call/run) and the Errors-tab read path (one call per admin
 *  page load) resolve the same deploy anchor; caching avoids a redundant
 *  Vercel API round trip when both run within the same minute. */
const DEPLOY_AT_CACHE_TTL_MS = 60_000;

export interface AutoResolveResult {
  resolvedRelease: number;
  resolvedQuiet: number;
  fingerprints: number;
  /** Present when Rule A did not run this pass — Vercel deploy data was
   *  unavailable, or the newest production deploy isn't 24h old yet. Rule B
   *  still runs regardless (see module doc). */
  releaseSkippedReason?: string;
  deploySha?: string | null;
}

interface DeployAnchor {
  deployAt: number | null;
  deploySha: string | null;
  reason?: string;
}

let deployAtCache: { anchor: DeployAnchor; fetchedAt: number } | null = null;

function newestReadyProductionDeploy(deployments: readonly VercelDeployment[]): VercelDeployment | null {
  let newest: VercelDeployment | null = null;
  let newestAt = -Infinity;
  for (const d of deployments) {
    if (d.target !== 'production' || d.state !== 'READY') continue;
    const at = d.ready ?? d.createdAt;
    if (at > newestAt) {
      newest = d;
      newestAt = at;
    }
  }
  return newest;
}

/**
 * Newest READY production deployment's ready (fallback created) time, epoch
 * ms — the shared anchor for Rule A here and for the Sentry-side read-time
 * filter in incident-feed.ts. Fail-soft/fail-open: `deployAt: null` on any
 * lookup failure (missing token, API error, or no READY production deploy
 * in the fetched page) — callers treat null as "don't filter / don't
 * resolve", never as a false positive.
 */
export async function getProductionDeployAt(now: number = Date.now()): Promise<DeployAnchor> {
  if (deployAtCache && now - deployAtCache.fetchedAt < DEPLOY_AT_CACHE_TTL_MS) {
    return deployAtCache.anchor;
  }

  const deploys = await fetchVercelDeployments(20);
  let anchor: DeployAnchor;
  if (deploys.status !== 'ok' || !deploys.data) {
    anchor = { deployAt: null, deploySha: null, reason: deploys.error ?? 'Vercel deployments unavailable' };
  } else {
    const newest = newestReadyProductionDeploy(deploys.data);
    anchor = newest
      ? { deployAt: newest.ready ?? newest.createdAt, deploySha: newest.commitSha }
      : { deployAt: null, deploySha: null, reason: 'no ready production deployment found' };
  }

  deployAtCache = { anchor, fetchedAt: now };
  return anchor;
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

type AdminClient = ReturnType<typeof createAdminClient>;

/** Bulk-resolve every currently-unresolved error row for the given
 *  fingerprints, chunked to keep each `.in()` clause bounded. Returns the
 *  total row count actually flipped (PostgREST `count: 'exact'` on the
 *  update, not `fingerprints.length` — a fingerprint can back many rows).
 *
 *  `cutoffIso` bounds the UPDATE to rows that already existed (and were
 *  already stale) at snapshot time: `.lt('created_at', cutoffIso)`. Without
 *  it, `.eq('resolved', false)` is re-evaluated at UPDATE time, not at the
 *  snapshot read — so a genuinely new row for one of these fingerprints
 *  inserted between the snapshot and this call (e.g. a live regression, or
 *  the fingerprint firing again mid-run) would still match `resolved=false`
 *  and get silently flipped to resolved=true. Passing the same cutoff the
 *  caller used to decide this fingerprint was stale (deployAt for Rule A,
 *  quietCutoff for Rule B) guarantees any such new row's created_at falls
 *  on the wrong side of the filter and is left untouched. */
async function resolveFingerprints(
  admin: AdminClient,
  fingerprints: readonly string[],
  cutoffIso: string,
  resolvedAtIso: string,
): Promise<number> {
  if (fingerprints.length === 0) return 0;
  let total = 0;
  for (const batch of chunk(fingerprints, FINGERPRINT_CHUNK_SIZE)) {
    const { error, count } = await admin
      .from('admin_events')
      .update({ resolved: true, resolved_at: resolvedAtIso }, { count: 'exact' })
      .eq('resolved', false)
      .eq('event_type', 'error')
      .lt('created_at', cutoffIso)
      .in('fingerprint', batch);
    if (error) throw new Error(`autoResolveFixedIncidents: update failed: ${error.message}`);
    total += count ?? 0;
  }
  return total;
}

export async function autoResolveFixedIncidents(): Promise<AutoResolveResult> {
  const admin = createAdminClient();
  const now = Date.now();

  // One paginated read of every currently-open error row's (fingerprint,
  // created_at) — the PostgREST client has no server-side GROUP BY, so
  // max(created_at) per fingerprint is reduced client-side from this page
  // set. fetchAllRows already paginates past the 1000-row cap.
  const rows = await fetchAllRows<{ fingerprint: string | null; created_at: string | null }>((from, to) =>
    admin
      .from('admin_events')
      .select('fingerprint, created_at')
      .eq('resolved', false)
      .eq('event_type', 'error')
      .not('fingerprint', 'is', null)
      .order('id', { ascending: true })
      .range(from, to),
  );

  const maxByFingerprint = new Map<string, number>();
  for (const row of rows) {
    if (!row.fingerprint || !row.created_at) continue;
    const t = Date.parse(row.created_at);
    if (Number.isNaN(t)) continue;
    const prev = maxByFingerprint.get(row.fingerprint);
    if (prev === undefined || t > prev) maxByFingerprint.set(row.fingerprint, t);
  }

  const deploy = await getProductionDeployAt(now);

  const releaseFingerprints: string[] = [];
  let releaseSkippedReason = deploy.reason;
  if (deploy.deployAt !== null) {
    if (now - deploy.deployAt >= RELEASE_GRACE_MS) {
      for (const [fp, maxT] of maxByFingerprint) {
        if (maxT < deploy.deployAt) releaseFingerprints.push(fp);
      }
    } else {
      releaseSkippedReason = 'newest production deploy is under 24h old';
    }
  }
  const releaseSet = new Set(releaseFingerprints);

  const quietCutoff = now - QUIET_MS;
  const quietFingerprints: string[] = [];
  for (const [fp, maxT] of maxByFingerprint) {
    if (maxT < quietCutoff && !releaseSet.has(fp)) quietFingerprints.push(fp);
  }

  const resolvedAtIso = new Date(now).toISOString();
  // cutoffIso for Rule A/B mirrors the exact boundary each rule already used
  // to decide staleness (deployAt / quietCutoff) — see resolveFingerprints'
  // doc comment for why this closes the snapshot-to-UPDATE race. deployAt
  // can be null here only when releaseFingerprints is empty (populated only
  // when deploy.deployAt !== null above), in which case resolveFingerprints
  // short-circuits before the cutoff is ever used.
  const resolvedRelease = await resolveFingerprints(
    admin,
    releaseFingerprints,
    new Date(deploy.deployAt ?? now).toISOString(),
    resolvedAtIso,
  );
  const resolvedQuiet = await resolveFingerprints(
    admin,
    quietFingerprints,
    new Date(quietCutoff).toISOString(),
    resolvedAtIso,
  );

  return {
    resolvedRelease,
    resolvedQuiet,
    fingerprints: releaseFingerprints.length + quietFingerprints.length,
    ...(releaseFingerprints.length === 0 && releaseSkippedReason ? { releaseSkippedReason } : {}),
    deploySha: deploy.deploySha,
  };
}
