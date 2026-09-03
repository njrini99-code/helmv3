/**
 * Schema / types / migration drift diagnosis — brief §40–41.
 *
 * "Integrate db drift / migration ledger / type drift into DB Mission Control
 * and auto-attach to missing-object incidents." This module is that
 * auto-attachment: given ONE missing-object failure it names the object, then
 * says what the repo knows about that object — is there a migration file that
 * creates it, does the applied ledger record that migration, do the generated
 * types mention it — and turns those three answers into an actionable verdict.
 *
 * PURE. NO FILESYSTEM, NO NETWORK, NO CLOCK.
 * -------------------------------------------
 * Every input arrives as an argument. A thin server-side reader supplies the
 * listings (scan `supabase/migrations/*.sql`, read the ledger the way
 * `scripts/db/migration-ledger-drift.mjs` does, scan `src/lib/types/database.ts`);
 * this file only reasons. That split is the same one `release-context.ts`
 * documents for its own migration-head read, and it is what makes every branch
 * below fixture-testable.
 *
 * THREE AXES, THREE SEPARATE `unknown`s — THE POINT OF THE WHOLE MODULE
 * ---------------------------------------------------------------------
 * `.claude/rules/shipping.md` §4 states it and `migration-ledger-drift.mjs`'s
 * own header proves it: **"recorded" is not "applied"**, and a migration file
 * existing in the tree is not evidence the object exists in the database.
 * Measured 2026-08-26, five local-only migrations were verified live in the
 * production catalog while carrying no ledger row at all. So this module never
 * collapses the axes into one confident sentence:
 *
 *     migrationFile    found | absent | unknown     does the TREE create it
 *     ledgerRow        present | absent | unknown   does the LEDGER record it
 *     generatedTypes   present | absent | unknown   do the TYPES mention it
 *
 * Each is reported independently, each has its own `unknown`, and the ledger's
 * unreliability is stated in the verdict's own explanation rather than hidden
 * behind a verdict that sounds certain. A caller that wants ground truth must
 * query the live catalog (`npm run db:drift:check`), which this module cannot
 * and does not do.
 *
 * PRIVACY (§6). The only free text this module reads is the envelope's
 * ALREADY-SANITIZED `normalizedMessage`, and only to recover an object NAME
 * when the structured `relation`/`rpc` fields are empty. Object names are safe
 * dimensions (the brief's own example uses `rpc=save_partial_round_atomic`);
 * nothing here reads a filter value, a row id, or a policy predicate, and the
 * output type has no field one could travel in.
 */
import type { SupabaseErrorEnvelope } from './envelope';

// ---------------------------------------------------------------------------
// What went missing
// ---------------------------------------------------------------------------

export type MissingObjectKind = 'table' | 'column' | 'function' | 'schema' | 'relationship' | 'unknown';

export type DriftMechanism =
  | 'postgres_undefined_object'
  | 'postgrest_schema_cache'
  | 'not_a_missing_object_failure';

export interface MissingObjectRef {
  kind: MissingObjectKind;
  /** Unqualified, lowercased. `null` when neither the structured fields nor
   *  the sanitized message name it — which is itself a reportable unknown. */
  name: string | null;
  /** For a column: the relation it was looked for on. */
  parent: string | null;
}

/** SQLSTATEs that mean "the database does not have this object". */
const UNDEFINED_OBJECT_SQLSTATES: Readonly<Record<string, MissingObjectKind>> = {
  '42P01': 'table', // undefined_table
  '42703': 'column', // undefined_column
  '42883': 'function', // undefined_function
  '3F000': 'schema', // invalid_schema_name
};

/**
 * The PostgREST 20x family. These are NOT Postgres saying the object is
 * absent — they are PostgREST saying its own schema cache has no entry, which
 * is a materially different mechanism with a different fix (reload the cache)
 * and is why `DriftMechanism` keeps them apart.
 */
const POSTGREST_SCHEMA_CACHE_CODES: Readonly<Record<string, MissingObjectKind>> = {
  PGRST200: 'relationship', // no relationship between two tables in the cache
  PGRST201: 'relationship', // ambiguous relationship
  PGRST202: 'function', // could not find the function in the schema cache
  PGRST203: 'function', // ambiguous function
  PGRST204: 'column', // could not find the column in the schema cache
  PGRST205: 'table', // could not find the table in the schema cache
};

