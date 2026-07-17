import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchAllRows } from '@/lib/supabase/fetch-all-rows';
import { fetchVercelDeployments } from '@/lib/admin/vercel-api';
import { type AdminFetchResult, unconfigured, ok } from '@/lib/admin/fetch-result';

/**
 * Helm Bridge — Release Ledger (deploys tab hero panel) + Regression Radar
 * folded in as its per-deploy verdict strip.
 *
 * "Did the last few ships make things better or worse, right now?" — a
 * trailing-7d hourly error trend with a ReferenceDot per production deploy
 * (colored by that deploy's own verdict), plus a release card per deploy
 * carrying a before/after-2h error delta and a resolved-vs-new fingerprint
 * verdict for that deploy's own "reign" (the window from when it went live
 * until the NEXT deploy superseded it, or now for the newest).
 *
 * Reuses admin_events + fetchVercelDeployments exactly like auto-resolve.ts
 * does (RELEASE_GRACE_MS / getProductionDeployAt) — but does NOT import that
 * module's mutation path. auto-resolve.ts answers "should we flip `resolved`
 * on stale rows" for the SINGLE newest production deploy; this module reads
 * the resulting `resolved`/`resolved_at`/`fingerprint` columns per DEPLOY IN
 * THE LEDGER (any of the last 7d of production deploys, not just the
 * newest), which is a different question with a different shape — so it is
 * a sibling reader of the same columns, not a duplicate of the resolver.
 *
 * HONESTY BOUNDS (documented, not hidden):
 *   - "New since ship" / "resolved and stayed quiet" are computed from a
 *     14-day admin_events lookback (7d card window + a 7d margin before the
 *     oldest possible card) — a fingerprint whose true first-ever occurrence
 *     predates the lookback window, but which happens to recur inside it,
 *     cannot be told apart from a genuinely new fingerprint. The 7-day
 *     margin makes this rare in practice but it is not eliminated; the UI
 *     copy says "since ship" scoped to this window, not "ever".
 *   - The before/after error delta uses a fixed 2h window on each side of
 *     the deploy timestamp. Deploys under 2h old render a "gathering
 *     signal" state instead of a premature half-window verdict.
 */

const CARD_WINDOW_MS = 7 * 86400_000; // release cards: trailing 7 days
const LOOKBACK_MARGIN_MS = 7 * 86400_000; // extra history so "new" isn't a lookback-edge artifact
const LOOKBACK_MS = CARD_WINDOW_MS + LOOKBACK_MARGIN_MS; // 14 days
const DELTA_WINDOW_MS = 2 * 3600_000; // before/after error-count window
const MAX_CARD_DEPLOYS = 10;
const HOUR_MS = 3600_000;

export type ReleaseVerdictTone = 'success' | 'neutral' | 'danger';

export interface ReleaseVerdict {
  tone: ReleaseVerdictTone;
  label: string;
}

export interface ReleaseFeatureDelta {
  feature: string;
  before: number;
  after: number;
  delta: number;
}

export interface ReleaseNewFingerprint {
  fingerprint: string;
  title: string;
  severity: string;
  firstSeen: string; // ISO
}

export interface ReleaseCardData {
  uid: string;
  commitSha: string | null;
  commitMessage: string | null;
  commitRef: string | null;
  commitAuthor: string | null;
  createdAt: number; // epoch ms
  isLive: boolean;
  /** Deploys < 2h old: the after-window isn't full yet, so the delta/verdict
   *  render as "still gathering signal" rather than a premature read. */
  gatheringSignal: boolean;
  errorsBefore2h: number;
  errorsAfter2h: number | null;
  delta: number | null;
  verdict: ReleaseVerdict;
  /** Fingerprints whose newest known occurrence (within the lookback) is a
   *  `resolved = true` row, resolved during this deploy's reign — i.e. it
   *  went quiet after (and has not fired again since, within the lookback). */
  resolvedAndQuietSince: number;
  /** Fingerprints first seen (within the lookback) during this deploy's
   *  reign — see HONESTY BOUNDS above. */
  newFingerprintsSince: number;
  topFeatureDeltas: ReleaseFeatureDelta[];
  newFingerprintSamples: ReleaseNewFingerprint[];
}

export interface ReleaseTrendPoint {
  x: string;
  y: number;
  marker?: { label: string; tone: ReleaseVerdictTone };
}

