import 'server-only';

import { REPLAY_COVERAGE_INDEX, type ReplayCoverageIndexRow, type ReplayVerdict } from './coverage-index.generated';

export type { ReplayVerdict, ReplayCoverageIndexRow };

/**
 * Read model for the Incident Replay Lab's Bridge surface
 * (`/admin/self-heal`'s "Replay coverage" panel — Phase G, G.6).
 *
 * Backed by a generated, bundled index
 * (`coverage-index.generated.ts`, regenerated from `replay/manifests/*.yml`
 * + `replay/proofs/*.json` by `node replay/runners/gen-coverage-index.mjs`)
 * rather than a runtime filesystem read — see that generator's own header
 * for why: this codebase has no precedent for a server component reading an
 * arbitrary repo-root file at request time, and Vercel's output file
 * tracing is not guaranteed to include files nothing imports.
 *
 * `verdict` is never fabricated. A manifest with no matching
 * `replay/proofs/<id>.json` renders `'not-yet-run'` — never
 * `'reproduced'` — because `replay/runners/run.mjs` only writes a proof
 * file after a real worktree checkout, fixture apply, and test run
 * actually completed. See `replay/README.md`'s "absence means not yet run,
 * never passed".
 */
export function getReplayCoverage(): readonly ReplayCoverageIndexRow[] {
  return REPLAY_COVERAGE_INDEX;
}

export interface ReplayCoverageSummary {
  total: number;
  reproduced: number;
  inconclusive: number;
  notYetRun: number;
}

export function summarizeReplayCoverage(rows: readonly ReplayCoverageIndexRow[] = REPLAY_COVERAGE_INDEX): ReplayCoverageSummary {
  return rows.reduce<ReplayCoverageSummary>(
    (acc, row) => {
      acc.total += 1;
      if (row.verdict === 'reproduced') acc.reproduced += 1;
      else if (row.verdict === 'inconclusive') acc.inconclusive += 1;
      else acc.notYetRun += 1;
      return acc;
    },
    { total: 0, reproduced: 0, inconclusive: 0, notYetRun: 0 },
  );
}

/** Finds the replay(s) backing a given incident, by the manifest's own
 *  `incident_id` field (a repo-relative path to a `memory/incidents/**`
 *  file). Returns an empty array for an incident with no replay — the
 *  overwhelming majority of incidents, since only 3 exist as of this PR. */
export function findReplaysForIncident(
  incidentId: string,
  rows: readonly ReplayCoverageIndexRow[] = REPLAY_COVERAGE_INDEX,
): readonly ReplayCoverageIndexRow[] {
  return rows.filter((r) => r.incidentId === incidentId);
}

export const VERDICT_LABEL: Record<ReplayVerdict, string> = {
  reproduced: 'Reproduced',
  inconclusive: 'Inconclusive',
  'not-yet-run': 'Not yet run',
};
