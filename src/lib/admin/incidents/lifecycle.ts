/**
 * Where an incident sits on the road from "seen" to "proven fixed" —
 * derived, not stored.
 *
 * WHY A SEPARATE MODULE. `types.ts` already states the invariant:
 * `lifecycleState` is a function of evidence that changes underneath it, and
 * persisting it would let a stale string outrank live evidence. This is that
 * function. It is PURE — no I/O, no `server-only`, no `Date.now()` anywhere
 * in it — because it has to run identically wherever an incident is rendered:
 * a server component building the Incidents tab, a cron computing lens
 * counts, and a unit test, all reading the same evidence and reaching the
 * same verdict. `now` is threaded in explicitly for exactly that reason —
 * see `summarizeLoop` in `selfheal-registry.ts` for the same discipline
 * applied to the self-healing loop's own status.
 *
 * TWO RULES THIS FILE ENFORCES, BOTH LEARNED THE HARD WAY ELSEWHERE IN THIS
 * PACKAGE:
 *
 *   1. WORST WINS. `deriveLifecycle` evaluates a fixed, ordered list of
 *      checks and returns on the FIRST match — never an average, never a
 *      "most recent event" heuristic. `summarizeLoop` uses the same
 *      first-match-over-a-severity-order shape for the self-healing loop as
 *      a whole, for the same reason: a system is only as healthy as its
 *      worst component, and averaging hides exactly the thing an operator
 *      needs to see.
 *
 *   2. A READ THAT FAILED IS NOT EVIDENCE OF ANYTHING. `repair.status ===
 *      'unknown'`, `deployProof.servesFix === null`, and `hasBlindSource`
 *      are all "we could not tell", and none of them may ever collapse into
 *      a healthy-looking state. `rca-category.ts` states the same rule for
 *      `isAutoResolvable` (an unrecognised category cannot auto-close), and
 *      `incident-classification.ts` states it for `matched` (an unmatched
 *      row cannot be auto-archived). Here it shows up as `'merged'` staying
 *      `'merged'` — not `'resolved'`, not `'awaiting-deploy'` — when deploy
 *      evidence is unreadable, and as the dedicated `'unknown'` state when a
 *      source went blind and nothing else explains the incident.
 *
 * Every branch below also has to answer "why am I seeing this?" without a
 * trip to this source file — that is what `because` is for. It is not a
 * debug log; it is the disclosure an operator reads on the card.
 */

import type {
  IncidentLifecycleState,
  LifecycleVerdict,
  LifecycleReasonLine,
  IncidentAnalysis,
  IncidentRepair,
  IncidentDeployProof,
  IncidentResolution,
} from '@/lib/admin/incidents/types';
import { isRepairCandidate, RCA_CATEGORY_LABEL } from '@/lib/admin/rca-category';
import type { IncidentClass } from '@/lib/admin/incident-classification';
import { INCIDENT_CLASS_LABEL } from '@/lib/admin/incident-classification';

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export interface LifecycleInput {
  firstSeen: string;
  lastSeen: string;
  analysis: IncidentAnalysis | null;
  repair: IncidentRepair | null;
  deployProof: IncidentDeployProof | null;
  resolution: IncidentResolution | null;
  /** A prior HUMAN resolution exists and the fault fired again after it. */
  regressed: boolean;
  actionable: boolean;
  klass: IncidentClass;
  /** Any source contributing to this incident could not be read this refresh. */
  hasBlindSource: boolean;
  now: number;
}

// ---------------------------------------------------------------------------
// Duration formatting — headlines say "6 days ago", never a raw ISO string
// or a percentage.
// ---------------------------------------------------------------------------

/** Clamped to zero: a `now` that lands before an evidence timestamp (clock
 *  skew between the reader and the writer) must never render as "in the
 *  future" on an operator's card. */
