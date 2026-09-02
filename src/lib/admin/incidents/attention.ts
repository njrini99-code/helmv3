/**
 * "Needs your eyes" — the incident-and-loop-aware attention queue.
 *
 * WHY THIS IS SEPARATE FROM THE EXISTING `/admin` BRIEFING. `fetchBriefing`
 * already ranks by severity — how bad is this fault, on its own. That is a
 * useful axis and it is not the one an operator most needs first thing in
 * the morning: severity says nothing about whether the SYSTEM is still
 * working the fault, whether automation already tried and failed, or
 * whether a fix that looked done quietly un-did itself. Those are lifecycle
 * facts, not severity facts, and they live on the unified incident model
 * (`types.ts`) and the self-heal board (`data/selfheal.ts`), not on the
 * triage item `fetchBriefing` reads. This module ranks by what the
 * EVIDENCE says needs a human — reusing `lifecycle.ts`'s own vocabulary and
 * ordering rather than re-deriving a second one, the same discipline
 * `truth-strip.ts` and `ProofDebtPanel.tsx` already apply to their own
 * slices of this same read model.
 *
 * PURE MODULE. No I/O, no `server-only`, no `Date.now()` — `now` is
 * threaded in explicitly, same discipline as `lifecycle.ts`'s
 * `deriveLifecycle` and `selfheal-capability.ts`'s `summarizeLoopVerdict`,
 * and for the identical reason: this has to produce the same verdict
 * wherever it runs — a server component building the Overview tab, a cron
 * computing a digest, and a unit test reading the same evidence.
 *
 * THREE RULES CARRIED FORWARD FROM THE MODULES THIS ONE REUSES, RESTATED
 * HERE BECAUSE GETTING THEM WRONG IS HOW A LIST STOPS BEING TRUSTED:
 *
 *   1. ONE ROW PER INCIDENT, AT ITS WORST REASON. An incident that is both
 *      regressed and critical is one piece of work, not two — see
 *      `selectProofDebt` in `ProofDebtPanel.tsx` for the same rule applied
 *      to proof gaps, and `deriveLifecycle`'s own "worst wins, first match"
 *      discipline that this file's per-incident check order copies.
 *
 *   2. A FAILED READ IS NEVER TREATED AS A FACT TO ACT ON. `repair.status
 *      === 'unknown'` means the GitHub lookup failed, not that no repair
 *      exists — `lifecycle.ts` states the same distinction for
 *      `RepairStatus`. Demanding action on a fact this system could not
 *      read is exactly how an operator learns to stop trusting the list, so
 *      `'unknown'` never satisfies `repairable-untouched` here, and a
 *      `capability.state === 'unknown'` stage (as opposed to `'unproven'`)
 *      never satisfies `stage-dead` either — `selfheal-capability.ts` draws
 *      that same line for the identical reason.
 *
 *   3. AN UNREADABLE SOURCE IS NAMED ONCE, NOT PER INCIDENT. Every incident
 *      touched by a blind source could in principle carry a `source-blind`
 *      gap, and rendering one row per incident would flood the queue with
 *      the same underlying fact — `sources.ts`'s `describeBlindness` already
 *      collapses this to one sentence for the Truth Strip; this file does
 *      the same for the attention queue.
 */

import type {
  IncidentLifecycleState,
  ProofGap,
  StateTone,
  UnifiedIncident,
} from '@/lib/admin/incidents/types';
import { INCIDENT_SOURCE_LABEL, LIFECYCLE_LABEL } from '@/lib/admin/incidents/types';
import type { CoverageSummary } from '@/lib/admin/incidents/sources';
// Type-only: `data/selfheal.ts` carries `import 'server-only'` at its head,
// but a type-only import is erased at compile time and never reaches a
// client bundle — the same discipline `rca-category.ts` documents for why
// importing `type RcaAnalysis` from a server-only module is safe while
// importing a VALUE from one is not.
import type { SelfHealStageDetail } from '@/lib/admin/data/selfheal';
import { deriveIncidentFlow, FLOW_STAGE_TITLE } from '@/lib/admin/selfheal-flow';

// ---------------------------------------------------------------------------
// The row
// ---------------------------------------------------------------------------

export type AttentionReason =
  | 'regression'
  | 'critical'
  | 'stage-dead'
  | 'repair-ci-failed'
  | 'stage-stalled'
  | 'repairable-untouched'
  | 'needs-evidence'
  | 'proof-overdue'
  | 'platform-attention'
  | 'platform-watch'
  | 'source-blind';

