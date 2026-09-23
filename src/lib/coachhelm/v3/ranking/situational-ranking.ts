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
 * The problem this solves: A3's `par-opportunities.ts`, A2's
 * `distance-profile.ts`, A4's `sequence-attribution.ts`, and A5's
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
 * finding (a `MetricResult` row from A2/A3, a `Hypothesis` from A5, or an
 * A4 sequence-attribution finding), each ADAPTED by its own family into
 * this common shape by whatever wires it up (that wiring is NOT this
 * module's job, and is explicitly out of scope for this slice — see the
 * module-level "Not wired" note below). The one field every adapter MUST
 * populate honestly is `sourceShotIds`: the `shotClaimId`-shaped identifiers
 * of the shots this packet's value actually came from. Grouping has no
 * other way to know two packets are "about the same thing" — it never
 * infers overlap from `metricId`, `dimensions`, or label text, only from
 * this explicit, adapter-stated set.
 *
 * `eligible` is decided by the adapter, not recomputed here — a
 * `MetricResult` with `status: 'invalid'`, or a `Hypothesis` at
 * `state: 'no_data'`, is exactly the kind of packet that should never
 * surface or own an issue. But eligibility is applied AFTER grouping, not
 * before: an ineligible packet still participates in union-find, because
 * dropping it first can silently split a chain that runs through it as a
 * bridge (A↔ineligible↔C, where A and C share no shot directly). Grouping
 * uses every packet with at least one source shot, eligible or not; only
 * once each connected group is known does `groupIssues` filter each
 * group down to its eligible members to decide what actually surfaces —
 * the ineligible bridge itself never appears in a `claims` list or
 * contributes a shot to an issue's own `sourceShotIds`, but its shared
 * shots still correctly keep A and C in one issue instead of two. A group
 * with no eligible member at all surfaces no issue.
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
 *   child claim, in owner-first order (or all sorted by `claimId` when
 *   there is no owner — see below), so a consumer can always drill down
 *   from "one issue" back to the individual par/distance/sequence/
 *   hypothesis finding that fed it.
 * - **Non-overlapping impact ownership** (`impactOwnership`): "impact"
 *   here means strokes LOST — an opportunity to fix something, not a
 *   strength to preserve. Only a member whose `strokesImpact` is a real
 *   negative number may own an issue (see `pickOwner` below); a strength
 *   (`strokesImpact > 0`) or an exact `0` never owns, however large its
 *   magnitude, and a group with no loss at all has NO impact owner
 *   (`ownerClaimId: null`). When an owner exists, every other member
 *   remains a listed, visible claim that contributes NO additional
 *   impact — this is what keeps "par, distance, and sequence all
 *   describe the same shots" from tripling the issue's estimated
 *   opportunity: only the single strongest LOSS claim's impact counts.
 * - **Opportunity frequency** (`opportunityFrequency`): how much real
 *   evidence backs the issue — the count of distinct source shots and the
 *   count of distinct rounds they span (parsed from each shot claim's own
 *   `round_id` segment), across every ELIGIBLE member (the union, unlike
 *   `policyInput.sampleSize` below).
 * - **Effective policy inputs** (`policyInput`): the resolved
 *   `strokesImpact`/`confidence`/`sampleSize` a later ranking policy
 *   (`ranking/score.ts`-shaped) would actually consume — mirroring ONLY
 *   the impact owner's own numbers (including the owner's own sample
 *   size, never the union across every member), so the "one leading
 *   priority per issue" acceptance rule holds by construction. All three
 *   fields are `0` when there is no owner.
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
   *  or a `Hypothesis` at `state: 'no_data'` is not eligible). Applied
   *  AFTER grouping, not before — see the module doc comment's "Packets"
   *  section on why an ineligible packet still participates in union-find
   *  as a possible bridge. */
  eligible: boolean;
  /** An estimated per-round stroke impact, however the adapter derived
   *  it — `null` when the family computes no such number (A3's own file
   *  header: neither of its metric families computes one today).
   *  SIGNED: negative means strokes LOST (a weakness/opportunity),
   *  positive means strokes GAINED (a strength). Only a real negative
   *  value can ever own an issue — see `pickOwner`. Never summed across
   *  packets describing the same shots; see `impactOwnership`. */
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
 *  module doc comment's "non-overlapping impact ownership" bullet.
 *  `ownerClaimId` is `null` when no eligible member represents a genuine
 *  stroke loss (every member is a strength, `null`, or exactly `0`) — a
 *  group of pure strengths has no impact owner at all, and every member
 *  is then listed in `nonOwningClaimIds`. */
export interface ImpactOwnership {
  ownerClaimId: string | null;
  nonOwningClaimIds: string[];
}

/** How much real evidence backs this issue, across every ELIGIBLE
 *  member — unlike `EffectivePolicyInput.sampleSize`, this is always the
 *  union, not just the owner's own sample. */
