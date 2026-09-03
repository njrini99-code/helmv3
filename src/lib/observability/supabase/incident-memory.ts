/**
 * Incident memory — brief §75.
 *
 * A resolved database incident becomes a durable, committed record in the
 * store this repo ALREADY has: `memory/incidents/<feature_id>/INC-*.md`,
 * Git-backed, reviewable, portable, and checked by
 * `scripts/knowledge/check-ledger-integrity.mjs`.
 *
 * NO NEW STORE, AND NO DATABASE TABLE
 * ------------------------------------
 * The obvious-looking alternative — a `helm_debug.db_incidents` table — is
 * refused on purpose. `.claude/rules/shipping.md` §1b states the reason for
 * the whole architecture: a machine-local (or database-local) store that can
 * disagree with committed state becomes a SECOND authority for engineering
 * truth. The brief's own anti-pattern list says the same thing more bluntly:
 * "a second incident DB". One authority. This module writes into the
 * existing one and invents nothing.
 *
 * WHAT IS ACTUALLY ENFORCED, AND WHAT IS CONVENTION
 * --------------------------------------------------
 * Read from the checker, not from the README prose (the README documents
 * four incidents that shipped with prose feature lines and passed review —
 * the regex is the authority):
 *
 *   directory  must be a `memory/registry.yml` feature key, verbatim
 *   filename   /^INC-\d{4}-\d{2}-\d{2}-[a-z0-9-]+\.md$/
 *   body       /^- Feature:\s*`([a-z0-9_]+)`/m, matching the directory
 *
 * Everything else — the section headings, the narrative, the tables — is
 * convention, and this module therefore TEMPLATES ONLY the enforced parts
 * plus the nine fields brief §75 names. Narrative is caller-supplied and
 * passed through verbatim: the existing incident files are long, specific
 * documents, and a renderer that forced them into a fixed prose skeleton
 * would produce records nobody reads.
 *
 * THE FEATURE ID IS VALIDATED AGAINST A SUPPLIED KEY LIST, AND UNMAPPED IS
 * A REFUSAL
 * ------------------------------------------------------------------------
 * `validateDbIncidentRecord` takes the registry keys as an INPUT so this
 * module stays pure and fixture-testable, and an id that is not among them
 * produces `FEATURE_NOT_IN_REGISTRY` rather than a file the checker will
 * reject after the fact. An EMPTY key list is itself a refusal
 * (`NO_REGISTRY_KEYS_SUPPLIED`) — validating against nothing is not
 * validation, and would let every id through.
 *
 * Note for a caller filing a database-observability defect: there is no
 * `observability_supabase` registry key today. A telemetry defect goes under
 * the feature whose visibility it broke — `admin_platform` for the Bridge
 * surfaces, as INC-2026-08-27 already does — and a database fault goes under
 * the product feature it hit. See the gap noted in
 * `docs/observability/SUPABASE_OPERATING_MODEL.md`.
 *
 * Pure: no fs, no clock, no server-only import. `incident-memory-writer.ts`
 * is the only thing that touches disk.
 */
import { sanitizeSupabaseFreeText } from './envelope';

/** The exact pattern `check-ledger-integrity.mjs` applies to a filename. */
export const INCIDENT_FILENAME_PATTERN = /^INC-\d{4}-\d{2}-\d{2}-[a-z0-9-]+\.md$/;
const FEATURE_ID_PATTERN = /^[a-z0-9_]+$/;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Incident prose is a human-read committed artefact, so it gets a longer
 *  bound than a telemetry field — the same masking, more room. */
const INCIDENT_TEXT_MAX_CHARS = 4000;

// ---------------------------------------------------------------------------
// Record
// ---------------------------------------------------------------------------

/**
 * A reference that is either present, or absent WITH A STATED REASON. The
 * repo's ledger checker already applies this rule to `incident_id: null`
 * ("an unexplained null is indistinguishable from a forgotten link"), and
 * the same reasoning applies to a missing migration or fix PR.
 */
export type IncidentReference = { present: true; ref: string } | { present: false; reason: string };

