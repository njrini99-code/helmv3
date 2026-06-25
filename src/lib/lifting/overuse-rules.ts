// =============================================================================
// src/lib/lifting/overuse-rules.ts
//
// Helm Lifting Lab — Overuse / Review Flag Rules (spec §13)
//
// PURE functions: no DB access, no React, no async.
// All inputs are plain data arrays the caller fetches and passes in.
// Each exported function returns zero or more typed Flags.
//
// Coach language rule: NEVER use "injury", "risk", or "medical" wording.
// Use "needs review", "worth checking", "pattern worth noting".
// =============================================================================

import { regionsForBaseballRiskGroup } from '@/lib/lifting/soreness-regions';
import type { SorenessRegionId } from '@/lib/lifting/soreness-regions';
import type { SorenessSeverity } from '@/lib/types/helm-lifting-checkins';

// -----------------------------------------------------------------------------
// Input shapes
//
// These are deliberately minimal — callers project from their own DB rows.
// No coupling to the full SorenessCheckRequest type so these rules can be
// unit-tested without any Supabase import.
// -----------------------------------------------------------------------------

/** One soreness-map row as needed by the overuse engine. */
export interface SorenessMapEntry {
  /** ISO date string for the check-in day (YYYY-MM-DD). */
  readonly checkin_date: string;
  /** Matches SorenessRegionId keys from soreness-regions.ts. */
  readonly region_id: SorenessRegionId;
  readonly severity: SorenessSeverity;
  readonly athlete_id: string;
}

/** One missed check-in request row as needed by the overuse engine. */
export interface MissedCheckinEntry {
  /** ISO date string for the due date. */
  readonly due_date: string;
  readonly athlete_id: string;
}

// -----------------------------------------------------------------------------
// Output shape — typed Flag
// -----------------------------------------------------------------------------

export type FlagKind =
  | 'high_severity'
  | 'recurring_region'
  | 'worsening'
  | 'throwing_arm_concern'
  | 'lower_body_lift_conflict'
  | 'missed_checkins';

/** A single coach-facing review flag for one athlete. */
export interface OveruseFlag {
  readonly kind: FlagKind;
  readonly athleteId: string;
  /** Present on region-specific flags. */
  readonly regionId?: SorenessRegionId;
  /** Present when a numeric severity is meaningful. */
  readonly severity?: SorenessSeverity;
  /** Coach-facing label: short, action-oriented, no medical language. */
  readonly label: string;
}

// -----------------------------------------------------------------------------
// Internal helpers
// -----------------------------------------------------------------------------

