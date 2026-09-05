/**
 * Joining a repair pull request back to the incident it repairs.
 *
 * WHY THIS IS NOT OBVIOUS. The repair half of the self-healing loop runs on
 * the owner's laptop and its only durable output is a pull request on GitHub.
 * Nothing writes a row anywhere linking that PR to the fingerprint it fixes —
 * so from the Bridge's side, "is anyone working on this incident?" has no
 * answer at all, and an operator re-triages work that is already sitting in a
 * branch. That gap is the whole reason "REPAIRABLE with no repair attempt"
 * could not previously be distinguished from "REPAIRABLE, PR #1660 open".
 *
 * The join has to be derived from what the repair contract already mandates,
 * because inventing a new storage location for it would be a second authority
 * that can disagree with GitHub. `docs/ai-system/selfheal/repair-contract.md`
 * requires two things on every repair PR, and both carry the fingerprint:
 *
 *   STEP 5  the body links to `/admin/errors/<fingerprint>`  — REQUIRED, and
 *           the only join new Repair work must carry
 *   STEP 4  the branch is `fix/rca-<fp>`  — HISTORICAL ONLY. The one supported
 *           worktree creator produces `agent/<task>`, so this form cannot be
 *           produced any more; parsing stays so old PRs keep resolving.
 *
 * Both are scanned, because only one of them is reliably available. The Bridge
 * reads PRs through GitHub's SEARCH endpoint (see `fetchPullRequests`), which
 * returns the body but NOT `head.ref`; the list-pulls fallback returns the
 * ref. Matching on either means the join survives whichever path served the
 * request, instead of working in development and silently returning nothing in
 * production.
 *
 * Deliberately pure and deliberately dumb: it extracts candidate tokens and
 * says nothing about whether they name a real incident. The caller intersects
 * with the incidents it actually has, so a stale link in an old PR body cannot
 * conjure an incident that does not exist.
 */

/**
 * Fingerprints are written by `buildIncidentSignature` as 8 hex characters,
 * but reliability-origin analyses are stored under `rel:<signature>` and
 * historical rows carry `row:<uuid>`. The pattern therefore accepts an
 * optional known prefix plus a hex/uuid-ish token rather than a bare
 * `[0-9a-f]{8}`, so a `rel:` repair is not silently unlinkable.
 *
 * The prefix alternation carries the PERCENT-ENCODED colon too. That is not
 * belt-and-braces: `encodeURIComponent` is what builds the Bridge link, so
 * `rel%3Af321abcd` is the spelling a PR body pasted from a browser address bar
 * actually contains — and decoding after the match cannot help if the match
 * never happens. Caught by a test that expected the encoded and plain forms to
 * produce the same id and got `[]` from the encoded one; the failure would
 * have looked exactly like "no repair exists" for every reliability-origin
 * repair, which is the answer this module exists to stop guessing at.
 *
 * `sentry:<issueId>` is the THIRD key kind and needs its own branch, because
 * a Sentry issue id (`JAVASCRIPT-NEXTJS-QZ`) is not hex — widening the hex
 * body to admit letters would let `/admin/errors/` run on into whatever prose
 * followed it. It is also the kind that can least afford to be missed:
 * `UnifiedIncident` (./types) picks it LAST, exactly when there is no
 * `admin_events` fingerprint and no `rel:<signature>` available, so an
 * incident keyed this way has no alternative id a PR body could cite instead.
 * Repeat of the `rel%3A` failure above, found the same way — a repair PR for
 * `sentry:JAVASCRIPT-NEXTJS-QZ` extracted `[]`, so the Bridge would have read
 * a merged, green, correctly-linked fix as "no repair exists" and left the
 * incident REPAIRABLE for an operator to re-triage.
 */
/** `sentry:<issueId>` — not hex, so its body is letters/digits/dashes and is
 *  bounded by the end of the path segment. */
const SENTRY_TOKEN = String.raw`(?:sentry:|sentry%3[Aa])[A-Za-z0-9][A-Za-z0-9-]{0,63}`;
/** An `admin_events` fingerprint, or a `rel:`/`row:`-prefixed one. */
const HEX_TOKEN = String.raw`(?:rel:|row:|rel%3[Aa]|row%3[Aa])?[0-9a-fA-F][0-9a-fA-F-]{5,63}`;
// Sentry first: its prefix is unambiguous, and trying it before the hex
// branch stops `sentry:` being skipped in favour of a hex-looking substring
// further along the same link.
const TOKEN = String.raw`(${SENTRY_TOKEN}|${HEX_TOKEN})`;

/** `/admin/errors/<fp>` — the link the repair contract's STEP 5 requires. */
const BRIDGE_LINK = new RegExp(String.raw`/admin/errors/${TOKEN}`, 'g');

/** `fix/rca-<fp>` — the branch name STEP 4 requires. */
const REPAIR_BRANCH = new RegExp(String.raw`fix/rca-${TOKEN}`, 'g');

/**
 * Every incident id a piece of PR text claims to repair, deduped, in first-seen
 * order.
 *
 * URL-encoded colons are decoded because `encodeURIComponent` is what builds
 * the Bridge link (`rel%3Aabc123`), and a PR body pasted from a browser address
 * bar carries the encoded form. Failing to decode would silently un-link every
 * reliability-origin repair — the failure would look exactly like "no repair
 * exists", which is the answer this module exists to stop guessing at.
 */
export function extractRepairIncidentIds(text: string | null | undefined): string[] {
  if (!text) return [];
  const found: string[] = [];
  const seen = new Set<string>();

  for (const pattern of [BRIDGE_LINK, REPAIR_BRANCH]) {
    // A `g` regex carries mutable `lastIndex`; these are module-level
    // constants, so reset before each use or the second call on the same
    // pattern starts mid-string and quietly finds nothing.
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      const raw = match[1];
      if (!raw) continue;
      const id = decodeURIComponent(raw).replace(/[.,;:)\]]+$/, '').toLowerCase();
      if (id.length === 0 || seen.has(id)) continue;
      seen.add(id);
      found.push(id);
    }
  }

  return found;
}

/**
 * Whether a PR's own text claims its reading of the analysis CONFIRMED or
 * CORRECTED the diagnosis.
 *
 * STEP 5 of the repair contract requires the PR to state this explicitly, and
 * it is the only empirical feedback the Diagnose contract ever receives — a
 * `corrected` verdict is the single most useful quality signal the loop
 * produces, and it was previously visible only to someone reading PR prose.
 *
 * Reads the sentence rather than guessing at it: anything that does not make
 * one of the two claims in its own words is `'not-reviewed'`, never a default
 * to `'confirmed'`. Presenting an unreviewed analysis as confirmed would
 * manufacture agreement that nobody expressed.
 */
export function extractRepairVerdict(text: string | null | undefined): 'confirmed' | 'corrected' | 'not-reviewed' {
  if (!text) return 'not-reviewed';
  const normalized = text.toLowerCase();
  // Corrected wins a tie. A PR that says "the analysis was confirmed in part
  // and corrected on the root cause" has corrected it, and the weaker reading
  // is the one that loses information.
  if (/\bcorrect(?:ed|s|ion)\b/.test(normalized) && /\banalys[ie]s|\brca\b|diagnos/.test(normalized)) {
    return 'corrected';
  }
  if (/\bconfirm(?:ed|s)\b/.test(normalized) && /\banalys[ie]s|\brca\b|diagnos|cause/.test(normalized)) {
    return 'confirmed';
  }
  return 'not-reviewed';
}
