// =============================================================================
// Joining a repair PR back to the incident it repairs — and reading whether
// the repair agrees with the analysis it acted on.
//
// WHY THIS SUITE EXISTS. Nothing writes a row anywhere linking a repair PR to
// the fingerprint it fixes; the repair contract's STEP 4/STEP 5 mandates are
// the only durable trace, and this module's whole job is to recover a join
// from PR text without a second stored authority that can disagree with
// GitHub. A regex silently failing to match here does not look like a test
// failure — it looks exactly like "no repair exists", so this suite is
// written against realistic PR bodies and branch names, not toy strings.
// =============================================================================

import { describe, it, expect } from 'vitest';
import { extractRepairIncidentIds, extractRepairVerdict } from '@/lib/admin/incidents/repair-link';

/** A realistic repair PR body shaped like the repair contract's STEP 5
 * template: fingerprint, the mandated /admin/errors/<fingerprint> link, the
 * probable cause, and a verdict sentence. */
function realisticRepairBody(fingerprint = 'a8d31b09'): string {
  return `## Repair for ${fingerprint}

**Incident:** https://helmsports.app/admin/errors/${fingerprint}
**24h occurrences:** 37

The analysis said the save action was missing an auth check before the
insert. My reading confirmed the analysis — the same code path is missing
\`supabase.auth.getUser()\`.

**Gates:**
- typecheck: 0
- lint: 0
- build: 0
`;
}

describe('extractRepairIncidentIds — recovering the join from PR text', () => {
  it('extracts the fingerprint from the mandated /admin/errors/<fingerprint> link', () => {
    const ids = extractRepairIncidentIds(realisticRepairBody('a8d31b09'));
    expect(ids).toContain('a8d31b09');
  });

  it('extracts the fingerprint from a fix/rca-<fp> branch reference', () => {
    const ids = extractRepairIncidentIds('Branch: fix/rca-a8d31b09, opened against main.');
    expect(ids).toEqual(['a8d31b09']);
  });

  it('decodes a rel:-prefixed id from the plain form', () => {
    // Reliability-origin analyses are stored under `rel:<signature>`, so the
    // id here is legitimately "rel:f321abcd" — the prefix is part of the
    // identity, not noise to strip.
    const ids = extractRepairIncidentIds('See /admin/errors/rel:f321abcd for detail.');
    expect(ids).toEqual(['rel:f321abcd']);
  });

  it('decodes a rel:-prefixed id from the URL-encoded form to the same id as the plain form', () => {
    // The encoded form (rel%3Af321abcd) is exactly what a browser address
    // bar yields when a colon-bearing path segment is copied out — encodeURI
    // Component is what BUILDS the Bridge link in the first place. Failing
    // to decode it would silently un-link every reliability-origin repair, a
    // failure indistinguishable from "no repair exists" at every call site
    // that reads this function's result.
    //
    // MODULE DEFECT, not a test bug: this currently fails. TOKEN's optional
    // prefix (repair-link.ts:40, `(?:rel:|row:)?`) matches only the literal
    // strings "rel:" / "row:", and the character class that follows it
    // accepts only hex digits and dashes — neither branch matches a literal
    // "%3A". For input containing "rel%3Af321abcd", BRIDGE_LINK never
    // matches at all: matchAll returns no match, `raw` is never captured, and
    // decodeURIComponent (repair-link.ts:71) never runs, because it only
    // decodes a substring that was already captured. Verified empirically:
    // `extractRepairIncidentIds('/admin/errors/rel%3Af321abcd')` returns
    // `[]`, not `['rel:f321abcd']`. Fix is either to widen TOKEN's prefix
    // alternation to also match the percent-encoded colon, or to run a
    // percent-decode pass over the whole input text before matching, since a
    // PR body has no other legitimate source of percent-encoding.
    const plain = extractRepairIncidentIds('/admin/errors/rel:f321abcd');
    const encoded = extractRepairIncidentIds('/admin/errors/rel%3Af321abcd');
    expect(encoded).toEqual(plain);
  });

  it('extracts a sentry:-prefixed id, in both the plain and URL-encoded forms', () => {
    // `sentry:<issueId>` is the THIRD incident key kind, minted at
    // src/lib/admin/data/triage.ts and named alongside the other two in
    // `MergeCandidateFacts.canonicalFingerprint` (aliases.ts) and
    // `UnifiedIncident` (types.ts). It is the LAST-RESORT identity — used
    // exactly when there is no `admin_events` fingerprint and no
    // `rel:<signature>` to fall back to — so an incident keyed this way has
    // no other id a PR body could cite instead.
    //
    // Two things make it unmatchable by the rel:/row: machinery: the prefix
    // is not in the alternation, and a Sentry issue id (JAVASCRIPT-NEXTJS-QZ)
    // is not hex, so the token body rejects it as well. The consequence is
    // the one this suite's header names: `/admin/errors/sentry:...` in a
    // repair PR yields `[]`, the Bridge reads it as "no repair exists", and
    // the incident stays REPAIRABLE with a merged fix sitting against it.
    const plain = extractRepairIncidentIds('/admin/errors/sentry:JAVASCRIPT-NEXTJS-QZ');
    expect(plain).toEqual(['sentry:javascript-nextjs-qz']);
    const encoded = extractRepairIncidentIds('/admin/errors/sentry%3AJAVASCRIPT-NEXTJS-QZ');
    expect(encoded).toEqual(plain);
  });

  it('does not let the widened prefix swallow ordinary prose after a link', () => {
    // The token body for a sentry id has to accept letters, which the hex
    // branch does not. Kept narrow deliberately: it must not run past the
    // path segment and eat the sentence that follows.
    const ids = extractRepairIncidentIds('/admin/errors/sentry:JAVASCRIPT-NEXTJS-QZ and the gates were green.');
    expect(ids).toEqual(['sentry:javascript-nextjs-qz']);
  });

  it('dedupes when the same id appears as both a link and a branch in one body', () => {
    const ids = extractRepairIncidentIds(realisticRepairBody('a8d31b09') + '\nBranch: fix/rca-a8d31b09');
    expect(ids.filter((id) => id === 'a8d31b09')).toHaveLength(1);
  });

  it('returns [] for null, undefined, empty string, and a body with no fingerprint', () => {
    expect(extractRepairIncidentIds(null)).toEqual([]);
    expect(extractRepairIncidentIds(undefined)).toEqual([]);
    expect(extractRepairIncidentIds('')).toEqual([]);
    expect(extractRepairIncidentIds('This PR tidies up some comments, nothing fingerprint-shaped here.')).toEqual([]);
  });

  it('strips trailing punctuation picked up from prose', () => {
    expect(extractRepairIncidentIds('See /admin/errors/a8d31b09).')).toEqual(['a8d31b09']);
  });

  it('lowercases the id', () => {
    expect(extractRepairIncidentIds('/admin/errors/A8D31B09')).toEqual(['a8d31b09']);
  });

  it('is stable across repeated calls on the same input', () => {
    // THE important one. BRIDGE_LINK and REPAIR_BRANCH are module-level `g`
    // regexes, and a `g` regex carries mutable `lastIndex` between calls. The
    // function resets `lastIndex = 0` before each use precisely because these
    // are shared, longer-lived instances rather than one-off literals — if
    // that reset line is ever removed, the second call on the same text
    // starts scanning from wherever the first call's match left off and
    // quietly returns fewer (or zero) ids, even though nothing about the
    // input changed.
    const body = realisticRepairBody('a8d31b09') + '\nBranch: fix/rca-a8d31b09';
    const first = extractRepairIncidentIds(body);
    const second = extractRepairIncidentIds(body);
    const third = extractRepairIncidentIds(body);
    expect(second).toEqual(first);
    expect(third).toEqual(first);
  });
});

