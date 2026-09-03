/**
 * Helm System Orbit (brief §11) — pure derivation of the Command Deck's one
 * dominant visual from evidence Bridge already has.
 *
 * No new incident model, no new source-health model (§44): every node's
 * state is read straight from `IncidentBoard.freshness` (the same per-source
 * health the Truth Strip already renders) and `UnifiedIncident[]` (the same
 * incidents the queue already lists). This file only maps that evidence onto
 * eight fixed nodes and never invents a verdict a source didn't supply.
 */

import type { UnifiedIncident, SourceFreshness, SourceHealth, IncidentSourceName } from '@/lib/admin/incidents/types';
import type { DeployFreshness } from '@/lib/admin/deploy-freshness';
import { ORBIT_NODE_IDS, type OrbitNode, type OrbitNodeId, type OrbitNodeState, type OrbitSnapshot } from './types';

const ORBIT_NODE_LABEL: Readonly<Record<OrbitNodeId, string>> = {
  users: 'Users',
  next_vercel: 'Next / Vercel',
  auth: 'Auth',
  supabase: 'Supabase',
  ai: 'AI',
  postgres: 'Postgres',
  jobs: 'Jobs',
  realtime: 'Realtime',
};

const ORBIT_NODE_HREF: Readonly<Record<OrbitNodeId, string | null>> = {
  users: '/admin/users',
  next_vercel: '/admin/deploys',
  auth: '/admin/auth',
  supabase: '/admin/reliability',
  ai: '/admin/errors?feature=coachhelm_ai_engine',
  postgres: '/admin/jobs',
  jobs: '/admin/self-heal',
  realtime: null,
};

/** Feature keys (`src/lib/admin/feature-registry.ts`) an incident carries
 *  under `featureId` that route it onto the AI node. Kept local and small —
 *  this is a display grouping over the SAME `featureId` the queue already
 *  shows, not a second taxonomy. */
const AI_FEATURE_IDS = new Set([
  'coachhelm_ai_engine',
  'round_review_ai',
  'coachhelm_analytics',
  'coaching_intelligence_settings',
  'player_coachhelm_dashboard',
  'coachhelm_v3_goals',
  'patterns_dashboard',
  'insights_management',
  'intelligence_dashboard',
]);

const AUTH_FEATURE_IDS = new Set(['auth_onboarding', 'join_team_flow']);

/** A Postgres SQLSTATE is always exactly 5 alphanumeric characters
 *  (`42501`, `23505`, `PGRST116` is the PostgREST-namespaced exception —
 *  deliberately excluded so it counts toward Supabase/PostgREST, not the
 *  database engine itself). */
function looksLikeSqlstate(code: string | null): boolean {
  return code !== null && /^[0-9A-Z]{5}$/.test(code);
}

function healthToOrbitState(health: SourceHealth | null): OrbitNodeState {
  if (health === null) return 'unknown';
  switch (health) {
    case 'reading':
      return 'healthy';
    case 'partial':
      return 'degraded';
    case 'blind':
      return 'critical';
    case 'unknown':
      return 'unknown';
  }
}

function stateWordFor(state: OrbitNodeState): string {
  switch (state) {
    case 'healthy':
      return 'Reading';
    case 'degraded':
      return 'Partial';
    case 'critical':
      return 'Blind';
    case 'unknown':
      return 'Unknown';
  }
}

/** Worst-of-N incident severity escalates a node past its source health —
 *  a source can read cleanly while its incidents are still critical (the
 *  source pipe is fine; what it is reporting is not). Never the reverse: an
 *  unknown source health is never downgraded back to healthy by an absence
 *  of incidents, because an absence of incidents from a source we cannot
 *  read proves nothing. */
function escalate(base: OrbitNodeState, worstSeverity: 'critical' | 'error' | 'warning' | null): OrbitNodeState {
  if (base === 'unknown') return 'unknown';
  if (worstSeverity === 'critical') return 'critical';
  if (worstSeverity === 'error' && base === 'healthy') return 'degraded';
  return base;
}