export interface OpportunityFrequency {
  /** Distinct source shots across every eligible member claim,
   *  deduplicated. */
  shotCount: number;
  /** Distinct rounds those shots span (parsed from each shot claim id's
   *  own `round_id` segment). */
  distinctRounds: number;
}

/** What a later ranking policy (`ranking/score.ts`-shaped) would actually
 *  consume for this issue — mirrors ONLY the impact owner's own numbers,
 *  never an average, sum, or union across every member claim. Every
 *  field is `0` when there is no owner (see `ImpactOwnership`). */
export interface EffectivePolicyInput {
  /** The impact owner's `strokesImpact` (always a real negative number
   *  when an owner exists), or `0` when there is no owner — never
   *  fabricated from a non-owning claim. */
  strokesImpact: number;
  /** The impact owner's `confidence`, or `0` when it carries `null` or
   *  there is no owner. */
  confidence: number;
  /** The impact owner's OWN `sourceShotIds.length` — deliberately NOT
   *  `opportunityFrequency.shotCount`. A non-owning claim's much larger
   *  (or smaller) sample must never inflate or dilute the sample size
   *  backing the owner's own number. `0` when there is no owner. */
  sampleSize: number;
}

export interface Issue {
  /** Stable issue identity — see the module doc comment. */
  id: string;
  /** Deduplicated, sorted union of every member claim's source shots. */
  sourceShotIds: string[];
  /** Parent/child claim links: owner first (when one exists), then the
   *  remaining ELIGIBLE members sorted by `claimId` — or, when there is
   *  no owner, every eligible member sorted by `claimId` with none
   *  privileged first. Fully order-independent, never a reflection of
   *  the input packet array's own order. */
  claims: IssueClaim[];
  impactOwnership: ImpactOwnership;
  opportunityFrequency: OpportunityFrequency;
  policyInput: EffectivePolicyInput;
}

/**
 * Matches A5 `hypothesis-policy.ts`'s own `shotClaimId` format for a
 * FULLY-KNOWN shot (`shot:<round_id>:<hole_number>:<shot_number>`) so ids
 * an A5 caller already has interoperate with this module without
 * translation for that case. Defined locally, not imported, because
 * `hypothesis-policy.ts` (#1993) has not merged to `main` as of this
 * slice — switch to importing it once it does.
 *
 * A `null` `hole_number`/`shot_number` is deliberately NOT rendered as the
 * literal string `'null'` (A5's #1993 version still does this and needs
 * the same fix in A5 slice 2 — see repair-plan addendum §13 review notes,
 * 2026-09-23): two different shots that both have an unknown hole/shot
 * number would otherwise stringify identically and silently merge into
 * one issue in `groupIssues`'s union-find. Instead, each null-numbered
 * shot gets its own per-call unique id, so it is grouped with nothing —
 * ungroupable rather than wrongly grouped. This does mean the SAME
 * logical shot, if referenced by two different packets while its
 * hole/shot number is unknown, will not be recognized as the same shot
 * either; that tradeoff is intentional (see the module doc comment on
 * `sourceShotIds`: an adapter that cannot honestly name its source shots
 * should not expect grouping to guess for it).
 */
let unknownShotCounter = 0;
export function shotClaimId(shot: {
  round_id: string;
  hole_number: number | null;
  shot_number: number | null;
}): string {
  if (shot.hole_number === null || shot.shot_number === null) {
    unknownShotCounter += 1;
    return `shot:${shot.round_id}:unknown:${unknownShotCounter}`;
  }
  return `shot:${shot.round_id}:${shot.hole_number}:${shot.shot_number}`;
}

/** Recovers the `round_id` segment from a `shotClaimId`-shaped string.
 *  Assumes a shot claim's `round_id` never itself contains a `:` — true
 *  for every round id in use today (a UUID or similar opaque token). */
function roundIdOfShotClaim(shotId: string): string {
  const parts = shotId.split(':');
  return parts[1] ?? shotId;
}

/** The single sort comparator used everywhere a stable claimId ordering
 *  is needed, so "which order" is answered identically wherever it's
 *  asked (never a second, possibly-inconsistent inline comparator). */
function compareByClaimId(a: { claimId: string }, b: { claimId: string }): number {
  return a.claimId.localeCompare(b.claimId);
}

/**
 * Deterministically choose which member packet owns this issue's impact
 * estimate. Only a genuine STROKES-LOST claim — `strokesImpact` a real
 * number strictly less than `0` — is eligible to own at all: a strength
 * (`strokesImpact > 0`), an exact `0` (no gain, no loss), or `null` (no
 * impact number) can never win ownership, however large its magnitude,
 * because "impact" here specifically means the loss this issue
 * represents an opportunity to fix, not any strong signal in either
 * direction. Among loss candidates, the largest MAGNITUDE of loss (the
 * most negative value) wins; ties break by `ORIGIN_PRIORITY`, then by
 * `claimId` so the choice never depends on input array order. Returns
 * `null` when no member represents a loss — a group of pure strengths
 * (or all-null/all-zero) has no impact owner at all. A single
 * deterministic winner (or a single deterministic absence of one) is
 * what makes "one underlying issue yields one leading priority" true by
 * construction rather than by convention.
 */