describe('extractRepairVerdict — reading whether repair agreed with the analysis', () => {
  it('reads "my reading confirmed the analysis" as confirmed', () => {
    expect(extractRepairVerdict('My reading confirmed the analysis end to end.')).toBe('confirmed');
  });

  it('reads "the analysis was corrected: the real cause is..." as corrected', () => {
    expect(
      extractRepairVerdict('The analysis was corrected: the real cause is a missing auth check, not a race.'),
    ).toBe('corrected');
  });

  it('returns corrected when a body contains both words — corrected wins the weaker reading', () => {
    // The corrected reading carries strictly more information than the
    // confirmed one (it says something was WRONG, not just endorsed), so a
    // body that makes both claims has, on net, corrected the analysis.
    const body = 'The analysis was confirmed in part and corrected on the root cause.';
    expect(extractRepairVerdict(body)).toBe('corrected');
  });

  it('returns not-reviewed when "confirmed" appears with nothing about the analysis, RCA, or cause', () => {
    // It has to read the sentence, not pattern-match a single word. "The
    // ticket was confirmed by the on-call engineer" says nothing about
    // whether the RCA held up.
    expect(extractRepairVerdict('The ticket was confirmed by the on-call engineer this morning.')).toBe(
      'not-reviewed',
    );
  });

  it('returns not-reviewed for null and empty text', () => {
    // Defaulting an unreviewed analysis to 'confirmed' would manufacture
    // agreement nobody actually expressed — the same unknown-is-not-healthy
    // rule the rest of the incident model enforces.
    expect(extractRepairVerdict(null)).toBe('not-reviewed');
    expect(extractRepairVerdict('')).toBe('not-reviewed');
  });
});