export interface AttentionRow {
  key: string;
  reason: AttentionReason;
  /** Short state word, uppercase — e.g. REGRESSED, PR FAILED, BLIND. */
  state: string;
  headline: string;
  /** One sentence: WHY this needs attention now. Never a category restatement. */
  why: string;
  ageMs: number | null;
  href: string | null;
  tone: StateTone;
}

export interface AttentionInput {
  incidents: readonly UnifiedIncident[];
  stages: readonly SelfHealStageDetail[];
  coverage: CoverageSummary;
  now: number;
  /**
   * Platform checks from `fetchBriefing()` — cron health, KPI thresholds and
   * the rest. They are NOT incidents and have no lifecycle, but they compete
   * for exactly the same thing: the operator's next action.
   *
   * They are folded in here because the Overview briefly carried two panels
   * both titled "Needs your eyes" — one for these, one for incidents and the
   * loop — which handed the operator two attention lists to reconcile and rank
   * against each other by eye. That is the same split this whole read model
   * exists to remove; a second attention list is no more defensible than a
   * second incident list.
   */
  briefing?: readonly PlatformCheck[];
}

/**
 * Worst first. This is the ranking an operator reads top to bottom, and it
 * is deliberately not the same order as `LIFECYCLE_ATTENTION_ORDER` in
 * `lifecycle.ts` — that ranking orders lifecycle STATES on their own; this
 * one orders REASONS a row exists at all, several of which (`stage-dead`,
 * `source-blind`) have no lifecycle state to rank by in the first place.
 *
 *   1. `regression`            — a fault declared fixed, and it came back.
 *      The single most valuable signal this system produces (see
 *      `deriveLifecycle`'s own header comment for why regression outranks
 *      even an existing resolution there too).
 *   2. `critical`              — severity critical, still open. Nothing
 *      automated is necessarily wrong; the stakes alone earn the top band.
 *   3. `stage-dead`            — a piece of the self-healing loop itself is
 *      not doing its job. Outranks anything the loop would otherwise be
 *      expected to resolve on its own, because if the loop is dead nothing
 *      below this line is getting worked without a human.
 *   4. `repair-ci-failed`      — automation actively tried and broke.
 *   4b. `stage-stalled`        — the loop is running and has skipped this
 *      incident for `STALL_CYCLES` of the owning stage's own cadence
 *      (`selfheal-flow.ts`). Ranked above `repairable-untouched` because it
 *      is the stronger fact about the same incident: not "a human could
 *      trigger Repair" but "Repair has had its chances and did nothing" —
 *      the calm-heartbeat failure `selfheal-capability.ts` was built for,
 *      now visible per incident rather than per stage.
 *   5. `repairable-untouched`  — automation found a fix and has not acted;
 *      a human unblocks it by triggering or reviewing Repair.
 *   6. `needs-evidence`        — automation cannot safely proceed without a
 *      human supplying more context.
 *   7. `proof-overdue`         — a fix that looks done has sat unproven
 *      past a reasonable window; nobody is actively blocked, but nobody is
 *      confirming it either.
 *   8. `source-blind`          — automation cannot even SEE part of the
 *      picture. Ranked last among these eight, not because it matters
 *      least, but because everything above it is a specific, named fault a
 *      human can act on right now, while this is a standing caveat on the
 *      whole list rather than one more piece of work.
 */
export const ATTENTION_PRIORITY: readonly AttentionReason[] = [
  'regression',
  'critical',
  'stage-dead',
  'repair-ci-failed',
  'stage-stalled',
  'repairable-untouched',
  'needs-evidence',
  'platform-attention',
  'proof-overdue',
  'platform-watch',
  'source-blind',
];

/**
 * How long a deployed-but-unverified fix may sit before it needs a human.
 *
 * 48 hours. `SOURCE_EXPECTED_INTERVAL_MS.supabase` (`sources.ts`) already
 * treats the reliability collector as stale past 3× its 3-hour cadence —
 * nine hours — so by two full days any traffic-bearing route has had many
 * multiples of that window to exercise a fix. Shorter would flag a
 * routinely quiet stretch (a weekend, an off-season week for a seasonal
 * sport) as needing a human when nothing is actually wrong. Longer would let
 * a genuine miss — a fix that is not actually live, or a route nobody hits
 * — sit unproven for most of a week before this queue said anything.
 */
