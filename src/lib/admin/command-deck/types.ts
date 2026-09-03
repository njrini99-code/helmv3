/**
 * Helm Bridge Premium — Command Deck shared vocabulary.
 *
 * Phase 2 of the owner's Bridge Premium Observability brief
 * (`docs/ai-system/briefs/BRIDGE_PREMIUM_OBSERVABILITY_BRIEF_2026-09-03.md`,
 * §10-12, §18, §34). This module carries only the types shared across two or
 * more Command Deck read models — a type used by exactly one file lives in
 * that file, not here (see `docs/ai-system/CONTROL_PLANE_ENFORCEMENT.md`'s
 * own rationale for the same convention elsewhere: a shared file invites
 * files that don't need each other to depend on each other anyway).
 *
 * Every state in this module distinguishes UNKNOWN from HEALTHY. A read that
 * failed, a source that could not be reached, or a value nothing computed
 * yet must resolve to `'unknown'`, never silently to a state that reads as
 * "fine" — the brief's §44 "unknown never rendered as zero" applies to a
 * calm color exactly as much as it applies to a count.
 */

import type { StateTone } from '@/lib/admin/incidents/types';

/** The Command Deck's own four-state posture vocabulary — a strict superset
 *  is deliberately NOT attempted here; this is coarser than `LoopVerdict` or
 *  `ReleaseWatchState` on purpose, because the posture sentence is the one
 *  place on the page that must resolve to ONE word, not a per-source matrix. */
export type PostureTone = 'healthy' | 'degraded' | 'critical' | 'unknown';

export const POSTURE_TONE_STATE_TONE: Readonly<Record<PostureTone, StateTone>> = {
  healthy: 'success',
  degraded: 'warning',
  critical: 'danger',
  unknown: 'neutral',
};

/** Orbit node identity — the brief's §11 list (6-9 major nodes), fixed and
 *  stable so the visual reads as the same instrument every time rather than
 *  reshuffling with the data. `realtime` has no evidence source behind it in
 *  the current Evidence Graph (no `IncidentSourceName` covers it) and is
 *  deliberately kept in the list, always resolving `'unknown'` — the payload
 *  budget (§41-43, Orbit <= 10 nodes) demonstrating the vocabulary honestly
 *  costs less than pretending the node doesn't exist. */
export const ORBIT_NODE_IDS = [
  'users',
  'next_vercel',
  'auth',
  'supabase',
  'ai',
  'postgres',
  'jobs',
  'realtime',
] as const;

export type OrbitNodeId = (typeof ORBIT_NODE_IDS)[number];

export type OrbitNodeState = 'healthy' | 'degraded' | 'critical' | 'unknown';

export interface OrbitNode {
  id: OrbitNodeId;
  label: string;
  /** Short state word rendered on the node — never color alone. */
  stateWord: string;
  state: OrbitNodeState;
  /** Recent event/incident count attributed to this node, or null when
   *  nothing is attributable (not the same as zero). */
  eventCount: number | null;
  /** Tiny latency/error readout, when one is meaningful for this node. */
  readout: string | null;
  /** Solid ring = evidence complete; dashed = evidence incomplete/unreadable. */
  evidenceComplete: boolean;
  /** Halo = new or materially changed in the current release window. */
  releaseHalo: boolean;
  /** Small pulse = this node's source is actively receiving recent data. */
  pulsing: boolean;
  href: string | null;
}

export interface OrbitSnapshot {
  nodes: readonly OrbitNode[];
  computedAt: string;
}