function findFreshness(freshness: readonly SourceFreshness[], source: IncidentSourceName): SourceFreshness | null {
  return freshness.find((f) => f.source === source) ?? null;
}

function worstSeverityOf(incidents: readonly UnifiedIncident[]): 'critical' | 'error' | 'warning' | null {
  let worst: 'critical' | 'error' | 'warning' | null = null;
  for (const incident of incidents) {
    if (incident.lifecycle.state === 'resolved' || incident.isFixture) continue;
    if (incident.severity === 'critical') return 'critical';
    if (incident.severity === 'error' && worst !== 'error') worst = 'error';
    if (incident.severity === 'warning' && worst === null) worst = 'warning';
  }
  return worst;
}

export interface OrbitInput {
  incidents: readonly UnifiedIncident[];
  freshness: readonly SourceFreshness[];
  deployFreshness: DeployFreshness;
  /** Active users today, or null when the KPI read failed/has not run. */
  activeUsersToday: number | null;
  /** True when at least one self-heal stage is actively flowing (not idle,
   *  not stalled) — the Jobs node's pulse. */
  selfHealFlowing: boolean;
  /** True when any self-heal stage is stalled — escalates Jobs past its
   *  own heartbeat health, mirroring `escalate` for the other nodes. */
  selfHealStalled: boolean;
  /** False when the self-heal board itself failed to read — the Jobs node
   *  must render `'unknown'`, never fall through to the calm `'healthy'`
   *  default `selfHealStalled: false` alone would otherwise produce. */
  selfHealReadable: boolean;
  now: number;
}

function activeUnresolvedByFeature(
  incidents: readonly UnifiedIncident[],
  featureIds: ReadonlySet<string>,
): readonly UnifiedIncident[] {
  return incidents.filter(
    (i) => !i.isFixture && i.lifecycle.state !== 'resolved' && i.featureId !== null && featureIds.has(i.featureId),
  );
}

/** Pure. Builds the eight-node Orbit snapshot from evidence the board
 *  already computed — see the module header for why nothing here reaches
 *  past `UnifiedIncident[]` / `SourceFreshness[]` / `DeployFreshness`. */