export const PROOF_OVERDUE_MS = 48 * 60 * 60 * 1000;

/**
 * Rows shown before the caller's overflow link takes over.
 *
 * 8, not the 6 `ProofDebtPanel` defaults to: this queue can carry a
 * `stage-dead` row and a `source-blind` row that compete for a slot against
 * real incidents even on a quiet day, and 6 was tight enough in practice to
 * push a genuine regression below the fold behind two standing-caveat rows.
 * Still small enough to read in one glance without scrolling — this is a
 * "what do I look at first" list, not an inbox.
 */
const DEFAULT_LIMIT = 8;

// ---------------------------------------------------------------------------
// Duration formatting — "6 days ago", never a raw ISO string.
//
// Mirrors `lifecycle.ts`'s private `formatDuration`/`since` exactly. Not
// imported: that module keeps them unexported on purpose (nothing else in
// it needs them outside `deriveLifecycle`), so this is a second copy of the
// same small algorithm rather than a shared one. Keep the two in step if
// either changes.
// ---------------------------------------------------------------------------

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

function since(iso: string, now: number): string {
  return formatDuration(now - Date.parse(iso));
}

function ageSince(iso: string, now: number): number {
  return now - Date.parse(iso);
}

/** `1440` minutes -> "1 day"; `60` -> "1 hour". Every `SELFHEAL_STAGES`
 *  cadence today is a whole number of days, but this does not assume that. */
function formatCadence(minutes: number): string {
  if (minutes % 1440 === 0) {
    const days = minutes / 1440;
    return days === 1 ? '1 day' : `${days} days`;
  }
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return hours === 1 ? '1 hour' : `${hours} hours`;
  }
  return `${minutes} minutes`;
}

// ---------------------------------------------------------------------------
// Tone
// ---------------------------------------------------------------------------

/**
 * Every reason in this queue is, by definition, something an operator has
 * to look at — so `success` and `neutral` never appear here. `accent` is
 * reserved for the two reasons that are an AFFORDANCE rather than a
 * problem: automation found something and is waiting on a human decision,
 * not on a fix (`repairable-untouched`, `needs-evidence`) — the same
 * reasoning `ProofDebtPanel.tsx`'s `GAP_TONE` applies to `awaiting-owner`
 * and `awaiting-repair`.
 */
const REASON_TONE: Readonly<Record<AttentionReason, StateTone>> = {
  regression: 'danger',
  critical: 'danger',
  'stage-dead': 'danger',
  'repair-ci-failed': 'danger',
  // Warning, not danger: nothing is broken outright, and the stage's own
  // heartbeat may well be green. That calm is exactly the point — this row
  // is the one that says the calm is not evidence of work.
  'stage-stalled': 'warning',
  'repairable-untouched': 'accent',
  'needs-evidence': 'warning',
  'proof-overdue': 'warning',
  'platform-attention': 'warning',
  'platform-watch': 'neutral',
  'source-blind': 'danger',
};

/**
 * One platform check, structurally compatible with `BriefingItem` from
 * `@/lib/admin/data/briefing`.
 *
 * Restated rather than imported: that module is `server-only`, and this one is
 * pure and reached from a client component. A type-only import would be erased
 * today, but the edge is one refactor away from becoming a value import and
 * dragging the Supabase admin client into a client bundle — the exact
 * poisoning `rca-category.ts`'s header documents. Structural typing means a
 * `BriefingItem[]` still assigns here with no adapter.
 */
export interface PlatformCheck {
  severity: 'attention' | 'watch';
  headline: string;
  href: string | null;
}

/**
 * A platform check as an attention row.
 *
 * `ageMs` is null and stays null: a briefing item carries no timestamp, and
 * the sort treats a null age as "sorts last within its band" rather than
 * "most recent". Inventing an age of 0 here would float every check above
 * genuinely fresh incidents in the same band.
 */
function deriveBriefingRow(item: PlatformCheck, index: number): AttentionRow {
  const reason: AttentionReason =
    item.severity === 'attention' ? 'platform-attention' : 'platform-watch';
  return {
    key: `platform:${index}:${item.headline}`,
    reason,
    state: item.severity === 'attention' ? 'ATTENTION' : 'WATCH',
    headline: item.headline,
    why:
      item.severity === 'attention'
        ? 'A platform check is failing and nothing automated will clear it.'
        : 'A platform check is drifting toward a threshold.',
    ageMs: null,
    href: item.href,
    tone: REASON_TONE[reason],
  };
}