function formatDuration(ms: number): string {
  const clamped = Math.max(0, ms);
  const minutes = Math.round(clamped / 60_000);
  if (minutes < 1) return 'moments';
  if (minutes === 1) return '1 minute';
  if (minutes < 60) return `${minutes} minutes`;
  const hours = Math.round(clamped / 3_600_000);
  if (hours === 1) return '1 hour';
  if (hours < 24) return `${hours} hours`;
  const days = Math.round(clamped / 86_400_000);
  if (days === 1) return '1 day';
  return `${days} days`;
}

/** How long ago an ISO timestamp was, relative to the injected clock — no
 *  trailing "ago", callers compose that where it reads naturally. */
function since(iso: string, now: number): string {
  return formatDuration(now - Date.parse(iso));
}

// ---------------------------------------------------------------------------
// Diagnose grace window
// ---------------------------------------------------------------------------

/**
 * How long a freshly observed incident is called `'new'` before it is called
 * `'diagnosing'` instead, when no analysis exists yet.
 *
 * Diagnose runs once every 24 hours (`SELFHEAL_STAGES[0].cadenceMinutes` in
 * `selfheal-registry.ts` — `DAILY = 24 * 60`). An incident with no analysis
 * is either one Diagnose has not reached yet, or one it should have reached
 * by now and has not. Those read identically from the evidence — "no
 * analysis" — but mean different things to an operator, and the only signal
 * available to tell them apart is age against Diagnose's own cadence.
 *
 * Set to exactly one Diagnose cycle. An incident first seen 20 minutes ago
 * has not had a CHANCE to be analysed — calling it `'new'` is not a gap,
 * it is simply true, and calling it `'diagnosing'` this early would promise
 * something is already in flight when nothing is. An incident that has
 * survived a full cycle with no analysis has — calling it `'diagnosing'`
 * past this point says "expect an analysis soon", which is the honest
 * reading once at least one run has had the chance to produce one. The two
 * states differ only in what the operator should expect to happen next, not
 * in any stronger claim about what Diagnose is doing right now.
 */
export const DIAGNOSING_GRACE_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Small builders
// ---------------------------------------------------------------------------

function met(text: string): LifecycleReasonLine {
  return { status: 'met', text };
}
function pending(text: string): LifecycleReasonLine {
  return { status: 'pending', text };
}
function failed(text: string): LifecycleReasonLine {
  return { status: 'failed', text };
}

function verdict(
  state: IncidentLifecycleState,
  headline: string,
  because: LifecycleReasonLine[],
): LifecycleVerdict {
  return { state, headline, because };
}

// ---------------------------------------------------------------------------
// Derivation
// ---------------------------------------------------------------------------

/**
 * Derive one incident's lifecycle state from its evidence.
 *
 * ORDERED CHECKS, FIRST MATCH WINS. The order is the precedence, not an
 * implementation detail: a regression outranks an existing resolution
 * because a fault coming back after being fixed is the single most valuable
 * signal this system produces, and it must never be shadowed by a stale
 * `resolution` row nobody has retracted yet.
 */
