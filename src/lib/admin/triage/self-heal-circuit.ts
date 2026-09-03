import 'server-only';

/**
 * Self-Heal Circuit (Bridge Premium Phase 3, brief §18).
 *
 * The self-heal board already answers three separate questions, each in its
 * own module: is each stage running on schedule (`selfheal-registry.ts`), has
 * each stage ever produced its output (`selfheal-capability.ts`), and is the
 * loop actually MOVING the incidents in front of it right now
 * (`selfheal-flow.ts`). `/admin/self-heal` renders the first two on one card
 * per stage and the third in a separate "Flow" section below — an operator
 * has to hold the counts from two different parts of the page in their head
 * to answer "does Repair have a backlog RIGHT NOW".
 *
 * This module is a PURE MERGE of those three, one row per stage, plus two
 * facts neither module carries: a repair-quality link (the newest PR that
 * names an incident — already fetched by `data/selfheal.ts`, just not
 * exposed per-stage), and an explicit "budget" field. Per the Phase 3 brief's
 * own dispatch text this circuit is asked to carry "current run, budget,
 * last outcome, repair-quality link" — `budget` has no meaning anywhere in
 * this codebase's self-heal code today (verified: no LLM budget, run-count
 * budget, or similar concept exists for Diagnose/Repair/Close). Inventing a
 * number here would be exactly the kind of fabricated evidence this repo's
 * engineering OS forbids, so every row reports it explicitly as
 * `{ tracked: false }` rather than a value nobody computed.
 *
 * NO NEW I/O SHAPE. `fetchSelfHealCircuit` composes two already-existing
 * fetchers (`fetchSelfHealBoard`, `cachedIncidentBoard`) and one already-pure
 * function (`summarizeFlow`) — it does not re-query anything either of those
 * doesn't already query.
 */

import {
  fetchSelfHealBoard,
  type SelfHealBoard,
  type SelfHealStageDetail,
  type RepairPrLink,
} from '@/lib/admin/data/selfheal';
import { cachedIncidentBoard } from '@/lib/admin/incidents/fetch';
import { DEFAULT_INCIDENT_WINDOW_HOURS } from '@/lib/admin/data/incident-feed';
import { summarizeFlow, type FlowSummary, type FlowStageId, type StageFlow } from '@/lib/admin/selfheal-flow';
import type { CronBoardStatus } from '@/lib/admin/cron-registry';
import type { CapabilityState } from '@/lib/admin/selfheal-capability';
import type { StageRunOutcome } from '@/lib/admin/selfheal-provenance';
import { ok, type AdminFetchResult } from '@/lib/admin/fetch-result';

/** Never a fabricated number — this codebase tracks no per-stage budget. */
export type BudgetReading = { tracked: false };

export const UNTRACKED_BUDGET: BudgetReading = { tracked: false };

export interface SelfHealCircuitStage {
  stageId: FlowStageId;
  title: string;
  step: number;
  /** Is the stage running on schedule — `selfheal-registry.ts`'s heartbeat. */
  runtimeStatus: CronBoardStatus;
  /** Has the stage ever demonstrably produced its output. */
  capabilityState: CapabilityState;
  capabilityEvidence: string;
  /** True only while the most recent run has started and not yet completed —
   *  the "current run" fact, read the same way `StageCard` derives it. */
  currentRunInProgress: boolean;
  /** What the most recent completed-or-in-progress run recorded, when known. */
  lastOutcome: StageRunOutcome | null;
  /** Incidents whose turn this stage it is, right now — from `selfheal-flow.ts`. */
  waiting: number;
  stalled: number;
  oldestWaitingMs: number | null;
  unmeasured: number;
  flowState: StageFlow['state'];
  budget: BudgetReading;
  /** Only ever set on the `repair` stage — the newest PR that names an
   *  incident. Null when none exists or the work-log read failed; those two
   *  cases are NOT distinguished here (see `SelfHealBoard.repairLink`'s own
   *  doc for why) because a stage card has no room for the distinction that
   *  `evidence.repairPrsOpened` (`null` vs `0`) already carries elsewhere. */
  repairLink: RepairPrLink | null;
}

export interface SelfHealCircuitView {
  stages: readonly SelfHealCircuitStage[];
  verdictLabel: string;
  verdictDetail: string;
  verdictTone: 'ok' | 'warning' | 'danger' | 'unknown';
  computedAt: string;
  /** Stages whose heartbeat history could not be read this refresh. */
  unreadable: readonly string[];
}

/** Pure. Every input already computed elsewhere — see the module header. */
export function buildSelfHealCircuit(board: SelfHealBoard, flow: FlowSummary): SelfHealCircuitView {
  const flowByStage = new Map(flow.stages.map((s) => [s.stageId, s] as const));

  const stages: SelfHealCircuitStage[] = board.stages.map((stage: SelfHealStageDetail) => {
    const stageId = stage.id as FlowStageId;
    const f = flowByStage.get(stageId);
    const latestRun = stage.history[0] ?? null;
    const currentRunInProgress = Boolean(latestRun?.startedAt) && latestRun?.completedAt == null;

    return {
      stageId,
      title: stage.title,
      step: stage.step,
      runtimeStatus: stage.status,
      capabilityState: stage.capability.state,
      capabilityEvidence: stage.capability.evidence,
      currentRunInProgress,
      lastOutcome: stage.lastOutcome,
      waiting: f?.waiting ?? 0,
      stalled: f?.stalled ?? 0,
      oldestWaitingMs: f?.oldestWaitingMs ?? null,
      unmeasured: f?.unmeasured ?? 0,
      flowState: f?.state ?? 'idle',
      budget: UNTRACKED_BUDGET,
      repairLink: stageId === 'repair' ? board.repairLink : null,
    };
  });

  return {
    stages,
    verdictLabel: board.verdict.label,
    verdictDetail: board.verdict.detail,
    verdictTone: board.verdict.tone,
    computedAt: board.computedAt,
    unreadable: board.unreadable,
  };
}

/**
 * I/O + pure derivation, composed. `now` is threaded through both fetches so
 * a pinned clock (tests, or a caller reasoning about one instant) gets one
 * consistent instant across the board read and the flow derivation, rather
 * than two clock reads a request apart.
 */
export async function fetchSelfHealCircuit(now: Date = new Date()): Promise<AdminFetchResult<SelfHealCircuitView>> {
  const [boardRes, incidentBoard] = await Promise.all([
    fetchSelfHealBoard(now),
    cachedIncidentBoard(DEFAULT_INCIDENT_WINDOW_HOURS),
  ]);

  if (boardRes.status !== 'ok' || !boardRes.data) {
    return { status: boardRes.status, data: null, fetchedAt: boardRes.fetchedAt, error: boardRes.error };
  }

  const flow = summarizeFlow(incidentBoard.incidents, now.getTime());
  return ok(buildSelfHealCircuit(boardRes.data, flow));
}