// ---------------------------------------------------------------------------
// Per-incident derivation
// ---------------------------------------------------------------------------

const UNRESOLVED_STATES: ReadonlySet<IncidentLifecycleState> = new Set(
  (
    [
      'new',
      'diagnosing',
      'needs-evidence',
      'repairable',
      'repairing',
      'pr-open',
      'pr-failed',
      'merged',
      'awaiting-deploy',
      'awaiting-proof',
      'regressed',
      'unknown',
    ] satisfies IncidentLifecycleState[]
  ),
);

/**
 * The worst qualifying `awaiting-traffic` / `awaiting-deploy` gap on an
 * incident, or `null` when none has aged past `PROOF_OVERDUE_MS`. "Worst"
 * is the oldest — `ageMs === null` (genuinely unknown age) never qualifies,
 * because an unknown age is not evidence the wait has gone on too long.
 */
function pickOverdueGap(gaps: readonly ProofGap[]): ProofGap | null {
  let worst: ProofGap | null = null;
  for (const gap of gaps) {
    if (gap.kind !== 'awaiting-traffic' && gap.kind !== 'awaiting-deploy') continue;
    if (gap.ageMs === null || gap.ageMs <= PROOF_OVERDUE_MS) continue;
    if (worst === null || gap.ageMs > (worst.ageMs as number)) worst = gap;
  }
  return worst;
}

/**
 * One incident's row, at its single highest-priority reason — or `null`
 * when nothing about it needs a human right now. ORDERED CHECKS, FIRST
 * MATCH WINS, same shape as `deriveLifecycle` itself: this is not an
 * average of how many things are wrong, it is "what is the ONE thing an
 * operator should be told about this incident".
 *
 * `stage-dead` and `source-blind` are not incident-scoped and are handled
 * by their own builders below.
 */
