import 'server-only';

import { fetchWorkLog, type WorkLogEntry, type PrLifecycleState } from '@/lib/admin/github-pr-timeline';
import { fetchReleaseLedger, type ReleaseCardData } from '@/lib/admin/data/release-ledger';
import type { WorkArea } from '@/lib/admin/pr-body-parser';
import { failed, ok, type AdminFetchResult } from '@/lib/admin/fetch-result';

/**
 * Change-to-proof Work Log (brief §29): for every PR, what it claims, which
 * release it shipped in, and the post-deploy proof state of that release.
 * Pure derivation over data the existing admin sync already fetches
 * (`fetchWorkLog` -> GitHub PRs, `fetchReleaseLedger` -> Vercel deploys +
 * error deltas) — no new network calls.
 *
 * Two honest scope limits, stated once here rather than implied by the
 * field names:
 *
 * 1. "Which gates proved it" is NOT live per-PR CI check-run data — fetching
 *    that would be a new network call this deliverable is not authorized to
 *    add. What IS shown is the PR's own self-reported repair verdict
 *    (`repairVerdict`: confirmed / corrected / not-reviewed — already
 *    extracted by `github-pr-timeline.ts` from the PR body's STEP 5 link)
 *    plus the CURRENT gate posture from the Charter panel
 *    (`src/lib/admin/engineering/charter.ts`) — never presented as "this is
 *    what ran at merge time".
 * 2. "Which release it shipped in" is a best-effort TIME BUCKET: the
 *    earliest known deploy at or after the PR's merge time, from the same
 *    release cards `/admin/deploys` already renders. A PR merged after the
 *    newest known deploy has not shipped yet (`shippedInRelease: null,
 *    notYetDeployed: true`); a PR that shipped before the oldest known
 *    deploy in this window has no matching card either (`notYetDeployed:
 *    false` — this is a coverage gap, not "still pending", so it stays
 *    distinct at the read-model layer even though today's UI does not
 *    need to say more than "no release match in window").
 */

export interface WorkLogShippedRelease {
  commitSha: string | null;
  deployedAt: number;
  gatheringSignal: boolean;
  errorsAfter2h: number | null;
  delta: number | null;
  verdict: ReleaseCardData['verdict'];
}

export interface WorkLogProofRow {
  number: number;
  htmlUrl: string;
  title: string;
  state: PrLifecycleState;
  area: WorkArea;
  authorLogin: string;
  mergedAt: string | null;
  repairIncidentIds: readonly string[];
  repairVerdict: WorkLogEntry['repairVerdict'];
  shippedInRelease: WorkLogShippedRelease | null;
  notYetDeployed: boolean;
}

export interface WorkLogProofSnapshot {
  rows: WorkLogProofRow[];
  repoLabel: string;
  truncated: boolean;
  /** False when the release ledger could not be read — rows still render
   *  with `shippedInRelease: null` throughout, disclosed here rather than
   *  silently presented as "nothing shipped yet". Per-source isolation:
   *  a Vercel/release-ledger failure must not blank the PR list. */
  releaseDataAvailable: boolean;
}

function findShippingRelease(mergedAtMs: number, cardsAscending: readonly ReleaseCardData[]): ReleaseCardData | null {
  for (const card of cardsAscending) {
    if (card.createdAt >= mergedAtMs) return card;
  }
  return null;
}

/** Pure — no I/O. `releaseCards` may be `null` when the release ledger is
 *  unavailable; every row then gets `shippedInRelease: null`. */
