/**
 * Incident Genome — the wiring layer between Phase 0's pure truth models
 * (`aliases.ts`, `episodes.ts`, `coverage.ts`) and a real `UnifiedIncident`
 * board (brief §7 "Bridge Premium Observability", §14 zone B "Incident
 * Genome": "occurrence timeline grouped by release: fixed / clean /
 * REGRESSION").
 *
 * WHY THIS FILE EXISTS. `aliases.ts`, `episodes.ts` and `coverage.ts` are all
 * deliberately pure and take hand-shaped input facts — they do not know how
 * to get those facts out of a `UnifiedIncident` or an `IncidentBoard`. This
 * module is that adapter: it stays pure itself (no I/O, no ambient clock —
 * every function takes the board/incident it needs as an argument), and it
 * only derives what today's `UnifiedIncident` shape can actually answer.
 *
 * HONESTY BOUNDS, STATED ONCE HERE RATHER THAN HIDDEN IN EACH FUNCTION.
 *
 *   - `buildIncidentEpisodes` has only TWO occurrence timestamps available
 *     per incident (`firstSeen`, `lastSeen`) and at most ONE resolution
 *     event (`UnifiedIncident.resolution` — the CURRENT resolution, not a
 *     full history). `episodes.ts`'s own algorithm needs an occurrence
 *     timestamp strictly after a resolution to open a new episode, so this
 *     adapter can detect AT MOST one regression boundary: "has this fault
 *     recurred since its most recent resolution" (exactly what
 *     `resolution.reopenedCount > 0` already independently confirms). It
 *     cannot reconstruct the individual timeline of a fault reopened three
 *     times from two data points, and it does not try to — `reopenedCount`
 *     is surfaced ALONGSIDE the derived episodes precisely so a caller can
 *     tell "we know about 2 episodes" apart from "this has actually reopened
 *     4 times total", never conflating the two.
 *   - `buildIncidentAliasGroups` runs the alias classifier's SECOND pass
 *     (brief §8) over a board of already-distinct `UnifiedIncident`s using
 *     only the fields that model already carries: `id` as the canonical
 *     fingerprint, `errorCode`, `featureId`, `actionName` as the operation,
 *     `route` folded into nothing (not a `classifyMergeConfidence` input),
 *     and `firstSeen` as the occurrence clock. It has no Helm trace id,
 *     Sentry trace id, Flight Recorder run id or normalized stack frames to
 *     compare — those never travel on `UnifiedIncident` today — so it can
 *     only ever produce the classifier's `'highest'` tier via
 *     `canonicalFingerprint` equality (which never happens across genuinely
 *     distinct incidents; `correlate.ts` already merged those) or the
 *     `'medium'` tier via matching RPC/error-code/feature/frames/release/
 *     window. `normalizedTopFrames` and `releaseCohort` are also absent, so
 *     in PRACTICE this adapter can only ever surface groups of size one
 *     (no alias found) until those fields exist upstream. This is
 *     documented, not silently degraded: `IncidentGenome.aliasGroup` is
 *     still built and rendered, and a size-one group renders as "no
 *     alternate evidence found" rather than being hidden.
 *   - `buildIncidentEvidenceCoverage` maps the four sources
 *     `UnifiedIncident.sources` actually carries (`sentry`, `supabase`,
 *     `vercel`; `app` has no cell in the six-source model — see
 *     `coverage.ts`'s header) onto three of the six `coverage.ts` cells
 *     directly. `flight-recorder` and `jobs` have no per-incident signal
 *     anywhere in this codebase yet and are always `'unknown'`. `github` is
 *     inferred from `IncidentRepair` — a real PR/repair state IS GitHub
 *     evidence — never fabricated from silence.
 */

import type { UnifiedIncident, IncidentSourceName } from './types';
import {
  groupIntoRootIncidents,
  type MergeCandidateFacts,
  type RootIncidentAliasGroup,
} from './aliases';
import { deriveEpisodes, type Episode } from './episodes';
import {
  buildEvidenceCoverage,
  type EvidenceReading,
  type EvidenceSourceCoverage,
} from './coverage';

// ---------------------------------------------------------------------------
// Evidence coverage adapter
// ---------------------------------------------------------------------------

/** `coverage.ts`'s six sources this codebase can actually attest to today,
 *  from `UnifiedIncident.sources` (`sentry`/`supabase`/`vercel`) plus a
 *  repair-derived GitHub reading. `flight-recorder` and `jobs` always read
 *  `'unknown'` — see the module header. */
const MAPPABLE_INCIDENT_SOURCES: ReadonlySet<IncidentSourceName> = new Set(['sentry', 'supabase', 'vercel']);

export function buildIncidentEvidenceCoverage(incident: UnifiedIncident): EvidenceSourceCoverage {
  const readings: EvidenceReading[] = [];

  for (const s of incident.sources) {
    if (!MAPPABLE_INCIDENT_SOURCES.has(s.source)) continue;
    readings.push({
      source: s.source as 'sentry' | 'supabase' | 'vercel',
      health: s.health,
      reason: s.health === 'reading' ? null : s.reason,
    });
  }

  if (incident.repair && incident.repair.status !== 'none') {
    readings.push({
      source: 'github',
      health: incident.repair.status === 'unknown' ? 'unknown' : 'reading',
      reason:
        incident.repair.status === 'unknown'
          ? (incident.repair.note ?? 'GitHub repair status could not be read.')
          : null,
    });
  }

  return buildEvidenceCoverage(readings);
}

