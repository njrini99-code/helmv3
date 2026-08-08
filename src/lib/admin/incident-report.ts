/**
 * Helm Bridge — "Copy-for-Claude" incident report builder.
 *
 * Owner debugs by pasting a copied incident straight into Claude, so the
 * copy payload IS the product: complete, structured, self-contained, and
 * built to survive a copy/paste round-trip without markdown mangling.
 *
 * Pure, synchronous, no DB/network access — every field is passed in by the
 * caller (data layer / server components). Deterministic field order so two
 * renders of the same input are byte-identical (easy to diff, easy to test).
 *
 * No 'server-only' guard: this module holds no secrets and does no I/O, so
 * it's safe to import from anywhere, though in practice only server code
 * (data layer, server components) calls it — the RESULT (a plain string) is
 * what crosses into client components, never this module or its functions.
 */

import { FEATURE_REGISTRY } from '@/lib/admin/feature-registry';

const ENV_HEADER = 'app: helmv3 (prod) · captured by Helm Bridge admin_events';

export interface IncidentReportOccurrence {
  /** ISO timestamp. */
  timestamp: string;
  route?: string | null;
  userId?: string | null;
  /** Freeform per-event context (admin_events.metadata), rendered as JSON. */
  metadata?: unknown;
}

export interface IncidentReportDeploy {
  sha?: string | null;
  /** ISO timestamp. */
  time: string;
}

export interface IncidentReportInput {
  title: string;
  message?: string | null;
  /** Grouping key: admin_events.fingerprint, a synthetic `row:<id>`, or a
   *  Sentry issue id/shortId. */
  fingerprint?: string | null;
  source?: string | null;
  severity: string;
  sport?: string | null;
  /** Canonical feature-registry key (admin_events.feature). */
  featureKey?: string | null;
  /** Human label — pass explicitly, or let buildIncidentReport resolve it
   *  from featureKey via the registry when omitted. */
  featureLabel?: string | null;
  /** admin_events.metadata.action — the wrapped fn/export name. */
  actionName?: string | null;
  eventCount?: number | null;
  /** Flood-throttle collapsed count (Noise Charter N4), summed across events. */
  collapsedCount?: number | null;
  affectedUserCount?: number | null;
  firstSeen?: string | null;
  lastSeen?: string | null;
  /** e.g. "24h" or a filter-window description. */
  windowLabel?: string | null;
  /** Most-recent-first. Only the first 20 are rendered. */
  occurrences?: IncidentReportOccurrence[];
  deployMarkers?: IncidentReportDeploy[];
  sentryUrl?: string | null;
  stackTrace?: string | null;
  /** Derived kind axis — see @/lib/admin/incident-classification. */
  incidentClass?: string | null;
  /** Why the classifier chose that class, in operator-readable words. */
  incidentClassReason?: string | null;
  /**
   * True when the captured message lost its content (e.g. "[object Object]").
   * Called out explicitly because this report is routinely pasted into Claude
   * to debug — a reader must know the message is USELESS rather than
   * concluding the error itself is content-free.
   */
  hasDegradedMessage?: boolean;
  /** Injectable for deterministic tests; defaults to `new Date().toISOString()`. */
  generatedAt?: string;
}

export interface CombinedIncidentReportOptions {
  /** Human-readable active-filter summary, shown in the combined doc header. */
  filterDescription: string;
  generatedAt?: string;
}

/**
 * Reverse-lookup: given a feature key + the action name captured on
 * admin_events.metadata.action, resolve the repo-relative file path that
 * owns it, per the feature registry's action manifest
 * (feature-registry.ts §2.2 file → feature map). This is "where it was" —
 * the single highest-value line in a Claude copy-paste incident report.
 *
 * Resolution order:
 *  1. Exact match — an explicit string[] manifest entry that names the
 *     action. Unambiguous: returns that one file.
 *  2. Fallback — the feature's 'ALL' manifest files (every export in that
 *     file belongs to the feature). A single 'ALL' file is returned as-is;
 *     multiple candidates are joined with " or " so Claude gets a short,
 *     honest list to grep instead of a guess presented as certain.
 *  3. Unknown feature / missing action name / zero candidates → null.
 */
export function resolveActionFilePath(
  featureKey: string | null | undefined,
  actionName: string | null | undefined,
): string | null {
  if (!featureKey || !actionName) return null;
  const feature = FEATURE_REGISTRY.find((f) => f.key === featureKey);
  if (!feature) return null;

  for (const [file, exports] of Object.entries(feature.actions)) {
    if (Array.isArray(exports) && exports.includes(actionName)) {
      return file;
    }
  }

  const allFiles = Object.entries(feature.actions)
    .filter(([, exports]) => exports === 'ALL')
    .map(([file]) => file);
  if (allFiles.length === 0) return null;
  return allFiles.join(' or ');
}

