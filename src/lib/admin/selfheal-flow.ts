/**
 * Flow — is the self-healing loop actually MOVING the incidents in front of
 * it, and where are they stuck?
 *
 * The loop already reports two facts about itself. `selfheal-registry.ts`
 * answers "is each stage running on schedule" (a heartbeat), and
 * `selfheal-capability.ts` answers "has each stage ever produced its output"
 * (a proof). Neither can answer the question an operator asks on the morning
 * a fault has sat unanalysed for a week: the heartbeats were green every day,
 * the stage has a proven history, and this incident was skipped every single
 * night. "The process ran" and "the process once worked" are both true, and
 * the loop is still not doing its job.
 *
 * This module adds the third axis — THROUGHPUT. Every incident on the board
 * is placed at the point in the circuit whose turn it is, using the lifecycle
 * `lifecycle.ts` already derived (never a second derivation of the same
 * evidence), and the three stages the loop owns — Diagnose, Repair, Close —
 * each get a backlog: what is waiting on them, and for how long. An incident
 * that has waited past `STALL_CYCLES` of the owning stage's own cadence is
 * STALLED: the stage has had that many chances to act on it and has not.
 *
 * THREE RULES, carried from the modules this one sits beside:
 *
 *   1. A FAILED READ NEVER STALLS ANYTHING. `repair.status === 'unknown'`, an
 *      unreadable deploy, a blind source — every one of those places the
 *      incident at `unknown`, never at a stage it could then be blamed for
 *      missing. Blaming Repair for an incident whose repair state GitHub could
 *      not return is the `unknown → broken` move, the mirror image of the
 *      `unknown → healthy` move the whole engineering OS forbids; both
 *      manufacture a claim nobody has evidence for.
 *
 *   2. THE THRESHOLD IS THE STAGE'S OWN CADENCE, read from `SELFHEAL_STAGES`.
 *      "Two cycles" is a statement about how many chances the stage has had,
 *      which stays true if a cadence changes. A hard-coded number of hours
 *      would silently become "one chance" or "five chances" the day someone
 *      re-schedules a routine.
 *
 *   3. AN ACTIVE STAGE IS NEVER STALLED. Repair running on an incident is the
 *      loop working, however long that run takes. Stalled means waiting, not
 *      slow.
 *
 * PURE MODULE. No I/O, no `server-only`, no `Date.now()` — `now` is threaded
 * in, same discipline as `lifecycle.ts`, `attention.ts` and
 * `selfheal-capability.ts`, and for the same reason: this must produce one
 * verdict whether it runs in a server component, a lens predicate on the
 * Errors tab, a client card, or a unit test.
 */

import { SELFHEAL_STAGES } from '@/lib/admin/selfheal-registry';
import { PRODUCTION_PROOF_WINDOW_MS } from '@/lib/admin/incidents/proof';
import type { UnifiedIncident } from '@/lib/admin/incidents/types';

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

/**
 * Where an incident sits in the circuit right now.
 *
 * The first three are the stages the loop OWNS — the only positions that can
 * stall, because they are the only ones where "nothing happened" is the
 * loop's own failure. The rest are waits on something else: a human, CI, a
 * promote, or simply time.
 */
export type FlowPosition =
  /** No analysis yet — Diagnose's turn. */
  | 'diagnose'
  /** An analysis says fix here and no PR exists, or Repair is running — Repair's turn. */
  | 'repair'
  /** Production has proven the fix and nothing has recorded it — Close's turn. */
  | 'close'
  /** A PR is open — waiting on CI or a merge decision. */
  | 'review'
  /** Merged, and production does not serve it yet — waiting on a promote. */
  | 'deploy'
  /** Live in production, waiting for post-deploy silence to count as proof. */
  | 'traffic'
  /** Needs a human judgement: more evidence, a failed PR, a regression. */
  | 'owner'
  /** Resolved and recorded, or not a defect. */
  | 'done'
  /** A read failed — this incident cannot be placed. */
  | 'unknown';

export const FLOW_POSITIONS: readonly FlowPosition[] = [
  'diagnose',
  'repair',
  'close',
  'review',
  'deploy',
  'traffic',
  'owner',
  'done',
  'unknown',
];

