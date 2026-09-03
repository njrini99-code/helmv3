/**
 * Release Wake ribbon (brief §12) — a horizontal temporal summary around the
 * last deploy, bucketed server-side (§41-43: "raw events are bucketed
 * server-side, never spammed").
 *
 * Wires the Phase 0 `release-context.ts` classifiers
 * (`classifyReleaseWatch`, `classifyReleaseRelationship`) against real
 * evidence already on `IncidentBoard` — this file adds no new incident
 * model and computes no new verdict `release-context.ts` doesn't already
 * define (§44).
 *
 * Two lanes the brief lists — latency and invariants — have no read model
 * wired anywhere in this repo yet (Query Pulse is brief §37, Invariant
 * Lattice is brief §16, both Phase 3+). Rather than fabricate numbers for
 * them, both render `unknown: true` with a stated reason. A lane that always
 * reads zero is indistinguishable from a healthy lane; a lane that says it
 * cannot be read is not.
 */

import type { UnifiedIncident } from '@/lib/admin/incidents/types';
import {
  classifyReleaseWatch,
  classifyReleaseRelationship,
  type ReleaseWatchState,
  type ReleaseRelationship,
} from '@/lib/admin/incidents/release-context';

export interface WakeIncidentEntry {
  id: string;
  title: string;
  href: string | null;
  severity: UnifiedIncident['severity'];
  relationship: ReleaseRelationship;
  affectedUsers: number;
}

export interface WakeLane {
  count: number;
  unknown: boolean;
  unknownReason: string | null;
}

export interface ReleaseWakeSnapshot {
  releaseSha: string | null;
  deployedAt: string | null;
  ageHours: number | null;
  watchState: ReleaseWatchState;
  incidents: readonly WakeIncidentEntry[];
  lanes: {
    incidents: WakeLane;
    userImpact: WakeLane;
    databaseErrors: WakeLane;
    latency: WakeLane;
    invariants: WakeLane;
    selfHealActions: WakeLane;
  };
  computedAt: string;
}

export interface BuildReleaseWakeInput {
  incidents: readonly UnifiedIncident[];
  releaseSha: string | null;
  deployedAtMs: number | null;
  sourceCoverageBlind: boolean;
  now: number;
  /** How many analyses/repairs were generated at/after the deploy — the
   *  self-heal-actions lane. Passed in rather than re-derived here so this
   *  file never has to know `rca_analyses`' schema. */
  selfHealActionsSinceDeploy: number;
}

const SQLSTATE_RE = /^[0-9A-Z]{5}$/;

function unknownLane(reason: string): WakeLane {
  return { count: 0, unknown: true, unknownReason: reason };
}

function knownLane(count: number): WakeLane {
  return { count, unknown: false, unknownReason: null };
}

/** Pure. `deployedAtMs: null` degrades `watchState` to `'unknown'` and every
 *  count-based lane to its honest zero-with-caveat rather than a guess. */
export function buildReleaseWake(input: BuildReleaseWakeInput): ReleaseWakeSnapshot {
  const { deployedAtMs, now } = input;

  const active = input.incidents.filter((i) => !i.isFixture && i.lifecycle.state !== 'resolved');

  const entries: WakeIncidentEntry[] = active.map((incident) => {
    const firstSeenMs = Date.parse(incident.firstSeen);
    const verdict = classifyReleaseRelationship({
      firstSeenMs: Number.isFinite(firstSeenMs) ? firstSeenMs : now,
      releaseDeployedAtMs: deployedAtMs,
      // Honest gaps: this Bridge does not yet track an occurrence-rate trend,
      // a per-release code diff, cohort membership, or a replay-on-two-SHAs
      // result, so every corroborating signal below is passed as unknown
      // rather than guessed. `classifyReleaseRelationship` degrades this
      // combination to a genuinely temporal-only verdict on its own — see its
      // own doc comment ("Proximity is not causation").
      occurrenceTrend: 'unknown',
      featureChangedInRelease: null,
      codeInTraceChangedInRelease: null,
      candidateCohortOnly: null,
      baselineCohortClean: null,
      replayReproducesOnNewShaOnly: null,
    });
    return {
      id: incident.id,
      title: incident.title,
      href: incident.linkTarget,
      severity: incident.severity,
      relationship: verdict.relationship,
      affectedUsers: incident.affectedUsersKnown ? incident.affectedUsers : 0,
    };
  });

  const sinceDeploy = deployedAtMs === null ? [] : entries.filter((e) => e.relationship !== 'existed-before-release');
  const newIncidentsCount = sinceDeploy.length;
  const regressedActive = active.filter(
    (i) => i.lifecycle.state === 'regressed' && (deployedAtMs === null || Date.parse(i.lastSeen) >= deployedAtMs),
  );

  const watchState: ReleaseWatchState = classifyReleaseWatch({
    releaseDeployedAtMs: deployedAtMs,
    now,
    newIncidentsCount,
    regressedIncidentsCount: regressedActive.length,
    rollbackRecommended: regressedActive.some((i) => i.severity === 'critical'),
    sourceCoverageBlind: input.sourceCoverageBlind,
  });

  const databaseErrorEntries = sinceDeploy.filter((e) => {
    const incident = active.find((i) => i.id === e.id);
    return incident !== undefined && SQLSTATE_RE.test(incident.errorCode ?? '');
  });
  const userImpactTotal = sinceDeploy.reduce((sum, e) => sum + e.affectedUsers, 0);

  return {
    releaseSha: input.releaseSha,
    deployedAt: deployedAtMs === null ? null : new Date(deployedAtMs).toISOString(),
    ageHours: deployedAtMs === null ? null : (now - deployedAtMs) / 3_600_000,
    watchState,
    incidents: sinceDeploy,
    lanes: {
      incidents: deployedAtMs === null ? unknownLane('Release deploy time unknown') : knownLane(newIncidentsCount),
      userImpact: deployedAtMs === null ? unknownLane('Release deploy time unknown') : knownLane(userImpactTotal),
      databaseErrors:
        deployedAtMs === null ? unknownLane('Release deploy time unknown') : knownLane(databaseErrorEntries.length),
      latency: unknownLane('Query Pulse (brief §37) is not wired yet'),
      invariants: unknownLane('Invariant Lattice (brief §16) is not wired yet'),
      // Gated on `deployedAtMs` the same as the other since-deploy lanes: the
      // caller can only honestly count actions "since deploy" when it knows
      // when the deploy was. A caller passing `0` because it, too, could not
      // establish the deploy time must not read as "zero actions happened" —
      // that is a materially different claim from "we cannot say".
      selfHealActions:
        deployedAtMs === null ? unknownLane('Release deploy time unknown') : knownLane(input.selfHealActionsSinceDeploy),
    },
    computedAt: new Date(now).toISOString(),
  };
}
