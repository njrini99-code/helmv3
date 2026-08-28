/**
 * Does production actually serve the fix, and has enough happened since to
 * call it proven?
 *
 * Pure — no I/O, `now` injected — and deliberately NOT `server-only`, for the
 * same reason `proof.ts` and `lens.ts` are not: this is the derivation that
 * decides what an operator reads on the incident card, and a derivation the
 * test suite cannot reach is a derivation that drifts. It lived inside
 * `fetch.ts` until 2026-08-28 and carried a bug the whole time (see
 * `deriveServesFix` below), invisible because every proof test built its
 * `IncidentDeployProof` fixtures by hand and nothing exercised the function
 * that PRODUCES them.
 */

import type { IncidentDeployProof, IncidentRepair } from './types';
import { PRODUCTION_PROOF_WINDOW_MS } from './proof';

/** What the deploy anchor could be read as. `deployAt === null` means Vercel
 *  could not be read at all — not that nothing is deployed. */
export interface DeployAnchor {
  deployAt: number | null;
  deploySha: string | null;
}

export interface DeployProofInput {
  /** `fixed_in_sha` off the stored resolution row, when one exists. */
  resolutionFixedInSha: string | null;
  repair: Pick<IncidentRepair, 'status' | 'mergeSha' | 'mergedAt'>;
  deploy: DeployAnchor;
  /** ISO — the incident's most recent occurrence. */
  lastSeen: string;
  now: number;
}

/** Two SHAs refer to the same commit when either is a prefix of the other —
 *  the ledger stores a short SHA in places and a full one in others. */
function sameCommit(a: string, b: string): boolean {
  return a.startsWith(b) || b.startsWith(a);
}

/**
 * Is the fix live in production? `true` / `false` / `null` = could not tell.
 *
 * THE RULE THAT MATTERS: a SHA match may only ever UPGRADE the answer to
 * `true`. It must never produce `false`.
 *
 * The obvious-looking version — "production SHA equals the fix SHA, else not
 * shipped" — is wrong the moment any later deploy ships, because production's
 * SHA is then some commit after the fix and the equality fails. That reported
 * every fix older than one deploy as permanently unshipped ("Merged, but
 * production does not serve the fix yet"), which is exactly the confidently
 * wrong claim this whole read model exists to eliminate, just inverted. It was
 * worse than a missing answer: the timestamp comparison below is the correct
 * general test, and it was unreachable whenever both SHAs happened to be known.
 *
 * So: an exact match proves shipped; anything else falls through to the
 * timestamp, which is what actually answers the question.
 */
export function deriveServesFix(input: DeployProofInput): boolean | null {
  const { deploy, repair, resolutionFixedInSha } = input;

  // No deploy anchor = Vercel unreadable. Unknown, never false.
  if (deploy.deployAt === null) return null;

  const fixedInSha = resolutionFixedInSha ?? repair.mergeSha ?? null;
  if (fixedInSha !== null && deploy.deploySha !== null && sameCommit(deploy.deploySha, fixedInSha)) {
    return true;
  }

  // Production moved past the fix, or the SHAs were never both known. Either
  // way the merge timestamp is the honest test: a deploy cut after the merge
  // carries the merge.
  const mergedAtMs = repair.mergedAt ? Date.parse(repair.mergedAt) : null;
  if (mergedAtMs !== null && Number.isFinite(mergedAtMs)) {
    return deploy.deployAt >= mergedAtMs;
  }

  // Merged with no timestamp and no SHA agreement — nothing to reason from.
  return null;
}

/**
 * Full deploy proof for one incident, or `null` when there is no fix to prove.
 *
 * Every field here is nullable on purpose. "We could not reach Vercel" and
 * "the fix is not live" are different facts, and the Bridge has rendered them
 * identically before — `shipStatus`'s three outcomes exist in
 * `auto-resolve.ts` for the same reason.
 */
export function buildDeployProof(input: DeployProofInput): IncidentDeployProof | null {
  const { repair, deploy, lastSeen, now, resolutionFixedInSha } = input;

  const fixedInSha = resolutionFixedInSha ?? repair.mergeSha ?? null;
  const hasFix = repair.status === 'merged' || fixedInSha !== null;
  if (!hasFix) return null;

  const deployedAt = deploy.deployAt === null ? null : new Date(deploy.deployAt).toISOString();
  const servesFix = deriveServesFix(input);

  const sinceDeployMs =
    servesFix === true && deploy.deployAt !== null ? now - deploy.deployAt : null;

  const lastOccurrenceMs = Date.parse(lastSeen);
  const recurredAfterDeploy =
    deploy.deployAt !== null && Number.isFinite(lastOccurrenceMs)
      ? lastOccurrenceMs > deploy.deployAt
      : null;

  // Only meaningful once the fix is known live: "enough evidence" is measured
  // from the deploy, so an unshipped or unknown fix has nothing to measure.
  const sufficientProof =
    servesFix !== true
      ? null
      : recurredAfterDeploy === true
        ? false
        : sinceDeployMs !== null && sinceDeployMs >= PRODUCTION_PROOF_WINDOW_MS;

  return {
    fixedInSha,
    productionSha: deploy.deploySha,
    deployedAt,
    servesFix,
    lastOccurrenceAt: lastSeen,
    sinceDeployMs,
    sufficientProof,
    gap:
      servesFix === null
        ? 'Production deploy state could not be read, so shipping cannot be confirmed.'
        : servesFix === false
          ? 'Merged, but production does not serve the fix yet.'
          : recurredAfterDeploy === true
            ? 'The fault fired again after the fix went live.'
            : sufficientProof
              ? null
              : 'Live, but not enough post-deploy evidence to close.',
  };
}
