import { describe, expect, it } from 'vitest';

import {
  classifyDriftMechanism,
  diagnoseSchemaDrift,
  extractMissingObject,
  normalizeObjectName,
  type GeneratedTypesListing,
  type MigrationLedgerListing,
} from '../schema-drift';
import type { SupabaseErrorEnvelope } from '../envelope';

type DriftEnvelope = Pick<
  SupabaseErrorEnvelope,
  'code' | 'sqlstate' | 'postgrestCode' | 'relation' | 'rpc' | 'normalizedMessage' | 'releaseSha'
>;

function envelope(overrides: Partial<DriftEnvelope> = {}): DriftEnvelope {
  return {
    code: '42P01',
    sqlstate: '42P01',
    postgrestCode: null,
    relation: null,
    rpc: null,
    normalizedMessage: 'relation "golf_round_notes" does not exist',
    releaseSha: 'abc1234',
    ...overrides,
  };
}

const EMPTY_LEDGER: MigrationLedgerListing = {
  filesReadable: true,
  files: [],
  appliedVersions: [],
  heldVersions: [],
};

const EMPTY_TYPES: GeneratedTypesListing = {
  readable: true,
  tables: [],
  columns: [],
  functions: [],
};

describe('normalizeObjectName', () => {
  it('drops schema qualifiers, quotes and function argument lists', () => {
    expect(normalizeObjectName('public."Golf_Rounds"')).toBe('golf_rounds');
    expect(normalizeObjectName('public.save_partial_round_atomic(uuid, jsonb)')).toBe('save_partial_round_atomic');
    expect(normalizeObjectName('  golf_rounds  ')).toBe('golf_rounds');
  });

  it('returns null rather than an empty string for absent input', () => {
    expect(normalizeObjectName(null)).toBeNull();
    expect(normalizeObjectName('')).toBeNull();
    expect(normalizeObjectName('   ')).toBeNull();
  });
});

describe('classifyDriftMechanism', () => {
  it('separates a Postgres undefined-object SQLSTATE from a PostgREST cache miss', () => {
    expect(classifyDriftMechanism({ code: '42P01', sqlstate: '42P01', postgrestCode: null })).toBe(
      'postgres_undefined_object',
    );
    expect(classifyDriftMechanism({ code: '42883', sqlstate: '42883', postgrestCode: null })).toBe(
      'postgres_undefined_object',
    );
    expect(classifyDriftMechanism({ code: 'PGRST202', sqlstate: null, postgrestCode: 'PGRST202' })).toBe(
      'postgrest_schema_cache',
    );
    expect(classifyDriftMechanism({ code: 'PGRST205', sqlstate: null, postgrestCode: 'PGRST205' })).toBe(
      'postgrest_schema_cache',
    );
  });

  it('reports anything else as not a missing-object failure', () => {
    expect(classifyDriftMechanism({ code: '42501', sqlstate: '42501', postgrestCode: null })).toBe(
      'not_a_missing_object_failure',
    );
    expect(classifyDriftMechanism({ code: null, sqlstate: null, postgrestCode: null })).toBe(
      'not_a_missing_object_failure',
    );
  });
});

describe('extractMissingObject', () => {
  it('prefers the structured rpc field over the message', () => {
    const object = extractMissingObject(
      envelope({
        code: '42883',
        sqlstate: '42883',
        rpc: 'save_partial_round_atomic',
        normalizedMessage: 'function public.something_else(uuid) does not exist',
      }),
    );
    expect(object).toEqual({ kind: 'function', name: 'save_partial_round_atomic', parent: null });
  });

  it('falls back to the message when the structured field is empty', () => {
    const object = extractMissingObject(
      envelope({ code: '42P01', sqlstate: '42P01', relation: null, normalizedMessage: 'relation "golf_x" does not exist' }),
    );
    expect(object).toEqual({ kind: 'table', name: 'golf_x', parent: null });
  });

  it('recovers a column and its parent relation from either message shape', () => {
    expect(
      extractMissingObject(
        envelope({
          code: '42703',
          sqlstate: '42703',
          normalizedMessage: 'column "tee_time" of relation "golf_rounds" does not exist',
        }),
      ),
    ).toEqual({ kind: 'column', name: 'tee_time', parent: 'golf_rounds' });

    expect(
      extractMissingObject(
        envelope({ code: '42703', sqlstate: '42703', normalizedMessage: 'column golf_rounds.tee_time does not exist' }),
      ),
    ).toEqual({ kind: 'column', name: 'tee_time', parent: 'golf_rounds' });
  });

  it('parses the PostgREST schema-cache wordings', () => {
    expect(
      extractMissingObject(
        envelope({
          code: 'PGRST202',
          sqlstate: null,
          postgrestCode: 'PGRST202',
          normalizedMessage: "Could not find the function public.save_partial_round_atomic(p_round) in the schema cache",
        }),
      ),
    ).toEqual({ kind: 'function', name: 'save_partial_round_atomic', parent: null });

    expect(
      extractMissingObject(
        envelope({
          code: 'PGRST205',
          sqlstate: null,
          postgrestCode: 'PGRST205',
          normalizedMessage: "Could not find the table 'public.golf_rounds' in the schema cache",
        }),
      ).name,
    ).toBe('golf_rounds');
  });

  it('returns a null name rather than guessing when nothing names the object', () => {
    const object = extractMissingObject(
      envelope({ code: '42P01', sqlstate: '42P01', relation: null, normalizedMessage: 'unknown_error' }),
    );
    expect(object.name).toBeNull();
    expect(object.kind).toBe('table');
  });
});