// ---------------------------------------------------------------------------
// Episodes adapter
// ---------------------------------------------------------------------------

export interface IncidentEpisodesResult {
  episodes: readonly Episode[];
  /** `resolution.reopenedCount` when a resolution exists — the ground truth
   *  for "how many times has this actually come back", independent of how
   *  many episode BOUNDARIES this adapter could reconstruct from the two
   *  timestamps it has. See the module header. */
  knownReopenedCount: number | null;
  /** True when `knownReopenedCount` exceeds `episodes.length - 1` — the
   *  timeline shown is a lower bound, not the whole history. */
  timelineIncomplete: boolean;
}

export function buildIncidentEpisodes(incident: UnifiedIncident): IncidentEpisodesResult {
  const occurrences = [{ at: incident.firstSeen }];
  if (incident.lastSeen !== incident.firstSeen) occurrences.push({ at: incident.lastSeen });

  const resolutions = incident.resolution
    ? [{ resolvedAt: incident.resolution.resolvedAt, fixedInSha: incident.resolution.fixedInSha }]
    : [];

  const episodes = deriveEpisodes({ firstSeen: incident.firstSeen, occurrences, resolutions });
  const knownReopenedCount = incident.resolution?.reopenedCount ?? null;
  const regressionEpisodes = episodes.filter((e) => e.kind === 'regression').length;

  return {
    episodes,
    knownReopenedCount,
    timelineIncomplete: knownReopenedCount !== null && knownReopenedCount > regressionEpisodes,
  };
}

// ---------------------------------------------------------------------------
// Alias groups adapter (board-wide second pass)
// ---------------------------------------------------------------------------

function toMergeCandidate(incident: UnifiedIncident): MergeCandidateFacts {
  return {
    id: incident.id,
    helmTraceId: null,
    sentryTraceId: null,
    flightRecorderRunId: null,
    canonicalFingerprint: incident.id,
    rpc: incident.actionName,
    errorCode: incident.errorCode,
    featureId: incident.featureId,
    operation: incident.actionName,
    normalizedTopFrames: null,
    releaseCohort: null,
    occurredAt: incident.firstSeen,
    source: incident.sources[0]?.source ?? null,
    userId: null,
    message: `${incident.title} ${incident.description}`,
  };
}

/** Run the alias classifier's second pass over an entire board once, keyed by
 *  every member incident id — so a card or the Genome panel for ANY incident
 *  in a group can look up the same group object without re-running the
 *  O(n^2) classifier per incident. */
export function buildBoardAliasGroups(
  incidents: readonly UnifiedIncident[],
): ReadonlyMap<string, RootIncidentAliasGroup> {
  const candidates = incidents.map(toMergeCandidate);
  const groups = groupIntoRootIncidents(candidates);
  const byMemberId = new Map<string, RootIncidentAliasGroup>();
  for (const group of groups) {
    for (const memberId of group.memberIds) byMemberId.set(memberId, group);
  }
  return byMemberId;
}

// ---------------------------------------------------------------------------
// The composed Genome
// ---------------------------------------------------------------------------

export interface IncidentGenome {
  incidentId: string;
  aliasGroup: RootIncidentAliasGroup;
  /** `aliasGroup.memberIds` resolved back to incidents that were findable in
   *  the board passed to `buildIncidentGenome` — the downstream symptoms this
   *  root incident's evidence graph actually attaches. Excludes this incident
   *  itself. */
  downstreamSymptoms: readonly UnifiedIncident[];
  episodes: IncidentEpisodesResult;
  evidenceCoverage: EvidenceSourceCoverage;
}

/**
 * Build the full Genome for one incident, given the board it belongs to.
 * `aliasGroups` should be `buildBoardAliasGroups(board.incidents)`, computed
 * once per board render and passed in — never recomputed per card.
 */
export function buildIncidentGenome(
  incident: UnifiedIncident,
  board: readonly UnifiedIncident[],
  aliasGroups: ReadonlyMap<string, RootIncidentAliasGroup>,
): IncidentGenome {
  const aliasGroup = aliasGroups.get(incident.id) ?? {
    rootId: incident.id,
    aliases: [],
    memberIds: [incident.id],
  };
  const byId = new Map(board.map((i) => [i.id, i] as const));
  const downstreamSymptoms = aliasGroup.memberIds
    .filter((id) => id !== incident.id)
    .map((id) => byId.get(id))
    .filter((i): i is UnifiedIncident => i !== undefined);

  return {
    incidentId: incident.id,
    aliasGroup,
    downstreamSymptoms,
    episodes: buildIncidentEpisodes(incident),
    evidenceCoverage: buildIncidentEvidenceCoverage(incident),
  };
}