export function buildWorkLogProof(
  entries: readonly WorkLogEntry[],
  releaseCards: readonly ReleaseCardData[] | null,
): WorkLogProofRow[] {
  const cardsAscending = releaseCards ? [...releaseCards].sort((a, b) => a.createdAt - b.createdAt) : null;
  const latestDeployAt = cardsAscending && cardsAscending.length > 0 ? (cardsAscending[cardsAscending.length - 1]?.createdAt ?? null) : null;

  return entries.map((entry): WorkLogProofRow => {
    const mergedAtMs = entry.merged_at ? Date.parse(entry.merged_at) : null;
    let shippedInRelease: WorkLogShippedRelease | null = null;
    let notYetDeployed = false;

    if (mergedAtMs !== null && cardsAscending) {
      const card = findShippingRelease(mergedAtMs, cardsAscending);
      if (card) {
        shippedInRelease = {
          commitSha: card.commitSha,
          deployedAt: card.createdAt,
          gatheringSignal: card.gatheringSignal,
          errorsAfter2h: card.errorsAfter2h,
          delta: card.delta,
          verdict: card.verdict,
        };
      } else if (latestDeployAt !== null && mergedAtMs > latestDeployAt) {
        notYetDeployed = true;
      }
    }

    return {
      number: entry.number,
      htmlUrl: entry.html_url,
      title: entry.title,
      state: entry.state,
      area: entry.parsed.area,
      authorLogin: entry.authorLogin,
      mergedAt: entry.merged_at,
      repairIncidentIds: entry.repairIncidentIds,
      repairVerdict: entry.repairVerdict,
      shippedInRelease,
      notYetDeployed,
    };
  });
}

export async function fetchWorkLogProof(): Promise<AdminFetchResult<WorkLogProofSnapshot>> {
  const workLogResult = await fetchWorkLog();
  if (workLogResult.status !== 'ok' || !workLogResult.data) {
    return workLogResult.status === 'unconfigured'
      ? { status: 'unconfigured', data: null, fetchedAt: null, error: workLogResult.error }
      : failed(workLogResult.error ?? 'Work log unavailable');
  }

  const releaseLedgerResult = await fetchReleaseLedger();
  const releaseCards = releaseLedgerResult.status === 'ok' ? (releaseLedgerResult.data?.cards ?? null) : null;

  return ok({
    rows: buildWorkLogProof(workLogResult.data.entries, releaseCards),
    repoLabel: workLogResult.data.repoLabel,
    truncated: workLogResult.truncated ?? false,
    releaseDataAvailable: releaseLedgerResult.status === 'ok',
  });
}

// ── Repair quality: the subset of Work Log rows that claim to repair an
//    incident, aggregated against the post-deploy proof of the release
//    they shipped in. A filtered view over the same data above, not a
//    second gate. ────────────────────────────────────────────────────────

export type RepairStayedFixed = 'improved' | 'worsened' | 'unchanged' | 'unknown' | 'not-yet-deployed';

export interface RepairQualityRow extends WorkLogProofRow {
  stayedFixed: RepairStayedFixed;
}

export interface RepairQualitySnapshot {
  rows: RepairQualityRow[];
  releaseDataAvailable: boolean;
}

function repairOutcome(row: WorkLogProofRow): RepairStayedFixed {
  if (row.notYetDeployed) return 'not-yet-deployed';
  if (!row.shippedInRelease) return 'unknown';
  const { tone } = row.shippedInRelease.verdict;
  if (tone === 'success') return 'improved';
  if (tone === 'danger') return 'worsened';
  return 'unchanged';
}

/** Pure. Filters Work Log rows to PRs that claim a repair
 *  (`repairIncidentIds.length > 0`) and labels each with whether the
 *  release it shipped in read as an improvement, a regression, or
 *  unchanged — the release-level proxy this repo already computes
 *  (`ReleaseCardData.verdict`, from `release-ledger.ts`'s before/after
 *  error-count comparison), not per-fingerprint episode tracking (that is
 *  a Phase 1 concept this file does not have access to without a second
 *  incident-fetching path). */
export function buildRepairQuality(rows: readonly WorkLogProofRow[]): RepairQualityRow[] {
  return rows
    .filter((row) => row.repairIncidentIds.length > 0)
    .map((row) => ({ ...row, stayedFixed: repairOutcome(row) }));
}

export async function fetchRepairQuality(): Promise<AdminFetchResult<RepairQualitySnapshot>> {
  const workLog = await fetchWorkLogProof();
  if (workLog.status !== 'ok' || !workLog.data) {
    return workLog.status === 'unconfigured'
      ? { status: 'unconfigured', data: null, fetchedAt: null, error: workLog.error }
      : failed(workLog.error ?? 'Work log unavailable');
  }
  return ok({
    rows: buildRepairQuality(workLog.data.rows),
    releaseDataAvailable: workLog.data.releaseDataAvailable,
  });
}