function deriveIncidentRow(incident: UnifiedIncident, now: number): AttentionRow | null {
  // 1. regression — outranks everything, including its own severity.
  if (incident.lifecycle.state === 'regressed') {
    return {
      key: incident.id,
      reason: 'regression',
      state: 'REGRESSED',
      headline: incident.description,
      // `deriveLifecycle`'s regression headline is already exactly this
      // shape ("Fixed 6 days ago, returned 14 minutes ago.") — reusing it
      // rather than re-deriving keeps the two surfaces from ever disagreeing
      // about the same fact.
      why: incident.lifecycle.headline,
      ageMs: ageSince(incident.lastSeen, now),
      href: incident.linkTarget,
      tone: REASON_TONE.regression,
    };
  }

  // 2. critical — severity critical AND still unresolved. `not-a-defect`
  //    and `resolved` are excluded by definition; every other lifecycle
  //    state counts as unresolved, including the ones automation is still
  //    actively working (`repairing`, `pr-open`, ...) — a critical fault
  //    being worked is still critical.
  if (
    incident.severity === 'critical' &&
    incident.actionable &&
    UNRESOLVED_STATES.has(incident.lifecycle.state)
  ) {
    return {
      key: incident.id,
      reason: 'critical',
      state: 'CRITICAL',
      headline: incident.description,
      why: `Critical severity and still open — last seen ${since(incident.lastSeen, now)} ago (${LIFECYCLE_LABEL[incident.lifecycle.state]}).`,
      ageMs: ageSince(incident.lastSeen, now),
      href: incident.linkTarget,
      tone: REASON_TONE.critical,
    };
  }

  const repair = incident.repair;

  // 4. repair-ci-failed — automation opened a PR and CI broke it, whether
  //    or not `repair.status` has caught up to say `pr-failed` yet.
  if (repair && (repair.status === 'pr-failed' || (repair.checks !== null && repair.checks.failed > 0))) {
    const prRef = repair.prNumber ? ` (#${repair.prNumber})` : '';
    let why: string;
    if (repair.status === 'pr-failed') {
      why = `CI failed on the repair PR${prRef}.`;
      if (repair.checks) {
        why += ` ${repair.checks.failed} of ${repair.checks.total} checks failed, ${repair.checks.passed} passed.`;
      }
    } else {
      // `repair.checks.failed > 0` fired ahead of `status` catching up —
      // still real, worded around what is actually known.
      why = `${repair.checks!.failed} of ${repair.checks!.total} checks have failed on the repair PR${prRef}.`;
    }
    return {
      key: incident.id,
      reason: 'repair-ci-failed',
      state: 'PR FAILED',
      headline: incident.description,
      why,
      ageMs: null, // no failure timestamp exists on IncidentRepair — never fabricated.
      href: repair.prUrl ?? incident.linkTarget,
      tone: REASON_TONE['repair-ci-failed'],
    };
  }

  // 4b. stage-stalled — the loop has had STALL_CYCLES of the owning stage's
  //     cadence to act on this incident and has not. Checked BEFORE
  //     `repairable-untouched` so the stronger fact wins for a repairable
  //     incident Repair has skipped twice. A failed read never reaches here:
  //     `deriveIncidentFlow` places `repair.status === 'unknown'` and an
  //     unreadable deploy off the loop, where nothing can stall (rule 2).
  const flow = deriveIncidentFlow(incident, now);
  if (flow.stalled && flow.stageId !== null) {
    return {
      key: incident.id,
      reason: 'stage-stalled',
      state: `STALLED · ${FLOW_STAGE_TITLE[flow.stageId].toUpperCase()}`,
      headline: incident.description,
      why: flow.why,
      ageMs: flow.waitingMs,
      href: incident.linkTarget,
      tone: REASON_TONE['stage-stalled'],
    };
  }

  // 5. repairable-untouched — analysis found a fix, Repair has not acted.
  //    Deliberately NOT when `repair.status === 'unknown'`: that is a
  //    failed GitHub lookup, not evidence no repair was attempted — see the
  //    module header, rule 2.
  if (incident.lifecycle.state === 'repairable' && (repair === null || repair.status === 'none')) {
    const since_ = incident.analysis?.generatedAt ?? incident.firstSeen;
    return {
      key: incident.id,
      reason: 'repairable-untouched',
      state: 'REPAIRABLE',
      headline: incident.description,
      why: 'Repair has never opened a pull request for this.',
      ageMs: ageSince(since_, now),
      href: incident.linkTarget,
      tone: REASON_TONE['repairable-untouched'],
    };
  }

  // 6. needs-evidence
  if (incident.lifecycle.state === 'needs-evidence') {
    return {
      key: incident.id,
      reason: 'needs-evidence',
      state: 'NEEDS EVIDENCE',
      headline: incident.description,
      why: incident.lifecycle.headline,
      ageMs: ageSince(incident.lastSeen, now),
      href: incident.linkTarget,
      tone: REASON_TONE['needs-evidence'],
    };
  }

  // 7. proof-overdue
  const overdueGap = pickOverdueGap(incident.proofGaps);
  if (overdueGap) {
    const ageMs = overdueGap.ageMs as number;
    const duration = formatDuration(ageMs);
    const why =
      overdueGap.kind === 'awaiting-traffic'
        ? `Deployed ${duration} ago and still no post-deploy traffic — ${overdueGap.detail}`
        : `Merged ${duration} ago and still not deployed — ${overdueGap.detail}`;
    return {
      key: incident.id,
      reason: 'proof-overdue',
      state: 'PROOF OVERDUE',
      headline: incident.description,
      why,
      ageMs,
      href: incident.linkTarget,
      tone: REASON_TONE['proof-overdue'],
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Stage rows — one per self-heal stage whose runtime OR capability is dead.
// ---------------------------------------------------------------------------

function stageRow(stage: SelfHealStageDetail, now: number, state: string, why: string): AttentionRow {
  return {
    key: `stage:${stage.id}`,
    reason: 'stage-dead',
    state,
    headline: stage.title,
    why,
    ageMs: stage.lastRunAt ? ageSince(stage.lastRunAt, now) : null,
    href: null,
    tone: REASON_TONE['stage-dead'],
  };
}

/**
 * `unreadable` is checked FIRST, ahead of `status`, on purpose: when a
 * stage's run history could not be read, `data/selfheal.ts` forces `status`
 * to `'never-ran'` as the honest neutral value — but "never ran" and
 * "we could not tell if it ran" are different facts (rule 2 in the module
 * header), and checking `status` first would report the wrong one.
 *
 * `capability.state === 'unproven'` is checked LAST and only reached when
 * `status` is `'ok'` — a stage that is failing or overdue is already
 * reported for that, and piling a second row on top of it would double-
 * count one dead stage as two attention items.
 */
function deriveStageRow(stage: SelfHealStageDetail, now: number): AttentionRow | null {
  if (stage.unreadable) {
    return stageRow(
      stage,
      now,
      'UNREADABLE',
      `Run history for ${stage.title} could not be READ this refresh — that says nothing about whether it actually ran.`,
    );
  }
  if (stage.status === 'failed') {
    return stageRow(
      stage,
      now,
      'FAILED',
      `${stage.title}'s last run failed${stage.lastError ? `: ${stage.lastError}` : '.'}`,
    );
  }
  if (stage.status === 'overdue') {
    const last = stage.lastRunAt ? `${since(stage.lastRunAt, now)} ago` : 'never recorded';
    return stageRow(
      stage,
      now,
      'OVERDUE',
      `${stage.title} has missed its schedule — last run ${last}, expected every ${formatCadence(stage.cadenceMinutes)}.`,
    );
  }
  if (stage.status === 'never-ran') {
    return stageRow(stage, now, 'NEVER RAN', `${stage.title} has never recorded a run.`);
  }
  if (stage.capability.state === 'unproven') {
    // `capability.evidence` is already a full, plain-language sentence
    // (e.g. "Repair has never opened a pull request.") — reused verbatim
    // rather than re-worded, same as the incident-level reasons above reuse
    // `lifecycle.headline`.
    return stageRow(stage, now, 'UNPROVEN', stage.capability.evidence);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Source-blind row — exactly one, regardless of how many incidents it touches.
// ---------------------------------------------------------------------------

function deriveSourceBlindRow(coverage: CoverageSummary): AttentionRow | null {
  if (!coverage.anyBlind) return null;
  const names = coverage.blindSources.map((s) => INCIDENT_SOURCE_LABEL[s]).join(', ');
  const plural = coverage.blindSources.length === 1 ? 'that source' : 'those sources';
  return {
    key: 'source-blind',
    reason: 'source-blind',
    state: 'BLIND',
    headline: 'Evidence coverage is incomplete',
    why: `${names} could not be read this refresh — anything only ${plural} would have shown is invisible right now.`,
    ageMs: null,
    href: null,
    tone: REASON_TONE['source-blind'],
  };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Build the attention queue: one row per incident at its worst reason, one
 * row per dead self-heal stage, one row per platform check from the briefing,
 * and at most one standing `source-blind` row — ranked by `ATTENTION_PRIORITY` and, within a reason, most recent
 * first (an `ageMs` of `null` sorts last within its band, never first: an
 * unknown age is not evidence of recency).
 *
 * `limit` truncates the RETURNED array; it does not mark dropped rows in
 * any way, because a row that was cut is simply not present — the caller
 * (`AttentionQueue`'s `total` prop) is what turns that into an honest
 * overflow link. To learn the full count before truncation, call this again
 * with a limit large enough not to truncate (e.g. `incidents.length +
 * stages.length + 1`) and read `.length` — this module does not expose a
 * separate "count" path, the same way `ProofDebtPanel`'s `selectProofDebt`
 * returns everything and leaves slicing to its caller.
 */
export function selectAttention(input: AttentionInput, limit: number = DEFAULT_LIMIT): AttentionRow[] {
  const { incidents, stages, coverage, now, briefing = [] } = input;
  const rows: AttentionRow[] = [];

  briefing.forEach((item, index) => rows.push(deriveBriefingRow(item, index)));

  for (const stage of stages) {
    const row = deriveStageRow(stage, now);
    if (row) rows.push(row);
  }

  for (const incident of incidents) {
    const row = deriveIncidentRow(incident, now);
    if (row) rows.push(row);
  }

  const blindRow = deriveSourceBlindRow(coverage);
  if (blindRow) rows.push(blindRow);

  rows.sort((a, b) => {
    const rankDiff = ATTENTION_PRIORITY.indexOf(a.reason) - ATTENTION_PRIORITY.indexOf(b.reason);
    if (rankDiff !== 0) return rankDiff;
    // Most recent first within a reason. A null age (genuinely unknown) is
    // never treated as "most recent" — it sorts to the back of its band.
    const aAge = a.ageMs ?? Number.POSITIVE_INFINITY;
    const bAge = b.ageMs ?? Number.POSITIVE_INFINITY;
    return aAge - bAge;
  });

  return rows.slice(0, limit);
}