export function buildSystemOrbit(input: OrbitInput): OrbitSnapshot {
  const nowIso = new Date(input.now).toISOString();
  const supabaseFreshness = findFreshness(input.freshness, 'supabase');
  const appFreshness = findFreshness(input.freshness, 'app');
  const vercelFreshness = findFreshness(input.freshness, 'vercel');

  const authIncidents = activeUnresolvedByFeature(input.incidents, AUTH_FEATURE_IDS);
  const aiIncidents = activeUnresolvedByFeature(input.incidents, AI_FEATURE_IDS);
  const postgresIncidents = input.incidents.filter(
    (i) => !i.isFixture && i.lifecycle.state !== 'resolved' && looksLikeSqlstate(i.errorCode),
  );
  const supabaseIncidents = input.incidents.filter(
    (i) =>
      !i.isFixture &&
      i.lifecycle.state !== 'resolved' &&
      !looksLikeSqlstate(i.errorCode) &&
      (i.sources.some((s) => s.source === 'supabase') || (i.errorCode ?? '').startsWith('PGRST')),
  );

  const deployState: OrbitNodeState =
    input.deployFreshness.state === 'unknown'
      ? 'unknown'
      : input.deployFreshness.state === 'current'
        ? 'healthy'
        : input.deployFreshness.state === 'behind'
          ? 'degraded'
          : 'critical';

  const jobsBaseState: OrbitNodeState = !input.selfHealReadable
    ? 'unknown'
    : input.selfHealStalled
      ? 'degraded'
      : 'healthy';

  const byId: Record<OrbitNodeId, Omit<OrbitNode, 'id' | 'label' | 'href'>> = {
    users: {
      stateWord: input.activeUsersToday === null ? 'Unknown' : 'Active',
      state: input.activeUsersToday === null ? 'unknown' : 'healthy',
      eventCount: input.activeUsersToday,
      readout: input.activeUsersToday === null ? null : `${input.activeUsersToday} today`,
      evidenceComplete: input.activeUsersToday !== null,
      releaseHalo: false,
      pulsing: false,
    },
    next_vercel: {
      stateWord: stateWordForDeploy(deployState),
      state: deployState,
      eventCount: null,
      readout: input.deployFreshness.ageHours !== null ? `${Math.round(input.deployFreshness.ageHours)}h since deploy` : null,
      evidenceComplete: deployState !== 'unknown',
      releaseHalo: input.deployFreshness.state === 'current',
      pulsing: vercelFreshness?.state === 'fresh',
    },
    auth: {
      stateWord: stateWordFor(escalate(healthToOrbitState(appFreshness?.health ?? null), worstSeverityOf(authIncidents))),
      state: escalate(healthToOrbitState(appFreshness?.health ?? null), worstSeverityOf(authIncidents)),
      eventCount: authIncidents.length,
      readout: null,
      evidenceComplete: appFreshness?.health === 'reading',
      releaseHalo: false,
      pulsing: appFreshness?.state === 'fresh',
    },
    supabase: {
      stateWord: stateWordFor(
        escalate(healthToOrbitState(supabaseFreshness?.health ?? null), worstSeverityOf(supabaseIncidents)),
      ),
      state: escalate(healthToOrbitState(supabaseFreshness?.health ?? null), worstSeverityOf(supabaseIncidents)),
      eventCount: supabaseIncidents.length,
      readout: null,
      evidenceComplete: supabaseFreshness?.health === 'reading',
      releaseHalo: false,
      pulsing: supabaseFreshness?.state === 'fresh',
    },
    ai: {
      stateWord: stateWordFor(escalate(healthToOrbitState(appFreshness?.health ?? null), worstSeverityOf(aiIncidents))),
      state: escalate(healthToOrbitState(appFreshness?.health ?? null), worstSeverityOf(aiIncidents)),
      eventCount: aiIncidents.length,
      readout: null,
      evidenceComplete: appFreshness?.health === 'reading',
      releaseHalo: false,
      pulsing: false,
    },
    postgres: {
      stateWord: stateWordFor(
        escalate(healthToOrbitState(supabaseFreshness?.health ?? null), worstSeverityOf(postgresIncidents)),
      ),
      state: escalate(healthToOrbitState(supabaseFreshness?.health ?? null), worstSeverityOf(postgresIncidents)),
      eventCount: postgresIncidents.length,
      readout: null,
      evidenceComplete: supabaseFreshness?.health === 'reading',
      releaseHalo: false,
      pulsing: false,
    },
    jobs: {
      stateWord: stateWordFor(jobsBaseState),
      state: jobsBaseState,
      eventCount: null,
      readout: !input.selfHealReadable
        ? 'unreadable'
        : input.selfHealFlowing
          ? 'active'
          : input.selfHealStalled
            ? 'stalled'
            : 'idle',
      evidenceComplete: input.selfHealReadable,
      releaseHalo: false,
      pulsing: input.selfHealFlowing,
    },
    // No `IncidentSourceName` covers Realtime today — no evidence, so this
    // node is ALWAYS unknown. That is the point, not a bug to silence: the
    // brief's visual vocabulary (§4) defines a dashed ring + hatched fill for
    // exactly this case, and a node that can never be anything else keeps the
    // rule honest instead of decorative.
    realtime: {
      stateWord: 'Unknown',
      state: 'unknown',
      eventCount: null,
      readout: 'no evidence source wired',
      evidenceComplete: false,
      releaseHalo: false,
      pulsing: false,
    },
  };

  const nodes: OrbitNode[] = ORBIT_NODE_IDS.map((id) => ({
    id,
    label: ORBIT_NODE_LABEL[id],
    href: ORBIT_NODE_HREF[id],
    ...byId[id],
  }));

  return { nodes, computedAt: nowIso };
}

function stateWordForDeploy(state: OrbitNodeState): string {
  switch (state) {
    case 'healthy':
      return 'Current';
    case 'degraded':
      return 'Behind';
    case 'critical':
      return 'Stale';
    case 'unknown':
      return 'Unknown';
  }
}
