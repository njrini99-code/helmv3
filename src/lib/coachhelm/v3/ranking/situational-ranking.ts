/**
 * Situational issue grouping and ranking-input unification (repair-plan
 * addendum §13, work package A6 slice 1 — pure core, no DB).
 *
 * The evidence contract's "Top-N selection audit" section (2026-09-23)
 * fixed every surface that truncated a `golf_coach_insights` list before
 * ranking it, but explicitly left "issue grouping and parent/child claim
 * links" out of scope pending A1–A4's evidence-packet work. That work now
 * exists (A1 `ShotFact`/`HoleContext`, A3 `par-opportunities.ts`, A5
 * `hypothesis-policy.ts`, and A2/A4 landing shortly) — this module is the
 * grouping step it deferred to.
 *
 * The problem this solves: A3's `par-opportunities.ts`, A2's future
 * `distance-profile.ts`, A4's future `sequence-attribution.ts`, and A5's
 * `hypothesis-policy.ts` each look at a round's shots from a different
 * angle and each may surface something about the SAME underlying shots —
 * a par-5 approach that came up short can be flagged by a par-opportunity
 * row, a distance-band row, AND a sequence-attribution finding, all
 * pointing at the same one or two shots. par-opportunities.ts's own file
 * header calls this out directly: "Neither family computes a
 * strokes_impact/counterfactual number — that would double the impact
 * par-type.ts's existing per-par cards already own... reconciling impact
 * ownership when that happens[, wiring this into a generator,] is a later
 * slice." This module IS that later slice, for the new v3 pure-core
 * families: it groups packets that share underlying evidence into one
 * `Issue`, and resolves ONE owner for the issue's impact estimate so the
 * same shots are never counted toward the opportunity total more than
 * once — without discarding the other perspectives, which remain visible
 * as drill-down claims.
 *
 * ## Packets
 * `groupIssues` takes a flat list of `IssueSourcePacket` — one per family
 * finding (a `MetricResult` row from A2/A3, a `Hypothesis` from A5, or a
 * future A4 sequence-attribution finding), each ADAPTED by its own family
 * into this common shape by whatever wires it up (that wiring is NOT this
 * module's job, and is explicitly out of scope for this slice — see the
 * module-level "Not wired" note below). The one field every adapter MUST
 * populate honestly is `sourceShotIds`: the `shotClaimId`-shaped identifiers
 * of the shots this packet's value actually came from. Grouping has no
 * other way to know two packets are "about the same thing" — it never
 * infers overlap from `metricId`, `dimensions`, or label text, only from
 * this explicit, adapter-stated set.
 *
 * `eligible` is likewise decided by the adapter, not recomputed here — a
 * `MetricResult` with `status: 'invalid'`, or a `Hypothesis` at
 * `state: 'no_data'`, is exactly the kind of packet that should never
 * found or join an issue; the adapter that already understands its own
 * family's status/state semantics is where that judgment belongs. Per the
 * evidence contract's A6 top-N audit (apply eligibility BEFORE ranking,
 * and rank BEFORE truncating), `groupIssues` filters ineligible packets
 * out FIRST, before grouping or computing any policy input — and any
 * FUTURE truncation (a later slice's top-N delivery cut) must happen
 * strictly after this, never before.
 *
 * ## Grouping
 * Two packets join the same issue when their `sourceShotIds` overlap in
 * at least one shot — transitively, via union-find, so a chain of
 * pairwise overlaps (A↔B, B↔C) all land in one issue even if A and C
 * share no shot directly. A packet whose shots overlap no one else's
 * becomes its own single-claim issue; most real issues will look like
 * this, and that is fine — grouping is additive, never forced.
 *
 * ## The five things an accepted issue carries
 * - **Stable issue identity** (`id`): a content-addressed key built from
 *   the sorted, deduplicated union of the issue's own `sourceShotIds` —
 *   the SAME underlying evidence always produces the SAME id regardless
 *   of packet input order, so an issue's identity survives a re-run.
 * - **Parent/child claim links** (`claims`): the issue is the parent; each
 *   member packet's `claimId`/`origin`/`label` survives unmerged as a
 *   child claim, in owner-first order, so a consumer can always drill
 *   down from "one issue" back to the individual par/distance/sequence/
 *   hypothesis finding that fed it.
 * - **Non-overlapping impact ownership** (`impactOwnership`): exactly ONE
 *   member claim is chosen as the impact owner (see `pickOwner` below);
 *   every other member remains a listed, visible claim that contributes
 *   NO additional impact. This is what keeps "par, distance, and sequence
 *   all describe the same shots" from tripling the issue's estimated
 *   opportunity — only the single strongest claim's impact counts.
 * - **Opportunity frequency** (`opportunityFrequency`): how much real
 *   evidence backs the issue — the count of distinct source shots and the
 *   count of distinct rounds they span (parsed from each shot claim's own
 *   `round_id` segment).
 * - **Effective policy inputs** (`policyInput`): the resolved
 *   `strokesImpact`/`confidence`/`sampleSize` a later ranking policy
 *   (`ranking/score.ts`-shaped) would actually consume — mirroring the
 *   impact owner's own numbers, not an average or sum across every
 *   member, so the "one leading priority per issue" acceptance rule holds
 *   by construction.
 *
 * ## Not wired
 * This module does not read `golf_shots`/`golf_coach_insights`, does not
 * call `ranking/score.ts`, and does not decide what gets delivered to a
 * player or coach. Building the real A2/A3/A4/A5-to-`IssueSourcePacket`
 * adapters and feeding `groupIssues`'s output into `score.ts`/delivery is
 * later-slice work, per this slice's explicit scope.
 */

