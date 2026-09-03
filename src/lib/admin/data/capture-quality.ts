import 'server-only';
import {
  extractActionName,
  extractErrorCode,
  extractRoute,
} from '@/lib/admin/incident-report';
import { isExpectedAuthNoise, type AppTriageEventRow } from '@/lib/admin/data/triage';
import { queryAppErrorEvents, DEFAULT_INCIDENT_WINDOW_HOURS } from '@/lib/admin/data/incident-feed';
import { type AdminFetchResult, ok, failed } from '@/lib/admin/fetch-result';

/**
 * Helm Bridge — capture QUALITY, not incident volume.
 *
 * This is a measurement, not an instrumentation change. It reads rows that
 * `queryAppErrorEvents` already returns and reports how completely each one
 * was captured — it adds no column, runs no migration, and touches no
 * capture path.
 *
 * WHY THIS EXISTS. A row that carries no error code, no stack and no route
 * is not a mystery about production — it is a mystery about the CALL SITE
 * that logged it, and the fix is to instrument that call site (see
 * server-error-logger.ts's normalizeContext, which is what a well-behaved
 * emitter runs through). Today that fact is invisible: an under-instrumented
 * emitter looks exactly like a well-instrumented one until someone happens
 * to open one of its rows. This turns that into a visible, ranked backlog —
 * "these emitters", not "somewhere, probably".
 */

export const CAPTURE_FIELDS = [
  'error-code',
  'stack',
  'route',
  'feature',
  'action',
  'user',
] as const;

export type CaptureField = (typeof CAPTURE_FIELDS)[number];

export const CAPTURE_FIELD_LABEL: Readonly<Record<CaptureField, string>> = {
  'error-code': 'Error code',
  stack: 'Stack trace',
  route: 'Route',
  feature: 'Feature',
  action: 'Action',
  user: 'User',
};

export interface CaptureFieldCoverage {
  field: CaptureField;
  present: number;
  /**
   * This field's own denominator. Equal to `CaptureQualityReport.rows` for
   * every field except 'user', which excludes cron/system rows that could
   * never have carried a user_id — see `SELF_REFERENTIAL_SOURCES`.
   */
  total: number;
  /**
   * Present as a fraction of total. Null when total is 0 — never coerced to
   * 0/0 = 0. Zero rows means "nothing happened", not "we captured nothing",
   * and rendering that as 0% coverage would report a capture failure that
   * never occurred.
   */
  ratio: number | null;
}

export interface CaptureQualityWeakSource {
  source: string;
  rows: number;
  missing: number;
  /** One real title from this source's rows, so the reader can go find the emitter. */
  sampleTitle: string;
}

export interface CaptureQualityReport {
  fields: CaptureFieldCoverage[];
  /**
   * Rows analysed. The denominator every field's ratio is computed against —
   * EXCEPT 'user': that field carries its own smaller `total`, excluding
   * cron/system rows that could never have carried a user_id. See
   * `CaptureFieldCoverage.total` and `SELF_REFERENTIAL_SOURCES`.
   */
  rows: number;
  windowHours: number;
  /** Emitters (grouped by `source`) with the WEAKEST capture, worst first. */
  weakestSources: CaptureQualityWeakSource[];
  computedAt: string;
}

/**
 * Which CAPTURE_FIELDS are present on one row.
 *
 * Mirrors mergeTriage's own field extraction exactly — same helpers, same
 * fallback order (`row.url ?? extractRoute(row.metadata)` for route) — so
 * "present" here means the same thing it means everywhere else this row is
 * read. Re-deriving the parse rules here would be a second definition of
 * "what counts", and the two would drift the moment one of them changed.
 */
function presentFields(row: AppTriageEventRow): ReadonlySet<CaptureField> {
  const present = new Set<CaptureField>();
  if (extractErrorCode(row.metadata) !== null) present.add('error-code');
  if (row.stack_trace) present.add('stack');
  if (row.url ?? extractRoute(row.metadata)) present.add('route');
  if (row.feature) present.add('feature');
  if (extractActionName(row.metadata) !== null) present.add('action');
  if (row.user_id ?? row.user_email) present.add('user');
  return present;
}

const WEAKEST_SOURCES_LIMIT = 5;

/**
 * Rows written by a cron/machine writer, never by a request a human made.
 *
 * `job-log.ts`'s `recordJobRun` writes `source: 'cron'` on every `Cron
 * failed: <jobType>` row — including the reliability collector's own —  and
 * `deploy-marker.ts` writes `source: 'system'` (though a deploy marker is
 * `event_type: 'deploy'`, already outside `queryAppErrorEvents`'s
 * `event_type='error'` filter, so it never actually reaches this analyser;
 * kept here anyway so the set states the whole self-referential vocabulary
 * in one place rather than only the half that happens to matter today).
 * `rca_analysis` rows are excluded the same way, structurally, by that same
 * upstream `event_type='error'` filter — no separate check is needed for
 * them here, and adding one would be a guard that can never fire.
 *
 * These rows are real, correctly-instrumented errors — a cron failure
 * legitimately carries an error code, a stack, a route, an action — so they
 * stay in `rows` and every other field's denominator. Only 'user' is
 * structurally impossible for them: a cron invocation has no session to
 * resolve a user from, so counting them against 'user' coverage blames a
 * call site for something no call site could ever do.
 */
