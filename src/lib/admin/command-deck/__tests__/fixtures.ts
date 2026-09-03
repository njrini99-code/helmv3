/**
 * Shared fixture builders for the Command Deck read-model tests. Mirrors the
 * `baseIncident`/`incident` pattern in `incidents/__tests__/attention.test.ts`
 * so a `UnifiedIncident` fixture here satisfies the exact same interface a
 * production board would produce.
 */

import type { CoverageSummary, SourceReading } from '@/lib/admin/incidents/sources';
import { buildSourceFreshness, summarizeCoverage } from '@/lib/admin/incidents/sources';
import type { SourceFreshness, UnifiedIncident } from '@/lib/admin/incidents/types';
import type { SelfHealStageDetail } from '@/lib/admin/data/selfheal';

export const NOW = Date.parse('2026-09-03T12:00:00.000Z');
export const DEPLOY_AT = Date.parse('2026-09-03T08:00:00.000Z');

export function baseIncident(id: string): UnifiedIncident {
  return {
    id,
    linkTarget: `/admin/errors/${id}`,
    title: `incident ${id}`,
    description: `incident ${id}`,
    severity: 'error',
    lifecycle: { state: 'new', headline: 'New — not yet analysed.', because: [] },
    firstSeen: '2026-09-03T00:00:00.000Z',
    lastSeen: '2026-09-03T00:00:00.000Z',
    occurrences: 1,
    affectedUsers: 0,
    affectedUsersKnown: false,
    sources: [],
    corroboration: 1,
    appFingerprints: [id],
    sentryIssueIds: [],
    reliabilitySignatures: [],
    route: null,
    featureId: null,
    actionName: null,
    errorCode: null,
    sport: null,
    klass: 'defect',
    actionable: true,
    klassReason: 'r',
    isFixture: false,
    analysis: null,
    repair: null,
    deployProof: null,
    resolution: null,
    proof: [],
    proofGaps: [],
    evidenceCoverage: { dimensions: [], present: 0, total: 7 },
    report: '',
    computedAt: '2026-09-03T00:00:00.000Z',
  };
}

export function incident(id: string, overrides: Partial<UnifiedIncident> = {}): UnifiedIncident {
  return { ...baseIncident(id), ...overrides };
}

export function baseStage(id: string): SelfHealStageDetail {
  return {
    id,
    jobType: `job-${id}`,
    step: 1,
    title: `Stage ${id}`,
    runner: 'vercel-cron',
    cadenceMinutes: 1440,
    what: 'does the thing',
    contract: 'docs/x.md',
    status: 'ok',
    lastRunAt: '2026-09-03T00:00:00.000Z',
    lastRunStatus: 'completed',
    lastError: null,
    lastNote: null,
    overdueAt: null,
    nextExpectedAt: '2026-09-04T00:00:00.000Z',
    lastOutcome: null,
    unreadable: false,
    capability: { stageId: id, state: 'proven', evidence: 'proven evidence', provenAt: '2026-09-03T00:00:00.000Z' },
    history: [],
  };
}

export function stage(id: string, overrides: Partial<SelfHealStageDetail> = {}): SelfHealStageDetail {
  return { ...baseStage(id), ...overrides };
}

/** A clean, fully-readable coverage summary — every source `reading`. */
export function healthyCoverage(): CoverageSummary {
  const readings: SourceReading[] = [
    { source: 'app', health: 'reading', observedAt: new Date(NOW).toISOString() },
    { source: 'sentry', health: 'reading', observedAt: new Date(NOW).toISOString() },
    { source: 'supabase', health: 'reading', observedAt: new Date(NOW).toISOString() },
    { source: 'vercel', health: 'reading', observedAt: new Date(NOW).toISOString() },
  ];
  const rows = buildSourceFreshness(readings, NOW);
  return summarizeCoverage(rows);
}

export function freshnessRows(overrides: Partial<Record<SourceFreshness['source'], SourceReading['health']>> = {}): SourceFreshness[] {
  const readings: SourceReading[] = (['app', 'sentry', 'supabase', 'vercel'] as const).map((source) => ({
    source,
    health: overrides[source] ?? 'reading',
    observedAt: new Date(NOW).toISOString(),
  }));
  return buildSourceFreshness(readings, NOW);
}

/** A coverage summary with one blind source (supabase) — the standing
 *  "evidence blind" fixture every read model's test suite reuses. */
export function blindCoverage(): CoverageSummary {
  const readings: SourceReading[] = [
    { source: 'app', health: 'reading', observedAt: new Date(NOW).toISOString() },
    { source: 'sentry', health: 'reading', observedAt: new Date(NOW).toISOString() },
    { source: 'supabase', health: 'blind', observedAt: null },
    { source: 'vercel', health: 'reading', observedAt: new Date(NOW).toISOString() },
  ];
  const rows = buildSourceFreshness(readings, NOW);
  return summarizeCoverage(rows);
}

/** Every source unknown — the fixture that pins "unknown never renders as
 *  healthy" across every Command Deck read model. */
export function allUnknownCoverage(): CoverageSummary {
  const readings: SourceReading[] = [
    { source: 'app', health: 'unknown', observedAt: null },
    { source: 'sentry', health: 'unknown', observedAt: null },
    { source: 'supabase', health: 'unknown', observedAt: null },
    { source: 'vercel', health: 'unknown', observedAt: null },
  ];
  const rows = buildSourceFreshness(readings, NOW);
  return summarizeCoverage(rows);
}