export interface ReleaseLedgerData {
  trend: ReleaseTrendPoint[];
  cards: ReleaseCardData[];
  currentBuildSha: string | null;
  /** Where the deploy timeline came from — surfaced so the panel can render
   *  an honest "showing recorded deploy markers, Vercel API not configured"
   *  note instead of silently passing fallback data off as the real thing. */
  deploySource: 'vercel' | 'marker-fallback';
}

interface RawReleaseDeploy {
  uid: string;
  commitSha: string | null;
  commitMessage: string | null;
  commitRef: string | null;
  commitAuthor: string | null;
  createdAt: number;
}

interface ReleaseEventRow {
  id: string;
  created_at: string | null;
  fingerprint: string | null;
  feature: string | null;
  severity: string;
  resolved: boolean | null;
  resolved_at: string | null;
  title: string;
}

/** Vercel deployments (preferred) — production target only, newest first.
 *  Falls back to deploy-marker.ts's admin_events `event_type='deploy'` rows
 *  (zero-secret, present even before VERCEL_API_TOKEN is provisioned) when
 *  Vercel isn't configured or the call fails, matching the fallback the
 *  Release Ledger spec's data_sources section calls for. */
async function resolveReleaseDeploys(
  admin: ReturnType<typeof createAdminClient>,
): Promise<{ deploys: RawReleaseDeploy[]; source: 'vercel' | 'marker-fallback' }> {
  const vercelRes = await fetchVercelDeployments(20);
  if (vercelRes.status === 'ok' && vercelRes.data) {
    const prod = vercelRes.data
      .filter((d) => d.target === 'production')
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(
        (d): RawReleaseDeploy => ({
          uid: d.uid,
          commitSha: d.commitSha,
          commitMessage: d.commitMessage,
          commitRef: d.commitRef,
          commitAuthor: d.commitAuthor,
          createdAt: d.createdAt,
        }),
      );
    return { deploys: prod, source: 'vercel' };
  }

  const { data } = await admin
    .from('admin_events')
    .select('id, created_at, message, metadata')
    .eq('event_type', 'deploy')
    .order('created_at', { ascending: false })
    .limit(20);

  const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
  const mapped = (data ?? []).map((row): RawReleaseDeploy => {
    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    const createdMs = row.created_at ? Date.parse(row.created_at) : NaN;
    return {
      uid: row.id,
      commitSha: strOrNull(meta.sha),
      commitMessage: row.message,
      commitRef: strOrNull(meta.ref),
      commitAuthor: strOrNull(meta.author),
      createdAt: Number.isFinite(createdMs) ? createdMs : Date.now(),
    };
  });
  return { deploys: mapped, source: 'marker-fallback' };
}

/** Exported for unit tests only — the boundary math (which hour a timestamp
 *  belongs to) is the kind of off-by-one that's cheap to get wrong and
 *  expensive to notice (a deploy marker landing on the wrong bar). */
export function bucketStartMs(t: number): number {
  return Math.floor(t / HOUR_MS) * HOUR_MS;
}

/** Deterministic UTC label — never `toLocale*` (this module runs server-side
 *  only; a locale/timezone-formatted string baked at request time would be
 *  the same hydration-mismatch bug class LocalTime.tsx exists to prevent,
 *  were this value ever re-derived client-side). */
export function bucketLabel(t: number): string {
  const d = new Date(t);
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  return `${mm}/${dd} ${hh}:00 UTC`;
}

const SEVERITY_RANK: Record<string, number> = { critical: 0, error: 1 };

/** Which release card's "reign" a timestamp falls into. `cards` must be
 *  sorted newest-first; a card's reign runs from its own createdAt up to
 *  (but not including) the next-newer card's createdAt, or `now` for the
 *  newest card. Returns null when `t` predates the oldest card in the list
 *  (outside the ledger entirely). */
/** Exported for unit tests only. */
export function reignIndexFor(t: number, cards: readonly { createdAt: number }[]): number | null {
  for (let i = 0; i < cards.length; i += 1) {
    const card = cards[i];
    if (card && t >= card.createdAt) return i;
  }
  return null;
}