const SELF_REFERENTIAL_SOURCES: ReadonlySet<string> = new Set(['cron', 'system']);

function isSelfReferentialRow(row: AppTriageEventRow): boolean {
  return typeof row.source === 'string' && SELF_REFERENTIAL_SOURCES.has(row.source);
}

/**
 * PURE. No I/O, no clock beyond the injected `now` — everything the caller
 * needs to reproduce a report byte-for-byte in a test.
 */
export function analyzeCaptureQuality(
  rows: readonly AppTriageEventRow[],
  windowHours: number,
  now: number,
): CaptureQualityReport {
  // Expected auth noise (a signed-out poll's missing user id, a routine
  // access denial) is not a capture gap — it is correct behaviour that
  // happens to carry thin metadata by design. Counting it would blame a
  // call site for something it did on purpose, so it is excluded from the
  // denominator entirely, the same way mergeTriage excludes it from the
  // incident feed.
  const scoped = rows.filter((row) => !isExpectedAuthNoise(row));

  const presentCounts = new Map<CaptureField, number>(CAPTURE_FIELDS.map((f) => [f, 0]));
  const sourceStats = new Map<string, { rows: number; missing: number; sampleTitle: string }>();
  // The 'user' field's own denominator — a SUBSET of `scoped`, never the
  // full `scoped.length` every other field uses. See
  // `SELF_REFERENTIAL_SOURCES` above.
  let userEligibleCount = 0;

  for (const row of scoped) {
    const present = presentFields(row);
    const userEligible = !isSelfReferentialRow(row);
    if (userEligible) userEligibleCount += 1;

    for (const field of CAPTURE_FIELDS) {
      if (field === 'user' && !userEligible) continue;
      if (present.has(field)) {
        presentCounts.set(field, (presentCounts.get(field) ?? 0) + 1);
      }
    }

    // A self-referential row is never "missing" credit for the one field it
    // could never have carried — its weakest-emitter score reflects only the
    // fields it was actually eligible to capture.
    const eligibleFieldCount = userEligible ? CAPTURE_FIELDS.length : CAPTURE_FIELDS.length - 1;
    const presentAmongEligible = userEligible
      ? present.size
      : present.size - (present.has('user') ? 1 : 0);
    const sourceKey = row.source ?? 'unknown';
    const stats = sourceStats.get(sourceKey) ?? { rows: 0, missing: 0, sampleTitle: row.title };
    stats.rows += 1;
    stats.missing += eligibleFieldCount - presentAmongEligible;
    sourceStats.set(sourceKey, stats);
  }

  const total = scoped.length;
  const fields: CaptureFieldCoverage[] = CAPTURE_FIELDS.map((field) => {
    const present = presentCounts.get(field) ?? 0;
    const fieldTotal = field === 'user' ? userEligibleCount : total;
    return { field, present, total: fieldTotal, ratio: fieldTotal === 0 ? null : present / fieldTotal };
  });

  const weakestSources: CaptureQualityWeakSource[] = Array.from(sourceStats.entries())
    .map(([source, stats]) => ({
      source,
      rows: stats.rows,
      missing: stats.missing,
      sampleTitle: stats.sampleTitle,
    }))
    // Worst first: most missing fields overall. Ties break on row count, so
    // a small sample with total dropout doesn't outrank a genuinely large
    // under-instrumented emitter of equal severity.
    .sort((a, b) => b.missing - a.missing || b.rows - a.rows)
    .slice(0, WEAKEST_SOURCES_LIMIT);

  return {
    fields,
    rows: total,
    windowHours,
    weakestSources,
    computedAt: new Date(now).toISOString(),
  };
}

/**
 * Server fetcher. Reuses `queryAppErrorEvents` — the same rows Overview's
 * KPIs, the triage queue and the Errors tab already agree on — rather than
 * writing a second query, so there is exactly one definition of "which rows
 * count" for this window.
 *
 * THROWS from queryAppErrorEvents become `failed(...)`, never an empty
 * report: an unreadable admin_events table rendering as a clean 0%-gap
 * scorecard would be a fabricated backlog, which is worse than showing
 * nothing at all. See incident-feed.ts's own doc comment on the same trap.
 */
export async function fetchCaptureQuality(
  windowHours: number = DEFAULT_INCIDENT_WINDOW_HOURS,
): Promise<AdminFetchResult<CaptureQualityReport>> {
  try {
    const rows = await queryAppErrorEvents({ windowHours });
    return ok(analyzeCaptureQuality(rows, windowHours, Date.now()));
  } catch (error) {
    return failed(error instanceof Error ? error.message : String(error));
  }
}