/** Human label for a feature-registry key, or null if unknown/absent. */
export function featureLabelFor(featureKey: string | null | undefined): string | null {
  if (!featureKey) return null;
  return FEATURE_REGISTRY.find((f) => f.key === featureKey)?.label ?? null;
}

/** admin_events.metadata is the RoundErrorContext-shaped JSON blob written by
 *  server-error-logger.ts's normalizeContext(). Extraction is defensive —
 *  older rows, cron rows (job-log.ts), and RLS-denial rows (rls-denial.ts)
 *  all set `action` but otherwise have slightly different shapes. */
export function extractActionName(metadata: unknown): string | null {
  if (metadata && typeof metadata === 'object' && 'action' in metadata) {
    const action = (metadata as { action?: unknown }).action;
    if (typeof action === 'string' && action.length > 0) return action;
  }
  return null;
}

export function extractRoute(metadata: unknown): string | null {
  if (metadata && typeof metadata === 'object') {
    const route = (metadata as { route?: unknown }).route;
    if (typeof route === 'string' && route.length > 0) return route;
  }
  return null;
}

/**
 * The stable `provider_<provider>_<kind>` code the app already writes on every
 * provider fault (server-error-logger persists context.errorCode into
 * metadata.errorCode).
 *
 * classifyIncident has had a dedicated `provider_` branch since day one
 * (incident-classification.ts:242) mapping these to the `integration` kind —
 * but no production caller ever passed errorCode, only tests. So a spent
 * Anthropic balance, an exhausted AI Gateway and a rejected Inngest credential
 * all classified as `defect / "Unexpected failure"`, i.e. read as app bugs, and
 * /admin/errors?kind=integration returned network noise instead of the four
 * faults the module exists to tag.
 */
export function extractErrorCode(metadata: unknown): string | null {
  if (metadata && typeof metadata === 'object') {
    const code = (metadata as { errorCode?: unknown }).errorCode;
    if (typeof code === 'string' && code.length > 0) return code;
  }
  return null;
}

/** Flood-throttle collapsed count lives at metadata.metadata.collapsed_count
 *  (observed-action.ts nests it under RoundErrorContext.metadata, which
 *  normalizeContext then nests again under the admin_events.metadata column). */
export function extractCollapsedCount(metadata: unknown): number {
  if (metadata && typeof metadata === 'object') {
    const inner = (metadata as { metadata?: unknown }).metadata;
    if (inner && typeof inner === 'object') {
      const collapsed = (inner as { collapsed_count?: unknown }).collapsed_count;
      if (typeof collapsed === 'number' && Number.isFinite(collapsed)) return collapsed;
    }
  }
  return 0;
}

/**
 * Deploys "near" an incident's lifetime: from 24h before first-seen (a
 * deploy just before the first occurrence is the prime suspect) through
 * last-seen (deploys during the incident's active window are also
 * relevant). Capped and sorted most-recent-first.
 */
export function selectNearbyDeploys(
  deploys: readonly { sha: string | null; time: number }[],
  firstSeenIso: string | null | undefined,
  lastSeenIso: string | null | undefined,
  maxCount = 5,
): IncidentReportDeploy[] {
  if (!deploys.length) return [];
  const firstMs = firstSeenIso ? Date.parse(firstSeenIso) : NaN;
  const lastMs = lastSeenIso ? Date.parse(lastSeenIso) : NaN;
  const windowStart = Number.isFinite(firstMs) ? firstMs - 24 * 3600_000 : -Infinity;
  const windowEnd = Number.isFinite(lastMs) ? lastMs : Infinity;

  return deploys
    .filter((d) => Number.isFinite(d.time) && d.time >= windowStart && d.time <= windowEnd)
    .sort((a, b) => b.time - a.time)
    .slice(0, maxCount)
    .map((d) => ({ sha: d.sha, time: new Date(d.time).toISOString() }));
}

function dash(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  return String(value);
}

function singleLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/** Fenced code block that always survives paste, even when the content
 *  itself contains a run of backticks (e.g. a message quoting other
 *  markdown) — the fence widens past the longest backtick run inside. */