export async function fetchReleaseLedger(): Promise<AdminFetchResult<ReleaseLedgerData>> {
  const now = Date.now();
  const currentBuildSha = process.env.VERCEL_GIT_COMMIT_SHA?.trim() || null;
  const admin = createAdminClient();

  const { deploys: allDeploys, source } = await resolveReleaseDeploys(admin);

  const windowStart = now - CARD_WINDOW_MS;
  const seen = new Set<string>();
  const cardDeploys = allDeploys
    .filter((d) => d.createdAt >= windowStart)
    .filter((d) => {
      const key = d.commitSha ?? d.uid;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_CARD_DEPLOYS);

  if (allDeploys.length === 0 && source === 'marker-fallback') {
    return unconfigured('Release ledger (Vercel deploys + deploy markers)');
  }

  const lookbackStartIso = new Date(now - LOOKBACK_MS).toISOString();
  const rows = await fetchAllRows<ReleaseEventRow>((from, to) =>
    admin
      .from('admin_events')
      .select('id, created_at, fingerprint, feature, severity, resolved, resolved_at, title')
      .eq('event_type', 'error')
      .in('severity', ['error', 'critical'])
      .not('fingerprint', 'is', null)
      .gte('created_at', lookbackStartIso)
      .order('id', { ascending: true })
      .range(from, to),
  );

  // Per-fingerprint rollup: earliest occurrence (for "new since") + the
  // NEWEST known occurrence's resolved state (for "resolved and stayed
  // quiet" — a fingerprint whose latest row is unresolved has clearly fired
  // again, so it never counts as quiet even if an earlier row was resolved).
  interface FpRollup {
    minT: number;
    minTitle: string;
    minSeverity: string;
    maxT: number;
    lastResolved: boolean;
    lastResolvedAt: number | null;
  }
  const fpMap = new Map<string, FpRollup>();
  for (const row of rows) {
    if (!row.fingerprint || !row.created_at) continue;
    const t = Date.parse(row.created_at);
    if (!Number.isFinite(t)) continue;
    const existing = fpMap.get(row.fingerprint);
    if (!existing) {
      fpMap.set(row.fingerprint, {
        minT: t,
        minTitle: row.title,
        minSeverity: row.severity,
        maxT: t,
        lastResolved: row.resolved === true,
        lastResolvedAt: row.resolved_at ? Date.parse(row.resolved_at) : null,
      });
      continue;
    }
    if (t < existing.minT) {
      existing.minT = t;
      existing.minTitle = row.title;
      existing.minSeverity = row.severity;
    }
    if (t >= existing.maxT) {
      existing.maxT = t;
      existing.lastResolved = row.resolved === true;
      existing.lastResolvedAt = row.resolved_at ? Date.parse(row.resolved_at) : null;
    }
  }

  // ---- Per-card before/after-2h + top feature deltas -----------------------
  const cards: ReleaseCardData[] = cardDeploys.map((d) => {
    const gatheringSignal = now - d.createdAt < DELTA_WINDOW_MS;
    const beforeStart = d.createdAt - DELTA_WINDOW_MS;
    const beforeEnd = d.createdAt;
    const afterStart = d.createdAt;
    const afterEnd = d.createdAt + DELTA_WINDOW_MS;

    let errorsBefore = 0;
    let errorsAfter = 0;
    const beforeByFeature = new Map<string, number>();
    const afterByFeature = new Map<string, number>();

    for (const row of rows) {
      if (!row.created_at) continue;
      const t = Date.parse(row.created_at);
      if (!Number.isFinite(t)) continue;
      const feature = row.feature ?? 'unlabeled';
      if (t >= beforeStart && t < beforeEnd) {
        errorsBefore += 1;
        beforeByFeature.set(feature, (beforeByFeature.get(feature) ?? 0) + 1);
      }
      if (!gatheringSignal && t >= afterStart && t < afterEnd) {
        errorsAfter += 1;
        afterByFeature.set(feature, (afterByFeature.get(feature) ?? 0) + 1);
      }
    }

    const delta = gatheringSignal ? null : errorsAfter - errorsBefore;
    const verdict: ReleaseVerdict = gatheringSignal
      ? { tone: 'neutral', label: 'gathering signal' }
      : delta! < 0
        ? { tone: 'success', label: 'improved' }
        : delta! > 0
          ? { tone: 'danger', label: 'regressed' }
          : { tone: 'neutral', label: 'neutral' };

    const topFeatureDeltas: ReleaseFeatureDelta[] = gatheringSignal
      ? []
      : Array.from(new Set([...beforeByFeature.keys(), ...afterByFeature.keys()]))
          .map((feature): ReleaseFeatureDelta => {
            const before = beforeByFeature.get(feature) ?? 0;
            const after = afterByFeature.get(feature) ?? 0;
            return { feature, before, after, delta: after - before };
          })
          .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
          .slice(0, 5);

    return {
      uid: d.uid,
      commitSha: d.commitSha,
      commitMessage: d.commitMessage,
      commitRef: d.commitRef,
      commitAuthor: d.commitAuthor,
      createdAt: d.createdAt,
      isLive: currentBuildSha !== null && d.commitSha !== null && d.commitSha === currentBuildSha,
      gatheringSignal,
      errorsBefore2h: errorsBefore,
      errorsAfter2h: gatheringSignal ? null : errorsAfter,
      delta,
      verdict,
      resolvedAndQuietSince: 0, // filled below
      newFingerprintsSince: 0, // filled below
      topFeatureDeltas,
      newFingerprintSamples: [], // filled below
    };
  });

  // ---- Per-fingerprint reign assignment: new-since / resolved-and-quiet ----
  const newSamplesByCard = new Map<number, ReleaseNewFingerprint[]>();
  for (const [fingerprint, fp] of fpMap) {
    const newIdx = reignIndexFor(fp.minT, cardDeploys);
    if (newIdx !== null) {
      const newCard = cards[newIdx];
      if (newCard) {
        newCard.newFingerprintsSince += 1;
        const list = newSamplesByCard.get(newIdx) ?? [];
        list.push({
          fingerprint,
          title: fp.minTitle,
          severity: fp.minSeverity,
          firstSeen: new Date(fp.minT).toISOString(),
        });
        newSamplesByCard.set(newIdx, list);
      }
    }

    if (fp.lastResolved && fp.lastResolvedAt !== null) {
      const resolvedIdx = reignIndexFor(fp.lastResolvedAt, cardDeploys);
      const resolvedCard = resolvedIdx !== null ? cards[resolvedIdx] : undefined;
      if (resolvedCard) resolvedCard.resolvedAndQuietSince += 1;
    }
  }
  for (const [idx, samples] of newSamplesByCard) {
    const card = cards[idx];
    if (!card) continue;
    card.newFingerprintSamples = samples
      .sort((a, b) => {
        const rankDiff = (SEVERITY_RANK[a.severity] ?? 2) - (SEVERITY_RANK[b.severity] ?? 2);
        if (rankDiff !== 0) return rankDiff;
        return Date.parse(b.firstSeen) - Date.parse(a.firstSeen);
      })
      .slice(0, 5);
  }

  // ---- 7d hourly trend + per-deploy ReferenceDot markers --------------------
  const trendStart = bucketStartMs(now - CARD_WINDOW_MS);
  const trendEnd = bucketStartMs(now);
  const bucketCount = Math.round((trendEnd - trendStart) / HOUR_MS) + 1;
  const buckets = Array.from({ length: bucketCount }, (_, i) => ({
    t: trendStart + i * HOUR_MS,
    count: 0,
    marker: undefined as { label: string; tone: ReleaseVerdictTone } | undefined,
  }));
  const bucketIndex = new Map(buckets.map((b, i) => [b.t, i]));

  for (const row of rows) {
    if (!row.created_at) continue;
    const t = Date.parse(row.created_at);
    if (!Number.isFinite(t) || t < trendStart) continue;
    const idx = bucketIndex.get(bucketStartMs(t));
    const bucket = idx !== undefined ? buckets[idx] : undefined;
    if (bucket) bucket.count += 1;
  }

  for (const card of cards) {
    if (card.createdAt < trendStart) continue;
    const idx = bucketIndex.get(bucketStartMs(card.createdAt));
    const bucket = idx !== undefined ? buckets[idx] : undefined;
    if (!bucket) continue;
    bucket.marker = {
      label: card.commitSha ? card.commitSha.slice(0, 7) : card.uid.slice(0, 7),
      tone: card.verdict.tone,
    };
  }

  const trend: ReleaseTrendPoint[] = buckets.map((b) => ({
    x: bucketLabel(b.t),
    y: b.count,
    ...(b.marker ? { marker: b.marker } : {}),
  }));

  return ok({
    trend,
    cards,
    currentBuildSha,
    deploySource: source,
  });
}
