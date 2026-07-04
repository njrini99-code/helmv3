// =============================================================================
// src/lib/baseball/import-source-enabled.ts
//
// Shared helpers for the per-team import-source registry (baseball_import_sources).
// Unregistered adapter keys remain available; a registered row with is_active=false
// is blocked from preview/commit and hidden from the import picker merge.
// =============================================================================

import type { BaseballImportSourceConfig } from '@/lib/types/baseball-settings';

/**
 * Thrown when a coach attempts preview/commit against a disabled registry row.
 * Re-raised by withBaseballAction so callers see a stable, user-safe message.
 */
export class BaseballDisabledSourceError extends Error {
  readonly status = 403;
  constructor(message = 'This import source is disabled for your program.') {
    super(message);
    this.name = 'BaseballDisabledSourceError';
  }
}

export type ImportSourceRegistration = Pick<
  BaseballImportSourceConfig,
  'source_name' | 'enabled'
>;

type ImportSourceRow = ImportSourceRegistration & {
  adapter_key?: string | null;
  is_active?: boolean | null;
  source_type?: string | null;
};

/**
 * Unregistered sources (null/undefined) use adapter defaults and stay available.
 */
export function isImportSourceEnabled(
  registration: ImportSourceRegistration | null | undefined,
): boolean {
  if (!registration) return true;
  return registration.enabled !== false;
}

/**
 * Throws BaseballDisabledSourceError when the team's registry row is disabled.
 */
export function assertImportSourceEnabled(
  registration: ImportSourceRegistration | null | undefined,
  sourceKey: string,
): void {
  if (isImportSourceEnabled(registration)) return;
  const label = registration?.source_name?.trim() || sourceKey;
  throw new BaseballDisabledSourceError(
    `"${label}" is disabled. Re-enable it in Program Settings → Import Sources.`,
  );
}

type ImportSourceLookupClient = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: string) => Promise<{ data: unknown[] | null; error: unknown }>;
    };
  };
};

/**
 * Deterministically resolve a registry row for `sourceKey`:
 * 1. Any disabled match wins (block preview/commit).
 * 2. Else prefer exact `adapter_key` match.
 * 3. Else prefer exact `source_name` match.
 */
export async function loadImportSourceRegistration(
  db: ImportSourceLookupClient,
  teamId: string,
  sourceKey: string,
): Promise<ImportSourceRegistration | null> {
  const { data } = await db
    .from('baseball_import_sources')
    .select('source_name, is_active, adapter_key')
    .eq('team_id', teamId);

  const rows = ((data ?? []) as ImportSourceRow[])
    .map((row) => {
      const adapterKey = row.adapter_key ?? row.source_type ?? null;
      return {
        source_name: row.source_name,
        enabled: (row.is_active ?? row.enabled) !== false,
        adapter_key: adapterKey,
      };
    })
    .filter((row) => row.adapter_key === sourceKey || row.source_name === sourceKey);
  if (rows.length === 0) return null;

  const disabled = rows.find((row) => row.enabled === false);
  if (disabled) return disabled;

  const byType = rows.find((row) => row.adapter_key === sourceKey);
  if (byType) return byType;

  const byName = rows.find((row) => row.source_name === sourceKey);
  return byName ?? rows[0] ?? null;
}

/** Block preview/commit when the registry row exists and is disabled. */
export async function assertImportSourceAllowed(
  db: ImportSourceLookupClient,
  teamId: string,
  sourceKey: string,
): Promise<void> {
  const registration = await loadImportSourceRegistration(db, teamId, sourceKey);
  assertImportSourceEnabled(registration, sourceKey);
}