/** Lowercase, unquote, drop a schema qualifier and any function argument list. */
export function normalizeObjectName(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const withoutArgs = raw.replace(/\(.*$/s, '');
  const cleaned = withoutArgs
    .trim()
    .replace(/["'`]/g, '')
    .toLowerCase();
  if (cleaned.length === 0) return null;
  const segments = cleaned.split('.').filter((s) => s.length > 0);
  if (segments.length === 0) return null;
  return segments[segments.length - 1] ?? null;
}

/** Postgres quotes object names with `"`, PostgREST with `'` — both shapes appear. */
const Q = `['"]?`;
const RELATION_MESSAGE_RE = new RegExp(`relation\\s+${Q}([a-z0-9_.]+)${Q}\\s+does not exist`, 'i');
const COLUMN_OF_RELATION_RE = new RegExp(`column\\s+${Q}([a-z0-9_]+)${Q}\\s+of\\s+relation\\s+${Q}([a-z0-9_.]+)${Q}`, 'i');
const COLUMN_DOTTED_RE = new RegExp(`column\\s+${Q}([a-z0-9_]+)\\.([a-z0-9_]+)${Q}\\s+does not exist`, 'i');
const FUNCTION_MESSAGE_RE = new RegExp(`function\\s+${Q}([a-z0-9_.]+)${Q}\\s*\\(`, 'i');
const SCHEMA_MESSAGE_RE = new RegExp(`schema\\s+${Q}([a-z0-9_]+)${Q}\\s+does not exist`, 'i');
const CACHE_FUNCTION_RE = new RegExp(`find the function\\s+${Q}([a-z0-9_.]+)${Q}`, 'i');
const CACHE_TABLE_RE = new RegExp(`find the table\\s+${Q}([a-z0-9_.]+)${Q}`, 'i');
const CACHE_COLUMN_RE = new RegExp(`find the\\s+${Q}([a-z0-9_]+)${Q}\\s+column of\\s+${Q}([a-z0-9_.]+)${Q}`, 'i');

/**
 * Structured fields first, sanitized message only as a fallback — the same
 * "codes are primary semantics, message matching is fallback" discipline
 * `classify.ts` applies to the code itself.
 */
export function extractMissingObject(
  envelope: Pick<SupabaseErrorEnvelope, 'code' | 'sqlstate' | 'postgrestCode' | 'relation' | 'rpc' | 'normalizedMessage'>,
): MissingObjectRef {
  const code = (envelope.sqlstate ?? envelope.postgrestCode ?? envelope.code ?? '').trim();
  const kind = UNDEFINED_OBJECT_SQLSTATES[code] ?? POSTGREST_SCHEMA_CACHE_CODES[code] ?? 'unknown';
  const message = envelope.normalizedMessage ?? '';

  if (kind === 'function') {
    const fromMessage = CACHE_FUNCTION_RE.exec(message)?.[1] ?? FUNCTION_MESSAGE_RE.exec(message)?.[1] ?? null;
    return { kind, name: normalizeObjectName(envelope.rpc) ?? normalizeObjectName(fromMessage), parent: null };
  }

  if (kind === 'table' || kind === 'relationship') {
    const fromMessage = RELATION_MESSAGE_RE.exec(message)?.[1] ?? CACHE_TABLE_RE.exec(message)?.[1] ?? null;
    return { kind, name: normalizeObjectName(envelope.relation) ?? normalizeObjectName(fromMessage), parent: null };
  }

  if (kind === 'column') {
    const ofRelation = COLUMN_OF_RELATION_RE.exec(message);
    const dotted = COLUMN_DOTTED_RE.exec(message);
    const cached = CACHE_COLUMN_RE.exec(message);
    const columnName = ofRelation?.[1] ?? dotted?.[2] ?? cached?.[1] ?? null;
    const parentName = ofRelation?.[2] ?? dotted?.[1] ?? cached?.[2] ?? envelope.relation ?? null;
    return { kind, name: normalizeObjectName(columnName), parent: normalizeObjectName(parentName) };
  }

  if (kind === 'schema') {
    return { kind, name: normalizeObjectName(SCHEMA_MESSAGE_RE.exec(message)?.[1] ?? null), parent: null };
  }

  return { kind: 'unknown', name: null, parent: null };
}

export function classifyDriftMechanism(
  envelope: Pick<SupabaseErrorEnvelope, 'code' | 'sqlstate' | 'postgrestCode'>,
): DriftMechanism {
  const code = (envelope.sqlstate ?? envelope.postgrestCode ?? envelope.code ?? '').trim();
  if (code in UNDEFINED_OBJECT_SQLSTATES) return 'postgres_undefined_object';
  if (code in POSTGREST_SCHEMA_CACHE_CODES) return 'postgrest_schema_cache';
  return 'not_a_missing_object_failure';
}

// ---------------------------------------------------------------------------
// The three evidence listings — supplied, never read, by this module
// ---------------------------------------------------------------------------

export interface MigrationFileListing {
  /** 14-digit filename prefix, the ledger's join key. */
  version: string;
  filename: string;
  /**
   * Every object name the file's SQL creates or alters, already normalized by
   * the reader. Tables and functions unqualified; a column as `table.column`
   * AND as its bare name, so either match works.
   */
  objects: readonly string[];
}

export interface MigrationLedgerListing {
  /** `false` when the migrations directory could not be listed. */
  filesReadable: boolean;
  files: readonly MigrationFileListing[];
  /** Versions in `supabase_migrations.schema_migrations`. `null` = unreadable
   *  (no credential, network failure) — NEVER an empty array standing in for
   *  "we could not check". */
  appliedVersions: readonly string[] | null;
  /** Versions `supabase/migrations/HELD.md` accounts for. `null` = unreadable. */
  heldVersions: readonly string[] | null;
}

export interface GeneratedTypesListing {
  /** `false` when `src/lib/types/database.ts` could not be read/parsed. */
  readable: boolean;
  tables: readonly string[];
  /** `table.column` entries. */
  columns: readonly string[];
  functions: readonly string[];
}

// ---------------------------------------------------------------------------
// Diagnosis
// ---------------------------------------------------------------------------

export type EvidencePresence = 'found' | 'absent' | 'unknown';
export type LedgerPresence = 'present' | 'absent' | 'unknown';
export type TypesPresence = 'present' | 'absent' | 'unknown';

export const SCHEMA_DRIFT_VERDICTS = [
  'not-applicable',
  'unknown',
  'object-unknown-to-repo',
  'migration-held',
  'migration-not-in-ledger',
  'schema-cache-stale',
  'object-defined-but-unreachable',
] as const;
export type SchemaDriftVerdict = (typeof SCHEMA_DRIFT_VERDICTS)[number];

export const SCHEMA_DRIFT_VERDICT_LABEL: Readonly<Record<SchemaDriftVerdict, string>> = {
  'not-applicable': 'NOT A MISSING-OBJECT FAILURE',
  unknown: 'UNKNOWN',
  'object-unknown-to-repo': 'OBJECT UNKNOWN TO THIS REPO',
  'migration-held': 'MIGRATION HELD — DELIBERATELY NOT APPLIED',
  'migration-not-in-ledger': 'MIGRATION FILE PRESENT, NO LEDGER ROW',
  'schema-cache-stale': 'POSTGREST SCHEMA CACHE SUSPECTED',
  'object-defined-but-unreachable': 'OBJECT DEFINED AND RECORDED, STILL UNREACHABLE',
};

export interface SchemaDriftDiagnosis {
  mechanism: DriftMechanism;
  object: MissingObjectRef;
  /** The release live when the failure happened, straight off the envelope. */
  releaseShaAtFailure: string | null;
  migrationFile: EvidencePresence;
  /** Filenames of every migration naming this object (may be several). */
  migrationFilenames: readonly string[];
  ledgerRow: LedgerPresence;
  /** `true` when a migration naming this object is recorded in HELD.md.
   *  `null` when HELD.md was unreadable or no migration names the object. */
  heldMigration: boolean | null;
  generatedTypes: TypesPresence;
  verdict: SchemaDriftVerdict;
  /** One short sentence. Built only from the axes above — never from the
   *  failure's message text. */
  explanation: string;
  nextSteps: readonly string[];
}

function objectMatches(target: MissingObjectRef, candidates: readonly string[]): boolean {
  if (target.name === null) return false;
  const wanted = new Set<string>([target.name]);
  if (target.parent !== null) wanted.add(`${target.parent}.${target.name}`);
  return candidates.some((c) => wanted.has(c.trim().toLowerCase()));
}

function typesPresence(target: MissingObjectRef, types: GeneratedTypesListing): TypesPresence {
  if (!types.readable) return 'unknown';
  if (target.name === null) return 'unknown';
  switch (target.kind) {
    case 'function':
      return objectMatches(target, types.functions) ? 'present' : 'absent';
    case 'column':
      return objectMatches(target, types.columns) ? 'present' : 'absent';
    case 'table':
    case 'relationship':
      return objectMatches(target, types.tables) ? 'present' : 'absent';
    default:
      return 'unknown';
  }
}

const NEXT_STEPS: Readonly<Record<SchemaDriftVerdict, readonly string[]>> = {
  'not-applicable': [],
  unknown: [
    'Re-run the diagnosis with the missing input available — an unreadable ledger, types file or migrations directory is a blind source, not a clean one.',
    'Ground truth for whether the object exists is the live catalog: npm run db:drift:check.',
  ],
  'object-unknown-to-repo': [
    'No migration in this tree creates the object and the generated types do not mention it — the calling code names something that was never defined here.',
    'Check the caller for a typo or a stale name before assuming a deploy problem.',
  ],
  'migration-held': [
    'Read the migration’s row in supabase/migrations/HELD.md — it states what would go wrong if applied.',
    'A HELD migration is an owner decision (R3). Do not apply it to resolve this incident.',
    'If the calling code shipped ahead of its migration, the repair is to make that code degrade instead.',
  ],
  'migration-not-in-ledger': [
    'The tree creates the object but the applied ledger has no row for that migration.',
    'The ledger is NOT authoritative — local-only migrations have been verified live in production with no ledger row. Confirm against the catalog: npm run db:drift:check.',
    'If it really is unapplied, applying it is R3 and belongs to the owner.',
  ],
  'schema-cache-stale': [
    'PostgREST reported a schema-cache miss, not Postgres reporting an absent object.',
    'Confirm the object exists in the catalog, then reload the PostgREST schema cache (NOTIFY pgrst, \'reload schema\').',
    'A function added or changed without a cache reload produces exactly this.',
  ],
  'object-defined-but-unreachable': [
    'The repo defines the object and the ledger records the migration, yet the database reported it absent.',
    'Suspect reachability rather than existence: schema USAGE, the function’s search_path, EXECUTE grants, or the object living in a schema PostgREST does not expose.',
    'Confirm what is actually live: npm run db:drift:check.',
  ],
};

/**
 * Diagnose one missing-object failure.
 *
 * Returns `verdict: 'not-applicable'` for any failure that is not a
 * missing-object mechanism — callers can pass every envelope in and filter on
 * that rather than pre-classifying.
 */
export function diagnoseSchemaDrift(input: {
  envelope: Pick<
    SupabaseErrorEnvelope,
    'code' | 'sqlstate' | 'postgrestCode' | 'relation' | 'rpc' | 'normalizedMessage' | 'releaseSha'
  >;
  ledger: MigrationLedgerListing;
  types: GeneratedTypesListing;
}): SchemaDriftDiagnosis {
  const { envelope, ledger, types } = input;
  const mechanism = classifyDriftMechanism(envelope);
  const object = extractMissingObject(envelope);

  const base = {
    mechanism,
    object,
    releaseShaAtFailure: envelope.releaseSha,
  };

  if (mechanism === 'not_a_missing_object_failure') {
    return {
      ...base,
      migrationFile: 'unknown',
      migrationFilenames: [],
      ledgerRow: 'unknown',
      heldMigration: null,
      generatedTypes: 'unknown',
      verdict: 'not-applicable',
      explanation: 'This failure is not a missing-object mechanism, so schema/ledger/types drift does not apply to it.',
      nextSteps: NEXT_STEPS['not-applicable'],
    };
  }

  // --- Axis 1: does the TREE create it -------------------------------------
  const matchingFiles = ledger.filesReadable ? ledger.files.filter((f) => objectMatches(object, f.objects)) : [];
  const migrationFile: EvidencePresence =
    !ledger.filesReadable || object.name === null ? 'unknown' : matchingFiles.length > 0 ? 'found' : 'absent';

  // --- Axis 2: does the LEDGER record it -----------------------------------
  let ledgerRow: LedgerPresence = 'unknown';
  if (ledger.appliedVersions !== null && migrationFile === 'found') {
    const applied = new Set(ledger.appliedVersions);
    ledgerRow = matchingFiles.some((f) => applied.has(f.version)) ? 'present' : 'absent';
  }

  // --- HELD: an owner decision, and the strongest single explanation --------
  let heldMigration: boolean | null = null;
  if (ledger.heldVersions !== null && migrationFile === 'found') {
    const held = new Set(ledger.heldVersions);
    heldMigration = matchingFiles.some((f) => held.has(f.version));
  }

  // --- Axis 3: do the TYPES mention it -------------------------------------
  const generatedTypes = typesPresence(object, types);

  const verdict = decideVerdict({ mechanism, migrationFile, ledgerRow, heldMigration, generatedTypes });

  return {
    ...base,
    migrationFile,
    migrationFilenames: matchingFiles.map((f) => f.filename),
    ledgerRow,
    heldMigration,
    generatedTypes,
    verdict,
    explanation: explain({ object, mechanism, migrationFile, ledgerRow, heldMigration, generatedTypes, verdict }),
    nextSteps: NEXT_STEPS[verdict],
  };
}

function decideVerdict(axes: {
  mechanism: DriftMechanism;
  migrationFile: EvidencePresence;
  ledgerRow: LedgerPresence;
  heldMigration: boolean | null;
  generatedTypes: TypesPresence;
}): SchemaDriftVerdict {
  const { mechanism, migrationFile, ledgerRow, heldMigration, generatedTypes } = axes;

  // A HELD migration is an explicit, recorded owner decision — it outranks
  // every inference below it. Unless the ledger says it was applied anyway,
  // in which case the two disagree and neither is a safe headline.
  if (heldMigration === true && ledgerRow !== 'present') return 'migration-held';

  if (migrationFile === 'absent' && generatedTypes === 'absent') return 'object-unknown-to-repo';
  if (migrationFile === 'found' && ledgerRow === 'absent') return 'migration-not-in-ledger';

  const knownToRepo = migrationFile === 'found' || generatedTypes === 'present';
  if (mechanism === 'postgrest_schema_cache' && knownToRepo && ledgerRow !== 'absent') return 'schema-cache-stale';
  if (knownToRepo && ledgerRow === 'present') return 'object-defined-but-unreachable';

  return 'unknown';
}

function explain(input: {
  object: MissingObjectRef;
  mechanism: DriftMechanism;
  migrationFile: EvidencePresence;
  ledgerRow: LedgerPresence;
  heldMigration: boolean | null;
  generatedTypes: TypesPresence;
  verdict: SchemaDriftVerdict;
}): string {
  const name = input.object.name === null ? `an unnamed ${input.object.kind}` : `${input.object.kind} "${input.object.name}"`;
  const reporter =
    input.mechanism === 'postgrest_schema_cache' ? 'PostgREST’s schema cache has no entry for' : 'Postgres reported no';

  switch (input.verdict) {
    case 'migration-held':
      return `${reporter} ${name}; the migration that creates it is recorded HELD, i.e. deliberately not applied.`;
    case 'object-unknown-to-repo':
      return `${reporter} ${name}; no migration in this tree creates it and the generated types do not mention it.`;
    case 'migration-not-in-ledger':
      return `${reporter} ${name}; a migration in this tree creates it but the applied ledger has no row for that migration — and the ledger is not authoritative about what is live.`;
    case 'schema-cache-stale':
      return `${reporter} ${name}, but this repo does define it — a stale PostgREST schema cache fits the evidence better than an absent object.`;
    case 'object-defined-but-unreachable':
      return `${reporter} ${name}, yet the tree defines it and the ledger records the migration — reachability (grants, search_path, schema exposure) fits better than absence.`;
    case 'unknown':
      return `${reporter} ${name}; at least one of migration file / ledger row / generated types could not be determined, so no verdict is supportable.`;
    default:
      return 'This failure is not a missing-object mechanism.';
  }
}
