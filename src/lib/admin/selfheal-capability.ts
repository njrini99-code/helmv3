/**
 * Whether the self-healing loop has ever DONE anything, as a fact distinct
 * from whether it has been RUNNING.
 *
 * `selfheal-registry.ts` answers "is each stage on schedule?" — a heartbeat
 * check. That is necessary and it is not sufficient: a stage can write a
 * perfectly healthy heartbeat on every single run while never once producing
 * the output the loop exists to produce. Observed 2026-08-28 — the Repair
 * stage's heartbeats were fine, on schedule, `status: 'completed'` every
 * time, and it had never opened a single pull request. A board that shows
 * only heartbeats renders that as green, because nothing about a heartbeat
 * says whether the run did its job or quietly did nothing forever.
 *
 * So this module adds a second, orthogonal axis — CAPABILITY — answering "has
 * this stage ever demonstrably produced its output?" A stage's full health is
 * the pair (runtime, capability), and the two can disagree in either
 * direction: on schedule but never proven (this is the dangerous one, because
 * it looks calm), or overdue but with a long proven history (annoying, not a
 * mystery). Reporting only one axis collapses a distinction operators need.
 *
 * Pure module: no I/O, no `Date.now()`, no `server-only`. Everything here is
 * a function of the `CapabilityEvidence` the caller already gathered — the
 * gathering (and its Supabase queries) lives in `data/selfheal.ts`, same
 * split as `selfheal-registry.ts` (classification) versus `data/jobs.ts`
 * (the queries that classification runs against).
 */
import type { SelfHealStage, SelfHealLoopStatus } from '@/lib/admin/selfheal-registry';

/**
 * Three states, not two, for the same reason `unreadable` exists on
 * `SelfHealStageRow`: "we looked and found nothing" and "we could not look"
 * are different facts, and collapsing them either direction manufactures a
 * claim nobody has evidence for.
 *
 * - `proven`   — the mechanical output exists. At least one real instance.
 * - `unproven` — the read succeeded and found zero instances.
 * - `unknown`  — the read itself failed, or no probe exists for this stage.
 *   Never rendered as `unproven` (that would manufacture "it has never
 *   worked" out of "we could not check") and never as `proven` (the
 *   unknown→healthy move this whole engineering OS forbids).
 */
export type CapabilityState = 'proven' | 'unproven' | 'unknown';

export interface StageCapability {
  stageId: string;
  state: CapabilityState;
  /** What proves it, or what is missing — plain engineer language. Never
   *  null: a state with no explanation is exactly the kind of unexplained
   *  green/red chip this module exists to replace. */
  evidence: string;
  /** ISO time of the most recent demonstration, when known. Null whenever
   *  `state !== 'proven'`, and also null for a `proven` stage whose evidence
   *  source could not supply a timestamp — a missing date does not downgrade
   *  a positive count back to `unproven`. */
  provenAt: string | null;
}

/**
 * The mechanical output each stage must produce for its capability to count
 * as proven. Gathered once per board read in `data/selfheal.ts`; this module
 * only ever consumes it.
 *
 * `null` in ANY field means the read that would populate it FAILED — the
 * query errored, the upstream fetch was unconfigured, or the source it reads
 * had nothing readable at all. It never means "checked, found zero" — `0`
 * means that. Get this backwards and an outage looks identical to a quiet
 * stage that has genuinely never had work to do.
 */
export interface CapabilityEvidence {
  /** Collect: correlated signals in the latest readable reliability
   *  snapshot. No stage in `SELFHEAL_STAGES` maps to this today — it is
   *  carried here for the day a Collect stage joins the registry, so the
   *  evidence shape does not need to change out from under it. */
  signalsCollected: number | null;
  /** Diagnose (`triage`): `rca_analysis` rows written in the lookback
   *  window. */
  analysesWritten: number | null;
  /** Repair (`repair`): pull requests that name an incident, per
   *  `repair-link.ts`'s extraction of the repair contract's two markers. */
  repairPrsOpened: number | null;
  /** Close (`close`): rows in `admin_error_resolutions` with
   *  `resolution_source = 'auto'`. */
  autoResolutionsRecorded: number | null;
  /** Most recent demonstration per stage id, ISO or null. Keyed by
   *  `SelfHealStage.id` (`'triage' | 'repair' | 'close'` today), not by the
   *  evidence field name above — a stage id absent from this record reads as
   *  "no timestamp known" the same as an explicit `null`. */
  lastProvenAt: Readonly<Record<string, string | null>>;
}

interface StageProbe {
  /** Pulls this stage's count out of the evidence bundle. */
  select: (evidence: CapabilityEvidence) => number | null;
  /** Plain-language reason when the read succeeded and found zero. */
  neverPhrase: string;
  /** Plain-language reason when the read succeeded and found `count > 0`. */
  provenPhrase: (count: number) => string;
}

/**
 * Stage id -> capability probe. Deliberately a plain object keyed by the
 * CURRENT `SELFHEAL_STAGES` ids (`'triage'`, `'repair'`, `'close'`) rather
 * than derived from the registry, so a stage the registry adds tomorrow with
 * no entry here fails visibly (see the `default` branch of
 * `deriveStageCapability`) instead of silently inheriting some other stage's
 * probe.
 */
const STAGE_PROBES: Readonly<Record<string, StageProbe>> = {
  triage: {
    select: (e) => e.analysesWritten,
    neverPhrase: 'Diagnose has never written an rca_analysis row.',
    provenPhrase: (n) => `${n} ${n === 1 ? 'analysis' : 'analyses'} written in the last 7 days.`,
  },
  repair: {
    select: (e) => e.repairPrsOpened,
    neverPhrase: 'Repair has never opened a pull request.',
    provenPhrase: (n) =>
      `${n} repair ${n === 1 ? 'pull request names' : 'pull requests name'} an incident it fixed.`,
  },
  close: {
    select: (e) => e.autoResolutionsRecorded,
    neverPhrase: 'Close has never recorded an automatic resolution in admin_error_resolutions.',
    provenPhrase: (n) =>
      `${n} automatic ${n === 1 ? 'resolution' : 'resolutions'} recorded in admin_error_resolutions.`,
  },
};