/** Which upstream family produced a packet. Listed in the fixed priority
 *  order `pickOwner` breaks ties with (par > distance > sequence >
 *  hypothesis) — an arbitrary but deterministic and documented order, not
 *  a claim that one family's evidence is inherently more trustworthy. */
export type IssueOrigin = 'par' | 'distance' | 'sequence' | 'hypothesis';

const ORIGIN_PRIORITY: Record<IssueOrigin, number> = {
  par: 0,
  distance: 1,
  sequence: 2,
  hypothesis: 3,
};

/**
 * One family's finding, normalized into the shape grouping consumes.
 * Built by an adapter for the originating family (A2/A3's `MetricResult`,
 * A5's `Hypothesis`, or a future A4 finding) — this module never
 * reconstructs eligibility or shot membership from a family-specific
 * shape itself.
 */
export interface IssueSourcePacket {
  /** Reused verbatim from the originating family — `metricClaimId(...)`
   *  for a MetricResult-shaped row, a `Hypothesis.id` for a
   *  hypothesis-shaped row. Never regenerated here. */
  claimId: string;
  origin: IssueOrigin;
  /** A short, human-facing description of what this packet claims (a
   *  metricId, or a hypothesis family name) — used only for the child
   *  claim's display, never for identity or grouping. */
  label: string;
  /** `shotClaimId`-shaped strings (`shot:<round_id>:<hole_number>:
   *  <shot_number>` — matches A5 `hypothesis-policy.ts`'s own format so
   *  ids from both modules interoperate without translation; see
   *  `shotClaimId` below) naming the shots this packet's value is
   *  actually about. The sole join key grouping uses. Never inferred —
   *  an adapter that cannot honestly name its source shots should not
   *  produce a packet grouping can safely place, and packets with an
   *  empty list here take no part in any issue. */
  sourceShotIds: string[];
  /** Whether this packet's own evidence is strong enough to found or
   *  join an issue at all, decided by the adapter using its OWN family's
   *  status/state semantics (e.g. a `MetricResult` at `status: 'invalid'`
   *  or a `Hypothesis` at `state: 'no_data'` is not eligible). Filtered
   *  out before grouping — see the module doc comment. */
  eligible: boolean;
  /** An estimated per-round stroke impact, however the adapter derived
   *  it — `null` when the family computes no such number (A3's own file
   *  header: neither of its metric families computes one today). Never
   *  summed across packets describing the same shots; see
   *  `impactOwnership`. */
  strokesImpact: number | null;
  /** ∈ [0, 1] (or `null` when the family has no notion of confidence for
   *  this packet). Mirrored, not combined, onto the issue's `policyInput`
   *  from whichever packet `pickOwner` selects. */
  confidence: number | null;
}