export function deriveLifecycle(input: LifecycleInput): LifecycleVerdict {
  const { analysis, repair, deployProof, resolution, now } = input;

  // 1. A fault that came back after being fixed outranks everything below,
  //    including an existing resolution — see the module doc. EXCEPT: when
  //    the latest RCA analysis for this fingerprint already found
  //    `not-a-defect`, recurring is expected noise, not a real regression —
  //    catalogued defect (e). An analysis that hasn't seen the recurrence
  //    yet still says whatever it said last, which is exactly the point:
  //    it already explained why this fires, so firing again is not new
  //    information.
  if (input.regressed) {
    if (analysis?.category === 'not-a-defect') {
      const because: LifecycleReasonLine[] = [
        resolution
          ? met(`Resolved ${since(resolution.resolvedAt, now)} ago (${resolution.resolvedBy}).`)
          : met('A prior human resolution exists for this fault.'),
        met(`Analysis (${since(analysis.generatedAt, now)} ago) already found this is NOT A DEFECT.`),
        pending(`Observed again ${since(input.lastSeen, now)} ago — expected noise, not a regression.`),
      ];
      return verdict(
        'expected-recurrence',
        `Recurred ${since(input.lastSeen, now)} ago — analysis already found this is not a defect.`,
        because,
      );
    }

    const because: LifecycleReasonLine[] = resolution
      ? [
          met(
            `Resolved ${since(resolution.resolvedAt, now)} ago (${resolution.resolvedBy}).`,
          ),
          failed(`Observed again ${since(input.lastSeen, now)} ago — this is a regression, not a new incident.`),
        ]
      : [
          met('A prior human resolution exists for this fault.'),
          failed(`Observed again ${since(input.lastSeen, now)} ago — this is a regression, not a new incident.`),
        ];
    const headline = resolution
      ? `Fixed ${since(resolution.resolvedAt, now)} ago, returned ${since(input.lastSeen, now)} ago.`
      : `Returned ${since(input.lastSeen, now)} ago after being marked resolved.`;
    return verdict('regressed', headline, because);
  }

  // 2. A resolution stands, and nothing has contradicted it.
  if (resolution !== null) {
    return verdict(
      'resolved',
      `Resolved ${since(resolution.resolvedAt, now)} ago${resolution.resolvedBy === 'auto' ? ', confirmed by production evidence' : ' by a human'}.`,
      [
        met(`Resolution recorded ${since(resolution.resolvedAt, now)} ago (${resolution.resolvedBy}).`),
        met('Not observed again since — this is not a regression.'),
      ],
    );
  }

  // 3. The classifier says this is expected control flow, not a defect —
  //    independent of anything Diagnose or Repair has done with it.
  if (!input.actionable) {
    return verdict(
      'not-a-defect',
      `${INCIDENT_CLASS_LABEL[input.klass]} — not treated as a defect.`,
      [
        met(`Classified as ${INCIDENT_CLASS_LABEL[input.klass]}.`),
        met('The classifier marked this non-actionable, independent of any repair activity.'),
      ],
    );
  }

  // 4. Repair opened a PR and CI failed it.
  if (repair?.status === 'pr-failed') {
    const because: LifecycleReasonLine[] = [met('Repair opened a pull request for this fault.')];
    because.push(
      failed(
        repair.prNumber
          ? `CI failed on the repair PR (#${repair.prNumber}).`
          : 'CI failed on the repair PR.',
      ),
    );
    if (repair.checks) {
      because.push(
        pending(`Checks: ${repair.checks.passed} passed, ${repair.checks.failed} failed, ${repair.checks.pending} pending.`),
      );
    }
    return verdict('pr-failed', 'Repair opened a PR, and CI failed it.', because);
  }

  // 5. Repair merged — whether that fix is proven live is a separate
  //    question, answered entirely from deployProof.
  if (repair?.status === 'merged') {
    const mergedLine = met(
      `Repair PR merged${repair.mergedAt ? ` ${since(repair.mergedAt, now)} ago` : ''}${repair.prNumber ? ` (#${repair.prNumber})` : ''}.`,
    );

    // 5d. Deploy evidence is unreadable. This must render as `'merged'`,
    //     never as `'resolved'` or `'awaiting-deploy'` — collapsing an
    //     unread source into either is the `unknown → healthy` (or
    //     `unknown → stalled`) move this file exists to refuse.
    if (deployProof === null || deployProof.servesFix === null) {
      return verdict('merged', 'Merged — whether production serves the fix is unknown.', [
        mergedLine,
        pending('Deploy evidence could not be read — this is unknown, not confirmed either way.'),
      ]);
    }

    if (deployProof.servesFix === true) {
      // 5a. Live and proven.
      if (deployProof.sufficientProof === true) {
        return verdict('resolved', 'Deployed and confirmed — production traffic shows the fix holding.', [
          mergedLine,
          met('Production serves the fix.'),
          met('Enough post-deploy evidence exists to call this proven.'),
        ]);
      }
      // 5b. Live, not yet proven.
      return verdict('awaiting-proof', 'Deployed — waiting for post-deploy traffic to prove it.', [
        mergedLine,
        met('Production serves the fix.'),
        pending(deployProof.gap ?? 'Not enough post-deploy traffic yet to call this proven.'),
      ]);
    }

    // 5c. Merged, not live.
    return verdict('awaiting-deploy', 'Merged, but production does not serve the fix yet.', [
      mergedLine,
      failed('Production does not yet serve the fix — not deployed, or the deploy has not propagated.'),
    ]);
  }

  // 6. Repair opened a PR that has not merged.
  if (repair?.status === 'pr-open') {
    return verdict(
      'pr-open',
      'Repair opened a PR — awaiting review or merge.',
      [
        met(`Repair opened pull request${repair.prNumber ? ` #${repair.prNumber}` : ''}.`),
        pending('Not yet merged.'),
      ],
    );
  }

  // 7. Repair is actively working this incident.
  if (repair?.status === 'running') {
    return verdict('repairing', 'Repair is working on this now.', [
      pending('Repair has picked this up and is running.'),
    ]);
  }

  // 8. The repair lookup itself failed. Only meaningful once an analysis
  //    exists to repair — say so, and blame the failed read, not the
  //    incident: `.status === 'unknown'` means "we could not tell", not
  //    "there is no repair".
  if (repair?.status === 'unknown' && analysis !== null) {
    return verdict('diagnosing', 'Analysis exists, but the repair lookup failed.', [
      met('An analysis exists for this fault.'),
      failed('The repair lookup failed this refresh — this state is limited by a failed read, not by the incident.'),
    ]);
  }

  // 9. No repair state took precedence — fall back to what Diagnose found.
  if (analysis !== null) {
    if (analysis.category === 'needs-more-evidence') {
      return verdict('needs-evidence', 'Analysis says it needs more evidence before it can proceed.', [
        met('An analysis exists.'),
        pending('The analysis could not safely conclude — it needs more evidence.'),
      ]);
    }
    if (analysis.category === 'not-a-defect') {
      return verdict('not-a-defect', 'Analysis concluded this is not a defect.', [
        met('An analysis exists.'),
        met('The analysis concluded this is not a defect.'),
      ]);
    }
    if (analysis.category === 'already-fixed') {
      return verdict('awaiting-proof', 'Analysis says this is already fixed — the proof it stopped is not in yet.', [
        met('An analysis exists and claims this is already fixed.'),
        pending('No deploy proof yet confirms the claim.'),
      ]);
    }
    if (isRepairCandidate(analysis.category)) {
      return verdict('repairable', 'Analysis found a fix — Repair has not opened a PR yet.', [
        met('An analysis exists.'),
        met(`Category: ${RCA_CATEGORY_LABEL[analysis.category]}.`),
        pending('Repair has not opened a PR for it yet.'),
      ]);
    }
    // Every RcaCategory is one of the four branches above — this is
    // unreachable, but TypeScript cannot prove that from a string union
    // without a fallthrough, so name the state honestly if it ever fires.
    return verdict('unknown', 'Analysis exists but carries an unrecognised category.', [
      met('An analysis exists.'),
      failed(`Category "${analysis.category}" is not one this derivation recognises.`),
    ]);
  }

  // 9b. No analysis yet — but Diagnose has not had a chance to produce one.
  //     See DIAGNOSING_GRACE_MS for why the cutoff is where it is.
  const ageMs = now - Date.parse(input.firstSeen);
  if (ageMs < DIAGNOSING_GRACE_MS) {
    return verdict('diagnosing', 'Seen recently — Diagnose has not had a chance to analyse it yet.', [
      pending(`First seen ${since(input.firstSeen, now)} ago, inside Diagnose's daily cycle.`),
      pending('No analysis yet, but one is expected once that cycle completes.'),
    ]);
  }

  // 10. A source is blind and nothing above explains this incident. A read
  //     that failed is not evidence of anything — this must never render as
  //     `'new'`, which would claim the picture is simply empty rather than
  //     incomplete.
  if (input.hasBlindSource) {
    return verdict('unknown', "A source could not be read — this incident's state is unknown.", [
      failed('A source contributing to this incident could not be read this refresh.'),
      pending('A failed read is not evidence of anything — this is unknown, not new or resolved.'),
    ]);
  }

  // 11. Every source read cleanly, Diagnose has had its chance and produced
  //     nothing, there is no repair activity, and nothing above matched.
  return verdict('new', 'New — not yet analysed.', [
    pending(`First seen ${since(input.firstSeen, now)} ago.`),
    pending('No analysis, repair, or resolution yet.'),
  ]);
}

// ---------------------------------------------------------------------------
// Attention ranking
// ---------------------------------------------------------------------------

/**
 * The states an operator should see under "Needs your eyes".
 *
 * Deliberately narrow. Everything else in the lifecycle is either the
 * self-healing loop doing its job unattended (`diagnosing`, `repairing`,
 * `pr-open`, `merged`, `awaiting-deploy`, `awaiting-proof`), a fault too
 * young to have been looked at (`new`), or a closed outcome that needs no
 * further action (`resolved`, `not-a-defect`). These five are the ones where
 * either automation has found something a human has to judge (`repairable`,
 * `needs-evidence`), automation has failed outright (`pr-failed`), the
 * picture is incomplete rather than merely in-progress (`unknown`), or the
 * single highest-value signal in the whole system just fired (`regressed`).
 */
const NEEDS_ATTENTION_STATES: ReadonlySet<IncidentLifecycleState> = new Set([
  'regressed',
  'pr-failed',
  'unknown',
  'needs-evidence',
  'repairable',
]);

/** True when `state` should appear in "Needs your eyes". */
export function needsAttention(state: IncidentLifecycleState): boolean {
  return NEEDS_ATTENTION_STATES.has(state);
}

/**
 * Every lifecycle state, ranked worst-first, so a list can be sorted by "how
 * much does this need me".
 *
 * The five `needsAttention` states lead, themselves ordered by how much
 * confidence has already been lost: `regressed` (a fix was proven and then
 * un-proven itself) and `pr-failed` (automation actively broke) outrank
 * `unknown` (automation simply cannot see), which outranks the two states
 * where automation is working correctly and waiting on a human judgement
 * call (`needs-evidence`, `repairable`). After that comes the queue of
 * incidents automation has not finished with yet — `new` before the
 * in-progress repair pipeline, because nothing has looked at it at all —
 * and the list ends with the three closed outcomes: `expected-recurrence`
 * (recurred, but the analysis already ruled it out) alongside `not-a-defect`
 * — neither needs a human — before `resolved`, because the latter is the
 * single state this whole model exists to produce.
 *
 * This module stays pure — no import-time validation lives here, on
 * purpose: a thrown error at module load would crash every render path that
 * imports this file, which is a strictly worse failure than a red test.
 * `lifecycle.test.ts` is the one authority for the invariant, and it asserts
 * this contains every member of `INCIDENT_LIFECYCLE_STATES` exactly once —
 * the test that catches a state added to the union later and never ranked
 * here.
 */
export const LIFECYCLE_ATTENTION_ORDER: readonly IncidentLifecycleState[] = [
  'regressed',
  'pr-failed',
  'unknown',
  'needs-evidence',
  'repairable',
  'new',
  'diagnosing',
  'repairing',
  'pr-open',
  'merged',
  'awaiting-deploy',
  'awaiting-proof',
  'expected-recurrence',
  'not-a-defect',
  'resolved',
];
