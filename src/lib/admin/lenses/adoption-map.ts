import 'server-only';
import { fetchFeatureAdoption, type FeatureAdoptionUserRow } from '@/lib/admin/data/feature-adoption';
import { fetchUsersTab } from '@/lib/admin/data/users';

/**
 * Feature Adoption Map lens (brief §20-27: "Utilization: Feature Adoption
 * Map tied to reliability ('Calendar 78% −18% after release … ← inspect')").
 *
 * REUSE, NOT REBUILD: the feature × time adoption grid (AdoptionHeatGrid)
 * already exists and ships today at /admin/utilization, backed by
 * src/lib/admin/data/feature-adoption.ts's `fetchFeatureAdoption()` — this
 * module does not re-scan admin_events. It calls that SAME function and adds
 * the ONE breakdown the brief names that /admin/utilization does not carry:
 * adoption by TEAM and by ROLE (fetchFeatureAdoption's `users` array already
 * carries `teamId`/`teamLabel` per user; role is joined in from
 * `fetchUsersTab`'s directory, which is the only place a user's role lives).
 *
 * KNOWN LIMIT, disclosed rather than silently accepted: fetchUsersTab caps
 * its directory read at 500 users (ordered by last_seen desc) — a user
 * outside that cap has an `unknown` role here, not a wrong one. Recorded in
 * `roleCoverageNote`.
 *
 * "Tied to reliability": `featureSignals` passes through the SAME
 * dropoutRisk/delta7dPct fields AdoptionHeatGrid already renders, sorted by
 * 30-day unique users — the "Calendar 78% −18% after release" reading is
 * literally `uniqueUsers30d` + `delta7dPct` on one row, already computed by
 * fetchFeatureAdoption; this module does not invent a second reliability
 * signal.
 */

export interface AdoptionGroupRow {
  key: string;
  label: string;
  userCount: number;
  /** Average distinct-feature breadth across users in this group, or null
   *  if the group has no users (never a fabricated 0). */
  avgBreadth: number | null;
  topFeatureKeys: string[];
}

export interface AdoptionFeatureSignal {
  key: string;
  label: string;
  uniqueUsers30d: number;
  delta7dPct: number | null;
  dropoutRisk: boolean;
}

export interface AdoptionMapLens {
  generatedAt: string;
  byTeam: AdoptionGroupRow[];
  byRole: AdoptionGroupRow[];
  featureSignals: AdoptionFeatureSignal[];
  roleCoverageNote: string | null;
  degradedNote: string | null;
}

const TOP_FEATURES_PER_GROUP = 5;
const TOP_SIGNALS = 12;

function topFeatureCounts(users: readonly FeatureAdoptionUserRow[]): string[] {
  const counts = new Map<string, number>();
  for (const u of users) {
    for (const key of u.featureKeys) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_FEATURES_PER_GROUP)
    .map(([k]) => k);
}

function groupRows(groups: Map<string, { label: string; users: FeatureAdoptionUserRow[] }>): AdoptionGroupRow[] {
  return [...groups.entries()]
    .map(([key, { label, users }]) => ({
      key,
      label,
      userCount: users.length,
      avgBreadth: users.length > 0 ? users.reduce((s, u) => s + u.breadth, 0) / users.length : null,
      topFeatureKeys: topFeatureCounts(users),
    }))
    .sort((a, b) => b.userCount - a.userCount);
}

export async function fetchAdoptionMapLens(now: Date = new Date()): Promise<AdoptionMapLens> {
  const degraded: string[] = [];

  const [adoption, directory] = await Promise.all([fetchFeatureAdoption(now), fetchUsersTab({})]);

  if (adoption.status === 'error') {
    degraded.push(`feature adoption read failed: ${adoption.error ?? 'unknown error'}`);
  }

  const roleById = new Map(directory.users.map((u) => [u.id, u.role]));
  const roleCoverageNote =
    directory.totalUsersCount > directory.users.length
      ? `Role lookup covers ${directory.users.length} of ${directory.totalUsersCount} users (directory read caps at 500, ordered by last activity) — users outside that cap show as "unknown" role, not a wrong one.`
      : null;

  const teamGroups = new Map<string, { label: string; users: FeatureAdoptionUserRow[] }>();
  const roleGroups = new Map<string, { label: string; users: FeatureAdoptionUserRow[] }>();

  for (const u of adoption.users) {
    const teamKey = u.teamId ?? 'no_team';
    const teamLabel = u.teamId ? u.teamLabel ?? 'Unknown team' : 'No team';
    if (!teamGroups.has(teamKey)) teamGroups.set(teamKey, { label: teamLabel, users: [] });
    teamGroups.get(teamKey)!.users.push(u);

    const role = roleById.get(u.userId) ?? 'unknown';
    const roleLabel = role.charAt(0).toUpperCase() + role.slice(1);
    if (!roleGroups.has(role)) roleGroups.set(role, { label: roleLabel, users: [] });
    roleGroups.get(role)!.users.push(u);
  }

  const featureSignals: AdoptionFeatureSignal[] = [...adoption.rows]
    .sort((a, b) => b.uniqueUsers30d - a.uniqueUsers30d)
    .slice(0, TOP_SIGNALS)
    .map((r) => ({
      key: r.key,
      label: r.label,
      uniqueUsers30d: r.uniqueUsers30d,
      delta7dPct: r.delta7dPct,
      dropoutRisk: r.dropoutRisk,
    }));

  return {
    generatedAt: now.toISOString(),
    byTeam: groupRows(teamGroups),
    byRole: groupRows(roleGroups),
    featureSignals,
    roleCoverageNote,
    degradedNote: degraded.length > 0 ? degraded.join('; ') : null,
  };
}