function fence(content: string, lang = ''): string {
  let tickCount = 3;
  const runs = content.match(/`+/g) ?? [];
  for (const run of runs) {
    if (run.length >= tickCount) tickCount = run.length + 1;
  }
  const ticks = '`'.repeat(tickCount);
  return `${ticks}${lang}\n${content}\n${ticks}`;
}

/**
 * Build a complete, self-contained markdown incident report for one
 * incident. Deterministic field order; every section renders even when its
 * data is missing (an explicit placeholder, never a silently-dropped
 * section) so Claude always sees the full shape of what is/isn't known.
 */
export function buildIncidentReport(input: IncidentReportInput): string {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const heading = input.title?.trim() ? singleLine(input.title) : '(untitled incident)';
  const featureLabel = input.featureLabel ?? featureLabelFor(input.featureKey);
  const actionFilePath = resolveActionFilePath(input.featureKey, input.actionName);

  const lines: string[] = [];

  lines.push(`# Incident report: ${heading}`, '');
  lines.push(ENV_HEADER);
  lines.push(`generated: ${generatedAt}`, '');

  lines.push('## Identity');
  lines.push(`- Fingerprint: ${dash(input.fingerprint)}`);
  lines.push(`- Source: ${dash(input.source)}`);
  lines.push(`- Severity: ${dash(input.severity)}`);
  lines.push(`- Sport: ${dash(input.sport)}`);
  lines.push(
    `- Feature: ${input.featureKey ? `${dash(featureLabel)} (\`${input.featureKey}\`)` : '—'}`,
  );
  lines.push(`- Action: ${dash(input.actionName)}`);
  lines.push(
    `- Source file: ${actionFilePath ? `\`${actionFilePath}\`` : '— (not resolvable from the feature registry)'}`,
  );
  lines.push('');

  // Classification leads, because it changes how the whole report should be
  // read: an "Integrity OK" or "Empty state" row is not a bug to chase, and a
  // reader (human or Claude) that learns this only after wading through a
  // stack trace has already wasted the effort.
  if (input.incidentClass) {
    lines.push('## Classification');
    lines.push(`- Kind: ${input.incidentClass}`);
    if (input.incidentClassReason) lines.push(`- Why: ${input.incidentClassReason}`);
    lines.push('');
  }

  lines.push('## Message', '');
  lines.push(fence(input.message?.length ? input.message : '(no message captured)'));
  if (input.hasDegradedMessage) {
    lines.push('');
    lines.push(
      '> ⚠️ **This message was degraded on capture** — the call site stringified an error object instead of using `describeError()`, so the real cause is NOT in this report. Fix the call site before trying to debug from this text.',
    );
  }
  lines.push('');

  lines.push('## Stack trace', '');
  lines.push(input.stackTrace?.length ? fence(input.stackTrace) : '_no stack trace captured_');
  lines.push('');

  lines.push('## Volume');
  const collapsedSuffix =
    input.collapsedCount && input.collapsedCount > 0
      ? ` (plus ${input.collapsedCount} collapsed by flood-throttle)`
      : '';
  lines.push(`- Events: ${dash(input.eventCount)}${collapsedSuffix}`);
  lines.push(`- Affected users: ${dash(input.affectedUserCount)}`);
  lines.push(`- First seen: ${dash(input.firstSeen)}`);
  lines.push(`- Last seen: ${dash(input.lastSeen)}`);
  lines.push(`- Window: ${dash(input.windowLabel)}`);
  lines.push('');

  const occurrences = input.occurrences ?? [];
  lines.push(
    `## Recent occurrences${occurrences.length ? ` (showing ${Math.min(20, occurrences.length)} of ${occurrences.length})` : ''}`,
    '',
  );
  if (occurrences.length) {
    const rows = occurrences.slice(0, 20).map((occ) => {
      const route = occ.route ? ` route=${occ.route}` : '';
      const user = occ.userId ? ` user=${occ.userId}` : '';
      const meta =
        occ.metadata !== undefined && occ.metadata !== null ? ` metadata=${safeJson(occ.metadata)}` : '';
      return `${occ.timestamp}${route}${user}${meta}`;
    });
    lines.push(fence(rows.join('\n')));
  } else {
    lines.push('_no occurrence detail available_');
  }
  lines.push('');

  lines.push('## Nearby deploys', '');
  if (input.deployMarkers?.length) {
    const rows = input.deployMarkers.map((d) => `${d.time}${d.sha ? ` sha=${d.sha}` : ''}`);
    lines.push(fence(rows.join('\n')));
  } else {
    lines.push('_no deploy data available_');
  }
  lines.push('');

  lines.push('## Sentry');
  lines.push(input.sentryUrl ? input.sentryUrl : '_not linked to a Sentry issue_');

  return lines.join('\n');
}

/**
 * Concatenate pre-built per-incident reports (from buildIncidentReport) into
 * one combined document for the errors-tab "Copy all (filtered)" toolbar
 * action. Takes already-rendered strings rather than raw inputs so the
 * exact same report a user could copy per-row is reused verbatim here —
 * one source of truth, no drift between the two copy paths.
 */
export function buildCombinedIncidentReport(
  reports: readonly string[],
  opts: CombinedIncidentReportOptions,
): string {
  const generatedAt = opts.generatedAt ?? new Date().toISOString();
  const header = [
    '# Incident reports — filtered export',
    '',
    ENV_HEADER,
    `generated: ${generatedAt}`,
    `filters: ${opts.filterDescription || 'none (all unresolved incidents)'}`,
    `incident count: ${reports.length}`,
  ].join('\n');

  if (reports.length === 0) {
    return `${header}\n\n_no incidents match the current filters_`;
  }

  const divider = '='.repeat(72);
  const body = reports
    .map((report, i) => `${divider}\nIncident ${i + 1} of ${reports.length}\n${divider}\n\n${report}`)
    .join('\n\n');

  return `${header}\n\n${body}`;
}