/** A parent issue's view of one of its member packets — every field
 *  needed to drill back down to it, nothing merged away. */
export interface IssueClaim {
  claimId: string;
  origin: IssueOrigin;
  label: string;
  strokesImpact: number | null;
  confidence: number | null;
}

/** Which single claim owns this issue's impact estimate, and which
 *  others were considered but contribute no additional impact — see the
 *  module doc comment's "non-overlapping impact ownership" bullet. */
export interface ImpactOwnership {
  ownerClaimId: string;
  nonOwningClaimIds: string[];
}

/** How much real evidence backs this issue. */
export interface OpportunityFrequency {
  /** Distinct source shots across every member claim, deduplicated. */
  shotCount: number;
  /** Distinct rounds those shots span (parsed from each shot claim id's
   *  own `round_id` segment). */
  distinctRounds: number;
}

/** What a later ranking policy (`ranking/score.ts`-shaped) would actually
 *  consume for this issue — mirrors the impact owner's own numbers, never
 *  an average or sum across every member claim. */
export interface EffectivePolicyInput {
  /** The impact owner's `strokesImpact`, or `0` when the owner (or every
   *  member) carries `null` — never fabricated from a non-owning claim. */
  strokesImpact: number;
  /** The impact owner's `confidence`, or `0` when it carries `null`. */
  confidence: number;
  /** Mirrors `opportunityFrequency.shotCount` — how much evidence backs
   *  the `strokesImpact`/`confidence` figures above. */
  sampleSize: number;
}

export interface Issue {
  /** Stable issue identity — see the module doc comment. */
  id: string;
  /** Deduplicated, sorted union of every member claim's source shots. */
  sourceShotIds: string[];
  /** Parent/child claim links, owner first, then the remaining members
   *  sorted by `claimId` — fully order-independent, never a reflection of
   *  the input packet array's own order. */
  claims: IssueClaim[];
  impactOwnership: ImpactOwnership;
  opportunityFrequency: OpportunityFrequency;
  policyInput: EffectivePolicyInput;
}

/**
 * Matches A5 `hypothesis-policy.ts`'s own `shotClaimId` format exactly
 * (`shot:<round_id>:<hole_number>:<shot_number>`) so ids an A5 caller
 * already has interoperate with this module without translation. Defined
 * locally, not imported, because `hypothesis-policy.ts` (#1993) has not
 * merged to `main` as of this slice — switch to importing it once it
 * does.
 */
export function shotClaimId(shot: {
  round_id: string;
  hole_number: number | null;
  shot_number: number | null;
}): string {
  return `shot:${shot.round_id}:${shot.hole_number ?? 'null'}:${shot.shot_number ?? 'null'}`;
}

/** Recovers the `round_id` segment from a `shotClaimId`-shaped string.
 *  Assumes a shot claim's `round_id` never itself contains a `:` — true
 *  for every round id in use today (a UUID or similar opaque token). */
function roundIdOfShotClaim(shotId: string): string {
  const parts = shotId.split(':');
  return parts[1] ?? shotId;
}

/**
 * Deterministically choose which member packet owns this issue's impact
 * estimate: the largest `|strokesImpact|` wins (a `null` impact sorts
 * last, treated as magnitude `-1` so it never wins over any real number,
 * including `0`); ties break by `ORIGIN_PRIORITY`, then by `claimId` so
 * the choice never depends on input array order. A single deterministic
 * winner is what makes "one underlying issue yields one leading
 * priority" true by construction rather than by convention.
 */