export interface IncidentSection {
  heading: string;
  body: string;
}

/** The nine fields brief §75 names, plus what the file contract requires. */
export interface DbIncidentRecord {
  /** A `memory/registry.yml` key, verbatim. */
  featureId: string;
  /** Extra registry keys, one per `- Also affects:` line. */
  alsoAffects: readonly string[];
  /** `YYYY-MM-DD` — the incident date, used in the filename. */
  date: string;
  /** `[a-z0-9-]+`, used in the filename. */
  slug: string;
  title: string;
  /** Only RESOLVED incidents are recorded here. An in-flight repair belongs
   *  in `memory/operations/release-queue.yml`, which has its own lifecycle. */
  status: 'resolved';
  /** HOW it failed: "RPC rejected before any row was written". */
  mechanism: string;
  /** SQLSTATE / PostgREST / Auth / Storage code. */
  code: string;
  /** The relation or RPC the failure names. */
  relationOrRpc: string;
  rootCause: string;
  fixPr: IncidentReference;
  migration: IncidentReference;
  regressionTest: IncidentReference;
  invariant: IncidentReference;
  /** The `buildSupabaseFingerprint` value this incident dedupes on. */
  fingerprint: string;
  /** Caller-supplied narrative, rendered verbatim after the field block. */
  sections: readonly IncidentSection[];
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type IncidentProblemKind =
  | 'NO_REGISTRY_KEYS_SUPPLIED'
  | 'FEATURE_NOT_IN_REGISTRY'
  | 'INVALID_FEATURE_ID'
  | 'ALSO_AFFECTS_NOT_IN_REGISTRY'
  | 'INVALID_SLUG'
  | 'INVALID_DATE'
  | 'NOT_RESOLVED'
  | 'MISSING_FIELD'
  | 'MISSING_REASON'
  // Raised by `incident-memory-writer.ts` rather than by validation. They
  // live in this union so a caller handles ONE problem shape end to end.
  | 'ALREADY_EXISTS'
  | 'ESCAPES_STORE'
  | 'WRITE_FAILED';

export interface IncidentProblem {
  kind: IncidentProblemKind;
  detail: string;
}

export interface IncidentValidationOptions {
  /** `Object.keys(registry.features)`. Supplied, never read from disk here. */
  knownFeatureIds: readonly string[];
}

function isRealDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number) as [number, number, number];
  const parsed = new Date(Date.UTC(y, m - 1, d));
  return parsed.getUTCFullYear() === y && parsed.getUTCMonth() === m - 1 && parsed.getUTCDate() === d;
}

function checkReference(name: string, ref: IncidentReference, problems: IncidentProblem[]): void {
  if (ref.present) {
    if (ref.ref.trim().length === 0) problems.push({ kind: 'MISSING_FIELD', detail: `${name} is marked present but empty` });
    return;
  }
  if (ref.reason.trim().length === 0) {
    problems.push({ kind: 'MISSING_REASON', detail: `${name} is absent and must state why` });
  }
}