/** Parse ISO date string to a JS Date at midnight UTC. */
function parseIso(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

/** Absolute difference in calendar days between two ISO dates. */
function diffDays(a: string, b: string): number {
  const ms = Math.abs(parseIso(a).getTime() - parseIso(b).getTime());
  return ms / 86_400_000;
}

/** Filter entries to those within the past N days from referenceDate (inclusive). */
function withinDays(
  entries: readonly { checkin_date: string }[],
  referenceDate: string,
  days: number,
): typeof entries {
  return entries.filter((e) => diffDays(e.checkin_date, referenceDate) <= days);
}

/** Group soreness entries by athlete_id → region_id. */
function groupByAthleteRegion(
  entries: readonly SorenessMapEntry[],
): Map<string, Map<SorenessRegionId, SorenessMapEntry[]>> {
  const out = new Map<string, Map<SorenessRegionId, SorenessMapEntry[]>>();
  for (const e of entries) {
    if (!out.has(e.athlete_id)) out.set(e.athlete_id, new Map());
    const byRegion = out.get(e.athlete_id)!;
    if (!byRegion.has(e.region_id)) byRegion.set(e.region_id, []);
    byRegion.get(e.region_id)!.push(e);
  }
  return out;
}

// -----------------------------------------------------------------------------
// Rule 1 — High severity (spec §13: any region >= 7)
// -----------------------------------------------------------------------------

/**
 * Returns a flag for every soreness-map entry where severity >= 7.
 * Operates on the caller-provided window (typically today's checkins).
 */
export function highSeverity(entries: readonly SorenessMapEntry[]): OveruseFlag[] {
  const flags: OveruseFlag[] = [];
  for (const e of entries) {
    if (e.severity >= 7) {
      flags.push({
        kind: 'high_severity',
        athleteId: e.athlete_id,
        regionId: e.region_id,
        severity: e.severity,
        label: `High soreness reported (${e.severity}/10) — worth checking before today's session.`,
      });
    }
  }
  return flags;
}

// -----------------------------------------------------------------------------
// Rule 2 — Recurring region (spec §13: same region 3x in 7 days)
// -----------------------------------------------------------------------------

/**
 * Returns a flag for each athlete × region combination that appears
 * 3 or more times within any 7-day window in the provided entries.
 *
 * Callers should pass the full rolling 7-day window; this function does
 * not need to know the reference date.
 */
export function recurringRegion(entries: readonly SorenessMapEntry[]): OveruseFlag[] {
  const flags: OveruseFlag[] = [];
  const byAthleteRegion = groupByAthleteRegion(entries);

  for (const [athleteId, byRegion] of byAthleteRegion) {
    for (const [regionId, regionEntries] of byRegion) {
      // Sort ascending so the sliding window check is straightforward
      const sorted = [...regionEntries].sort((a, b) =>
        a.checkin_date.localeCompare(b.checkin_date),
      );

      // Slide: for each entry i, count how many entries j (j >= i) are within 7 days of i
      let flagged = false;
      for (let i = 0; i < sorted.length && !flagged; i++) {
        const anchor = sorted[i];
        if (!anchor) continue;
        let count = 0;
        for (let j = i; j < sorted.length; j++) {
          const entry = sorted[j];
          if (!entry) continue;
          if (diffDays(anchor.checkin_date, entry.checkin_date) <= 7) count++;
          else break; // sorted → no point continuing
        }
        if (count >= 3) {
          flags.push({
            kind: 'recurring_region',
            athleteId,
            regionId,
            label: `${regionId.replace(/_/g, ' ')} reported ${count}× in 7 days — soreness pattern worth noting.`,
          });
          flagged = true; // one flag per athlete × region per window is enough
        }
      }
    }
  }
  return flags;
}

// -----------------------------------------------------------------------------
// Rule 3 — Worsening (spec §13: same region increased +3 over 7 days)
// -----------------------------------------------------------------------------

/**
 * Compares the earliest and latest severity reading for each athlete × region
 * pair within the window. Flags if severity increased by 3+ points.
 *
 * "Worsening" is directional — decreasing severity is never flagged.
 */
export function worsening(entries: readonly SorenessMapEntry[]): OveruseFlag[] {
  const flags: OveruseFlag[] = [];
  const byAthleteRegion = groupByAthleteRegion(entries);

  for (const [athleteId, byRegion] of byAthleteRegion) {
    for (const [regionId, regionEntries] of byRegion) {
      if (regionEntries.length < 2) continue;

      const sorted = [...regionEntries].sort((a, b) =>
        a.checkin_date.localeCompare(b.checkin_date),
      );
      const earliest = sorted[0];
      const latest = sorted[sorted.length - 1];

      if (!earliest || !latest) continue;

      const delta = latest.severity - earliest.severity;
      if (delta >= 3) {
        flags.push({
          kind: 'worsening',
          athleteId,
          regionId,
          severity: latest.severity,
          label: `${regionId.replace(/_/g, ' ')} up ${delta} points over 7 days (${earliest.severity}→${latest.severity}) — soreness trend worth reviewing.`,
        });
      }
    }
  }
  return flags;
}

// -----------------------------------------------------------------------------
// Rule 4 — Throwing arm concern (spec §13: pitcher reports throwing arm >= 5)
//
// Callers are responsible for scoping entries to pitchers only when they want
// pitcher-specific alerts. This function applies the arm-region + severity
// threshold regardless of position.
// -----------------------------------------------------------------------------

/** IDs of throwing-arm regions (shoulder, elbow, forearm) from the registry. */
const THROWING_ARM_REGION_IDS = new Set<string>(
  regionsForBaseballRiskGroup('throwing_arm'),
);

/**
 * Returns a flag for every soreness-map entry in a throwing-arm region with
 * severity >= 5. Callers should pre-filter to pitcher athletes.
 */
export function throwingArmConcern(entries: readonly SorenessMapEntry[]): OveruseFlag[] {
  const flags: OveruseFlag[] = [];
  for (const e of entries) {
    if (THROWING_ARM_REGION_IDS.has(e.region_id) && e.severity >= 5) {
      flags.push({
        kind: 'throwing_arm_concern',
        athleteId: e.athlete_id,
        regionId: e.region_id,
        severity: e.severity,
        label: `Throwing arm soreness (${e.region_id.replace(/_/g, ' ')}, ${e.severity}/10) — review before next throw workload.`,
      });
    }
  }
  return flags;
}

// -----------------------------------------------------------------------------
// Rule 5 — Lower body lift conflict
//   (spec §13: lower body soreness >= 6 on lower-body lift day)
//
// "Lower body" region IDs are: quad, hamstring, knee, calf, ankle_foot, glute, hip.
// Callers pass: soreness entries for today AND a boolean indicating whether a
// lower-body lift is scheduled today for the athlete.
// -----------------------------------------------------------------------------

const LOWER_BODY_REGION_IDS = new Set<SorenessRegionId>([
  'left_quad', 'right_quad',
  'left_hamstring', 'right_hamstring',
  'left_knee', 'right_knee',
  'left_calf', 'right_calf',
  'left_ankle_foot', 'right_ankle_foot',
  'left_glute', 'right_glute',
  'left_hip', 'right_hip',
  'groin',
]);

/**
 * Flags athletes who reported lower-body soreness >= 6 AND have a lower-body
 * lift scheduled today.
 *
 * @param entries       Today's soreness-map entries (any athletes)
 * @param liftAthleteIds Set of athlete_ids who have a lower-body lift today
 */
export function lowerBodyLiftConflict(
  entries: readonly SorenessMapEntry[],
  liftAthleteIds: ReadonlySet<string>,
): OveruseFlag[] {
  const flags: OveruseFlag[] = [];
  for (const e of entries) {
    if (
      LOWER_BODY_REGION_IDS.has(e.region_id) &&
      e.severity >= 6 &&
      liftAthleteIds.has(e.athlete_id)
    ) {
      flags.push({
        kind: 'lower_body_lift_conflict',
        athleteId: e.athlete_id,
        regionId: e.region_id,
        severity: e.severity,
        label: `Lower body soreness (${e.region_id.replace(/_/g, ' ')}, ${e.severity}/10) with a lower-body lift today — check before session.`,
      });
    }
  }
  return flags;
}

// -----------------------------------------------------------------------------
// Rule 6 — Missed check-ins (spec §13: 2+ missed in 7 days)
// -----------------------------------------------------------------------------

/**
 * Returns a flag for each athlete who has missed 2 or more soreness or weight
 * check-ins within the past 7 days (inclusive of the reference date).
 *
 * @param missedEntries   All 'missed' request rows for the relevant window
 * @param referenceDate   ISO date string representing "today" (YYYY-MM-DD)
 */
export function missedCheckins(
  missedEntries: readonly MissedCheckinEntry[],
  referenceDate: string,
): OveruseFlag[] {
  const flags: OveruseFlag[] = [];

  // Filter to window, then group by athlete.
  // Remap due_date → checkin_date so withinDays can operate on a shared shape.
  const remapped = missedEntries.map((e) => ({
    athlete_id: e.athlete_id,
    checkin_date: e.due_date,
  }));
  const inWindow = withinDays(remapped, referenceDate, 7);
  const inWindowDates = new Set(inWindow.map((e) => e.checkin_date));

  const countByAthlete = new Map<string, number>();
  for (const entry of missedEntries) {
    if (!inWindowDates.has(entry.due_date)) continue;
    countByAthlete.set(entry.athlete_id, (countByAthlete.get(entry.athlete_id) ?? 0) + 1);
  }

  for (const [athleteId, count] of countByAthlete) {
    if (count >= 2) {
      flags.push({
        kind: 'missed_checkins',
        athleteId,
        label: `${count} missed check-ins in the last 7 days — follow up on compliance.`,
      });
    }
  }
  return flags;
}

// -----------------------------------------------------------------------------
// Convenience: run all rules in one pass
// -----------------------------------------------------------------------------

export interface AllRulesInput {
  /** Rolling 7-day soreness entries for all athletes in scope. */
  readonly sorenessWindow: readonly SorenessMapEntry[];
  /** Today's soreness entries only (subset of sorenessWindow). */
  readonly today: readonly SorenessMapEntry[];
  /** Pitcher athlete IDs (for throwing-arm concern). */
  readonly pitcherAthleteIds: ReadonlySet<string>;
  /** Athlete IDs with a lower-body lift scheduled today. */
  readonly lowerBodyLiftAthleteIds: ReadonlySet<string>;
  /** 'missed' request rows for the past 7 days. */
  readonly missedWindow: readonly MissedCheckinEntry[];
  /** ISO date for "today". */
  readonly referenceDate: string;
}

/**
 * Runs all six overuse rules and returns a deduplicated, sorted flag list.
 * Deduplication key: kind + athleteId + regionId — prevents one bad day
 * from producing a flood of identical alerts.
 */
export function runAllOveruseRules(input: AllRulesInput): OveruseFlag[] {
  const {
    sorenessWindow,
    today,
    pitcherAthleteIds,
    lowerBodyLiftAthleteIds,
    missedWindow,
    referenceDate,
  } = input;

  const pitcherEntries = today.filter((e) => pitcherAthleteIds.has(e.athlete_id));

  const raw: OveruseFlag[] = [
    ...highSeverity(today),
    ...recurringRegion(sorenessWindow),
    ...worsening(sorenessWindow),
    ...throwingArmConcern(pitcherEntries),
    ...lowerBodyLiftConflict(today, lowerBodyLiftAthleteIds),
    ...missedCheckins(missedWindow, referenceDate),
  ];

  // Deduplicate on kind + athleteId + regionId
  const seen = new Set<string>();
  return raw.filter((f) => {
    const key = `${f.kind}|${f.athleteId}|${f.regionId ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
