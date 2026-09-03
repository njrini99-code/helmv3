/**
 * Self-Heal Circuit summary (brief §18) — Diagnose -> Repair -> Close.
 *
 * The owner brief's full circuit is Collect -> Diagnose -> Repair -> Review
 * -> Deploy -> Traffic -> Close; the loop this repo actually runs today has
 * three automated stages (`src/lib/admin/selfheal-registry.ts`'s
 * `SELFHEAL_STAGES`: `triage` titled "Diagnose", `repair`, `close`) with
 * Review/Deploy/Traffic covered by ordinary PR review and the existing
 * deploy-proof machinery, not a fourth-through-sixth automated stage. This
 * summary renders the three stages that exist rather than three more that
 * would have to be invented to fill out the brief's diagram — no second
 * self-heal lifecycle (§44).
 *
 * Composition only: every fact here already exists on `SelfHealBoard`
 * (`data/selfheal.ts`) and `FlowSummary`/`deriveIncidentFlow`
 * (`selfheal-flow.ts`). This file adds exactly one thing neither of those
 * expose — WHICH incident is the one currently waiting longest at each
 * stage, so "current active incident" (§18) is a real link, not a count.
 */

import type { UnifiedIncident } from '@/lib/admin/incidents/types';
import { deriveIncidentFlow, type FlowStageId, type FlowSummary, FLOW_STAGE_TITLE } from '@/lib/admin/selfheal-flow';
import type { SelfHealStageDetail } from '@/lib/admin/data/selfheal';
import type { LoopVerdict } from '@/lib/admin/selfheal-capability';

export interface CircuitStage {
  stageId: FlowStageId;
  title: string;
  /** 'idle' | 'flowing' | 'stalled', straight from `FlowSummary`. */
  state: 'idle' | 'flowing' | 'stalled';
  waiting: number;
  stalled: number;
  oldestWaitingMs: number | null;
  /** From `StageCapability` — 'proven' | 'unproven' | 'unknown'. Never
   *  displayed as proven when the underlying evidence read failed. */
  capabilityState: 'proven' | 'unproven' | 'unknown';
  lastOutcome: SelfHealStageDetail['lastOutcome'];
  nextExpectedAt: string | null;
  overdueAt: string | null;
  /** The one incident waiting longest at this stage, when any is. */
  activeIncident: { id: string; title: string; href: string | null; waitingMs: number | null } | null;
}

export interface CircuitSummary {
  /** true only when a stage's `state === 'flowing'` — the one traveling dot
   *  the brief's motion vocabulary allows (§3). */
  activeStageId: FlowStageId | null;
  stages: readonly CircuitStage[];
  verdict: LoopVerdict | null;
  computedAt: string;
}

export interface BuildCircuitSummaryInput {
  incidents: readonly UnifiedIncident[];
  flow: FlowSummary;
  stageDetails: readonly SelfHealStageDetail[] | null;
  verdict: LoopVerdict | null;
  now: number;
}

function longestWaitingIncident(
  incidents: readonly UnifiedIncident[],
  stageId: FlowStageId,
  now: number,
): CircuitStage['activeIncident'] {
  let best: { incident: UnifiedIncident; waitingMs: number | null } | null = null;
  for (const incident of incidents) {
    const flow = deriveIncidentFlow(incident, now);
    if (flow.stageId !== stageId) continue;
    const ms = flow.waitingMs ?? -1;
    const bestMs = best?.waitingMs ?? -1;
    if (best === null || ms > bestMs) {
      best = { incident, waitingMs: flow.waitingMs };
    }
  }
  if (!best) return null;
  return {
    id: best.incident.id,
    title: best.incident.title,
    href: best.incident.linkTarget,
    waitingMs: best.waitingMs,
  };
}

/** Pure. `stageDetails: null` means the self-heal board itself failed to
 *  read — every stage degrades to `capabilityState: 'unknown'` rather than
 *  being silently omitted, so a dead loop still has a row per stage instead
 *  of vanishing from the summary. */
export function buildCircuitSummary(input: BuildCircuitSummaryInput): CircuitSummary {
  const detailByStage = new Map((input.stageDetails ?? []).map((d) => [d.id as FlowStageId, d]));

  const stages: CircuitStage[] = input.flow.stages.map((flowStage) => {
    const detail = detailByStage.get(flowStage.stageId) ?? null;
    return {
      stageId: flowStage.stageId,
      title: FLOW_STAGE_TITLE[flowStage.stageId],
      state: flowStage.state,
      waiting: flowStage.waiting,
      stalled: flowStage.stalled,
      oldestWaitingMs: flowStage.oldestWaitingMs,
      capabilityState: detail?.capability.state ?? 'unknown',
      lastOutcome: detail?.lastOutcome ?? null,
      nextExpectedAt: detail?.nextExpectedAt ?? null,
      overdueAt: detail?.overdueAt ?? null,
      activeIncident: longestWaitingIncident(input.incidents, flowStage.stageId, input.now),
    };
  });

  const flowing = stages.find((s) => s.state === 'flowing');

  return {
    activeStageId: flowing?.stageId ?? null,
    stages,
    verdict: input.verdict,
    computedAt: new Date(input.now).toISOString(),
  };
}