export function validateDbIncidentRecord(
  record: DbIncidentRecord,
  options: IncidentValidationOptions,
): IncidentProblem[] {
  const problems: IncidentProblem[] = [];

  if (options.knownFeatureIds.length === 0) {
    problems.push({
      kind: 'NO_REGISTRY_KEYS_SUPPLIED',
      detail: 'No registry feature keys were supplied, so the feature id cannot be validated at all.',
    });
  }

  if (!FEATURE_ID_PATTERN.test(record.featureId)) {
    problems.push({ kind: 'INVALID_FEATURE_ID', detail: `feature id '${record.featureId}' is not [a-z0-9_]+` });
  } else if (options.knownFeatureIds.length > 0 && !options.knownFeatureIds.includes(record.featureId)) {
    problems.push({
      kind: 'FEATURE_NOT_IN_REGISTRY',
      detail: `feature id '${record.featureId}' is not a memory/registry.yml key — map it there first, or file under the product feature this defect affected`,
    });
  }

  for (const extra of record.alsoAffects) {
    if (options.knownFeatureIds.length > 0 && !options.knownFeatureIds.includes(extra)) {
      problems.push({ kind: 'ALSO_AFFECTS_NOT_IN_REGISTRY', detail: `'also affects' id '${extra}' is not a registry key` });
    }
  }

  if (!SLUG_PATTERN.test(record.slug)) {
    problems.push({ kind: 'INVALID_SLUG', detail: `slug '${record.slug}' must be lowercase words joined by single hyphens` });
  }
  if (!isRealDate(record.date)) {
    problems.push({ kind: 'INVALID_DATE', detail: `date '${record.date}' must be a real YYYY-MM-DD calendar date` });
  }
  if (record.status !== 'resolved') {
    problems.push({
      kind: 'NOT_RESOLVED',
      detail: 'incident memory records RESOLVED incidents; an in-flight repair belongs in the release queue',
    });
  }

  const required: ReadonlyArray<readonly [string, string]> = [
    ['mechanism', record.mechanism],
    ['code', record.code],
    ['relationOrRpc', record.relationOrRpc],
    ['rootCause', record.rootCause],
    ['title', record.title],
    ['fingerprint', record.fingerprint],
  ];
  for (const [name, value] of required) {
    if (value.trim().length === 0) problems.push({ kind: 'MISSING_FIELD', detail: `${name} is required` });
  }

  checkReference('fixPr', record.fixPr, problems);
  checkReference('migration', record.migration, problems);
  checkReference('regressionTest', record.regressionTest, problems);
  checkReference('invariant', record.invariant, problems);

  return problems;
}

// ---------------------------------------------------------------------------
// Path
// ---------------------------------------------------------------------------

export function buildIncidentRelativePath(record: Pick<DbIncidentRecord, 'featureId' | 'date' | 'slug'>): string {
  return `memory/incidents/${record.featureId}/INC-${record.date}-${record.slug}.md`;
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

export type RenderIncidentResult =
  | { ok: true; relativePath: string; markdown: string }
  | { ok: false; problems: readonly IncidentProblem[] };

function safe(value: string): string {
  return sanitizeSupabaseFreeText(value, INCIDENT_TEXT_MAX_CHARS) ?? '(not recorded)';
}

function renderReference(label: string, ref: IncidentReference): string {
  return ref.present ? `- ${label}: ${safe(ref.ref)}` : `- ${label}: none — ${safe(ref.reason)}`;
}

/**
 * Returns the document and its path, or the problems that stopped it. Never
 * throws, never writes, and never renders a record whose feature id is not a
 * supplied registry key.
 */
export function renderDbIncident(record: DbIncidentRecord, options: IncidentValidationOptions): RenderIncidentResult {
  const problems = validateDbIncidentRecord(record, options);
  if (problems.length > 0) return { ok: false, problems };

  const lines: string[] = [
    '<!-- markdownlint-disable MD013 MD022 MD032 MD034 MD037 MD040 MD060 -->',
    `# INC-${record.date} — ${safe(record.title)}`,
    '',
    // The three lines below are the ENFORCED contract. The backticks are not
    // decoration: they are what joins this file to the registry.
    `- Feature: \`${record.featureId}\``,
    ...record.alsoAffects.map((id) => `- Also affects: \`${id}\``),
    '- Status: resolved',
    '',
    '## Record',
    '',
    `- Mechanism: ${safe(record.mechanism)}`,
    `- Code: \`${safe(record.code)}\``,
    `- Relation or RPC: \`${safe(record.relationOrRpc)}\``,
    `- Fingerprint: \`${safe(record.fingerprint)}\``,
    renderReference('Fix PR', record.fixPr),
    renderReference('Migration', record.migration),
    renderReference('Regression test', record.regressionTest),
    renderReference('Invariant', record.invariant),
    '',
    '## Root cause',
    '',
    safe(record.rootCause),
  ];

  for (const section of record.sections) {
    lines.push('', `## ${safe(section.heading)}`, '', safe(section.body));
  }

  lines.push('');
  return { ok: true, relativePath: buildIncidentRelativePath(record), markdown: lines.join('\n') };
}