/** The three automated stages, keyed exactly as `SELFHEAL_STAGES` keys them. */
export type FlowStageId = 'triage' | 'repair' | 'close';

export const FLOW_STAGE_IDS: readonly FlowStageId[] = ['triage', 'repair', 'close'];

function registryStage(stageId: FlowStageId) {
  return SELFHEAL_STAGES.find((s) => s.id === stageId);
}

/**
 * Stage id -> the title the rest of the Bridge already uses for it, read from
 * the registry so a rename there reaches every flow surface without a second
 * edit. A stage this module knows about but the registry has dropped falls
 * back to its id, visibly.
 */
export const FLOW_STAGE_TITLE: Readonly<Record<FlowStageId, string>> = {
  triage: registryStage('triage')?.title ?? 'triage',
  repair: registryStage('repair')?.title ?? 'repair',
  close: registryStage('close')?.title ?? 'close',
};

export const FLOW_POSITION_LABEL: Readonly<Record<FlowPosition, string>> = {
  diagnose: `Waiting on ${FLOW_STAGE_TITLE.triage}`,
  repair: `Waiting on ${FLOW_STAGE_TITLE.repair}`,
  close: `Waiting on ${FLOW_STAGE_TITLE.close}`,
  review: 'PR open',
  deploy: 'Awaiting promote',
  traffic: 'Awaiting traffic',
  owner: 'Needs a human',
  done: 'Done',
  unknown: 'Unknown',
};

/**
 * How many of a stage's own cycles an incident may wait before it is called
 * stalled.
 *
 * Two, not one. One cycle is the grace `lifecycle.ts` already gives Diagnose
 * (`DIAGNOSING_GRACE_MS`) — an incident first seen an hour before the nightly
 * run has genuinely not had a chance. A second full cycle passing is a run
 * that HAD the chance and did not take it. Three would let a fault sit for
 * most of a working week before the board said anything.
 */
export const STALL_CYCLES = 2;

const MINUTE_MS = 60_000;

function cadenceMs(stageId: FlowStageId): number {
  // Every id in FLOW_STAGE_IDS is in the registry today. If one is ever
  // removed, a zero cadence would make every incident at that stage read as
  // stalled instantly — fall back to a day, the cadence every stage has,
  // rather than manufacture a stall out of a missing registry row.
  return (registryStage(stageId)?.cadenceMinutes ?? 24 * 60) * MINUTE_MS;
}

/** The wait after which an incident at `stageId` is stalled. */
export function stallThresholdMs(stageId: FlowStageId): number {
  return cadenceMs(stageId) * STALL_CYCLES;
}

// ---------------------------------------------------------------------------
// Duration formatting — "6 days", never a raw ISO string.
//
// Mirrors `lifecycle.ts`'s private `formatDuration` exactly. Not imported:
// that module keeps it unexported on purpose, and `attention.ts` carries the
// same copy for the same reason. Keep the three in step if any changes.
// ---------------------------------------------------------------------------