function pickOwner(members: readonly IssueSourcePacket[]): IssueSourcePacket {
  return [...members].sort((a, b) => {
    const am = a.strokesImpact === null ? -1 : Math.abs(a.strokesImpact);
    const bm = b.strokesImpact === null ? -1 : Math.abs(b.strokesImpact);
    if (am !== bm) return bm - am;
    const ap = ORIGIN_PRIORITY[a.origin];
    const bp = ORIGIN_PRIORITY[b.origin];
    if (ap !== bp) return ap - bp;
    return a.claimId.localeCompare(b.claimId);
  })[0]!;
}

function buildIssue(members: readonly IssueSourcePacket[]): Issue {
  const sourceShotIds = Array.from(new Set(members.flatMap((m) => m.sourceShotIds))).sort();
  const id = `issue:${sourceShotIds.join('|')}`;

  const owner = pickOwner(members);
  const nonOwners = members
    .filter((m) => m.claimId !== owner.claimId)
    .slice()
    .sort((a, b) => a.claimId.localeCompare(b.claimId));
  const claims: IssueClaim[] = [owner, ...nonOwners].map((m) => ({
    claimId: m.claimId,
    origin: m.origin,
    label: m.label,
    strokesImpact: m.strokesImpact,
    confidence: m.confidence,
  }));

  const impactOwnership: ImpactOwnership = {
    ownerClaimId: owner.claimId,
    nonOwningClaimIds: nonOwners.map((m) => m.claimId),
  };

  const distinctRounds = new Set(sourceShotIds.map(roundIdOfShotClaim)).size;
  const opportunityFrequency: OpportunityFrequency = {
    shotCount: sourceShotIds.length,
    distinctRounds,
  };

  const policyInput: EffectivePolicyInput = {
    strokesImpact: owner.strokesImpact ?? 0,
    confidence: owner.confidence ?? 0,
    sampleSize: sourceShotIds.length,
  };

  return { id, sourceShotIds, claims, impactOwnership, opportunityFrequency, policyInput };
}

/**
 * Group eligible packets into issues by transitive source-shot overlap
 * (union-find), then resolve each issue's stable identity, parent/child
 * claim links, non-overlapping impact ownership, opportunity frequency,
 * and effective policy input. See the module doc comment for the full
 * contract. Ineligible packets (`eligible: false`) and packets with no
 * source shots at all are dropped before grouping — they found no issue
 * and join none.
 *
 * Deterministic regardless of input order: issues are returned sorted by
 * `id`, and each issue's own fields (claim order, owner, frequency) are
 * themselves order-independent.
 */
export function groupIssues(packets: readonly IssueSourcePacket[]): Issue[] {
  const eligible = packets.filter((p) => p.eligible && p.sourceShotIds.length > 0);

  const parent = eligible.map((_, i) => i);
  function find(i: number): number {
    let root = i;
    while (parent[root] !== root) root = parent[root]!;
    let cur = i;
    while (parent[cur] !== root) {
      const next = parent[cur]!;
      parent[cur] = root;
      cur = next;
    }
    return root;
  }
  function union(a: number, b: number): void {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  }

  const firstPacketForShot = new Map<string, number>();
  eligible.forEach((packet, i) => {
    for (const shotId of packet.sourceShotIds) {
      const seen = firstPacketForShot.get(shotId);
      if (seen === undefined) {
        firstPacketForShot.set(shotId, i);
      } else {
        union(seen, i);
      }
    }
  });

  const groups = new Map<number, number[]>();
  eligible.forEach((_, i) => {
    const root = find(i);
    const list = groups.get(root);
    if (list) list.push(i);
    else groups.set(root, [i]);
  });

  const issues = [...groups.values()].map((indices) => buildIssue(indices.map((i) => eligible[i]!)));
  issues.sort((a, b) => a.id.localeCompare(b.id));
  return issues;
}