/**
 * One stage's capability, derived from the already-gathered evidence.
 *
 * An unrecognised stage id (one `SELFHEAL_STAGES` carries but this file has
 * no probe for) yields `'unknown'`, never `'unproven'` — a missing probe is
 * this file being behind the registry, not the stage having failed at
 * anything. That distinction is the entire point of the three-state type.
 */
export function deriveStageCapability(
  stage: SelfHealStage,
  evidence: CapabilityEvidence,
): StageCapability {
  const probe = STAGE_PROBES[stage.id];

  if (!probe) {
    return {
      stageId: stage.id,
      state: 'unknown',
      evidence: `${stage.title} (id "${stage.id}") has no capability probe defined — this registry entry is ahead of the code that proves it does anything.`,
      provenAt: null,
    };
  }

  const count = probe.select(evidence);

  if (count === null) {
    return {
      stageId: stage.id,
      state: 'unknown',
      evidence: `Could not read whether ${stage.title} has ever produced its output — the underlying query failed. This is not the same fact as "it has never worked".`,
      provenAt: null,
    };
  }

  if (count === 0) {
    return { stageId: stage.id, state: 'unproven', evidence: probe.neverPhrase, provenAt: null };
  }

  return {
    stageId: stage.id,
    state: 'proven',
    evidence: probe.provenPhrase(count),
    provenAt: evidence.lastProvenAt[stage.id] ?? null,
  };
}

/**
 * The loop's capability in one word: its WORST row, same discipline as
 * `summarizeLoop` in `selfheal-registry.ts` and for the identical reason —
 * an average or a majority would report a healthy-looking loop with one dead
 * link in it, and a dead link (a stage that never produces output) is
 * exactly the failure this module was built to expose. `unknown` beats
 * `unproven` beats `proven` in severity, checked in that order; an empty set
 * has no evidence at all and is `unknown`, not a default `proven`.
 */
export function deriveLoopCapability(rows: readonly StageCapability[]): CapabilityState {
  if (rows.length === 0) return 'unknown';
  if (rows.some((r) => r.state === 'unknown')) return 'unknown';
  if (rows.some((r) => r.state === 'unproven')) return 'unproven';
  return 'proven';
}

export interface LoopVerdict {
  tone: 'ok' | 'warning' | 'danger' | 'unknown';
  label: string;
  detail: string;
}

/**
 * The loop's combined verdict — runtime and capability folded into the one
 * chip an operator actually looks at — as the WORST of the two axes, never
 * an average of them.
 *
 * This is the function that stops "the process ran" from being read as "the
 * system works". A loop can be perfectly on schedule (`runtime: 'ok'`) while
 * a stage inside it has never once produced its output
 * (`capability: 'unproven'`) — that combination must never resolve to
 * `tone: 'ok'`, because the calm heartbeat is exactly what hid the Repair
 * stage's silent failure on 2026-08-28. `unknown` on either axis wins
 * outright over everything else, matching `summarizeLoop`'s own unreadable
 * check: a read that failed proves nothing in either direction, so it can
 * never be outranked by a state that DID read cleanly on the other axis.
 */
export function summarizeLoopVerdict(input: {
  runtime: SelfHealLoopStatus;
  capability: CapabilityState;
}): LoopVerdict {
  const { runtime, capability } = input;

  if (runtime === 'unknown' || capability === 'unknown') {
    const half =
      runtime === 'unknown' && capability === 'unknown'
        ? 'Runtime and capability'
        : runtime === 'unknown'
          ? 'Runtime'
          : 'Capability';
    return {
      tone: 'unknown',
      label: 'Unknown',
      detail: `${half} could not be read for at least one stage — an unread stage is never reported as healthy or as broken.`,
    };
  }

  if (runtime === 'failed') {
    return {
      tone: 'danger',
      label: 'Failing',
      detail: "At least one stage's last run failed outright — the circuit is broken right now, independent of what it has ever produced.",
    };
  }

  if (runtime === 'overdue') {
    return {
      tone: 'danger',
      label: 'Overdue',
      detail: 'At least one stage has missed its schedule — the circuit has gone quiet.',
    };
  }

  // From here `runtime` is 'ok' or 'never-ran': nothing is actively broken or
  // late. Capability is the only axis left that can still say the loop is
  // not to be trusted.
  if (capability === 'unproven') {
    return runtime === 'ok'
      ? {
          tone: 'warning',
          label: 'Running, unproven',
          detail:
            'Every stage is on schedule; at least one has never produced its output. "The process ran" is not "the system works" — this is the check that keeps a calm heartbeat from being read as proof.',
        }
      : {
          tone: 'warning',
          label: 'Not yet proven',
          detail:
            'No stage has a recent heartbeat, and at least one has never produced its output either — there is no evidence yet that this loop has ever closed.',
        };
  }

  // capability === 'proven' from here.
  if (runtime === 'never-ran') {
    return {
      tone: 'warning',
      label: 'No recent heartbeat',
      detail:
        'Every stage has demonstrably produced its output before, but at least one has no heartbeat in its recent-run window — recheck before trusting this as current.',
    };
  }

  return {
    tone: 'ok',
    label: 'Healthy',
    detail: 'Every stage is on schedule and has demonstrably produced its output — runtime and capability both check out.',
  };
}