function pickOwner(
  members: readonly IssueSourcePacket[],
): (IssueSourcePacket & { strokesImpact: number }) | null {
  const lossCandidates = members.filter(
    (m): m is IssueSourcePacket & { strokesImpact: number } =>
      m.strokesImpact !== null && m.strokesImpact < 0,
  );
  if (lossCandidates.length === 0) return null;

  return [...lossCandidates].sort((a, b) => {
    if (a.strokesImpact !== b.strokesImpact) return a.strokesImpact - b.strokesImpact; // more negative (bigger loss) sorts first
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
  // Filtered by object IDENTITY, never by `claimId` string equality — two
  // distinct packets that happen to share a `claimId` (a data bug
  // upstream) must not both vanish just because one of them was picked as
  // owner. `groupIssues` also rejects a true duplicate claimId outright
  // before this ever runs; this is defense in depth, not the only guard.
  const rest = members.filter((m) => m !== owner).slice().sort(compareByClaimId);
  const claims: IssueClaim[] = (owner ? [owner, ...rest] : rest).map((m) => ({
    claimId: m.claimId,
    origin: m.origin,
    label: m.label,
    strokesImpact: m.strokesImpact,
    confidence: m.confidence,
  }));

  const impactOwnership: ImpactOwnership = {
    ownerClaimId: owner?.claimId ?? null,
    nonOwningClaimIds: rest.map((m) => m.claimId),
  };

  const distinctRounds = new Set(sourceShotIds.map(roundIdOfShotClaim)).size;
  const opportunityFrequency: OpportunityFrequency = {
    shotCount: sourceShotIds.length,
    distinctRounds,
  };

  const policyInput: EffectivePolicyInput = {
    strokesImpact: owner ? owner.strokesImpact : 0,
    confidence: owner ? (owner.confidence ?? 0) : 0,
    // The OWNER's own sample, never the union — see EffectivePolicyInput's
    // doc comment. `opportunityFrequency.shotCount` above is the union.
    sampleSize: owner ? owner.sourceShotIds.length : 0,
  };

  return { id, sourceShotIds, claims, impactOwnership, opportunityFrequency, policyInput };
}

/** Throws if two distinct packets share a `claimId` — `claimId` is
 *  documented as reused verbatim from the originating family and must be
 *  globally unique per packet; silently tolerating a duplicate risks one
 *  of the two packets vanishing from a `claims`/`nonOwningClaimIds` list
 *  (see `buildIssue`'s identity-based filter, which is a second, belated
 *  guard against the same class of bug, not a substitute for rejecting
 *  bad input up front). */
function assertUniqueClaimIds(packets: readonly IssueSourcePacket[]): void {
  const seen = new Set<string>();
  for (const p of packets) {
    if (seen.has(p.claimId)) {
      throw new Error(`groupIssues: duplicate claimId "${p.claimId}" — claimId must be unique per packet`);
    }
    seen.add(p.claimId);
  }
}

/**
 * Group packets into issues by transitive source-shot overlap
 * (union-find) — using EVERY packet with at least one source shot,
 * eligible or not, so an ineligible packet can still act as a bridge
 * between two eligible ones (see the module doc comment's "Packets"
 * section). Only after grouping does each connected group get filtered
 * down to its eligible members; a group with no eligible member at all
 * surfaces no issue. Then resolve each surfaced issue's stable identity,
 * parent/child claim links, non-overlapping impact ownership, opportunity
 * frequency, and effective policy input. See the module doc comment for
 * the full contract.
 *
 * Deterministic regardless of input order: issues are returned sorted by
 * `id`, and each issue's own fields (claim order, owner, frequency) are
 * themselves order-independent.
 *
 * Throws if two distinct input packets share a `claimId` — see
 * `assertUniqueClaimIds`.
 */
export function groupIssues(packets: readonly IssueSourcePacket[]): Issue[] {
  assertUniqueClaimIds(packets);

  const withShots = packets.filter((p) => p.sourceShotIds.length > 0);

  const parent = withShots.map((_, i) => i);
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
  withShots.forEach((packet, i) => {
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
  withShots.forEach((_, i) => {
    const root = find(i);
    const list = groups.get(root);
    if (list) list.push(i);
    else groups.set(root, [i]);
  });

  const issues: Issue[] = [];
  for (const indices of groups.values()) {
    const eligibleMembers = indices.map((i) => withShots[i]!).filter((p) => p.eligible);
    if (eligibleMembers.length === 0) continue; // the whole group is hidden — an ineligible bridge alone founds nothing
    issues.push(buildIssue(eligibleMembers));
  }
  issues.sort((a, b) => a.id.localeCompare(b.id));
  return issues;
}