function formatDuration(ms: number): string {
  const clamped = Math.max(0, ms);
  const minutes = Math.round(clamped / MINUTE_MS);
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

/** Exported for the surfaces that render a wait — one formatter, not four. */
export function formatWait(ms: number): string {
  return formatDuration(ms);
}

/** `1440` -> "daily", `360` -> "6-hourly" — for "inside its daily cycle". */
function describeCadence(stageId: FlowStageId): string {
  const minutes = cadenceMs(stageId) / MINUTE_MS;
  if (minutes === 24 * 60) return 'daily';
  if (minutes % 60 === 0) return `${minutes / 60}-hourly`;
  return `${minutes}-minute`;
}

function parseTimeOrNull(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

// ---------------------------------------------------------------------------
// Per-incident derivation
// ---------------------------------------------------------------------------

export interface IncidentFlow {
  position: FlowPosition;
  /** The automated stage whose turn it is, when `position` is one the loop owns. */
  stageId: FlowStageId | null;
  /** ISO — when the incident arrived at this position, when that is known. */
  waitingSince: string | null;
  /** How long it has waited there. Null whenever `waitingSince` is null. */
  waitingMs: number | null;
  /** The wait after which this position reads stalled. Null off the loop. */
  stallAfterMs: number | null;
  /** Only ever true for a position the loop owns, with a measurable wait. */
  stalled: boolean;
  /** One sentence, plain language — WHY it is here, safe to render on a card. */
  why: string;
}

function offLoop(position: FlowPosition, why: string): IncidentFlow {
  return { position, stageId: null, waitingSince: null, waitingMs: null, stallAfterMs: null, stalled: false, why };
}

interface StageWait {
  stageId: FlowStageId;
  position: 'diagnose' | 'repair' | 'close';
  waitingSince: string | null;
  /** True while the stage is demonstrably working this incident — never stalls. */
  active: boolean;
  /** Sentence when `waitingSince` could not be established. */
  unmeasuredReason: string | null;
  /** "first seen" / "analysed" — what happened at `waitingSince`, for the waiting sentence. */
  arrivedPhrase: string;
  /** "it was first seen" / "the analysis was written" — the same event, for the stalled sentence. */
  sincePhrase: string;
  /** "without writing an analysis" — what the stage failed to do. */
  omission: string;
}

function atStage(wait: StageWait, now: number): IncidentFlow {
  const title = FLOW_STAGE_TITLE[wait.stageId];
  const stallAfterMs = stallThresholdMs(wait.stageId);
  const sinceMs = parseTimeOrNull(wait.waitingSince);
  const base = { position: wait.position, stageId: wait.stageId, stallAfterMs };

  if (wait.active) {
    const waitingMs = sinceMs !== null ? Math.max(0, now - sinceMs) : null;
    return {
      ...base,
      waitingSince: sinceMs !== null ? wait.waitingSince : null,
      waitingMs,
      stalled: false,
      why: `${title} is working on this now${waitingMs !== null ? ` — analysed ${formatDuration(waitingMs)} ago` : ''}.`,
    };
  }

  if (sinceMs === null) {
    return {
      ...base,
      waitingSince: null,
      waitingMs: null,
      stalled: false,
      why:
        wait.unmeasuredReason ??
        `Waiting on ${title}, but when the wait began could not be determined — it cannot be measured against ${title}’s cadence.`,
    };
  }

  const waitingMs = Math.max(0, now - sinceMs);
  const stalled = waitingMs > stallAfterMs;
  const cycles = Math.floor(waitingMs / cadenceMs(wait.stageId));
  const cadence = describeCadence(wait.stageId);

  return {
    ...base,
    waitingSince: wait.waitingSince,
    waitingMs,
    stalled,
    why: stalled
      ? `${title} has had ${cycles} ${cadence} ${cycles === 1 ? 'cycle' : 'cycles'} since ${wait.sincePhrase} (${formatDuration(waitingMs)} ago) ${wait.omission}.`
      : `Waiting on ${title} — ${wait.arrivedPhrase} ${formatDuration(waitingMs)} ago, inside its ${cadence} cycle.`,
  };
}

const DIAGNOSE_WAIT = {
  stageId: 'triage',
  position: 'diagnose',
  active: false,
  unmeasuredReason: null,
  arrivedPhrase: 'first seen',
  sincePhrase: 'it was first seen',
  omission: 'without writing an analysis',
} as const satisfies Omit<StageWait, 'waitingSince'>;

const REPAIR_WAIT = {
  stageId: 'repair',
  position: 'repair',
  active: false,
  unmeasuredReason: null,
  arrivedPhrase: 'analysed',
  sincePhrase: 'the analysis was written',
  omission: 'without opening a pull request',
} as const satisfies Omit<StageWait, 'waitingSince'>;

const CLOSE_WAIT = {
  stageId: 'close',
  position: 'close',
  active: false,
  unmeasuredReason:
    'Production proves the fix, but when that proof became sufficient could not be determined — the deploy time is unknown, so Close’s wait cannot be measured.',
  arrivedPhrase: 'production proved the fix',
  sincePhrase: 'production proved the fix',
  omission: 'without recording the resolution',
} as const satisfies Omit<StageWait, 'waitingSince'>;

/**
 * Place one incident in the circuit.
 *
 * Reads the lifecycle state `lifecycle.ts` already derived rather than
 * re-deriving from the raw evidence — two derivations of the same facts is
 * how the Bridge got two error tabs. Each branch below names the lifecycle
 * rule it depends on.
 */
export function deriveIncidentFlow(incident: UnifiedIncident, now: number): IncidentFlow {
  const state = incident.lifecycle.state;
  const { analysis, repair, deployProof, resolution } = incident;
  const headline = incident.lifecycle.headline;

  switch (state) {
    case 'not-a-defect':
      return offLoop('done', headline);

    case 'resolved': {
      // lifecycle.ts rule 2: a recorded resolution stands. Rule 5a: production
      // proof alone also reads `resolved` — BEFORE Close has written the
      // fingerprint-level row. That gap is Close's backlog.
      if (resolution !== null) return offLoop('done', headline);

      const deployedAtMs = parseTimeOrNull(deployProof?.deployedAt ?? null);
      // The wait starts when silence became proof — one production proof
      // window after the deploy — not when the deploy landed. Close could not
      // have acted a minute after the fix went live.
      const provenAt =
        deployedAtMs !== null ? new Date(deployedAtMs + PRODUCTION_PROOF_WINDOW_MS).toISOString() : null;
      return atStage({ ...CLOSE_WAIT, waitingSince: provenAt }, now);
    }

    case 'regressed':
    case 'needs-evidence':
    case 'pr-failed':
      return offLoop('owner', headline);

    case 'pr-open':
      return offLoop('review', headline);
    case 'awaiting-deploy':
      return offLoop('deploy', headline);
    case 'awaiting-proof':
      return offLoop('traffic', headline);

    case 'merged':
      // lifecycle.ts rule 5d: `merged` survives only when deploy evidence is
      // unreadable. Not Close's fault, not a promote's — a failed read.
      return offLoop('unknown', headline);
    case 'unknown':
      return offLoop('unknown', headline);

    case 'repairing':
      return atStage({ ...REPAIR_WAIT, active: true, waitingSince: analysis?.generatedAt ?? null }, now);

    case 'repairable':
      // lifecycle.ts rule 9: an analysis names a fix and no repair took
      // precedence. `candidate` still waits on Repair — picked, not opened.
      return atStage({ ...REPAIR_WAIT, waitingSince: analysis?.generatedAt ?? incident.firstSeen }, now);

    case 'diagnosing':
      // lifecycle.ts rule 8 renders "analysis exists, repair lookup failed"
      // as `diagnosing` too. That is a failed READ — rule 1 above — and must
      // not be placed at Diagnose, which did its job.
      if (analysis !== null && repair?.status === 'unknown') return offLoop('unknown', headline);
      return atStage({ ...DIAGNOSE_WAIT, waitingSince: incident.firstSeen }, now);

    case 'new':
      return atStage({ ...DIAGNOSE_WAIT, waitingSince: incident.firstSeen }, now);
  }
}

// ---------------------------------------------------------------------------
// Board-level summary
// ---------------------------------------------------------------------------

export type StageFlowState = 'idle' | 'flowing' | 'stalled';

export interface StageFlow {
  stageId: FlowStageId;
  title: string;
  /** Incidents whose turn this stage it is, stalled ones included. */
  waiting: number;
  stalled: number;
  /** The longest measurable wait at this stage. Null when nothing is waiting or no wait could be measured. */
  oldestWaitingMs: number | null;
  /** Waits that exist but could not be measured — reported, never folded into `oldestWaitingMs`. */
  unmeasured: number;
  state: StageFlowState;
}

export interface FlowSummary {
  /** One row per automated stage, in circuit order. */
  stages: StageFlow[];
  /** Incidents at any of the three automated stages. */
  waiting: number;
  stalled: number;
  /** Incidents that could not be placed because a read failed. */
  unknown: number;
  byPosition: Record<FlowPosition, number>;
}

export function summarizeFlow(incidents: readonly UnifiedIncident[], now: number): FlowSummary {
  const byPosition = Object.fromEntries(FLOW_POSITIONS.map((p) => [p, 0])) as Record<FlowPosition, number>;
  const perStage = new Map<FlowStageId, { waiting: number; stalled: number; oldest: number | null; unmeasured: number }>(
    FLOW_STAGE_IDS.map((id) => [id, { waiting: 0, stalled: 0, oldest: null, unmeasured: 0 }]),
  );

  for (const incident of incidents) {
    const flow = deriveIncidentFlow(incident, now);
    byPosition[flow.position] += 1;
    if (flow.stageId === null) continue;
    const bucket = perStage.get(flow.stageId)!;
    bucket.waiting += 1;
    if (flow.stalled) bucket.stalled += 1;
    if (flow.waitingMs === null) bucket.unmeasured += 1;
    else if (bucket.oldest === null || flow.waitingMs > bucket.oldest) bucket.oldest = flow.waitingMs;
  }

  const stages: StageFlow[] = FLOW_STAGE_IDS.map((stageId) => {
    const b = perStage.get(stageId)!;
    return {
      stageId,
      title: FLOW_STAGE_TITLE[stageId],
      waiting: b.waiting,
      stalled: b.stalled,
      oldestWaitingMs: b.oldest,
      unmeasured: b.unmeasured,
      state: b.stalled > 0 ? 'stalled' : b.waiting > 0 ? 'flowing' : 'idle',
    };
  });

  return {
    stages,
    waiting: stages.reduce((sum, s) => sum + s.waiting, 0),
    stalled: stages.reduce((sum, s) => sum + s.stalled, 0),
    unknown: byPosition.unknown,
    byPosition,
  };
}

export interface StalledIncident {
  incident: UnifiedIncident;
  flow: IncidentFlow;
}

/** Every stalled incident, longest wait first — the list the Self-heal page shows. */
export function selectStalled(incidents: readonly UnifiedIncident[], now: number): StalledIncident[] {
  const rows: StalledIncident[] = [];
  for (const incident of incidents) {
    const flow = deriveIncidentFlow(incident, now);
    if (flow.stalled) rows.push({ incident, flow });
  }
  return rows.sort((a, b) => (b.flow.waitingMs ?? 0) - (a.flow.waitingMs ?? 0));
}

/**
 * The summary in words, for the Truth Strip cell and the Self-heal header.
 *
 * `label` leads with the stalled count whenever there is one — that is the
 * number that changes what an operator does. Otherwise it reports what is
 * waiting, and "0 waiting" is idle, not an all-clear: an idle loop under a
 * blind source is a loop that could not see its own backlog, and the caller
 * (`canClaimAllClear`) owns that distinction, not this sentence.
 */
export function describeFlow(summary: FlowSummary): { label: string; detail: string } {
  const parts: string[] = [];

  if (summary.stalled > 0) {
    const where = summary.stages
      .filter((s) => s.stalled > 0)
      .map((s) => `${s.stalled} on ${s.title}`)
      .join(', ');
    parts.push(
      `${summary.stalled} ${summary.stalled === 1 ? 'incident has' : 'incidents have'} waited past ${STALL_CYCLES} cycles of a stage: ${where}.`,
    );
    const inside = summary.waiting - summary.stalled;
    if (inside > 0) parts.push(`${inside} more ${inside === 1 ? 'is' : 'are'} waiting inside a cycle.`);
  } else if (summary.waiting > 0) {
    parts.push(
      `${summary.waiting} ${summary.waiting === 1 ? 'incident is' : 'incidents are'} waiting on a stage, all inside that stage’s cycle.`,
    );
  } else {
    parts.push('Nothing is waiting on Diagnose, Repair or Close.');
  }

  if (summary.unknown > 0) {
    parts.push(
      `${summary.unknown} ${summary.unknown === 1 ? 'incident' : 'incidents'} could not be placed because a read failed — ${summary.unknown === 1 ? 'it' : 'they'} may be waiting on any stage.`,
    );
  }

  const label =
    summary.stalled > 0
      ? `${summary.stalled} stalled`
      : summary.waiting > 0
        ? `${summary.waiting} waiting`
        : summary.unknown > 0
          ? `${summary.unknown} unplaced`
          : 'idle';

  return { label, detail: parts.join(' ') };
}