describe('diagnoseSchemaDrift — the three axes never collapse', () => {
  it('is not-applicable for a failure that is not a missing-object mechanism', () => {
    const result = diagnoseSchemaDrift({
      envelope: envelope({ code: '42501', sqlstate: '42501', normalizedMessage: 'permission denied for table golf_rounds' }),
      ledger: EMPTY_LEDGER,
      types: EMPTY_TYPES,
    });
    expect(result.verdict).toBe('not-applicable');
    expect(result.migrationFile).toBe('unknown');
    expect(result.ledgerRow).toBe('unknown');
    expect(result.generatedTypes).toBe('unknown');
  });

  it('reports object-unknown-to-repo when neither a migration nor the types name it', () => {
    const result = diagnoseSchemaDrift({ envelope: envelope(), ledger: EMPTY_LEDGER, types: EMPTY_TYPES });
    expect(result.migrationFile).toBe('absent');
    expect(result.generatedTypes).toBe('absent');
    expect(result.verdict).toBe('object-unknown-to-repo');
  });

  it('reports migration-not-in-ledger, and says in the explanation that the ledger is not authoritative', () => {
    const result = diagnoseSchemaDrift({
      envelope: envelope(),
      ledger: {
        filesReadable: true,
        files: [{ version: '20260901120000', filename: '20260901120000_add_notes.sql', objects: ['golf_round_notes'] }],
        appliedVersions: ['20260101000000'],
        heldVersions: [],
      },
      types: EMPTY_TYPES,
    });
    expect(result.migrationFile).toBe('found');
    expect(result.migrationFilenames).toEqual(['20260901120000_add_notes.sql']);
    expect(result.ledgerRow).toBe('absent');
    expect(result.verdict).toBe('migration-not-in-ledger');
    expect(result.explanation).toContain('not authoritative');
  });

  it('reports migration-held when HELD.md accounts for the migration', () => {
    const result = diagnoseSchemaDrift({
      envelope: envelope(),
      ledger: {
        filesReadable: true,
        files: [{ version: '20260901120000', filename: '20260901120000_add_notes.sql', objects: ['golf_round_notes'] }],
        appliedVersions: [],
        heldVersions: ['20260901120000'],
      },
      types: EMPTY_TYPES,
    });
    expect(result.heldMigration).toBe(true);
    expect(result.verdict).toBe('migration-held');
    expect(result.nextSteps.join(' ')).toContain('HELD.md');
  });

  it('does NOT claim migration-held when the ledger says the same version was applied anyway', () => {
    const result = diagnoseSchemaDrift({
      envelope: envelope(),
      ledger: {
        filesReadable: true,
        files: [{ version: '20260901120000', filename: '20260901120000_add_notes.sql', objects: ['golf_round_notes'] }],
        appliedVersions: ['20260901120000'],
        heldVersions: ['20260901120000'],
      },
      types: EMPTY_TYPES,
    });
    expect(result.heldMigration).toBe(true);
    expect(result.ledgerRow).toBe('present');
    expect(result.verdict).toBe('object-defined-but-unreachable');
  });

  it('suspects a stale schema cache only for the PostgREST family, and only when the repo knows the object', () => {
    const cacheMiss = envelope({
      code: 'PGRST202',
      sqlstate: null,
      postgrestCode: 'PGRST202',
      rpc: 'save_partial_round_atomic',
      normalizedMessage: 'Could not find the function public.save_partial_round_atomic in the schema cache',
    });

    const known = diagnoseSchemaDrift({
      envelope: cacheMiss,
      ledger: EMPTY_LEDGER,
      types: { readable: true, tables: [], columns: [], functions: ['save_partial_round_atomic'] },
    });
    expect(known.verdict).toBe('schema-cache-stale');

    const unknown = diagnoseSchemaDrift({ envelope: cacheMiss, ledger: EMPTY_LEDGER, types: EMPTY_TYPES });
    expect(unknown.verdict).toBe('object-unknown-to-repo');
  });

  it('reports object-defined-but-unreachable when tree and ledger both have it', () => {
    const result = diagnoseSchemaDrift({
      envelope: envelope(),
      ledger: {
        filesReadable: true,
        files: [{ version: '20260901120000', filename: '20260901120000_add_notes.sql', objects: ['golf_round_notes'] }],
        appliedVersions: ['20260901120000'],
        heldVersions: [],
      },
      types: { readable: true, tables: ['golf_round_notes'], columns: [], functions: [] },
    });
    expect(result.verdict).toBe('object-defined-but-unreachable');
    expect(result.nextSteps.join(' ')).toContain('search_path');
  });

  it('an unreadable ledger yields unknown, never absent — a blind source is not a clean one', () => {
    const result = diagnoseSchemaDrift({
      envelope: envelope(),
      ledger: { filesReadable: false, files: [], appliedVersions: null, heldVersions: null },
      types: { readable: false, tables: [], columns: [], functions: [] },
    });
    expect(result.migrationFile).toBe('unknown');
    expect(result.ledgerRow).toBe('unknown');
    expect(result.heldMigration).toBeNull();
    expect(result.generatedTypes).toBe('unknown');
    expect(result.verdict).toBe('unknown');
  });

  it('an unreadable APPLIED ledger still reports the migration file it can see', () => {
    const result = diagnoseSchemaDrift({
      envelope: envelope(),
      ledger: {
        filesReadable: true,
        files: [{ version: '20260901120000', filename: '20260901120000_add_notes.sql', objects: ['golf_round_notes'] }],
        appliedVersions: null,
        heldVersions: null,
      },
      types: EMPTY_TYPES,
    });
    expect(result.migrationFile).toBe('found');
    expect(result.ledgerRow).toBe('unknown');
    expect(result.verdict).toBe('unknown');
  });

  it('matches a column by both its bare name and its table.column form', () => {
    const columnEnvelope = envelope({
      code: '42703',
      sqlstate: '42703',
      normalizedMessage: 'column "tee_time" of relation "golf_rounds" does not exist',
    });
    const result = diagnoseSchemaDrift({
      envelope: columnEnvelope,
      ledger: {
        filesReadable: true,
        files: [{ version: '20260901120000', filename: '20260901120000_tee.sql', objects: ['golf_rounds.tee_time'] }],
        appliedVersions: ['20260901120000'],
        heldVersions: [],
      },
      types: { readable: true, tables: ['golf_rounds'], columns: ['golf_rounds.tee_time'], functions: [] },
    });
    expect(result.migrationFile).toBe('found');
    expect(result.generatedTypes).toBe('present');
    expect(result.verdict).toBe('object-defined-but-unreachable');
  });

  it('carries the release live at the time of failure through untouched', () => {
    const result = diagnoseSchemaDrift({
      envelope: envelope({ releaseSha: 'deadbee' }),
      ledger: EMPTY_LEDGER,
      types: EMPTY_TYPES,
    });
    expect(result.releaseShaAtFailure).toBe('deadbee');
  });

  it('never echoes the failure message into the explanation', () => {
    const result = diagnoseSchemaDrift({
      envelope: envelope({ normalizedMessage: 'relation "golf_round_notes" does not exist SECRET-MARKER-XYZ' }),
      ledger: EMPTY_LEDGER,
      types: EMPTY_TYPES,
    });
    expect(result.explanation).not.toContain('SECRET-MARKER-XYZ');
    expect(result.nextSteps.join(' ')).not.toContain('SECRET-MARKER-XYZ');
  });
});
